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
        facility_id: str,
        room_id: str,
        data: HarvestCreate,
        current_user
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
                detail=f"Room '{room_id}' not found in facility '{facility_id}'"
            )

        # Auto-fill flush number from room's current flush state
        flush_number = data.flushNumber
        if flush_number is None:
            flush_info = room_doc.get("flushInfo", {})
            flush_number = flush_info.get("currentFlush", 1)

        # Calculate biological efficiency when substrate weight is available
        biological_efficiency: Optional[float] = None
        substrate_weight = room_doc.get("substrateWeight")
        if substrate_weight and substrate_weight > 0:
            # Reason: BE = (fresh weight harvested / dry weight substrate) * 100
            biological_efficiency = round((data.weightKg / substrate_weight) * 100, 2)

        harvest = Harvest(
            **data.model_dump(exclude={"flushNumber"}),
            harvestId=str(uuid4()),
            roomId=room_id,
            facilityId=facility_id,
            strainId=room_doc.get("strainId"),
            flushNumber=flush_number,
            biologicalEfficiency=biological_efficiency,
            harvestedBy=current_user.userId,
            harvestedAt=datetime.utcnow(),
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = harvest.model_dump()
        try:
            await db.mushroom_harvests.insert_one(doc)
        except Exception as e:
            logger.error(f"[HarvestService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create harvest record"
            )

        # Update room's totalYieldKg incrementally
        await db.growing_rooms.update_one(
            {"roomId": room_id},
            {
                "$inc": {"totalYieldKg": data.weightKg},
                "$set": {"updatedAt": datetime.utcnow()},
            }
        )

        logger.info(
            f"[HarvestService] Created harvest {harvest.harvestId} "
            f"for room {room_id} flush #{flush_number} "
            f"weight={data.weightKg}kg BE={biological_efficiency}% "
            f"by user {current_user.userId}"
        )
        return harvest

    # ---------------------------------------------------------------------------
    # List for a specific room
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_harvests_for_room(
        facility_id: str,
        room_id: str
    ) -> List[Harvest]:
        """
        Return all harvest records for a specific growing room, newest first.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.

        Returns:
            List of Harvest documents ordered by harvestedAt descending.
        """
        db = mushroom_db.get_database()
        cursor = (
            db.mushroom_harvests
            .find({"roomId": room_id, "facilityId": facility_id})
            .sort("harvestedAt", -1)
        )

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
        cursor = (
            db.mushroom_harvests
            .find({"facilityId": facility_id})
            .sort("harvestedAt", -1)
        )

        harvests: List[Harvest] = []
        async for doc in cursor:
            doc.pop("_id", None)
            harvests.append(Harvest(**doc))

        return harvests
