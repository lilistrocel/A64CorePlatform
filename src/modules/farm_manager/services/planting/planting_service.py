"""
Planting Service

Business logic for planting operations.
"""

import asyncio
from typing import List, Optional, Tuple
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from fastapi import HTTPException, status
import logging

from ...models.planting import Planting, PlantingCreate, PlantingItem
from ...models.block import BlockState
from ...services.block import BlockService, BlockRepository
from ...services.plant_data import PlantDataEnhancedService
from .planting_repository import PlantingRepository

logger = logging.getLogger(__name__)


class PlantingService:
    """Service for planting business logic"""

    @staticmethod
    async def create_planting_plan(
        planting_data: PlantingCreate,
        planner_user_id: UUID,
        planner_email: str
    ) -> Tuple[Planting, dict]:
        """
        Create a planting plan for a block.

        This validates capacity, fetches plant data, calculates yield prediction,
        and transitions the block to PLANNED state.

        Args:
            planting_data: Planting creation data
            planner_user_id: User ID of planner
            planner_email: Email of planner

        Returns:
            Tuple of (created planting, updated block)

        Raises:
            HTTPException: If validation fails or block is not available
        """
        # 1. Validate block exists and is in EMPTY state
        # Reason: BlockService.get_block raises HTTP 404 on missing (no None check needed).
        block = await BlockService.get_block(planting_data.blockId)

        if block.state != BlockState.EMPTY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Block is not empty (current state: {block.state}). Cannot create planting plan."
            )

        # 2. Validate total plants doesn't exceed block capacity
        if planting_data.totalPlants > block.maxPlants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total plants ({planting_data.totalPlants}) exceeds block capacity ({block.maxPlants})"
            )

        # 3. Validate sum of individual plant quantities equals totalPlants
        actual_total = sum(plant.quantity for plant in planting_data.plants)
        if actual_total != planting_data.totalPlants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sum of plant quantities ({actual_total}) doesn't match totalPlants ({planting_data.totalPlants})"
            )

        # 4. Fetch plant data and create snapshots
        enriched_plants = []
        total_predicted_yield = 0.0
        yield_unit = None
        longest_growth_cycle = 0

        for plant_item in planting_data.plants:
            # Fetch plant data from plant_data_enhanced (the active collection).
            # PlantDataEnhancedService.get_plant_data raises HTTP 404 on missing,
            # so no additional None check is needed.
            plant_data = await PlantDataEnhancedService.get_plant_data(plant_item.plantDataId)

            # Resolve nested fields from the enhanced model.
            # Reason: enhanced model uses growthCycle.totalCycleDays and yieldInfo.* sub-documents.
            growth_cycle_days: int = plant_data.growthCycle.totalCycleDays
            yield_per_plant: float = plant_data.yieldInfo.yieldPerPlant
            plant_yield_unit: str = plant_data.yieldInfo.yieldUnit

            # Resolve temperature fields defensively — environmentalRequirements is Optional.
            # Pre-check confirmed all 57 dev docs have this field, but model allows None.
            env_reqs = plant_data.environmentalRequirements
            temp = env_reqs.temperature if env_reqs is not None else None
            min_temperature: float | None = temp.minCelsius if temp is not None else None
            max_temperature: float | None = temp.maxCelsius if temp is not None else None

            # Calculate yield for this plant type
            plant_yield = yield_per_plant * plant_item.quantity
            total_predicted_yield += plant_yield

            # Track yield unit (all plants should have same unit)
            if yield_unit is None:
                yield_unit = plant_yield_unit
            elif yield_unit != plant_yield_unit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"All plants must have the same yield unit. Found {yield_unit} and {plant_yield_unit}"
                )

            # Track longest growth cycle for harvest estimation
            if growth_cycle_days > longest_growth_cycle:
                longest_growth_cycle = growth_cycle_days

            # Create snapshot of plant data at planning time.
            # Snapshot dict keys are IDENTICAL to legacy — downstream consumers are unchanged.
            plant_snapshot = {
                "plantName": plant_data.plantName,
                "scientificName": plant_data.scientificName,
                "growthCycleDays": growth_cycle_days,
                "expectedYieldPerPlant": yield_per_plant,
                "yieldUnit": plant_yield_unit,
                "dataVersion": plant_data.dataVersion,
                "minTemperatureCelsius": min_temperature,
                "maxTemperatureCelsius": max_temperature,
            }

            enriched_plants.append(
                PlantingItem(
                    plantDataId=plant_item.plantDataId,
                    plantName=plant_data.plantName,
                    quantity=plant_item.quantity,
                    plantDataSnapshot=plant_snapshot
                )
            )

        # 5. Create planting record
        now = datetime.utcnow()

        planting = Planting(
            plantingId=uuid4(),
            blockId=planting_data.blockId,
            farmId=block.farmId,
            plants=enriched_plants,
            totalPlants=planting_data.totalPlants,
            plannedBy=planner_user_id,
            plannedByEmail=planner_email,
            plannedAt=now,
            predictedYield=round(total_predicted_yield, 2),
            yieldUnit=yield_unit or "kg",
            status="planned",
            createdAt=now,
            updatedAt=now
        )

        # 6. Save planting to database
        created_planting = await PlantingRepository.create(planting)

        # 7. Update block state to PLANNED and store current planting reference.
        # Reason: Using BlockRepository.update_status directly because PlantingService
        # has already validated the EMPTY→PLANNED transition above and must also set
        # currentPlantingId as additional context. This bypasses change_status's
        # pending-task guards (not applicable to a new planting plan creation).
        updated_block = await BlockRepository.update_status(
            block.blockId,
            BlockState.PLANNED,
            user_id=planner_user_id,
            user_email=planner_email,
            notes=f"Planting plan created: {created_planting.plantingId}"
        )
        if updated_block is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Block {block.blockId} not found during state update"
            )
        # Set currentPlantingId separately (not in BlockRepository.update_status signature).
        # Reason: update_status does not accept arbitrary extra fields; raw $set is needed.
        from ..database import farm_db as _farm_db
        _db = _farm_db.get_database()
        await _db.blocks.update_one(
            {"blockId": str(block.blockId)},
            {"$set": {"currentPlantingId": str(created_planting.plantingId)}}
        )
        # Re-fetch to reflect currentPlantingId in the returned block
        updated_block = await BlockRepository.get_by_id(block.blockId)

        logger.info(
            f"[Planting Service] Created planting plan {created_planting.plantingId} "
            f"for block {block.blockId} by user {planner_user_id}"
        )

        return created_planting, updated_block.model_dump(mode="json")

    @staticmethod
    async def mark_as_planted(
        planting_id: UUID,
        farmer_user_id: UUID,
        farmer_email: str
    ) -> Tuple[Planting, dict]:
        """
        Mark a planned planting as planted (farmer executes the plan).

        This transitions the block to GROWING state and calculates harvest estimation.

        Args:
            planting_id: Planting ID
            farmer_user_id: User ID of farmer
            farmer_email: Email of farmer

        Returns:
            Tuple of (updated planting, updated block)

        Raises:
            HTTPException: If planting not found or not in planned state
        """
        # 1. Get planting
        planting = await PlantingRepository.get_by_id(planting_id)
        if not planting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planting {planting_id} not found"
            )

        # 2. Validate planting is in planned state
        if planting.status != "planned":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Planting is not in planned state (current: {planting.status})"
            )

        # 3. Validate block is in PLANNED state
        # Reason: BlockService.get_block raises HTTP 404 on missing (no None check needed).
        block = await BlockService.get_block(planting.blockId)

        if block.state != BlockState.PLANNED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Block is not in planned state (current: {block.state})"
            )

        # 4. Calculate harvest estimation dates
        # Use the longest growth cycle among all plants
        longest_cycle = max(
            plant.plantDataSnapshot.get("growthCycleDays", 90)
            for plant in planting.plants
        )

        planted_at = datetime.utcnow()
        estimated_harvest_start = planted_at + timedelta(days=longest_cycle)
        estimated_harvest_end = estimated_harvest_start + timedelta(days=7)  # Assume 1 week harvest window

        # 5. Update planting record
        update_data = {
            "plantedBy": str(farmer_user_id),
            "plantedByEmail": farmer_email,
            "plantedAt": planted_at,
            "estimatedHarvestStartDate": estimated_harvest_start,
            "estimatedHarvestEndDate": estimated_harvest_end,
            "status": "planted"
        }

        updated_planting = await PlantingRepository.update(planting_id, update_data)

        # 6. Update block state to GROWING.
        # Reason: Using BlockRepository.update_status directly — PlantingService has
        # already validated PLANNED→GROWING transition above. BlockRepository sets
        # plantedDate automatically when transitioning to GROWING.
        updated_block = await BlockRepository.update_status(
            planting.blockId,
            BlockState.GROWING,
            user_id=farmer_user_id,
            user_email=farmer_email,
            notes=f"Farmer marked planting {planting_id} as planted"
        )
        if updated_block is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Block {planting.blockId} not found during state update"
            )

        logger.info(
            f"[Planting Service] Marked planting {planting_id} as planted "
            f"by user {farmer_user_id}. Estimated harvest: {estimated_harvest_start.date()}"
        )

        # 7. Fire SenseHub MCP sync (fire-and-log; never blocks the primary response).
        # Resolved block from the DB update is used so plantedDate is already set.
        _planting_id_for_sync = updated_planting.plantingId
        _block_for_sync = updated_block

        async def _sync_set_crop_data_on_planted() -> None:
            """
            Background task: push set_crop_data to SenseHub after mark_as_planted.

            Uses plant_data_enhanced (not the legacy plantDataSnapshot) per T-002 design.
            Skips silently when block has no iotController or plant data is unavailable.
            """
            from ..sensehub.sensehub_crop_sync import SenseHubCropSync
            from ..sensehub.sensehub_stage_mapper import compute_stage
            from ..plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository

            block_id_str = str(_block_for_sync.blockId)
            try:
                sync = SenseHubCropSync.from_block(_block_for_sync)
                if sync is None:
                    # No iotController — already logged inside from_block.
                    return

                # Resolve plant data fresh from plant_data_enhanced (bypasses T-003 legacy bug).
                if _block_for_sync.targetCrop is None:
                    logger.warning(
                        "[SenseHub] block %s has no targetCrop set after mark_as_planted — "
                        "skipping set_crop_data",
                        block_id_str,
                    )
                    return

                plant_data = await PlantDataEnhancedRepository.get_by_id(_block_for_sync.targetCrop)
                if plant_data is None:
                    logger.warning(
                        "[SenseHub] plant_data_enhanced not found for id=%s (block %s) — "
                        "skipping set_crop_data",
                        _block_for_sync.targetCrop,
                        block_id_str,
                    )
                    return

                # Compute initial stage from planting date (just set to now on this block).
                planted_date = _block_for_sync.plantedDate or planted_at
                initial_stage = compute_stage(
                    planted_date=planted_date,
                    plant_data_enhanced=plant_data,
                    block_state=_block_for_sync.state,
                )

                await sync.set_crop_data(
                    block=_block_for_sync,
                    planting_id=_planting_id_for_sync,
                    current_stage=initial_stage,
                    plant_data_enhanced=plant_data,
                )
                logger.info(
                    "[SenseHub] set_crop_data succeeded for block %s planting %s",
                    block_id_str,
                    _planting_id_for_sync,
                )
            except Exception as exc:
                logger.error(
                    "[SenseHub] set_crop_data task failed | operation=mark_as_planted "
                    "block_id=%s planting_id=%s | error: %s",
                    block_id_str,
                    _planting_id_for_sync,
                    str(exc)[:500],
                )

        asyncio.create_task(_sync_set_crop_data_on_planted())

        return updated_planting, updated_block.model_dump(mode="json")

    @staticmethod
    async def get_planting_by_id(planting_id: UUID) -> Planting:
        """
        Get planting by ID.

        Args:
            planting_id: Planting ID

        Returns:
            Planting

        Raises:
            HTTPException: If planting not found
        """
        planting = await PlantingRepository.get_by_id(planting_id)
        if not planting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planting {planting_id} not found"
            )

        return planting

    @staticmethod
    async def get_farm_plantings(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        status: Optional[str] = None
    ) -> Tuple[List[Planting], int]:
        """
        Get plantings for a farm with pagination.

        Args:
            farm_id: Farm ID
            page: Page number
            per_page: Items per page
            status: Filter by status

        Returns:
            Tuple of (plantings list, total count)
        """
        return await PlantingRepository.get_farm_plantings(farm_id, page, per_page, status)

    @staticmethod
    async def get_active_planting_for_block(block_id: UUID) -> Optional[Planting]:
        """
        Get active planting for a block.

        Args:
            block_id: Block ID

        Returns:
            Active planting if exists, None otherwise
        """
        return await PlantingRepository.get_by_block_id(block_id)
