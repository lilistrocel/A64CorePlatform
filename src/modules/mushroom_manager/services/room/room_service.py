"""
Mushroom Management Module - Growing Room Service

CRUD and lifecycle management for the growing_rooms MongoDB collection.
Rooms have a 12-phase lifecycle with flush-cycle tracking and validated transitions.
"""

import logging
from datetime import datetime
from typing import List, Tuple
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.growing_room import (
    GrowingRoom,
    GrowingRoomCreate,
    GrowingRoomUpdate,
    PhaseHistoryEntry,
    RoomPhase,
    VALID_TRANSITIONS,
    FlushInfo,
    allowed_phases_for,
    BATCH_ROOM_TYPES,
)
from ..database import mushroom_db

logger = logging.getLogger(__name__)

# Phases that start a new fruiting flush cycle
_FLUSH_START_PHASES = {RoomPhase.FRUITING_INITIATION}

# MongoDB stores "roomId"; the Pydantic model uses "id".
_MONGO_ID_KEY = "roomId"


def _doc_to_model(doc: dict) -> GrowingRoom:
    """Rename MongoDB's roomId → id before constructing the model."""
    doc.pop("_id", None)
    if _MONGO_ID_KEY in doc:
        doc["id"] = doc.pop(_MONGO_ID_KEY)
    return GrowingRoom(**doc)


def _model_to_doc(model: GrowingRoom) -> dict:
    """Rename model's id → roomId for MongoDB storage."""
    doc = model.model_dump()
    doc[_MONGO_ID_KEY] = doc.pop("id")
    return doc


