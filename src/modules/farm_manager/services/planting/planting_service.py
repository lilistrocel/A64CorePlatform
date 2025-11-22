"""
Planting Service

Business logic for planting operations.
"""

from typing import List, Optional, Tuple
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from fastapi import HTTPException, status
import logging

from ...models.planting import Planting, PlantingCreate, PlantingItem
from ...models.block import BlockState
from ...services.block import BlockService
from ...services.plant_data import PlantDataService
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
        block = await BlockService.get_block_by_id(planting_data.blockId)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Block {planting_data.blockId} not found"
            )

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
            # Fetch plant data
            plant_data = await PlantDataService.get_plant_data(plant_item.plantDataId)
            if not plant_data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Plant data {plant_item.plantDataId} not found"
                )

            # Calculate yield for this plant type
            plant_yield = plant_data.expectedYieldPerPlant * plant_item.quantity
            total_predicted_yield += plant_yield

            # Track yield unit (all plants should have same unit)
            if yield_unit is None:
                yield_unit = plant_data.yieldUnit
            elif yield_unit != plant_data.yieldUnit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"All plants must have the same yield unit. Found {yield_unit} and {plant_data.yieldUnit}"
                )

            # Track longest growth cycle for harvest estimation
            if plant_data.growthCycleDays > longest_growth_cycle:
                longest_growth_cycle = plant_data.growthCycleDays

            # Create snapshot of plant data at planning time
            plant_snapshot = {
                "plantName": plant_data.plantName,
                "scientificName": plant_data.scientificName,
                "growthCycleDays": plant_data.growthCycleDays,
                "expectedYieldPerPlant": plant_data.expectedYieldPerPlant,
                "yieldUnit": plant_data.yieldUnit,
                "dataVersion": plant_data.dataVersion,
                "minTemperatureCelsius": plant_data.minTemperatureCelsius,
                "maxTemperatureCelsius": plant_data.maxTemperatureCelsius,
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

        # 7. Update block state to PLANNED and store current planting reference
        updated_block = await BlockService.update_block_state(
            block.blockId,
            BlockState.PLANNED,
            {"currentPlantingId": str(created_planting.plantingId)}
        )

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
        block = await BlockService.get_block_by_id(planting.blockId)
        if not block:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Block {planting.blockId} not found"
            )

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

        # 6. Update block state to GROWING
        updated_block = await BlockService.update_block_state(
            planting.blockId,
            BlockState.GROWING,
            {"lastPlantedAt": planted_at}
        )

        logger.info(
            f"[Planting Service] Marked planting {planting_id} as planted "
            f"by user {farmer_user_id}. Estimated harvest: {estimated_harvest_start.date()}"
        )

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
