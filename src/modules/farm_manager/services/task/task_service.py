"""
Farm Task Service - Business Logic Layer

Handles task management operations with validation and business rules.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.farm_task import (
    FarmTask, FarmTaskCreate, FarmTaskUpdate,
    TaskType, TaskStatus, HarvestEntryCreate,
    TaskCompletionData
)
from ...utils.responses import PaginatedResponse, PaginationMeta
from .task_repository import TaskRepository
from ..database import farm_db

logger = logging.getLogger(__name__)


class TaskService:
    """Service for farm task operations"""

    @staticmethod
    async def create_custom_task(
        task_data: FarmTaskCreate,
        created_by: UUID,
        created_by_email: str
    ) -> FarmTask:
        """
        Create a custom task (assigned by manager)

        Args:
            task_data: Task creation data
            created_by: User creating the task (manager)
            created_by_email: Email of creator

        Returns:
            Created FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Validate farm exists
        db = farm_db.get_database()
        farm = await db.farms.find_one({"farmId": str(task_data.farmId)})
        if not farm:
            raise ValueError(f"Farm not found: {task_data.farmId}")

        # Validate block exists and belongs to farm
        block = await db.blocks.find_one({"blockId": str(task_data.blockId)})
        if not block:
            raise ValueError(f"Block not found: {task_data.blockId}")
        if block["farmId"] != str(task_data.farmId):
            raise ValueError(f"Block {task_data.blockId} does not belong to farm {task_data.farmId}")

        # Validate assigned user if specified
        if task_data.assignedTo:
            # Check user has access to this farm
            assignment = await db.farmer_assignments.find_one({
                "userId": str(task_data.assignedTo),
                "farmId": str(task_data.farmId),
                "isActive": True
            })
            if not assignment:
                raise ValueError(f"User {task_data.assignedTo} is not assigned to farm {task_data.farmId}")

        # Custom tasks are never auto-generated
        task = await TaskRepository.create(
            task_data,
            is_auto_generated=False,
            generated_from_cycle_id=None
        )

        logger.info(f"Created custom task {task.taskId} by {created_by_email}")
        return task

    @staticmethod
    async def get_task(task_id: UUID) -> FarmTask:
        """
        Get task by ID

        Args:
            task_id: Task ID

        Returns:
            FarmTask

        Raises:
            ValueError: If task not found
        """
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        return task

    @staticmethod
    async def get_farm_tasks(
        farm_id: UUID,
        status: Optional[TaskStatus] = None,
        page: int = 1,
        per_page: int = 50
    ) -> PaginatedResponse[FarmTask]:
        """
        Get tasks for a farm

        Args:
            farm_id: Farm ID
            status: Optional status filter
            page: Page number
            per_page: Results per page

        Returns:
            PaginatedResponse with paginated tasks
        """
        tasks, total = await TaskRepository.get_by_farm(farm_id, status, page, per_page)
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1

        return PaginatedResponse(
            data=tasks,
            meta=PaginationMeta(
                total=total,
                page=page,
                perPage=per_page,
                totalPages=total_pages
            )
        )

    @staticmethod
    async def get_block_tasks(
        block_id: UUID,
        status: Optional[TaskStatus] = None,
        page: int = 1,
        per_page: int = 50
    ) -> PaginatedResponse[FarmTask]:
        """
        Get tasks for a block

        Args:
            block_id: Block ID
            status: Optional status filter
            page: Page number
            per_page: Results per page

        Returns:
            PaginatedResponse with paginated tasks
        """
        tasks, total = await TaskRepository.get_by_block(block_id, status, page, per_page)
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1

        return PaginatedResponse(
            data=tasks,
            meta=PaginationMeta(
                total=total,
                page=page,
                perPage=per_page,
                totalPages=total_pages
            )
        )

    @staticmethod
    async def get_my_tasks(
        user_id: UUID,
        farm_id: Optional[UUID] = None,
        status: Optional[TaskStatus] = None
    ) -> List[FarmTask]:
        """
        Get tasks visible to a user

        For farmers: Auto-tasks on their assigned farms + tasks assigned to them
        For managers: All tasks on their farms

        Args:
            user_id: User ID
            farm_id: Optional farm filter
            status: Optional status filter

        Returns:
            List of tasks
        """
        db = farm_db.get_database()

        # Get user's assigned farms
        if farm_id:
            # Single farm specified
            farm_ids = [farm_id]
        else:
            # Get all farms user is assigned to
            cursor = db.farmer_assignments.find({
                "userId": str(user_id),
                "isActive": True
            })
            farm_ids = []
            async for assignment in cursor:
                farm_ids.append(UUID(assignment["farmId"]))

        # Get tasks for each farm
        all_tasks = []
        for fid in farm_ids:
            tasks = await TaskRepository.get_my_tasks(fid, user_id, status)
            all_tasks.extend(tasks)

        # Sort by scheduled date
        all_tasks.sort(key=lambda t: t.scheduledDate)

        return all_tasks

    @staticmethod
    async def get_pending_task_count(user_id: UUID) -> int:
        """
        Get count of pending tasks for a user

        Args:
            user_id: User ID

        Returns:
            Count of pending tasks
        """
        db = farm_db.get_database()

        # Get user's assigned farms
        cursor = db.farmer_assignments.find({
            "userId": str(user_id),
            "isActive": True
        })
        farm_ids = []
        async for assignment in cursor:
            farm_ids.append(UUID(assignment["farmId"]))

        if not farm_ids:
            return 0

        return await TaskRepository.count_pending_tasks(user_id, farm_ids)

    @staticmethod
    async def update_task(
        task_id: UUID,
        update_data: FarmTaskUpdate,
        updated_by: UUID,
        updated_by_email: str
    ) -> FarmTask:
        """
        Update a task

        Args:
            task_id: Task ID
            update_data: Update data
            updated_by: User updating the task
            updated_by_email: Email of updater

        Returns:
            Updated FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Get existing task
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        # Validate status transitions
        if update_data.status:
            if task.status == TaskStatus.COMPLETED and update_data.status != TaskStatus.COMPLETED:
                raise ValueError("Cannot change status of completed task")
            if task.status == TaskStatus.CANCELLED and update_data.status != TaskStatus.CANCELLED:
                raise ValueError("Cannot change status of cancelled task")

        # Update task
        updated_task = await TaskRepository.update(task_id, update_data)
        if not updated_task:
            raise ValueError(f"Failed to update task: {task_id}")

        logger.info(f"Task {task_id} updated by {updated_by_email}")
        return updated_task

    @staticmethod
    async def complete_task(
        task_id: UUID,
        user_id: UUID,
        user_email: str,
        completion_data: TaskCompletionData
    ) -> FarmTask:
        """
        Complete a non-harvest task

        Args:
            task_id: Task ID
            user_id: User completing the task
            user_email: Email of user
            completion_data: Completion data (notes, photos)

        Returns:
            Completed FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Get task
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        # Validate task type
        if task.taskType == TaskType.DAILY_HARVEST:
            raise ValueError("Use add_harvest_entry() for daily harvest tasks")

        # Validate task status
        if task.status == TaskStatus.COMPLETED:
            raise ValueError("Task already completed")
        if task.status == TaskStatus.CANCELLED:
            raise ValueError("Cannot complete cancelled task")

        # Verify user has access to this farm
        db = farm_db.get_database()

        # Check if task is assigned to specific user
        if task.assignedTo and str(task.assignedTo) != str(user_id):
            raise ValueError(f"Task is assigned to another user")

        # Get user role to check permissions
        user = await db.users.find_one({"userId": str(user_id)})
        if not user:
            raise ValueError(f"User not found: {user_id}")
        user_role = user.get("role", "")

        # Verify user is assigned to the farm (if not assigned task)
        # Super admins bypass farm assignment checks
        if not task.assignedTo and user_role != "super_admin":
            assignment = await db.farmer_assignments.find_one({
                "userId": str(user_id),
                "farmId": str(task.farmId),
                "isActive": True
            })
            if not assignment:
                raise ValueError(f"User not assigned to farm {task.farmId}")

        # Create task data from completion data
        from ...models.farm_task import TaskData
        task_data = TaskData(
            notes=completion_data.notes,
            photoUrls=completion_data.photoUrls
        )

        # Complete task
        completed_task = await TaskRepository.complete_task(
            task_id,
            user_id,
            user_email,
            task_data
        )

        if not completed_task:
            raise ValueError(f"Failed to complete task: {task_id}")

        logger.info(f"Task {task_id} ({task.taskType}) completed by {user_email}")
        return completed_task

    @staticmethod
    async def add_harvest_entry(
        task_id: UUID,
        user_id: UUID,
        user_email: str,
        entry_data: HarvestEntryCreate
    ) -> FarmTask:
        """
        Add a harvest entry to a daily harvest task

        Args:
            task_id: Task ID
            user_id: User recording harvest
            user_email: Email of user
            entry_data: Harvest entry data

        Returns:
            Updated FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Get task
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        # Validate task type
        if task.taskType != TaskType.DAILY_HARVEST:
            raise ValueError(f"Task is not a daily_harvest task: {task.taskType}")

        # Validate task status
        if task.status == TaskStatus.COMPLETED:
            raise ValueError("Task already completed (harvest ended)")
        if task.status == TaskStatus.CANCELLED:
            raise ValueError("Cannot add harvest to cancelled task")

        # Verify user has access to this farm
        db = farm_db.get_database()

        # Get user role to check permissions
        user = await db.users.find_one({"userId": str(user_id)})
        if not user:
            raise ValueError(f"User not found: {user_id}")
        user_role = user.get("role", "")

        # Super admins bypass farm assignment checks
        if user_role != "super_admin":
            assignment = await db.farmer_assignments.find_one({
                "userId": str(user_id),
                "farmId": str(task.farmId),
                "isActive": True
            })
            if not assignment:
                raise ValueError(f"User not assigned to farm {task.farmId}")

        # Add harvest entry
        updated_task = await TaskRepository.add_harvest_entry(
            task_id,
            user_id,
            user_email,
            entry_data
        )

        if not updated_task:
            raise ValueError(f"Failed to add harvest entry to task: {task_id}")

        logger.info(f"Harvest entry added to task {task_id}: {entry_data.quantity}kg grade {entry_data.grade} by {user_email}")
        return updated_task

    @staticmethod
    async def end_daily_harvest(
        task_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> FarmTask:
        """
        Manually end a daily harvest task early (aggregate and complete)

        Args:
            task_id: Task ID
            user_id: User ending harvest
            user_email: Email of user

        Returns:
            Completed FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Get task
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        # Validate task type
        if task.taskType != TaskType.DAILY_HARVEST:
            raise ValueError(f"Task is not a daily_harvest task: {task.taskType}")

        # Validate task status
        if task.status == TaskStatus.COMPLETED:
            raise ValueError("Task already completed")
        if task.status == TaskStatus.CANCELLED:
            raise ValueError("Cannot complete cancelled task")

        # Verify user has access (manager permission)
        db = farm_db.get_database()
        user = await db.users.find_one({"userId": str(user_id)})
        if not user:
            raise ValueError(f"User not found: {user_id}")

        # Check if user is manager or admin
        user_role = user.get("role", "")
        if user_role not in ["admin", "super_admin", "moderator"]:
            raise ValueError("Only managers can manually end daily harvest tasks")

        # Aggregate harvest entries
        completed_task = await TaskRepository.aggregate_daily_harvest(task_id)
        if not completed_task:
            raise ValueError(f"Failed to aggregate harvest for task: {task_id}")

        logger.info(f"Daily harvest task {task_id} ended early by {user_email}")
        return completed_task

    @staticmethod
    async def cancel_task(
        task_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> FarmTask:
        """
        Cancel a task

        Args:
            task_id: Task ID
            user_id: User cancelling the task
            user_email: Email of user

        Returns:
            Cancelled FarmTask

        Raises:
            ValueError: If validation fails
        """
        # Get task
        task = await TaskRepository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        # Validate task status
        if task.status == TaskStatus.COMPLETED:
            raise ValueError("Cannot cancel completed task")
        if task.status == TaskStatus.CANCELLED:
            raise ValueError("Task already cancelled")

        # Verify user has manager permission
        db = farm_db.get_database()
        user = await db.users.find_one({"userId": str(user_id)})
        if not user:
            raise ValueError(f"User not found: {user_id}")

        user_role = user.get("role", "")
        if user_role not in ["admin", "super_admin", "moderator"]:
            raise ValueError("Only managers can cancel tasks")

        # Cancel task
        from ...models.farm_task import FarmTaskUpdate
        update_data = FarmTaskUpdate(status=TaskStatus.CANCELLED)
        cancelled_task = await TaskRepository.update(task_id, update_data)

        if not cancelled_task:
            raise ValueError(f"Failed to cancel task: {task_id}")

        logger.info(f"Task {task_id} cancelled by {user_email}")
        return cancelled_task

    @staticmethod
    async def delete_task(
        task_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> bool:
        """
        Delete a task (admin only)

        Args:
            task_id: Task ID
            user_id: User deleting the task
            user_email: Email of user

        Returns:
            True if deleted

        Raises:
            ValueError: If validation fails
        """
        # Verify user has admin permission
        db = farm_db.get_database()
        user = await db.users.find_one({"userId": str(user_id)})
        if not user:
            raise ValueError(f"User not found: {user_id}")

        user_role = user.get("role", "")
        if user_role not in ["admin", "super_admin"]:
            raise ValueError("Only admins can delete tasks")

        # Delete task
        deleted = await TaskRepository.delete(task_id)
        if not deleted:
            raise ValueError(f"Task not found: {task_id}")

        logger.info(f"Task {task_id} deleted by {user_email}")
        return True