class RoomService:
    """
    Service for managing growing rooms within a mushroom facility.

    Handles CRUD operations and the phased lifecycle (empty → preparing →
    inoculated → colonizing → fruiting_initiation → fruiting → harvesting →
    resting → fruiting_initiation | cleaning → empty).
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_room(
        facility_id: str,
        data: GrowingRoomCreate,
        current_user
    ) -> GrowingRoom:
        db = mushroom_db.get_database()

        # Validate parent facility exists
        facility_doc = await db.mushroom_facilities.find_one({"facilityId": facility_id})
        if not facility_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Facility '{facility_id}' not found"
            )

        # Enforce unique roomCode per facility
        existing = await db.growing_rooms.find_one(
            {"facilityId": facility_id, "roomCode": data.roomCode}
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Room code '{data.roomCode}' already exists in facility '{facility_id}'"
            )

        room = GrowingRoom(
            **data.model_dump(exclude_none=True),
            id=str(uuid4()),
            facilityId=facility_id,
            currentPhase=RoomPhase.EMPTY,
            flushInfo=FlushInfo(),
            phaseHistory=[],
            totalYieldKg=0.0,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = _model_to_doc(room)
        try:
            await db.growing_rooms.insert_one(doc)
        except Exception as e:
            logger.error(f"[RoomService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create growing room"
            )

        logger.info(
            f"[RoomService] Created room {room.id} "
            f"in facility {facility_id} by user {current_user.userId}"
        )
        return room

    # ---------------------------------------------------------------------------
    # Read single
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_room(facility_id: str, room_id: str) -> GrowingRoom:
        db = mushroom_db.get_database()
        doc = await db.growing_rooms.find_one(
            {_MONGO_ID_KEY: room_id, "facilityId": facility_id}
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room '{room_id}' not found in facility '{facility_id}'"
            )
        return _doc_to_model(doc)

    # ---------------------------------------------------------------------------
    # Read list
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_rooms(
        facility_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> Tuple[List[GrowingRoom], int]:
        db = mushroom_db.get_database()
        query = {"facilityId": facility_id}

        total = await db.growing_rooms.count_documents(query)
        cursor = (
            db.growing_rooms
            .find(query)
            .sort("roomCode", 1)
            .skip(skip)
            .limit(limit)
        )

        rooms: List[GrowingRoom] = []
        async for doc in cursor:
            rooms.append(_doc_to_model(doc))

        return rooms, total

    # ---------------------------------------------------------------------------
    # Update
    # ---------------------------------------------------------------------------

    @staticmethod
    async def update_room(
        facility_id: str,
        room_id: str,
        data: GrowingRoomUpdate
    ) -> GrowingRoom:
        await RoomService.get_room(facility_id, room_id)

        update_fields = data.model_dump(exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update"
            )

        update_fields["updatedAt"] = datetime.utcnow()

        db = mushroom_db.get_database()
        await db.growing_rooms.update_one(
            {_MONGO_ID_KEY: room_id, "facilityId": facility_id},
            {"$set": update_fields}
        )

        logger.info(f"[RoomService] Updated room {room_id}: {list(update_fields.keys())}")
        return await RoomService.get_room(facility_id, room_id)

    # ---------------------------------------------------------------------------
    # Phase transition (lifecycle advancement)
    # ---------------------------------------------------------------------------

    @staticmethod
    async def advance_phase(
        facility_id: str,
        room_id: str,
        target_phase: RoomPhase,
        notes: str | None,
        current_user
    ) -> GrowingRoom:
        room = await RoomService.get_room(facility_id, room_id)
        current_phase = room.currentPhase

        # Only a batch room runs a crop lifecycle. A lab, spawn or incubation
        # room holds many independent items, so it has no single phase to
        # advance — the items inside carry their own state.
        permitted = allowed_phases_for(room.roomType)
        if target_phase not in permitted:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"A '{room.roomType.value}' room has no crop lifecycle — it holds "
                    f"independently tracked items. Allowed phases for this room type: "
                    f"{sorted(p.value for p in permitted)}"
                ),
            )

        if room.roomType not in BATCH_ROOM_TYPES:
            # Container rooms are not walking a crop cycle, so the ordered
            # transition table does not apply — a lab can go from empty to
            # cleaning to maintenance in any order. Permission to hold the
            # phase (checked above) is the only constraint.
            return await RoomService._commit_phase(
                facility_id, room_id, room, current_phase, target_phase,
                notes, current_user,
            )

        # Validate the transition
        allowed = VALID_TRANSITIONS.get(current_phase, [])
        if target_phase not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Invalid phase transition: '{current_phase}' → '{target_phase}'. "
                    f"Allowed next phases: {[p.value for p in allowed]}"
                )
            )

        return await RoomService._commit_phase(
            facility_id, room_id, room, current_phase, target_phase,
            notes, current_user,
        )

    @staticmethod
    async def _commit_phase(
        facility_id: str,
        room_id: str,
        room: GrowingRoom,
        current_phase: RoomPhase,
        target_phase: RoomPhase,
        notes: str | None,
        current_user,
    ) -> GrowingRoom:
        """Persist a phase change and its history entry.

        Shared by both paths: batch rooms reach it after the crop transition
        table is validated, container rooms after the simpler room-type check.
        """
        history_entry = PhaseHistoryEntry(
            fromPhase=current_phase,
            toPhase=target_phase,
            changedAt=datetime.utcnow(),
            changedBy=current_user.userId,
            notes=notes,
        )

        update_fields: dict = {
            "currentPhase": target_phase.value,
            "updatedAt": datetime.utcnow(),
        }

        # Entering fruiting_initiation from resting starts a new flush cycle.
        if (
            target_phase == RoomPhase.FRUITING_INITIATION
            and current_phase == RoomPhase.RESTING
        ):
            new_flush = room.flushInfo.currentFlush + 1
            update_fields["flushInfo.currentFlush"] = new_flush
            update_fields["flushInfo.totalFlushes"] = room.flushInfo.totalFlushes + 1
            logger.info(f"[RoomService] Room {room_id} started flush #{new_flush}")

        db = mushroom_db.get_database()
        await db.growing_rooms.update_one(
            {_MONGO_ID_KEY: room_id, "facilityId": facility_id},
            {
                "$set": update_fields,
                "$push": {"phaseHistory": history_entry.model_dump()},
            },
        )

        logger.info(
            f"[RoomService] Room {room_id} transitioned "
            f"{current_phase} → {target_phase} by user {current_user.userId}"
        )
        return await RoomService.get_room(facility_id, room_id)

    # ---------------------------------------------------------------------------
    # Deletion
    # ---------------------------------------------------------------------------

    @staticmethod
    async def room_dependents(facility_id: str, room_id: str) -> dict:
        """Count everything that would be orphaned by deleting this room."""
        db = mushroom_db.get_database()
        return {
            "accessions": await db.genetic_accessions.count_documents(
                {"location.roomId": room_id}
            ),
            "harvests": await db.mushroom_harvests.count_documents({"roomId": room_id}),
            "contaminationReports": await db.contamination_reports.count_documents(
                {"roomId": room_id}
            ),
            "environmentLogs": await db.room_environment_logs.count_documents(
                {"roomId": room_id}
            ),
        }

    @staticmethod
    async def delete_room(facility_id: str, room_id: str, current_user) -> dict:
        """Delete a room, but only when nothing depends on it.

        Deliberately refuses rather than cascading. A room holding 40 fruiting
        blocks, or carrying a year of harvest history, is load-bearing for the
        lineage and yield trails — silently removing it would destroy exactly
        the traceability this system exists to provide, and the operator would
        not find out until they needed the record.

        A room that has been used but should no longer be is a job for the
        DECOMMISSIONED phase, which keeps its history intact.
        """
        room = await RoomService.get_room(facility_id, room_id)
        blocking = await RoomService.room_dependents(facility_id, room_id)

        if any(blocking.values()):
            parts = [f"{v} {k}" for k, v in blocking.items() if v]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Room '{room.roomCode}' still has {', '.join(parts)} attached. "
                    f"Deleting it would orphan those records. Move or discard the "
                    f"material first, or set the room to 'decommissioned' to retire "
                    f"it while keeping its history."
                ),
            )

        db = mushroom_db.get_database()
        await db.growing_rooms.delete_one(
            {_MONGO_ID_KEY: room_id, "facilityId": facility_id}
        )
        logger.info(
            f"[RoomService] Deleted empty room {room.roomCode} ({room_id}) "
            f"by user {current_user.userId}"
        )
        return {"roomCode": room.roomCode, "roomId": room_id}
