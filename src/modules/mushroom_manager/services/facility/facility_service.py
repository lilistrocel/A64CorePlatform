"""
Mushroom Management Module - Facility Service

CRUD operations for the mushroom_facilities MongoDB collection.
Facilities are the top-level container for mushroom cultivation.
"""

import logging
from datetime import datetime
from typing import List, Tuple
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.facility import Facility, FacilityCreate, FacilityUpdate
from ..database import mushroom_db

logger = logging.getLogger(__name__)

# MongoDB stores "facilityId"; the Pydantic model uses "id".
_MONGO_ID_KEY = "facilityId"


def _doc_to_model(doc: dict) -> Facility:
    """Rename MongoDB's facilityId → id before constructing the model."""
    doc.pop("_id", None)
    if _MONGO_ID_KEY in doc:
        doc["id"] = doc.pop(_MONGO_ID_KEY)
    return Facility(**doc)


def _model_to_doc(model: Facility) -> dict:
    """Rename model's id → facilityId for MongoDB storage."""
    doc = model.model_dump()
    doc[_MONGO_ID_KEY] = doc.pop("id")
    return doc


class FacilityService:
    """
    Service for managing mushroom facilities.

    Handles CRUD operations against the mushroom_facilities MongoDB collection.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_facility(data: FacilityCreate, current_user) -> Facility:
        db = mushroom_db.get_database()

        facility = Facility(
            **data.model_dump(exclude_none=True),
            id=str(uuid4()),
            managerId=current_user.userId,
            managerEmail=current_user.email,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = _model_to_doc(facility)
        try:
            await db.mushroom_facilities.insert_one(doc)
        except Exception as e:
            logger.error(f"[FacilityService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create facility",
            )

        logger.info(
            f"[FacilityService] Created facility {facility.id} "
            f"by user {current_user.userId}"
        )
        return facility

    # ---------------------------------------------------------------------------
    # Read single
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_facility(facility_id: str) -> Facility:
        db = mushroom_db.get_database()
        doc = await db.mushroom_facilities.find_one({_MONGO_ID_KEY: facility_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Facility '{facility_id}' not found",
            )
        return _doc_to_model(doc)

    # ---------------------------------------------------------------------------
    # Read list
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_facilities(
        skip: int = 0, limit: int = 20
    ) -> Tuple[List[Facility], int]:
        db = mushroom_db.get_database()

        total = await db.mushroom_facilities.count_documents({})
        cursor = db.mushroom_facilities.find({}).sort("name", 1).skip(skip).limit(limit)

        facilities: List[Facility] = []
        async for doc in cursor:
            facilities.append(_doc_to_model(doc))

        return facilities, total

    # ---------------------------------------------------------------------------
    # Update
    # ---------------------------------------------------------------------------

    @staticmethod
    async def update_facility(facility_id: str, data: FacilityUpdate) -> Facility:
        await FacilityService.get_facility(facility_id)

        update_fields = data.model_dump(exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        update_fields["updatedAt"] = datetime.utcnow()

        db = mushroom_db.get_database()
        await db.mushroom_facilities.update_one(
            {_MONGO_ID_KEY: facility_id}, {"$set": update_fields}
        )

        logger.info(
            f"[FacilityService] Updated facility {facility_id}: {list(update_fields.keys())}"
        )
        return await FacilityService.get_facility(facility_id)

    # ---------------------------------------------------------------------------
    # Deletion
    # ---------------------------------------------------------------------------

    @staticmethod
    async def delete_facility(facility_id: str, current_user) -> dict:
        """Delete a facility, but only when it has no rooms.

        Refuses rather than cascading, for the same reason room deletion does:
        the rooms underneath may hold material and history, and a cascade would
        take all of it without the operator seeing what they lost. Empty the
        facility first — that forces each room's own dependency check to run.
        """
        facility = await FacilityService.get_facility(facility_id)

        db = mushroom_db.get_database()
        room_count = await db.growing_rooms.count_documents({"facilityId": facility_id})
        substrate_count = await db.substrate_batches.count_documents(
            {"facilityId": facility_id}
        )

        if room_count or substrate_count:
            parts = []
            if room_count:
                parts.append(f"{room_count} room(s)")
            if substrate_count:
                parts.append(f"{substrate_count} substrate batch(es)")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Facility '{facility.name}' still contains {', '.join(parts)}. "
                    f"Delete those first — each room runs its own check for attached "
                    f"material, so emptying the facility this way cannot silently "
                    f"discard lineage or harvest records."
                ),
            )

        await db.mushroom_facilities.delete_one({"facilityId": facility_id})
        logger.info(
            f"[FacilityService] Deleted empty facility {facility.name} ({facility_id}) "
            f"by user {current_user.userId}"
        )
        return {"name": facility.name, "facilityId": facility_id}
