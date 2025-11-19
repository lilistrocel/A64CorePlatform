"""
Task Generator Service

Automatically generates tasks when blocks transition through their lifecycle.
Triggers: empty → planned state change
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta
import logging

from ...models.farm_task import FarmTaskCreate, TaskType, FarmTask
from ...models.block import BlockStatus
from .task_repository import TaskRepository
from ..database import farm_db

logger = logging.getLogger(__name__)


class TaskGeneratorService:
    """Service for auto-generating tasks based on block lifecycle"""

    @staticmethod
    async def generate_tasks_for_block(
        block_id: UUID,
        cycle_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> List[FarmTask]:
        """
        Generate all tasks for a block when it transitions to 'planned' state

        Creates tasks for:
        1. Planting
        2. Fruiting check (if plant has fruiting stage)
        3. Harvest readiness check
        4. Daily harvest tasks (one per day in harvest window)
        5. Harvest completion check
        6. Cleaning

        Args:
            block_id: Block ID
            cycle_id: Block cycle ID (for tracking)
            user_id: User who triggered task generation
            user_email: Email of user

        Returns:
            List of created tasks

        Raises:
            ValueError: If block data incomplete
        """
        db = farm_db.get_database()

        # Get block data
        block = await db.blocks.find_one({"blockId": str(block_id)})
        if not block:
            raise ValueError(f"Block not found: {block_id}")

        # Verify block has timeline data
        if not block.get("expectedStatusChanges"):
            raise ValueError(f"Block {block_id} has no timeline data")

        if not block.get("plantedDate"):
            # Use current planting from block
            planting = await db.plantings.find_one({"blockId": str(block_id)})
            if not planting:
                raise ValueError(f"Block {block_id} has no planting data")

        farm_id = UUID(block["farmId"])
        expected_changes = block["expectedStatusChanges"]

        # Get plant data to check for fruiting stage
        current_planting = await db.plantings.find_one({"blockId": str(block_id)})
        has_fruiting_stage = False
        if current_planting and current_planting.get("plants"):
            # Check if any plant has fruiting stage
            for plant in current_planting["plants"]:
                plant_data = await db.plant_data_enhanced.find_one({
                    "plantName": plant.get("plantName")
                })
                if plant_data and plant_data.get("growthStages"):
                    stages = plant_data.get("growthStages", [])
                    if "fruiting" in [s.lower() for s in stages]:
                        has_fruiting_stage = True
                        break

        created_tasks = []

        # 1. PLANTING TASK
        # Scheduled for planted status date
        if "planted" in expected_changes:
            planting_date = datetime.fromisoformat(expected_changes["planted"].replace("Z", "+00:00"))
            planting_task = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.PLANTING,
                scheduledDate=planting_date,
                dueDate=planting_date + timedelta(days=1),  # 1 day window
                assignedTo=None,  # Auto-task, visible to all farmers
                description=f"Plant {block.get('name', block['blockCode'])} as planned"
            )
            task = await TaskRepository.create(
                planting_task,
                is_auto_generated=True,
                generated_from_cycle_id=cycle_id
            )
            created_tasks.append(task)
            logger.info(f"Created PLANTING task for block {block_id} on {planting_date.date()}")

        # 2. FRUITING CHECK TASK (only if plant has fruiting stage)
        if has_fruiting_stage and "fruiting" in expected_changes:
            fruiting_date = datetime.fromisoformat(expected_changes["fruiting"].replace("Z", "+00:00"))
            fruiting_task = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.FRUITING_CHECK,
                scheduledDate=fruiting_date,
                dueDate=fruiting_date + timedelta(days=2),
                assignedTo=None,
                description=f"Check fruiting status of {block.get('name', block['blockCode'])}"
            )
            task = await TaskRepository.create(
                fruiting_task,
                is_auto_generated=True,
                generated_from_cycle_id=cycle_id
            )
            created_tasks.append(task)
            logger.info(f"Created FRUITING_CHECK task for block {block_id} on {fruiting_date.date()}")

        # 3. HARVEST READINESS CHECK
        if "harvesting" in expected_changes:
            harvest_start_date = datetime.fromisoformat(expected_changes["harvesting"].replace("Z", "+00:00"))
            # Schedule 2 days before expected harvest
            readiness_date = harvest_start_date - timedelta(days=2)

            readiness_task = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.HARVEST_READINESS,
                scheduledDate=readiness_date,
                dueDate=harvest_start_date,
                assignedTo=None,
                description=f"Check if {block.get('name', block['blockCode'])} is ready for harvest"
            )
            task = await TaskRepository.create(
                readiness_task,
                is_auto_generated=True,
                generated_from_cycle_id=cycle_id
            )
            created_tasks.append(task)
            logger.info(f"Created HARVEST_READINESS task for block {block_id} on {readiness_date.date()}")

            # 4. DAILY HARVEST TASKS
            # Create one task per day in harvest window
            daily_harvest_tasks = await TaskGeneratorService._generate_daily_harvest_tasks(
                farm_id=farm_id,
                block_id=block_id,
                block_name=block.get('name', block['blockCode']),
                harvest_start_date=harvest_start_date,
                expected_changes=expected_changes,
                cycle_id=cycle_id
            )
            created_tasks.extend(daily_harvest_tasks)

            # 5. HARVEST COMPLETION CHECK
            # Get harvest end date from cycle or estimate based on plant data
            cycle = await db.block_cycles.find_one({"cycleId": str(cycle_id)})
            if cycle and cycle.get("estimatedHarvestStartDate"):
                # Estimate 30 days harvest period (or get from plant data)
                harvest_end_estimate = harvest_start_date + timedelta(days=30)

                completion_task = FarmTaskCreate(
                    farmId=farm_id,
                    blockId=block_id,
                    taskType=TaskType.HARVEST_COMPLETION,
                    scheduledDate=harvest_end_estimate,
                    dueDate=harvest_end_estimate + timedelta(days=7),
                    assignedTo=None,
                    description=f"Verify harvest completion for {block.get('name', block['blockCode'])}"
                )
                task = await TaskRepository.create(
                    completion_task,
                    is_auto_generated=True,
                    generated_from_cycle_id=cycle_id
                )
                created_tasks.append(task)
                logger.info(f"Created HARVEST_COMPLETION task for block {block_id} on {harvest_end_estimate.date()}")

        # 6. CLEANING TASK
        # Schedule after harvest completion
        if "harvesting" in expected_changes:
            harvest_start_date = datetime.fromisoformat(expected_changes["harvesting"].replace("Z", "+00:00"))
            # Schedule cleaning 35 days after harvest start (after 30-day harvest + 5 day buffer)
            cleaning_date = harvest_start_date + timedelta(days=35)

            cleaning_task = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.CLEANING,
                scheduledDate=cleaning_date,
                dueDate=cleaning_date + timedelta(days=3),
                assignedTo=None,
                description=f"Clean and prepare {block.get('name', block['blockCode'])} for next cycle"
            )
            task = await TaskRepository.create(
                cleaning_task,
                is_auto_generated=True,
                generated_from_cycle_id=cycle_id
            )
            created_tasks.append(task)
            logger.info(f"Created CLEANING task for block {block_id} on {cleaning_date.date()}")

        logger.info(f"Generated {len(created_tasks)} tasks for block {block_id} (cycle {cycle_id})")
        return created_tasks

    @staticmethod
    async def _generate_daily_harvest_tasks(
        farm_id: UUID,
        block_id: UUID,
        block_name: str,
        harvest_start_date: datetime,
        expected_changes: dict,
        cycle_id: UUID
    ) -> List[FarmTask]:
        """
        Generate daily harvest tasks for the harvest window

        Args:
            farm_id: Farm ID
            block_id: Block ID
            block_name: Block name for description
            harvest_start_date: When harvest begins
            expected_changes: Expected status changes dict
            cycle_id: Block cycle ID

        Returns:
            List of daily harvest tasks
        """
        # Default harvest period: 30 days
        # In future, get this from plant data
        harvest_period_days = 30

        daily_tasks = []

        # Create one task per day
        for day_offset in range(harvest_period_days):
            task_date = harvest_start_date + timedelta(days=day_offset)

            daily_harvest_task = FarmTaskCreate(
                farmId=farm_id,
                blockId=block_id,
                taskType=TaskType.DAILY_HARVEST,
                scheduledDate=task_date,
                dueDate=task_date.replace(hour=23, minute=59, second=59),  # End of day
                assignedTo=None,
                description=f"Daily harvest for {block_name} - Day {day_offset + 1}"
            )

            task = await TaskRepository.create(
                daily_harvest_task,
                is_auto_generated=True,
                generated_from_cycle_id=cycle_id
            )
            daily_tasks.append(task)

        logger.info(f"Generated {len(daily_tasks)} daily harvest tasks for block {block_id}")
        return daily_tasks

    @staticmethod
    async def reschedule_tasks_for_timeline_change(
        block_id: UUID,
        cycle_id: UUID,
        new_expected_changes: dict,
        user_id: UUID,
        user_email: str
    ) -> int:
        """
        Reschedule auto-generated tasks when block timeline changes

        Called when block dates are updated (early/late status changes).

        Args:
            block_id: Block ID
            cycle_id: Block cycle ID
            new_expected_changes: Updated expectedStatusChanges dict
            user_id: User who triggered the change
            user_email: Email of user

        Returns:
            Number of tasks rescheduled
        """
        db = farm_db.get_database()
        total_rescheduled = 0

        # Reschedule PLANTING task
        if "planted" in new_expected_changes:
            new_date = datetime.fromisoformat(new_expected_changes["planted"].replace("Z", "+00:00"))
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.PLANTING,
                [new_date]
            )
            total_rescheduled += count

        # Reschedule FRUITING_CHECK task
        if "fruiting" in new_expected_changes:
            new_date = datetime.fromisoformat(new_expected_changes["fruiting"].replace("Z", "+00:00"))
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.FRUITING_CHECK,
                [new_date]
            )
            total_rescheduled += count

        # Reschedule HARVEST_READINESS task
        if "harvesting" in new_expected_changes:
            harvest_date = datetime.fromisoformat(new_expected_changes["harvesting"].replace("Z", "+00:00"))
            readiness_date = harvest_date - timedelta(days=2)
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.HARVEST_READINESS,
                [readiness_date]
            )
            total_rescheduled += count

            # Reschedule DAILY_HARVEST tasks
            # Get existing daily harvest tasks count
            existing_tasks = await db.farm_tasks.count_documents({
                "generatedFromCycleId": str(cycle_id),
                "taskType": TaskType.DAILY_HARVEST.value
            })

            # Generate new dates for all daily harvest tasks
            new_harvest_dates = [
                harvest_date + timedelta(days=i)
                for i in range(existing_tasks)
            ]
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.DAILY_HARVEST,
                new_harvest_dates
            )
            total_rescheduled += count

            # Reschedule HARVEST_COMPLETION task
            harvest_end_estimate = harvest_date + timedelta(days=30)
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.HARVEST_COMPLETION,
                [harvest_end_estimate]
            )
            total_rescheduled += count

            # Reschedule CLEANING task
            cleaning_date = harvest_date + timedelta(days=35)
            count = await TaskRepository.reschedule_tasks_for_cycle(
                cycle_id,
                TaskType.CLEANING,
                [cleaning_date]
            )
            total_rescheduled += count

        logger.info(f"Rescheduled {total_rescheduled} tasks for block {block_id} due to timeline change")
        return total_rescheduled

    @staticmethod
    async def cancel_future_harvest_tasks(
        cycle_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> int:
        """
        Cancel future daily harvest tasks when harvest ends early

        Args:
            cycle_id: Block cycle ID
            user_id: User who ended harvest early
            user_email: Email of user

        Returns:
            Number of tasks cancelled
        """
        # Cancel all future daily harvest, completion, and cleaning tasks
        task_types = [
            TaskType.DAILY_HARVEST,
            TaskType.HARVEST_COMPLETION,
            TaskType.CLEANING
        ]

        cancelled_count = await TaskRepository.cancel_future_tasks_for_cycle(
            cycle_id,
            task_types
        )

        logger.info(f"Cancelled {cancelled_count} future harvest tasks for cycle {cycle_id} by {user_email}")
        return cancelled_count
