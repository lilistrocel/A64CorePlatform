"""
Mushroom Management Module - Substrate Batch Service

CRUD operations for the substrate_batches MongoDB collection.
Tracks substrate preparation, sterilization, and assignment to growing rooms.
"""

import logging
from datetime import datetime
from typing import List, Tuple
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.substrate import SubstrateBatch, SubstrateBatchCreate, SubstrateBatchUpdate
from ..database import mushroom_db

logger = logging.getLogger(__name__)


class SubstrateService:
    """
    Service for managing substrate batches within a mushroom facility.

    Handles CRUD operations against the substrate_batches MongoDB collection.
    Substrate batches are scoped to a facility and track preparation, sterilization
    status, and which growing rooms are using the batch.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_batch(
        facility_id: str,
        data: SubstrateBatchCreate,
        current_user
    ) -> SubstrateBatch:
        """
        Create a new substrate batch for a facility.

        Args:
            facility_id: Parent facility ID (validated to exist).
            data: Validated batch creation payload.
            current_user: Authenticated user.

        Returns:
            The newly-created SubstrateBatch document.

        Raises:
            HTTPException 404: If the facility does not exist.
            HTTPException 409: If a batch with the same batchCode exists in the facility.
            HTTPException 500: If the database insert fails.
        """
        db = mushroom_db.get_database()

        # Validate parent facility exists
        facility_doc = await db.mushroom_facilities.find_one({"facilityId": facility_id})
        if not facility_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Facility '{facility_id}' not found"
            )

        # Enforce unique batchCode per facility
        existing = await db.substrate_batches.find_one(
            {"facilityId": facility_id, "batchCode": data.batchCode}
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Batch code '{data.batchCode}' already exists "
                    f"in facility '{facility_id}'"
                )
            )

        batch = SubstrateBatch(
            **data.model_dump(),
            batchId=str(uuid4()),
            facilityId=facility_id,
            assignedRooms=[],
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = batch.model_dump()
        try:
            await db.substrate_batches.insert_one(doc)
        except Exception as e:
            logger.error(f"[SubstrateService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create substrate batch"
            )

        logger.info(
            f"[SubstrateService] Created batch {batch.batchId} "
            f"in facility {facility_id} by user {current_user.userId}"
        )
        return batch

    # ---------------------------------------------------------------------------
    # Read single
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_batch(batch_id: str) -> SubstrateBatch:
        """
        Retrieve a substrate batch by its batchId.

        Args:
            batch_id: UUID string of the substrate batch.

        Returns:
            SubstrateBatch document.

        Raises:
            HTTPException 404: If no batch with that ID exists.
        """
        db = mushroom_db.get_database()
        doc = await db.substrate_batches.find_one({"batchId": batch_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Substrate batch '{batch_id}' not found"
            )
        doc.pop("_id", None)
        return SubstrateBatch(**doc)

    # ---------------------------------------------------------------------------
    # Read list
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_batches(
        facility_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> Tuple[List[SubstrateBatch], int]:
        """
        Return a paginated list of substrate batches for a facility.

        Args:
            facility_id: Parent facility ID.
            skip: Number of documents to skip.
            limit: Maximum number of documents to return.

        Returns:
            Tuple of (list of SubstrateBatch objects, total count).
        """
        db = mushroom_db.get_database()
        query = {"facilityId": facility_id}

        total = await db.substrate_batches.count_documents(query)
        cursor = (
            db.substrate_batches
            .find(query)
            .sort([("createdAt", -1)])
            .skip(skip)
            .limit(limit)
        )

        batches: List[SubstrateBatch] = []
        async for doc in cursor:
            doc.pop("_id", None)
            batches.append(SubstrateBatch(**doc))

        return batches, total

    # ---------------------------------------------------------------------------
    # Update
    # ---------------------------------------------------------------------------

    @staticmethod
    async def update_batch(batch_id: str, data: SubstrateBatchUpdate) -> SubstrateBatch:
        """
        Partially update a substrate batch document.

        Args:
            batch_id: UUID string of the batch to update.
            data: Fields to update (all optional).

        Returns:
            Updated SubstrateBatch document.

        Raises:
            HTTPException 404: If the batch does not exist.
            HTTPException 400: If the update payload is empty.
        """
        # Ensure batch exists
        await SubstrateService.get_batch(batch_id)

        update_fields = data.model_dump(exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update"
            )

        update_fields["updatedAt"] = datetime.utcnow()

        db = mushroom_db.get_database()
        await db.substrate_batches.update_one(
            {"batchId": batch_id},
            {"$set": update_fields}
        )

        logger.info(f"[SubstrateService] Updated batch {batch_id}: {list(update_fields.keys())}")
        return await SubstrateService.get_batch(batch_id)
