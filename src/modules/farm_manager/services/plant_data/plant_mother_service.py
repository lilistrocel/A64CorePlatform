"""
PlantMother Service - Business Logic Layer (Plant Library Phase 2)

Business logic for the mother-plant (product) CRUD API and for creating
varieties underneath a mother. Phase 1 shipped the model + a minimal
repository skeleton only (see plant_mother_repository.py's module docstring)
- this is the first place mothers are created/updated/deleted through the
running app rather than only via the migration script.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.plant_mother import (
    PlantMother,
    PlantMotherCreate,
    PlantMotherUpdate,
    PlantMotherWithVarietyCount,
    PlantMotherWithVarieties,
    VarietySummary,
    VarietyCreateForMother,
)
from ...models.plant_data_enhanced import PlantDataEnhanced, PlantDataEnhancedCreate
from .plant_mother_repository import PlantMotherRepository
from .plant_data_enhanced_repository import PlantDataEnhancedRepository
from .plant_data_enhanced_service import PlantDataEnhancedService

logger = logging.getLogger(__name__)


class PlantMotherService:
    """Service for mother-plant (product) business logic"""

    @staticmethod
    async def create_mother(
        data: PlantMotherCreate,
        user_id: UUID,
        user_email: str,
        organization_id: Optional[str] = None,
        division_id: Optional[str] = None,
    ) -> PlantMother:
        """
        Create a new mother plant (product).

        Raises:
            HTTPException: 409 if a mother with the same plantName already exists.
        """
        existing = await PlantMotherRepository.get_by_name(data.plantName)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Mother plant '{data.plantName}' already exists",
            )

        mother = await PlantMotherRepository.create(
            data,
            created_by=user_id,
            created_by_email=user_email,
            organization_id=organization_id,
            division_id=division_id,
        )

        logger.info(
            f"[PlantMother Service] User {user_id} created mother plant: "
            f"{mother.plantMotherId} - {mother.plantName}"
        )
        return mother

    @staticmethod
    async def list_mothers(
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> Tuple[List[PlantMotherWithVarietyCount], int, int]:
        """
        List mother plants with varietyCount, search, and pagination.

        Returns:
            Tuple of (list of mothers w/ varietyCount, total count, total pages)
        """
        if per_page > 100:
            per_page = 100
        skip = (page - 1) * per_page

        rows, total = await PlantMotherRepository.list_mothers(
            skip=skip,
            limit=per_page,
            search=search,
            organization_id=organization_id,
        )
        mothers = [PlantMotherWithVarietyCount(**row) for row in rows]
        total_pages = (total + per_page - 1) // per_page if total else 0

        return mothers, total, total_pages

    @staticmethod
    async def get_mother(plant_mother_id: UUID) -> PlantMotherWithVarieties:
        """
        Get a mother plant by ID, with its active varieties embedded.

        Raises:
            HTTPException: 404 if not found or soft-deleted.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        varieties = await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )
        variety_summaries = [
            VarietySummary(
                plantDataId=v.plantDataId,
                varietyName=v.varietyName,
                isActive=v.isActive,
            )
            for v in varieties
        ]

        return PlantMotherWithVarieties(
            **mother.model_dump(), varieties=variety_summaries
        )

    @staticmethod
    async def update_mother(
        plant_mother_id: UUID, update_data: PlantMotherUpdate
    ) -> PlantMother:
        """
        Update a mother plant. When plantName/scientificName change, cascades
        the new values down onto its varieties (plant_data_enhanced) and
        blocks'/block_archives' denormalized productName, so downstream
        display never freezes on a stale product name.

        Raises:
            HTTPException: 404 if not found; 409 if renaming onto a name
                already used by a different mother.
        """
        current = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not current:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        if update_data.plantName and update_data.plantName != current.plantName:
            name_clash = await PlantMotherRepository.get_by_name(update_data.plantName)
            if name_clash and name_clash.plantMotherId != current.plantMotherId:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Mother plant '{update_data.plantName}' already exists",
                )

        name_changed = (
            update_data.plantName is not None
            and update_data.plantName != current.plantName
        ) or (
            update_data.scientificName is not None
            and update_data.scientificName != current.scientificName
        )

        updated = await PlantMotherRepository.update(plant_mother_id, update_data)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        if name_changed:
            cascade_counts = await PlantMotherRepository.cascade_rename(
                plant_mother_id, updated.plantName, updated.scientificName
            )
            logger.info(
                f"[PlantMother Service] Cascaded rename for mother "
                f"{plant_mother_id} ('{updated.plantName}'): {cascade_counts}"
            )

        logger.info(f"[PlantMother Service] Updated mother plant: {plant_mother_id}")
        return updated

    @staticmethod
    async def delete_mother(plant_mother_id: UUID) -> None:
        """
        Soft-delete a mother plant.

        Raises:
            HTTPException: 404 if not found; 409 if it still has active
                varieties (the user must remove/move them first — this
                endpoint deliberately does not cascade-delete varieties).
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        active_varieties = await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )
        if active_varieties:
            count = len(active_varieties)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Cannot delete mother plant '{mother.plantName}': "
                    f"{count} active variet{'y' if count == 1 else 'ies'} still "
                    f"reference it. Deactivate or reassign them first."
                ),
            )

        deleted = await PlantMotherRepository.soft_delete(plant_mother_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mother plant not found or already deleted",
            )

        logger.info(
            f"[PlantMother Service] Soft-deleted mother plant: {plant_mother_id}"
        )

    @staticmethod
    async def list_varieties(plant_mother_id: UUID) -> List[PlantDataEnhanced]:
        """
        List active varieties belonging to a mother.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        return await PlantDataEnhancedRepository.get_by_mother(
            plant_mother_id, active_only=True
        )

    @staticmethod
    async def create_variety_for_mother(
        plant_mother_id: UUID,
        variety_data: VarietyCreateForMother,
        user_id: UUID,
        user_email: str,
    ) -> PlantDataEnhanced:
        """
        Create a new variety (plant_data_enhanced doc) under a mother.

        Basic info (plantName/scientificName) is COPIED from the mother —
        never taken from the request, even if the client sends it (see
        VarietyCreateForMother's docstring). Detailed cultivation fields
        reuse PlantDataEnhancedService's validation
        (_validate_detail_fields) so both creation paths enforce identical
        rules.

        Raises:
            HTTPException: 404 if the mother doesn't exist / is soft-deleted;
                409 if a variety with the same varietyName already exists
                under this mother.
        """
        mother = await PlantMotherRepository.get_by_id(plant_mother_id)
        if not mother:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Mother plant not found: {plant_mother_id}",
            )

        existing = await PlantDataEnhancedRepository.get_by_mother_and_variety_name(
            plant_mother_id, variety_data.varietyName
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Variety '{variety_data.varietyName}' already exists under "
                    f"mother plant '{mother.plantName}'"
                ),
            )

        # Build the full create payload with basic info sourced from the
        # mother, not the request (exclude the client's plantName/
        # scientificName/varietyName entirely rather than merely overwriting
        # them, so there is no ambiguity about which value wins).
        detail_fields = variety_data.model_dump(
            exclude={"plantName", "scientificName", "varietyName"}
        )
        create_payload = PlantDataEnhancedCreate(
            plantName=mother.plantName,
            scientificName=mother.scientificName,
            **detail_fields,
        )

        PlantDataEnhancedService._validate_detail_fields(create_payload)

        variety = await PlantDataEnhancedRepository.create(
            create_payload,
            user_id,
            user_email,
            mother_plant_id=plant_mother_id,
            variety_name=variety_data.varietyName,
        )

        logger.info(
            f"[PlantMother Service] User {user_id} created variety "
            f"{variety.plantDataId} ('{variety_data.varietyName}') under mother "
            f"{plant_mother_id} ('{mother.plantName}')"
        )
        return variety
