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

        # Build the history entry
        history_entry = PhaseHistoryEntry(
            fromPhase=current_phase,
            toPhase=target_phase,
            changedAt=datetime.utcnow(),
            changedBy=current_user.userId,
            notes=notes,
        )

        # Build the update payload
        update_fields: dict = {
            "currentPhase": target_phase.value,
            "updatedAt": datetime.utcnow(),
        }

        # When transitioning INTO fruiting_initiation FROM resting,
        # a new flush cycle begins. Increment currentFlush and totalFlushes.
        if (
            target_phase == RoomPhase.FRUITING_INITIATION
            and current_phase == RoomPhase.RESTING
        ):
            new_flush = room.flushInfo.currentFlush + 1
            update_fields["flushInfo.currentFlush"] = new_flush
            update_fields["flushInfo.totalFlushes"] = room.flushInfo.totalFlushes + 1
            logger.info(
                f"[RoomService] Room {room_id} started flush #{new_flush}"
            )

        db = mushroom_db.get_database()
        await db.growing_rooms.update_one(
            {_MONGO_ID_KEY: room_id, "facilityId": facility_id},
            {
                "$set": update_fields,
                "$push": {"phaseHistory": history_entry.model_dump()},
            }
        )

        logger.info(
            f"[RoomService] Room {room_id} transitioned "
            f"{current_phase} → {target_phase} by user {current_user.userId}"
        )
        return await RoomService.get_room(facility_id, room_id)
