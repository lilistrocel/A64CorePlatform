"""
Mushroom Management Module - Harvest Service

Flush-aware harvest tracking for the mushroom_harvests MongoDB collection.
Harvests are automatically linked to the room's current flush number and
biological efficiency (BE) is calculated when substrate weight is available.
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.harvest import Harvest, HarvestCreate
from ..database import mushroom_db

logger = logging.getLogger(__name__)


class HarvestService:
    """
    Service for recording and retrieving mushroom harvest events.

    Key behaviour:
    - flushNumber is auto-filled from the room's current flushInfo.currentFlush
      when the caller omits it.
    - Biological efficiency is calculated when substrateWeight exists on the room.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_harvest(
        facility_id: str, room_id: str, data: HarvestCreate, current_user
    ) -> Harvest:
        """
        Record a new harvest event for a growing room.

        Auto-fills flushNumber from the room's current flush when not provided.
        Calculates biological efficiency (BE %) when the room has substrateWeight.

        BE formula: (harvest weight kg / substrate weight kg) * 100

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.
            data: Validated harvest creation payload.
            current_user: Authenticated user performing the recording.

        Returns:
            The newly-created Harvest document.

        Raises:
            HTTPException 404: If the room does not exist in the facility.
            HTTPException 500: If the database insert fails.
        """
        db = mushroom_db.get_database()

        # Validate room exists and retrieve for flush info
        room_doc = await db.growing_rooms.find_one(
            {"roomId": room_id, "facilityId": facility_id}
        )
        if not room_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room '{room_id}' not found in facility '{facility_id}'",
            )

        # Auto-fill flush number from room's current flush state
        flush_number = data.flushNumber
        if flush_number is None:
            flush_info = room_doc.get("flushInfo", {})
            flush_number = flush_info.get("currentFlush", 1)

        # Resolve the harvested block, if one was named, and denormalise its
        # lineage onto the harvest.
        #
        # This reads genetic_accessions directly rather than importing the
        # genetics service. The dependency direction is deliberate: genetics is
        # a shared module (industries: all) and mushroom_manager is exclusive,
        # so exclusive-depends-on-shared is the right way round. Denormalising
        # rather than joining at read time means a harvest stays truthful about
        # which generation produced it even if the accession is later split,
        # consumed or re-labelled.
        accession_fields: dict = {}
        if data.accessionId:
            accession_doc = await db.genetic_accessions.find_one(
                {"accessionId": data.accessionId}
            )
            if not accession_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Accession '{data.accessionId}' not found",
                )

            line_doc = await db.genetic_lines.find_one(
                {"lineId": accession_doc.get("lineId")}
            )
            accession_fields = {
                "accessionId": data.accessionId,
                "accessionCode": accession_doc.get("accessionCode"),
                "lineId": accession_doc.get("lineId"),
                "lineCode": (line_doc or {}).get("code"),
                "cloneGeneration": accession_doc.get("cloneGeneration"),
                "filialGeneration": accession_doc.get("filialGeneration"),
            }

        # Pin the SOP followed, if one was cited. Reads the protocols collection
        # directly for the same reason the accession lookup does — shared module,
        # data-layer dependency, no service import cycle.
        protocol_ref = None
        if data.protocolId:
            protocol_doc = await db.protocols.find_one({"protocolId": data.protocolId})
            if not protocol_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Protocol '{data.protocolId}' not found",
                )
            if protocol_doc.get("status") != "active":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Protocol '{protocol_doc.get('code')}' is "
                        f"{protocol_doc.get('status')}, not active. Only an approved "
                        f"procedure can be recorded as followed."
                    ),
                )
            protocol_ref = {
                "protocolId": data.protocolId,
                "code": protocol_doc.get("code"),
                "title": protocol_doc.get("title"),
                "version": protocol_doc.get("version", 1),
                "followedAt": datetime.utcnow(),
            }

        # Biological efficiency. A per-block substrate weight wins over the
        # room-level figure — a room may hold blocks from several batches, and
        # attributing all of them the same denominator would make the BE
        # comparison between lineages meaningless.
        substrate_weight = data.substrateWeightKg or room_doc.get("substrateWeight")
        biological_efficiency: Optional[float] = None
        if substrate_weight and substrate_weight > 0:
            # Reason: BE = (fresh weight harvested / dry weight substrate) * 100
            biological_efficiency = round((data.weightKg / substrate_weight) * 100, 2)

        harvest = Harvest(
            **data.model_dump(
                exclude={
                    "flushNumber",
                    "accessionId",
                    "substrateWeightKg",
                    "protocolId",
                }
            ),
            harvestId=str(uuid4()),
            roomId=room_id,
            facilityId=facility_id,
            strainId=room_doc.get("strainId"),
            flushNumber=flush_number,
            biologicalEfficiency=biological_efficiency,
            substrateWeightKg=substrate_weight,
            protocolRef=protocol_ref,
            harvestedBy=current_user.userId,
            harvestedAt=datetime.utcnow(),
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
            **accession_fields,
        )

        doc = harvest.model_dump()
        try:
            await db.mushroom_harvests.insert_one(doc)
        except Exception as e:
            logger.error(f"[HarvestService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create harvest record",
            )

        # Update room's totalYieldKg incrementally
        await db.growing_rooms.update_one(
            {"roomId": room_id},
            {
                "$inc": {"totalYieldKg": data.weightKg},
                "$set": {"updatedAt": datetime.utcnow()},
            },
        )

        logger.info(
            f"[HarvestService] Created harvest {harvest.harvestId} "
            f"for room {room_id} flush #{flush_number} "
            f"weight={data.weightKg}kg BE={biological_efficiency}% "
            f"by user {current_user.userId}"
        )
        return harvest

    # ---------------------------------------------------------------------------
    # Yield attribution by lineage
    # ---------------------------------------------------------------------------

    @staticmethod
    async def yield_by_line(
        facility_id: Optional[str] = None,
    ) -> List[dict]:
        """Aggregate harvest performance per genetic line and generation.

        This is the question the genetics repo exists to answer: not "how did
        Blue Oyster do" but "how did *this* Blue Oyster culture do, and did it
        get worse as I kept transferring it".

        Grouped by (lineId, cloneGeneration) so a decline across generations is
        visible directly — the practical readout of senescence. Harvests with
        no accession recorded are excluded rather than lumped together, since
        attributing them to a line would be a guess.
        """
        db = mushroom_db.get_database()

        match: dict = {"lineId": {"$ne": None}}
        if facility_id:
            match["facilityId"] = facility_id

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {"lineId": "$lineId", "generation": "$cloneGeneration"},
                    "lineCode": {"$first": "$lineCode"},
                    "totalKg": {"$sum": "$weightKg"},
                    "harvests": {"$sum": 1},
                    "avgBE": {"$avg": "$biologicalEfficiency"},
                    "blocks": {"$addToSet": "$accessionId"},
                    "lastHarvestAt": {"$max": "$harvestedAt"},
                }
            },
            {"$sort": {"_id.lineId": 1, "_id.generation": 1}},
        ]

        rows: List[dict] = []
        async for row in db.mushroom_harvests.aggregate(pipeline):
            rows.append(
                {
                    "lineId": row["_id"]["lineId"],
                    "lineCode": row.get("lineCode"),
                    "cloneGeneration": row["_id"]["generation"],
                    "totalKg": round(row.get("totalKg") or 0, 3),
                    "harvests": row.get("harvests", 0),
                    "avgBE": (
                        round(row["avgBE"], 2) if row.get("avgBE") is not None else None
                    ),
                    "blockCount": len([b for b in row.get("blocks", []) if b]),
                    "lastHarvestAt": row.get("lastHarvestAt"),
                }
            )
        return rows

    # ---------------------------------------------------------------------------
    # List for a specific room
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_harvests_for_room(facility_id: str, room_id: str) -> List[Harvest]:
        """
        Return all harvest records for a specific growing room, newest first.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.

        Returns:
            List of Harvest documents ordered by harvestedAt descending.
        """
        db = mushroom_db.get_database()
        cursor = db.mushroom_harvests.find(
            {"roomId": room_id, "facilityId": facility_id}
        ).sort("harvestedAt", -1)

        harvests: List[Harvest] = []
        async for doc in cursor:
            doc.pop("_id", None)
            harvests.append(Harvest(**doc))

        return harvests

    # ---------------------------------------------------------------------------
    # List for entire facility
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_harvests_for_facility(facility_id: str) -> List[Harvest]:
        """
        Return all harvest records across all rooms in a facility, newest first.

        Args:
            facility_id: Parent facility ID.

        Returns:
            List of Harvest documents ordered by harvestedAt descending.
        """
        db = mushroom_db.get_database()
        cursor = db.mushroom_harvests.find({"facilityId": facility_id}).sort(
            "harvestedAt", -1
        )

        harvests: List[Harvest] = []
        async for doc in cursor:
            doc.pop("_id", None)
            harvests.append(Harvest(**doc))

        return harvests
