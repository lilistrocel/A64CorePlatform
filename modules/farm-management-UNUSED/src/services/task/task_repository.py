"""
Task Repository - Data Access Layer

Handles all database operations for farm tasks.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.farm_task import (
    FarmTask,
    FarmTaskCreate,
    FarmTaskUpdate,
    TaskStatus,
    TaskType,
    HarvestEntry
)
from ..database import farm_db

logger = logging.getLogger(__name__)


class TaskRepository:
    """Repository for FarmTask data access"""

    # Collection name
    COLLECTION = "farm_tasks"

    @staticmethod
    async def create(
        task_data: FarmTaskCreate,
        created_by: UUID,
        created_by_email: str
    ) -> FarmTask:
        """
        Create a new farm task

        Args:
            task_data: Task creation data
            created_by: User ID creating the task
            created_by_email: Email of user creating the task

        Returns:
            Created FarmTask object

        Raises:
            Exception: If database operation fails
        """
        db = farm_db.get_database()

        # Create task object
        task = FarmTask(
            **task_data.model_dump(),
            createdBy=created_by,
            createdByEmail=created_by_email
        )

        # Insert into database
        result = await db[TaskRepository.COLLECTION].insert_one(
            task.model_dump(by_alias=True, mode='json')
        )

        if not result.inserted_id:
            raise Exception("Failed to create task")

        logger.info(f"[TaskRepository] Created task {task.taskId} for block {task.blockId}")
        return task

    @staticmethod
    async def get_by_id(task_id: UUID) -> Optional[FarmTask]:
        """
        Get task by ID

        Args:
            task_id: Task ID

        Returns:
            FarmTask object or None if not found
        """
        db = farm_db.get_database()

        doc = await db[TaskRepository.COLLECTION].find_one({
            "taskId": str(task_id),
            "deleted": False
        })

        if not doc:
            return None

        return FarmTask(**doc)

    @staticmethod
    async def get_by_block(
        block_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[TaskStatus] = None
    ) -> Tuple[List[FarmTask], int]:
        """
        Get all tasks for a block with pagination

        Args:
            block_id: Block ID
            skip: Number of tasks to skip
            limit: Maximum number of tasks to return
            status: Optional status filter

        Returns:
            Tuple of (tasks list, total count)
        """
        db = farm_db.get_database()

        query = {
            "blockId": str(block_id),
            "deleted": False
        }

        if status:
            query["status"] = status.value

        # Get total count
        total = await db[TaskRepository.COLLECTION].count_documents(query)

        # Get tasks sorted by scheduledDate (newest first)
        cursor = db[TaskRepository.COLLECTION].find(query).sort([
            ("scheduledDate", -1),
            ("createdAt", -1)
        ]).skip(skip).limit(limit)

        tasks = []
        async for doc in cursor:
            tasks.append(FarmTask(**doc))

        return tasks, total

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[TaskStatus] = None
    ) -> Tuple[List[FarmTask], int]:
        """
        Get all tasks for a farm with pagination

        Args:
            farm_id: Farm ID
            skip: Number of tasks to skip
            limit: Maximum number of tasks to return
            status: Optional status filter

        Returns:
            Tuple of (tasks list, total count)
        """
        db = farm_db.get_database()

        query = {
            "farmId": str(farm_id),
            "deleted": False
        }

        if status:
            query["status"] = status.value

        # Get total count
        total = await db[TaskRepository.COLLECTION].count_documents(query)

        # Get tasks sorted by scheduledDate (newest first)
        cursor = db[TaskRepository.COLLECTION].find(query).sort([
            ("scheduledDate", -1),
            ("createdAt", -1)
        ]).skip(skip).limit(limit)

        tasks = []
        async for doc in cursor:
            tasks.append(FarmTask(**doc))

        return tasks, total

    @staticmethod
    async def get_my_tasks(
        user_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[TaskStatus] = None
    ) -> Tuple[List[FarmTask], int]:
        """
        Get all tasks assigned to a user

        Args:
            user_id: User ID
            skip: Number of tasks to skip
            limit: Maximum number of tasks to return
            status: Optional status filter

        Returns:
            Tuple of (tasks list, total count)
        """
        db = farm_db.get_database()

        query = {
            "assignedTo": str(user_id),
            "deleted": False
        }

        if status:
            query["status"] = status.value

        # Get total count
        total = await db[TaskRepository.COLLECTION].count_documents(query)

        # Get tasks sorted by scheduledDate (newest first)
        cursor = db[TaskRepository.COLLECTION].find(query).sort([
            ("scheduledDate", -1),
            ("createdAt", -1)
        ]).skip(skip).limit(limit)

        tasks = []
        async for doc in cursor:
            tasks.append(FarmTask(**doc))

        return tasks, total

    @staticmethod
    async def update(
        task_id: UUID,
        update_data: FarmTaskUpdate
    ) -> Optional[FarmTask]:
        """
        Update task

        Args:
            task_id: Task ID
            update_data: Fields to update

        Returns:
            Updated FarmTask or None if not found
        """
        db = farm_db.get_database()

        # Build update dict (only include non-None fields)
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            # No fields to update, return existing task
            return await TaskRepository.get_by_id(task_id)

        # Add updated timestamp
        update_dict["updatedAt"] = datetime.utcnow()

        # Update task
        result = await db[TaskRepository.COLLECTION].find_one_and_update(
            {"taskId": str(task_id), "deleted": False},
            {"$set": update_dict},
            return_document=True
        )

        if not result:
            return None

        return FarmTask(**result)

    @staticmethod
    async def complete_task(
        task_id: UUID,
        completed_by: UUID,
        completed_by_name: str,
        completed_by_email: str,
        notes: Optional[str] = None,
        photo_urls: Optional[List[str]] = None
    ) -> Optional[FarmTask]:
        """
        Mark task as completed

        Args:
            task_id: Task ID
            completed_by: User completing the task
            completed_by_name: Name of user completing the task
            completed_by_email: Email of user completing the task
            notes: Optional completion notes
            photo_urls: Optional photo URLs

        Returns:
            Updated FarmTask or None if not found
        """
        db = farm_db.get_database()

        update_dict = {
            "status": TaskStatus.COMPLETED.value,
            "completedAt": datetime.utcnow(),
            "completedBy": str(completed_by),
            "completedByName": completed_by_name,
            "completedByEmail": completed_by_email,
            "updatedAt": datetime.utcnow()
        }

        if notes:
            update_dict["completionNotes"] = notes

        if photo_urls:
            update_dict["photoUrls"] = photo_urls

        result = await db[TaskRepository.COLLECTION].find_one_and_update(
            {"taskId": str(task_id), "deleted": False},
            {"$set": update_dict},
            return_document=True
        )

        if not result:
            return None

        logger.info(f"[TaskRepository] Task {task_id} completed by {completed_by_email}")
        return FarmTask(**result)

    @staticmethod
    async def cancel_task(
        task_id: UUID,
        reason: Optional[str] = None
    ) -> Optional[FarmTask]:
        """
        Cancel a task

        Args:
            task_id: Task ID
            reason: Optional cancellation reason

        Returns:
            Updated FarmTask or None if not found
        """
        db = farm_db.get_database()

        update_dict = {
            "status": TaskStatus.CANCELLED.value,
            "updatedAt": datetime.utcnow()
        }

        if reason:
            update_dict["completionNotes"] = f"Cancelled: {reason}"

        result = await db[TaskRepository.COLLECTION].find_one_and_update(
            {"taskId": str(task_id), "deleted": False},
            {"$set": update_dict},
            return_document=True
        )

        if not result:
            return None

        logger.info(f"[TaskRepository] Task {task_id} cancelled")
        return FarmTask(**result)

    @staticmethod
    async def add_harvest_entry(
        task_id: UUID,
        harvest_entry: HarvestEntry
    ) -> Optional[FarmTask]:
        """
        Add a harvest entry to a daily_harvest task

        Args:
            task_id: Task ID
            harvest_entry: Harvest entry to add

        Returns:
            Updated FarmTask or None if not found
        """
        db = farm_db.get_database()

        result = await db[TaskRepository.COLLECTION].find_one_and_update(
            {"taskId": str(task_id), "deleted": False, "taskType": TaskType.DAILY_HARVEST.value},
            {
                "$push": {"harvestEntries": harvest_entry.model_dump(by_alias=True, mode='json')},
                "$set": {"updatedAt": datetime.utcnow()}
            },
            return_document=True
        )

        if not result:
            return None

        logger.info(f"[TaskRepository] Added harvest entry to task {task_id}")
        return FarmTask(**result)

    @staticmethod
    async def soft_delete(task_id: UUID) -> bool:
        """
        Soft delete a task

        Args:
            task_id: Task ID

        Returns:
            True if deleted, False if not found
        """
        db = farm_db.get_database()

        result = await db[TaskRepository.COLLECTION].update_one(
            {"taskId": str(task_id), "deleted": False},
            {
                "$set": {
                    "deleted": True,
                    "deletedAt": datetime.utcnow()
                }
            }
        )

        if result.modified_count > 0:
            logger.info(f"[TaskRepository] Soft deleted task {task_id}")
            return True

        return False

    @staticmethod
    async def count_pending_by_block(block_id: UUID) -> int:
        """
        Count pending tasks for a block

        Args:
            block_id: Block ID

        Returns:
            Count of pending tasks
        """
        db = farm_db.get_database()

        count = await db[TaskRepository.COLLECTION].count_documents({
            "blockId": str(block_id),
            "status": {"$in": [TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value]},
            "deleted": False
        })

        return count

    @staticmethod
    async def count_pending_by_farm(farm_id: UUID) -> int:
        """
        Count pending tasks for a farm

        Args:
            farm_id: Farm ID

        Returns:
            Count of pending tasks
        """
        db = farm_db.get_database()

        count = await db[TaskRepository.COLLECTION].count_documents({
            "farmId": str(farm_id),
            "status": {"$in": [TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value]},
            "deleted": False
        })

        return count
