"""
Task Generator Service - Business Logic Layer

Generates tasks automatically based on block state transitions.
Tasks are created BEFORE the state change completes to ensure atomicity.
"""

from typing import List, Dict, Optional
from uuid import UUID
from datetime import datetime, timedelta
import logging
from fastapi import HTTPException

from ...models.farm_task import FarmTask, FarmTaskCreate, TaskType, TaskStatus
from ...models.block import BlockStatus
from ...models.plant_data_enhanced import PlantDataEnhanced
from .task_repository import TaskRepository

logger = logging.getLogger(__name__)


class TaskGeneratorService:
    """Service for generating tasks based on block state transitions"""

    @staticmethod
    async def generate_tasks_for_transition(
        block_id: UUID,
        from_state: BlockStatus,
        to_state: BlockStatus,
        plant_data: PlantDataEnhanced,
        expected_dates: Dict[str, datetime],
        plant_count: int,
        block_name: str,
        block_code: str,
        farm_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate tasks based on state transition

        State transition mapping:
        - EMPTY → PLANNED: Generate "Plant {crop} on {date}" task
        - PLANNED → GROWING: Generate fruiting check OR harvest start task
        - GROWING → FRUITING: Generate harvest start task
        - GROWING/FRUITING → HARVESTING: Generate daily harvest task
        - HARVESTING → CLEANING: Generate cleaning task

        Args:
            block_id: Block ID
            from_state: Current block state
            to_state: New block state
            plant_data: Plant data for the crop
            expected_dates: Dict of expected status change dates
            plant_count: Number of plants in block
            block_name: Block name
            block_code: Block code
            farm_id: Farm ID
            user_id: User performing transition
            user_email: User email

        Returns:
            List of created FarmTask objects

        Raises:
            HTTPException: If task generation fails
        """
        tasks = []

        try:
            # EMPTY → PLANNED: Generate planting task
            if from_state == BlockStatus.EMPTY and to_state == BlockStatus.PLANNED:
                tasks = await TaskGeneratorService._generate_planting_task(
                    block_id=block_id,
                    farm_id=farm_id,
                    plant_data=plant_data,
                    expected_dates=expected_dates,
                    plant_count=plant_count,
                    block_name=block_name,
                    block_code=block_code,
                    user_id=user_id,
                    user_email=user_email
                )

            # PLANNED → GROWING: Generate next phase task
            elif from_state == BlockStatus.PLANNED and to_state == BlockStatus.GROWING:
                tasks = await TaskGeneratorService._generate_growing_phase_tasks(
                    block_id=block_id,
                    farm_id=farm_id,
                    plant_data=plant_data,
                    expected_dates=expected_dates,
                    block_name=block_name,
                    block_code=block_code,
                    user_id=user_id,
                    user_email=user_email
                )

            # GROWING → FRUITING: Generate harvest readiness task
            elif from_state == BlockStatus.GROWING and to_state == BlockStatus.FRUITING:
                tasks = await TaskGeneratorService._generate_harvest_readiness_task(
                    block_id=block_id,
                    farm_id=farm_id,
                    plant_data=plant_data,
                    expected_dates=expected_dates,
                    block_name=block_name,
                    block_code=block_code,
                    user_id=user_id,
                    user_email=user_email
                )

            # GROWING/FRUITING → HARVESTING: Generate daily harvest task
            elif (from_state in [BlockStatus.GROWING, BlockStatus.FRUITING] and
                  to_state == BlockStatus.HARVESTING):
                tasks = await TaskGeneratorService._generate_daily_harvest_task(
                    block_id=block_id,
                    farm_id=farm_id,
                    plant_data=plant_data,
                    block_name=block_name,
                    block_code=block_code,
                    user_id=user_id,
                    user_email=user_email
                )

            # HARVESTING → CLEANING: Generate cleaning task
            elif from_state == BlockStatus.HARVESTING and to_state == BlockStatus.CLEANING:
                tasks = await TaskGeneratorService._generate_cleaning_task(
                    block_id=block_id,
                    farm_id=farm_id,
                    block_name=block_name,
                    block_code=block_code,
                    user_id=user_id,
                    user_email=user_email
                )

            else:
                # No tasks to generate for this transition
                logger.info(
                    f"[TaskGenerator] No tasks to generate for {from_state.value} → {to_state.value}"
                )
                return []

            logger.info(
                f"[TaskGenerator] Generated {len(tasks)} tasks for block {block_code} "
                f"transition {from_state.value} → {to_state.value}"
            )
            return tasks

        except Exception as e:
            logger.error(
                f"[TaskGenerator] Failed to generate tasks for {from_state.value} → {to_state.value}: {e}",
                exc_info=True
            )
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate tasks for state transition: {str(e)}"
            )

    @staticmethod
    async def _generate_planting_task(
        block_id: UUID,
        farm_id: UUID,
        plant_data: PlantDataEnhanced,
        expected_dates: Dict[str, datetime],
        plant_count: int,
        block_name: str,
        block_code: str,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate planting task for EMPTY → PLANNED transition

        Task: "Plant {crop_name} on {planned_date}"
        """
        planted_date = expected_dates.get("planted")
        if not planted_date:
            planted_date = datetime.utcnow()

        # Format date for title
        date_str = planted_date.strftime("%Y-%m-%d")

        task_data = FarmTaskCreate(
            farmId=farm_id,
            blockId=block_id,
            taskType=TaskType.PLANTING,
            title=f"Plant {plant_data.plantName} on {date_str}",
            description=f"Plant {plant_count} {plant_data.plantName} plants in Block {block_name} ({block_code})",
            priority=8,  # High priority
            scheduledDate=planted_date,
            metadata={
                "targetCrop": str(plant_data.plantId),
                "targetCropName": plant_data.plantName,
                "plantCount": plant_count,
                "blockName": block_name,
                "blockCode": block_code
            }
        )

        task = await TaskRepository.create(task_data, user_id, user_email)
        return [task]

    @staticmethod
    async def _generate_growing_phase_tasks(
        block_id: UUID,
        farm_id: UUID,
        plant_data: PlantDataEnhanced,
        expected_dates: Dict[str, datetime],
        block_name: str,
        block_code: str,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate next phase task for PLANNED → GROWING transition

        If plant has fruiting phase: Generate "Check if {crop} is fruiting"
        If no fruiting phase: Generate "Start harvesting {crop}"
        """
        # Check if plant has fruiting phase
        has_fruiting = (
            plant_data.growthCycle and
            plant_data.growthCycle.fruitingDays is not None and
            plant_data.growthCycle.fruitingDays > 0
        )

        if has_fruiting:
            # Generate fruiting check task
            fruiting_date = expected_dates.get("fruiting")
            if not fruiting_date:
                # Fallback if no fruiting date
                fruiting_date = datetime.utcnow() + timedelta(days=30)

            date_str = fruiting_date.strftime("%Y-%m-%d")

            task_data = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.FRUITING_CHECK,
                title=f"Check if {plant_data.plantName} is fruiting",
                description=f"Inspect Block {block_name} ({block_code}) to verify {plant_data.plantName} has started fruiting phase",
                priority=6,  # Medium-high priority
                scheduledDate=fruiting_date,
                metadata={
                    "targetCrop": str(plant_data.plantId),
                    "targetCropName": plant_data.plantName,
                    "blockName": block_name,
                    "blockCode": block_code,
                    "expectedDate": date_str
                }
            )

            task = await TaskRepository.create(task_data, user_id, user_email)
            return [task]

        else:
            # Generate harvest readiness task (skip fruiting)
            harvesting_date = expected_dates.get("harvesting")
            if not harvesting_date:
                # Fallback if no harvesting date
                harvesting_date = datetime.utcnow() + timedelta(days=45)

            date_str = harvesting_date.strftime("%Y-%m-%d")

            task_data = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.HARVEST_READINESS,
                title=f"Start harvesting {plant_data.plantName}",
                description=f"Begin harvest operations for {plant_data.plantName} in Block {block_name} ({block_code})",
                priority=7,  # High priority
                scheduledDate=harvesting_date,
                metadata={
                    "targetCrop": str(plant_data.plantId),
                    "targetCropName": plant_data.plantName,
                    "blockName": block_name,
                    "blockCode": block_code,
                    "expectedDate": date_str
                }
            )

            task = await TaskRepository.create(task_data, user_id, user_email)
            return [task]

    @staticmethod
    async def _generate_harvest_readiness_task(
        block_id: UUID,
        farm_id: UUID,
        plant_data: PlantDataEnhanced,
        expected_dates: Dict[str, datetime],
        block_name: str,
        block_code: str,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate harvest readiness task for GROWING → FRUITING transition

        Task: "Start harvesting {crop_name}"
        """
        harvesting_date = expected_dates.get("harvesting")
        if not harvesting_date:
            # Fallback if no harvesting date
            harvesting_date = datetime.utcnow() + timedelta(days=14)

        date_str = harvesting_date.strftime("%Y-%m-%d")

        task_data = FarmTaskCreate(
            farmId=farm_id,
            blockId=block_id,
            taskType=TaskType.HARVEST_READINESS,
            title=f"Start harvesting {plant_data.plantName}",
            description=f"Begin harvest operations for {plant_data.plantName} in Block {block_name} ({block_code})",
            priority=7,  # High priority
            scheduledDate=harvesting_date,
            metadata={
                "targetCrop": str(plant_data.plantId),
                "targetCropName": plant_data.plantName,
                "blockName": block_name,
                "blockCode": block_code,
                "expectedDate": date_str
            }
        )

        task = await TaskRepository.create(task_data, user_id, user_email)
        return [task]

    @staticmethod
    async def _generate_daily_harvest_task(
        block_id: UUID,
        farm_id: UUID,
        plant_data: PlantDataEnhanced,
        block_name: str,
        block_code: str,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate daily harvest task for GROWING/FRUITING → HARVESTING transition

        Task: "Daily harvest for {crop_name}"
        Note: In future phases, this will be recurring
        """
        task_data = FarmTaskCreate(
            farmId=farm_id,
            blockId=block_id,
            taskType=TaskType.DAILY_HARVEST,
            title=f"Daily harvest for {plant_data.plantName}",
            description=f"Record daily harvest for {plant_data.plantName} in Block {block_name} ({block_code})",
            priority=9,  # Highest priority
            scheduledDate=datetime.utcnow(),  # Today
            metadata={
                "targetCrop": str(plant_data.plantId),
                "targetCropName": plant_data.plantName,
                "blockName": block_name,
                "blockCode": block_code
            }
        )

        task = await TaskRepository.create(task_data, user_id, user_email)
        return [task]

    @staticmethod
    async def _generate_cleaning_task(
        block_id: UUID,
        farm_id: UUID,
        block_name: str,
        block_code: str,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate cleaning task for HARVESTING → CLEANING transition

        Task: "Clean and sanitize Block {block_name}"
        """
        # Schedule for tomorrow
        tomorrow = datetime.utcnow() + timedelta(days=1)

        task_data = FarmTaskCreate(
            farmId=farm_id,
            blockId=block_id,
            taskType=TaskType.CLEANING,
            title=f"Clean and sanitize Block {block_name}",
            description=f"Clean and sanitize Block {block_name} ({block_code}) after harvest, prepare for next cycle",
            priority=7,  # High priority
            scheduledDate=tomorrow,
            metadata={
                "blockName": block_name,
                "blockCode": block_code
            }
        )

        task = await TaskRepository.create(task_data, user_id, user_email)
        return [task]
