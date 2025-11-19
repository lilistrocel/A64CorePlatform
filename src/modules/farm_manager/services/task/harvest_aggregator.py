"""
Harvest Aggregator Service

Midnight cron job to aggregate daily harvest tasks.
Runs at 00:00 every day to finalize the previous day's harvest entries.
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
    async def run_midnight_aggregation() -> dict:
        """
        Run harvest aggregation for all daily harvest tasks from yesterday

        This should be called at midnight (00:00) every day.
        Finds all daily_harvest tasks scheduled for yesterday that are in_progress,
        aggregates their harvest entries, and marks them as completed.

        Returns:
            Dictionary with aggregation statistics
        """
        # Get yesterday's date (the day that just ended)
        now = datetime.utcnow()
        yesterday = now - timedelta(days=1)
        yesterday_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)

        logger.info(f"Running harvest aggregation for {yesterday_start.date()}")

        # Get all daily harvest tasks scheduled for yesterday that need aggregation
        tasks_to_aggregate = await TaskRepository.get_daily_harvest_tasks_to_aggregate(yesterday_start)

        stats = {
            "date": yesterday_start.date().isoformat(),
            "tasks_found": len(tasks_to_aggregate),
            "tasks_aggregated": 0,
            "tasks_skipped": 0,
            "total_harvest_kg": 0.0,
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
            f"Harvest aggregation completed for {yesterday_start.date()}: "
            f"{stats['tasks_aggregated']} tasks aggregated, "
            f"{stats['total_harvest_kg']:.2f}kg total harvest, "
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

        Returns all in_progress daily harvest tasks scheduled for yesterday or earlier.
        Useful for monitoring and troubleshooting.

        Returns:
            List of tasks pending aggregation
        """
        now = datetime.utcnow()
        yesterday = now - timedelta(days=1)
        yesterday_end = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Find all daily harvest tasks that are still in_progress but scheduled before today
        tasks = await TaskRepository.get_daily_harvest_tasks_to_aggregate(yesterday_end)

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
