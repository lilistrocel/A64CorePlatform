"""
Genetics Repo Module - Medium Service

Manages medium recipes and the batches poured from them.

Two behaviours carry the traceability weight:

* editing a recipe's formulation bumps its ``version`` — existing batches keep
  the snapshot they were made with, so history never gets rewritten;
* ``find_accessions_by_additive`` walks additive -> batch -> accession, which
  is the experiment readout: everything ever grown on a medium containing X.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from ...models.accession import Accession
from ...models.medium import (
    Batch,
    BatchCreate,
    BatchUpdate,
    Recipe,
    RecipeCreate,
    RecipeUpdate,
)
from ..common import (
    build_batch_code,
    doc_to_model,
    model_to_doc,
    scope_fields,
    slugify_code,
)
from ..database import ACCESSIONS, BATCHES, RECIPES, genetics_db
from ..protocol_link import build_protocol_ref

logger = logging.getLogger(__name__)

_RECIPE_ID_KEY = "recipeId"
_BATCH_ID_KEY = "batchId"
_ACCESSION_ID_KEY = "accessionId"

# Changing any of these fields means the formulation itself moved, which is
# what a version bump is meant to signal. Renaming or re-describing a recipe
# does not.
_FORMULATION_FIELDS = {
    "ingredients",
    "additives",
    "targetPh",
    "sterilization",
    "type",
}

_MAX_CODE_ATTEMPTS = 50


class MediumService:
    """Service for medium recipes and prepared batches."""

    # =======================================================================
    # Recipes
    # =======================================================================

    @staticmethod
    async def create_recipe(data: RecipeCreate, current_user: Any) -> Recipe:
        db = genetics_db.get_database()

        code = slugify_code(data.code)
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipe code must contain at least one alphanumeric character",
            )

        if await db[RECIPES].find_one({"code": code}, {"_id": 1}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A recipe with code '{code}' already exists",
            )

        payload = data.model_dump()
        payload["code"] = code
        recipe = Recipe(**payload, **scope_fields(current_user))

        await db[RECIPES].insert_one(model_to_doc(recipe, _RECIPE_ID_KEY))
        logger.info(f"[MediumService] Created recipe {recipe.code} v{recipe.version}")
        return recipe

    @staticmethod
    async def get_recipe(recipe_id: str) -> Recipe:
        db = genetics_db.get_database()
        doc = await db[RECIPES].find_one({_RECIPE_ID_KEY: recipe_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Medium recipe '{recipe_id}' not found",
            )
        return doc_to_model(doc, Recipe, _RECIPE_ID_KEY)

    @staticmethod
    async def list_recipes(
        skip: int = 0,
        limit: int = 20,
        medium_type: Optional[str] = None,
        search: Optional[str] = None,
        additive: Optional[str] = None,
        active_only: bool = False,
    ) -> Tuple[List[Recipe], int]:
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if medium_type:
            query["type"] = medium_type
        if active_only:
            query["isActive"] = True
        if additive:
            query["additives.name"] = {"$regex": additive, "$options": "i"}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"code": {"$regex": search, "$options": "i"}},
            ]

        total = await db[RECIPES].count_documents(query)
        cursor = db[RECIPES].find(query).sort("name", 1).skip(skip).limit(limit)

        recipes: List[Recipe] = []
        async for doc in cursor:
            recipes.append(doc_to_model(doc, Recipe, _RECIPE_ID_KEY))
        return recipes, total

    @staticmethod
    async def update_recipe(recipe_id: str, data: RecipeUpdate) -> Recipe:
        """Update a recipe, bumping the version when the formulation changes.

        Batches already poured are untouched — they carry their own snapshot.
        """
        existing = await MediumService.get_recipe(recipe_id)

        update_fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        db = genetics_db.get_database()

        if "code" in update_fields:
            new_code = slugify_code(update_fields["code"])
            clash = await db[RECIPES].find_one(
                {"code": new_code, _RECIPE_ID_KEY: {"$ne": recipe_id}}, {"_id": 1}
            )
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A recipe with code '{new_code}' already exists",
                )
            update_fields["code"] = new_code

        if _FORMULATION_FIELDS & set(update_fields.keys()):
            update_fields["version"] = existing.version + 1
            logger.info(
                f"[MediumService] Formulation changed for recipe {existing.code}; "
                f"version {existing.version} -> {update_fields['version']}"
            )

        update_fields["updatedAt"] = datetime.utcnow()
        await db[RECIPES].update_one(
            {_RECIPE_ID_KEY: recipe_id}, {"$set": update_fields}
        )
        return await MediumService.get_recipe(recipe_id)

    # =======================================================================
    # Batches
    # =======================================================================

    @staticmethod
    async def _mint_batch_code(recipe_code: str, prepared_at: datetime) -> str:
        """Generate the next free batch code for a recipe/month."""
        db = genetics_db.get_database()
        prefix = f"{slugify_code(recipe_code)}-{prepared_at.strftime('%y%m')}-"

        count = await db[BATCHES].count_documents(
            {"batchCode": {"$regex": f"^{prefix}"}}
        )

        sequence = count + 1
        for _ in range(_MAX_CODE_ATTEMPTS):
            candidate = build_batch_code(recipe_code, prepared_at, sequence)
            if not await db[BATCHES].find_one({"batchCode": candidate}, {"_id": 1}):
                return candidate
            sequence += 1

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate a unique batch code",
        )

    @staticmethod
    async def create_batch(data: BatchCreate, current_user: Any) -> Batch:
        """Record one prepared batch, snapshotting the recipe as it stands now."""
        recipe = await MediumService.get_recipe(data.recipeId)
        db = genetics_db.get_database()

        prepared_at = data.preparedAt or datetime.utcnow()
        code = data.batchCode or await MediumService._mint_batch_code(
            recipe.code, prepared_at
        )

        if data.batchCode and await db[BATCHES].find_one(
            {"batchCode": code}, {"_id": 1}
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Batch code '{code}' is already in use",
            )

        scope = scope_fields(current_user)
        protocol_ref = await build_protocol_ref(data.protocolId)
        batch = Batch(
            batchCode=code,
            recipeId=recipe.id,
            recipeVersion=recipe.version,
            recipeName=recipe.name,
            type=recipe.type,
            ingredientsSnapshot=recipe.ingredients,
            additivesSnapshot=recipe.additives,
            sterilization=data.sterilizationOverride or recipe.sterilization,
            preparedAt=prepared_at,
            preparedBy=data.preparedBy or scope.get("createdBy"),
            vesselCount=data.vesselCount,
            vesselType=data.vesselType,
            sterilizerRun=data.sterilizerRun,
            protocolRef=protocol_ref,
            notes=data.notes,
            divisionId=scope.get("divisionId"),
            organizationId=scope.get("organizationId"),
        )

        await db[BATCHES].insert_one(model_to_doc(batch, _BATCH_ID_KEY))
        logger.info(
            f"[MediumService] Prepared batch {batch.batchCode} "
            f"from {recipe.code} v{recipe.version} ({batch.vesselCount} vessels)"
        )
        return batch

    @staticmethod
    async def get_batch(batch_id: str) -> Batch:
        db = genetics_db.get_database()
        doc = await db[BATCHES].find_one({_BATCH_ID_KEY: batch_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Medium batch '{batch_id}' not found",
            )
        return doc_to_model(doc, Batch, _BATCH_ID_KEY)

    @staticmethod
    async def list_batches(
        skip: int = 0,
        limit: int = 20,
        recipe_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        additive: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Batch], int]:
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if recipe_id:
            query["recipeId"] = recipe_id
        if status_filter:
            query["status"] = status_filter
        if additive:
            query["additivesSnapshot.name"] = {"$regex": additive, "$options": "i"}
        if search:
            query["batchCode"] = {"$regex": search, "$options": "i"}

        total = await db[BATCHES].count_documents(query)
        cursor = db[BATCHES].find(query).sort("preparedAt", -1).skip(skip).limit(limit)

        batches: List[Batch] = []
        async for doc in cursor:
            batches.append(doc_to_model(doc, Batch, _BATCH_ID_KEY))
        return batches, total

    @staticmethod
    async def update_batch(batch_id: str, data: BatchUpdate) -> Batch:
        await MediumService.get_batch(batch_id)

        update_fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        update_fields["updatedAt"] = datetime.utcnow()
        db = genetics_db.get_database()
        await db[BATCHES].update_one({_BATCH_ID_KEY: batch_id}, {"$set": update_fields})
        return await MediumService.get_batch(batch_id)

    # =======================================================================
    # Experiment readout
    # =======================================================================

    @staticmethod
    async def find_accessions_by_additive(
        additive_name: str,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Accession], int, List[Batch]]:
        """Every accession ever grown on a medium containing a given additive.

        Walks additive -> batches -> accessions. Matching is done against the
        batch snapshots rather than the live recipes, so a since-removed
        additive still returns the material that was actually exposed to it.
        """
        db = genetics_db.get_database()

        batch_cursor = db[BATCHES].find(
            {"additivesSnapshot.name": {"$regex": additive_name, "$options": "i"}}
        )
        batches = [
            doc_to_model(doc, Batch, _BATCH_ID_KEY) async for doc in batch_cursor
        ]
        if not batches:
            return [], 0, []

        batch_ids = [b.id for b in batches]
        query = {"mediumBatchId": {"$in": batch_ids}}

        total = await db[ACCESSIONS].count_documents(query)
        cursor = (
            db[ACCESSIONS].find(query).sort("createdAt", -1).skip(skip).limit(limit)
        )
        accessions = [
            doc_to_model(doc, Accession, _ACCESSION_ID_KEY) async for doc in cursor
        ]

        return accessions, total, batches

    @staticmethod
    async def get_batch_codes(batch_ids: List[str]) -> Dict[str, str]:
        """Map batch ids to their codes for denormalised display."""
        if not batch_ids:
            return {}
        db = genetics_db.get_database()
        cursor = db[BATCHES].find(
            {_BATCH_ID_KEY: {"$in": list(set(batch_ids))}},
            {_BATCH_ID_KEY: 1, "batchCode": 1},
        )
        return {doc[_BATCH_ID_KEY]: doc.get("batchCode", "") async for doc in cursor}
