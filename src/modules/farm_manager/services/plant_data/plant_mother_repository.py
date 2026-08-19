"""
PlantMother Repository - Data Access Layer (Plant Library Phase 1)

Minimal skeleton for the `plant_mothers` collection — enough for the
collection to be indexed and queryable through the same pattern as every
other farm_manager collection. This phase does NOT build a CRUD API on top
of it (that is future work); the migration script
(scripts/migrations/plant_library_mother_variety_migration.py) talks to
Mongo directly via Motor rather than through this repository, matching this
codebase's existing migration-script convention (see
scripts/migrations/wave4_purchasing_status_migration.py) — standalone
scripts run outside the FastAPI app context, so they do not go through
app repositories.
"""

from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging
import re

from ...models.plant_mother import PlantMother, PlantMotherCreate, PlantMotherUpdate
from ..database import farm_db
from .plant_data_enhanced_repository import PlantDataEnhancedRepository

logger = logging.getLogger(__name__)


class PlantMotherRepository:
    """Repository for mother-plant (product) data access"""

    # Collection name
    COLLECTION = "plant_mothers"

    @staticmethod
    async def create(
        mother_data: PlantMotherCreate,
        created_by: Optional[UUID] = None,
        created_by_email: Optional[str] = None,
        organization_id: Optional[str] = None,
        division_id: Optional[str] = None,
    ) -> PlantMother:
        """
        Create a new mother plant (product).

        Args:
            mother_data: Mother plant creation data
            created_by: User ID creating the product (None for system/migration writes)
            created_by_email: Email of user creating the product
            organization_id: Org scope, stamped by the service from the
                acting user (not client-supplied) — mirrors PlantDataEnhanced's
                treatment of scoping fields.
            division_id: Division scope, same treatment as organization_id.

        Returns:
            Created PlantMother object

        Raises:
            Exception: If database operation fails
        """
        db = farm_db.get_database()

        mother = PlantMother(
            **mother_data.model_dump(),
            createdBy=created_by,
            createdByEmail=created_by_email,
            organizationId=organization_id,
            divisionId=division_id,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
            deletedAt=None,
        )

        mother_dict = mother.model_dump()
        mother_dict["plantMotherId"] = str(mother_dict["plantMotherId"])
        if mother_dict.get("createdBy") is not None:
            mother_dict["createdBy"] = str(mother_dict["createdBy"])

        # Reason: Parameterized insert prevents injection
        result = await db[PlantMotherRepository.COLLECTION].insert_one(mother_dict)

        if not result.inserted_id:
            raise Exception("Failed to create mother plant")

        logger.info(
            f"[PlantMother Repository] Created mother plant: "
            f"{mother.plantMotherId} - {mother.plantName}"
        )
        return mother

    @staticmethod
    async def get_by_id(
        plant_mother_id: UUID, include_deleted: bool = False
    ) -> Optional[PlantMother]:
        """
        Get a mother plant by ID.

        Args:
            plant_mother_id: PlantMother ID
            include_deleted: Include soft-deleted records

        Returns:
            PlantMother object if found, None otherwise
        """
        db = farm_db.get_database()

        query = {"plantMotherId": str(plant_mother_id)}
        if not include_deleted:
            query["deletedAt"] = None

        # Reason: Parameterized query prevents injection
        mother_doc = await db[PlantMotherRepository.COLLECTION].find_one(query)

        if not mother_doc:
            return None

        return PlantMother(**mother_doc)

    @staticmethod
    async def get_by_name(
        plant_name: str, include_deleted: bool = False
    ) -> Optional[PlantMother]:
        """
        Get a mother plant by product name.

        Args:
            plant_name: Product name
            include_deleted: Include soft-deleted records

        Returns:
            PlantMother object if found, None otherwise
        """
        db = farm_db.get_database()

        query = {"plantName": plant_name}
        if not include_deleted:
            query["deletedAt"] = None

        # Reason: Parameterized query prevents injection
        mother_doc = await db[PlantMotherRepository.COLLECTION].find_one(query)

        if not mother_doc:
            return None

        return PlantMother(**mother_doc)

    @staticmethod
    async def get_active_mothers() -> List[PlantMother]:
        """
        Get all active mother plants (products), sorted by name.

        Returns:
            List of active PlantMother objects
        """
        db = farm_db.get_database()

        query = {"deletedAt": None, "isActive": {"$ne": False}}

        cursor = db[PlantMotherRepository.COLLECTION].find(query).sort("plantName", 1)
        mother_docs = await cursor.to_list(length=1000)
        return [PlantMother(**doc) for doc in mother_docs]

    # ==================== Phase 2: full CRUD ====================

    @staticmethod
    async def list_mothers(
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List mother plants (excluding soft-deleted), each annotated with
        varietyCount — the count of active, non-deleted plant_data_enhanced
        docs referencing it.

        Org scoping: filters by organization_id only when one is supplied
        (matches how the acting user's org is threaded through elsewhere in
        this module — see PlantMotherService.list_mothers). Passing None
        returns mothers across all orgs, same as every other farm_manager
        plant-library listing endpoint today (plant_data_enhanced search is
        unscoped entirely).

        Returns:
            Tuple of (list of PlantMother-shaped dicts + varietyCount, total count).
            Plain dicts, not PlantMother instances, since varietyCount isn't
            a model field — the router wraps each into
            PlantMotherWithVarietyCount.
        """
        db = farm_db.get_database()

        query: Dict[str, Any] = {"deletedAt": None}
        if organization_id:
            query["organizationId"] = organization_id
        if search:
            pattern = re.escape(search)
            query["$or"] = [
                {"plantName": {"$regex": pattern, "$options": "i"}},
                {"scientificName": {"$regex": pattern, "$options": "i"}},
            ]

        total = await db[PlantMotherRepository.COLLECTION].count_documents(query)

        cursor = (
            db[PlantMotherRepository.COLLECTION]
            .find(query)
            .sort("plantName", 1)
            .skip(skip)
            .limit(limit)
        )
        mother_docs = await cursor.to_list(length=limit)

        results: List[Dict[str, Any]] = []
        for doc in mother_docs:
            mother = PlantMother(**doc)
            # Reason: simple per-row count rather than an aggregation
            # $lookup — this collection is expected to stay small (product
            # count, not variety/block count), so N+1 count_documents calls
            # per page (N <= limit, default 20, max 100) keeps the code
            # simple and easy to verify at the cost of a bit of query
            # volume, per this project's KISS principle.
            variety_count = await db[
                PlantDataEnhancedRepository.COLLECTION
            ].count_documents(
                {
                    "motherPlantId": str(mother.plantMotherId),
                    "isActive": True,
                    "deletedAt": None,
                }
            )
            results.append({**mother.model_dump(), "varietyCount": variety_count})

        return results, total

    @staticmethod
    async def update(
        plant_mother_id: UUID, update_data: PlantMotherUpdate
    ) -> Optional[PlantMother]:
        """
        Update a mother plant's fields (plantName/scientificName/plantType/
        isActive). Does NOT cascade denormalized copies itself — that is
        PlantMotherService.update_mother's job, since it needs to compare
        old vs. new plantName/scientificName to decide whether a cascade is
        needed at all.

        Returns:
            Updated PlantMother, or None if not found / already deleted.
        """
        db = farm_db.get_database()

        current = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not current:
            return None

        update_dict = {
            k: v
            for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }
        if not update_dict:
            return current

        update_dict["updatedAt"] = datetime.utcnow()

        result = await db[PlantMotherRepository.COLLECTION].update_one(
            {"plantMotherId": str(plant_mother_id), "deletedAt": None},
            {"$set": update_dict},
        )
        if result.matched_count == 0:
            return None

        logger.info(f"[PlantMother Repository] Updated mother plant: {plant_mother_id}")
        return await PlantMotherRepository.get_by_id(plant_mother_id)

    @staticmethod
    async def soft_delete(plant_mother_id: UUID) -> bool:
        """
        Soft-delete a mother plant (deletedAt + isActive=False).

        Callers must have already verified there are zero active varieties
        referencing this mother (PlantMotherService.delete_mother's 409
        guard) — this method itself does not check, so it stays a pure
        data-access primitive.
        """
        db = farm_db.get_database()

        result = await db[PlantMotherRepository.COLLECTION].update_one(
            {"plantMotherId": str(plant_mother_id), "deletedAt": None},
            {
                "$set": {
                    "deletedAt": datetime.utcnow(),
                    "isActive": False,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        if result.matched_count > 0:
            logger.info(
                f"[PlantMother Repository] Soft-deleted mother plant: {plant_mother_id}"
            )
        return result.matched_count > 0

    @staticmethod
    async def cascade_rename(
        plant_mother_id: UUID,
        plant_name: str,
        scientific_name: Optional[str],
    ) -> Dict[str, int]:
        """
        Push a renamed mother's plantName/scientificName down onto its
        denormalized copies, so downstream display stays consistent with
        the product record instead of freezing on a stale name:

        - plant_data_enhanced (varieties): plantName + scientificName,
          matched by motherPlantId. Not scoped to isActive/deletedAt — an
          inactive or soft-deleted variety should still show the correct
          product name if it's ever surfaced again, not a stale one.
        - blocks: productName only, matched by productMotherId. blocks
          never stored scientificName in the first place (only
          productMotherId/productName — see models/block.py), so there is
          nothing to cascade there for a scientificName-only change.
        - block_archives: productName only, matched by productMotherId,
          same reasoning as blocks (historical cycles should still read the
          current product name, not the one at time of archival).

        Returns:
            Dict of modified counts per collection, for logging.
        """
        db = farm_db.get_database()
        mother_id_str = str(plant_mother_id)
        now = datetime.utcnow()

        varieties_result = await db[PlantDataEnhancedRepository.COLLECTION].update_many(
            {"motherPlantId": mother_id_str},
            {
                "$set": {
                    "plantName": plant_name,
                    "scientificName": scientific_name,
                    "updatedAt": now,
                }
            },
        )
        blocks_result = await db.blocks.update_many(
            {"productMotherId": mother_id_str},
            {"$set": {"productName": plant_name, "updatedAt": now}},
        )
        archives_result = await db.block_archives.update_many(
            {"productMotherId": mother_id_str},
            {"$set": {"productName": plant_name}},
        )

        return {
            "varietiesUpdated": varieties_result.modified_count,
            "blocksUpdated": blocks_result.modified_count,
            "blockArchivesUpdated": archives_result.modified_count,
        }
