"""
Mushroom Management Module - Strain Service

CRUD operations for the mushroom_strains MongoDB collection.
Strains are reusable species/variety definitions (equivalent of Plant Data
in the vegetable module).
"""

import logging
from datetime import datetime
from typing import List, Tuple
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.strain import Strain, StrainCreate, StrainUpdate
from ..database import mushroom_db

logger = logging.getLogger(__name__)

# MongoDB stores "strainId"; the Pydantic model uses "id".
_MONGO_ID_KEY = "strainId"


def _doc_to_model(doc: dict) -> Strain:
    """Rename MongoDB's strainId → id before constructing the model."""
    doc.pop("_id", None)
    if _MONGO_ID_KEY in doc:
        doc["id"] = doc.pop(_MONGO_ID_KEY)
    return Strain(**doc)


def _model_to_doc(model: Strain) -> dict:
    """Rename model's id → strainId for MongoDB storage."""
    doc = model.model_dump()
    doc[_MONGO_ID_KEY] = doc.pop("id")
    return doc


class StrainService:
    """
    Service for managing mushroom strains.

    Handles CRUD operations against the mushroom_strains MongoDB collection.
    Strains are global catalog entries not scoped to a specific facility.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_strain(
        data: StrainCreate,
        current_user
    ) -> Strain:
        db = mushroom_db.get_database()

        strain = Strain(
            **data.model_dump(exclude_none=True),
            id=str(uuid4()),
            createdBy=current_user.userId,
            isActive=True,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = _model_to_doc(strain)
        try:
            await db.mushroom_strains.insert_one(doc)
        except Exception as e:
            logger.error(f"[StrainService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create strain"
            )

        logger.info(
            f"[StrainService] Created strain {strain.id} "
            f"'{strain.commonName}' by user {current_user.userId}"
        )
        return strain

    # ---------------------------------------------------------------------------
    # Read single
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_strain(strain_id: str) -> Strain:
        db = mushroom_db.get_database()
        doc = await db.mushroom_strains.find_one({_MONGO_ID_KEY: strain_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Strain '{strain_id}' not found"
            )
        return _doc_to_model(doc)

    # ---------------------------------------------------------------------------
    # Read list
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_strains(
        skip: int = 0,
        limit: int = 20,
        active_only: bool = False
    ) -> Tuple[List[Strain], int]:
        db = mushroom_db.get_database()
        query: dict = {}
        if active_only:
            query["isActive"] = True

        total = await db.mushroom_strains.count_documents(query)
        cursor = (
            db.mushroom_strains
            .find(query)
            .sort("commonName", 1)
            .skip(skip)
            .limit(limit)
        )

        strains: List[Strain] = []
        async for doc in cursor:
            strains.append(_doc_to_model(doc))

        return strains, total

    # ---------------------------------------------------------------------------
    # Update
    # ---------------------------------------------------------------------------

    @staticmethod
    async def update_strain(strain_id: str, data: StrainUpdate) -> Strain:
        await StrainService.get_strain(strain_id)

        update_fields = data.model_dump(exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update"
            )

        update_fields["updatedAt"] = datetime.utcnow()

        db = mushroom_db.get_database()
        await db.mushroom_strains.update_one(
            {_MONGO_ID_KEY: strain_id},
            {"$set": update_fields}
        )

        logger.info(f"[StrainService] Updated strain {strain_id}: {list(update_fields.keys())}")
        return await StrainService.get_strain(strain_id)
