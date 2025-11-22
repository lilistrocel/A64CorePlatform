"""
Harvest Aggregator Service

Daily cron job to aggregate daily harvest tasks.
Runs at 23:00 (11 PM) every day to finalize the day's harvest entries
and generate the next day's task if block is still in HARVESTING state.
"""

from datetime import datetime, timedelta
import logging
from typing import List

from ...models.farm_task import FarmTask, TaskType, TaskStatus
from .task_repository import TaskRepository

logger = logging.getLogger(__name__)


class HarvestAggregatorService:
    """Service for aggregating daily harvest tasks"""

    @staticmethod
    async def run_daily_aggregation() -> dict:
        """
        Run harvest aggregation for all daily harvest tasks from today

        This should be called at 23:00 (11 PM) every day.
        Finds all daily_harvest tasks scheduled for today that are in_progress,
        aggregates their harvest entries, marks them as completed, and generates
        next day's task if block is still in HARVESTING state.

        Returns:
            Dictionary with aggregation statistics
        """
        # Get today's date (the day that is ending)
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        logger.info(f"Running harvest aggregation for {today_start.date()}")

        # Get all daily harvest tasks scheduled for today that need aggregation
        tasks_to_aggregate = await TaskRepository.get_daily_harvest_tasks_to_aggregate(today_start)

        stats = {
            "date": today_start.date().isoformat(),
            "tasks_found": len(tasks_to_aggregate),
            "tasks_aggregated": 0,
            "tasks_skipped": 0,
            "total_harvest_kg": 0.0,
            "new_tasks_generated": 0,
            "errors": []
        }

        for task in tasks_to_aggregate:
            try:
                # Aggregate harvest entries
                aggregated_task = await TaskRepository.aggregate_daily_harvest(task.taskId)

                if aggregated_task:
                    stats["tasks_aggregated"] += 1

                    # Add to total harvest
                    if aggregated_task.taskData.totalHarvest:
                        stats["total_harvest_kg"] += aggregated_task.taskData.totalHarvest.totalQuantity

                    logger.info(
                        f"Aggregated task {task.taskId}: "
                        f"{aggregated_task.taskData.totalHarvest.totalQuantity if aggregated_task.taskData.totalHarvest else 0}kg "
                        f"from {len(aggregated_task.taskData.harvestEntries) if aggregated_task.taskData.harvestEntries else 0} entries"
                    )

                    # Generate next day's task if block is still in HARVESTING state
                    try:
                        from ..database import farm_db
                        from ...models.farm_task import FarmTaskCreate
                        from ...models.block import BlockStatus

                        db = farm_db.get_database()
                        block = await db.blocks.find_one({"blockId": str(task.blockId)})

                        if block and block.get("state") == BlockStatus.HARVESTING.value:
                            # Generate task for tomorrow
                            tomorrow = today_start + timedelta(days=1)

                            next_task_data = FarmTaskCreate(
                                farmId=task.farmId,
                                blockId=task.blockId,
                                taskType=TaskType.DAILY_HARVEST,
                                scheduledDate=tomorrow,
                                dueDate=tomorrow.replace(hour=23, minute=59, second=59),
                                assignedTo=None,
                                description=f"Daily harvest for {block.get('name', block.get('blockCode'))}"
                            )

                            # Create next day's task
                            next_task = await TaskRepository.create(
                                next_task_data,
                                is_auto_generated=True,
                                generated_from_cycle_id=task.generatedFromCycleId
                            )

                            stats["new_tasks_generated"] += 1
                            logger.info(f"Generated next day's harvest task {next_task.taskId} for block {task.blockId}")

                    except Exception as e:
                        logger.error(f"Failed to generate next day's task for block {task.blockId}: {e}", exc_info=True)
                        # Don't fail the aggregation if task generation fails

                else:
                    stats["tasks_skipped"] += 1
                    logger.warning(f"Failed to aggregate task {task.taskId}")
                    stats["errors"].append(f"Task {task.taskId}: Failed to aggregate")

            except Exception as e:
                stats["tasks_skipped"] += 1
                error_msg = f"Task {task.taskId}: {str(e)}"
                stats["errors"].append(error_msg)
                logger.error(f"Error aggregating task {task.taskId}: {e}", exc_info=True)

        # Log summary
        logger.info(
            f"Harvest aggregation completed for {today_start.date()}: "
            f"{stats['tasks_aggregated']} tasks aggregated, "
            f"{stats['total_harvest_kg']:.2f}kg total harvest, "
            f"{stats['new_tasks_generated']} new tasks generated, "
            f"{stats['tasks_skipped']} tasks skipped"
        )

        if stats["errors"]:
            logger.warning(f"Aggregation had {len(stats['errors'])} errors: {stats['errors']}")

        return stats

    @staticmethod
    async def aggregate_specific_task(task_id: str) -> bool:
        """
        Manually aggregate a specific daily harvest task

        Useful for testing or manual intervention.

        Args:
            task_id: Task ID to aggregate

        Returns:
            True if successful, False otherwise
        """
        from uuid import UUID

        try:
            task_uuid = UUID(task_id)
            task = await TaskRepository.get_by_id(task_uuid)

            if not task:
                logger.error(f"Task not found: {task_id}")
                return False

            if task.taskType != TaskType.DAILY_HARVEST:
                logger.error(f"Task {task_id} is not a daily_harvest task: {task.taskType}")
                return False

            aggregated_task = await TaskRepository.aggregate_daily_harvest(task_uuid)

            if aggregated_task:
                logger.info(
                    f"Manually aggregated task {task_id}: "
                    f"{aggregated_task.taskData.totalHarvest.totalQuantity if aggregated_task.taskData.totalHarvest else 0}kg"
                )
                return True
            else:
                logger.error(f"Failed to aggregate task {task_id}")
                return False

        except Exception as e:
            logger.error(f"Error aggregating task {task_id}: {e}", exc_info=True)
            return False

    @staticmethod
    async def get_pending_aggregations() -> List[FarmTask]:
        """
        Get list of daily harvest tasks that need aggregation

        Returns all in_progress daily harvest tasks scheduled for today or earlier.
        Useful for monitoring and troubleshooting.

        Returns:
            List of tasks pending aggregation
        """
        now = datetime.utcnow()
        today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Find all daily harvest tasks that are still in_progress but scheduled for today or earlier
        tasks = await TaskRepository.get_daily_harvest_tasks_to_aggregate(today_end)

        logger.info(f"Found {len(tasks)} daily harvest tasks pending aggregation")
        return tasks

    @staticmethod
    async def get_aggregation_report(start_date: datetime, end_date: datetime) -> dict:
        """
        Generate aggregation report for a date range

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Report with aggregation statistics
        """
        from ..database import farm_db

        db = farm_db.get_database()

        # Find all completed daily harvest tasks in date range
        query = {
            "taskType": TaskType.DAILY_HARVEST.value,
            "status": TaskStatus.COMPLETED.value,
            "scheduledDate": {
                "$gte": start_date,
                "$lte": end_date
            },
            "taskData.totalHarvest": {"$exists": True}
        }

        cursor = db.farm_tasks.find(query).sort("scheduledDate", 1)

        report = {
            "start_date": start_date.date().isoformat(),
            "end_date": end_date.date().isoformat(),
            "total_tasks": 0,
            "total_harvest_kg": 0.0,
            "total_entries": 0,
            "unique_contributors": set(),
            "daily_breakdown": []
        }

        daily_totals = {}

        async for task_doc in cursor:
            report["total_tasks"] += 1

            total_harvest = task_doc.get("taskData", {}).get("totalHarvest")
            if total_harvest:
                quantity = total_harvest.get("totalQuantity", 0.0)
                entry_count = total_harvest.get("entryCount", 0)
                contributors = total_harvest.get("contributors", [])

                report["total_harvest_kg"] += quantity
                report["total_entries"] += entry_count

                # Track unique contributors
                for contributor in contributors:
                    report["unique_contributors"].add(contributor)

                # Track daily totals
                scheduled_date = task_doc.get("scheduledDate")
                if scheduled_date:
                    date_key = scheduled_date.date().isoformat()
                    if date_key not in daily_totals:
                        daily_totals[date_key] = {
                            "date": date_key,
                            "tasks": 0,
                            "total_kg": 0.0,
                            "entries": 0
                        }
                    daily_totals[date_key]["tasks"] += 1
                    daily_totals[date_key]["total_kg"] += quantity
                    daily_totals[date_key]["entries"] += entry_count

        # Convert set to count
        report["unique_contributors"] = len(report["unique_contributors"])

        # Add daily breakdown sorted by date
        report["daily_breakdown"] = sorted(daily_totals.values(), key=lambda x: x["date"])

        logger.info(
            f"Generated aggregation report for {start_date.date()} to {end_date.date()}: "
            f"{report['total_tasks']} tasks, {report['total_harvest_kg']:.2f}kg total"
        )

        return report
