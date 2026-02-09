"""
Farm Task API Routes

Endpoints for the Operations Task Manager - farmer task management system.
"""

from fastapi import APIRouter, Depends, Query, status, HTTPException
from typing import Optional, List
from uuid import UUID

from ...models.farm_task import (
    FarmTask, FarmTaskCreate, FarmTaskUpdate,
    TaskType, TaskStatus, TaskPriority, HarvestEntryCreate, TaskCompletionData
)
from ...services.task.task_service import TaskService
from ...services.task.task_generator import TaskGeneratorService
from ...services.task.harvest_aggregator import HarvestAggregatorService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get(
    "/my-tasks",
    response_model=SuccessResponse[List[FarmTask]],
    summary="Get tasks for current user"
)
async def get_my_tasks(
    farm_id: Optional[UUID] = Query(None, description="Filter by specific farm"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by status"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get tasks visible to the current user.

    For **farmers**: Returns auto-tasks on their assigned farms + tasks assigned to them.
    For **managers**: Returns all tasks on their managed farms.

    **Query Parameters**:
    - `farm_id`: Filter tasks for a specific farm (optional)
    - `status`: Filter by task status (optional)

    **Response**: List of tasks sorted by scheduled date
    """
    tasks = await TaskService.get_my_tasks(
        user_id=UUID(current_user.userId),
        farm_id=farm_id,
        status=status_filter
    )

    return SuccessResponse(
        data=tasks,
        message=f"Retrieved {len(tasks)} tasks"
    )


@router.get(
    "/pending-count",
    response_model=SuccessResponse[int],
    summary="Get pending task count for user"
)
async def get_pending_task_count(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get count of pending tasks for the current user.

    Used for the main menu task counter badge.

    **Response**: Integer count of pending tasks
    """
    count = await TaskService.get_pending_task_count(UUID(current_user.userId))

    return SuccessResponse(
        data=count,
        message=f"{count} pending tasks"
    )


@router.get(
    "/farms/{farm_id}",
    response_model=PaginatedResponse[FarmTask],
    summary="List tasks for a farm"
)
async def list_farm_tasks(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(50, ge=1, le=100, description="Items per page"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by status"),
    farmingYear: Optional[int] = Query(None, description="Filter by farming year (e.g., 2025 for Aug 2025 - Jul 2026)"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get paginated list of tasks for a farm.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 50, max: 100)
    - `status`: Filter by task status (optional)
    - `farmingYear`: Filter by farming year (optional, e.g., 2025 for Aug 2025 - Jul 2026)

    **Note**: The farming year filter returns tasks for blocks planted in that farming year.

    **Response**: Paginated list of tasks
    """
    response = await TaskService.get_farm_tasks(
        farm_id=farm_id,
        status=status_filter,
        page=page,
        per_page=perPage,
        farming_year=farmingYear
    )

    return response


@router.get(
    "/blocks/{block_id}",
    response_model=PaginatedResponse[FarmTask],
    summary="List tasks for a block"
)
async def list_block_tasks(
    block_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(50, ge=1, le=100, description="Items per page"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by status"),
    sort_by: Optional[str] = Query("scheduledDate", description="Sort field: scheduledDate, priority, createdAt"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get paginated list of tasks for a specific block.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 50, max: 100)
    - `status`: Filter by task status (optional)
    - `sort_by`: Sort field - scheduledDate (default), priority, createdAt

    **Response**: Paginated list of tasks sorted by specified field
    """
    response = await TaskService.get_block_tasks(
        block_id=block_id,
        status=status_filter,
        page=page,
        per_page=perPage,
        sort_by=sort_by
    )

    return response


@router.get(
    "/{task_id}",
    response_model=SuccessResponse[FarmTask],
    summary="Get task details"
)
async def get_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get detailed information about a specific task.

    **Response**: Complete task details including harvest entries if applicable
    """
    try:
        task = await TaskService.get_task(task_id)
        return SuccessResponse(
            data=task,
            message="Task retrieved successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "",
    response_model=SuccessResponse[FarmTask],
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom task"
)
async def create_custom_task(
    task_data: FarmTaskCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Create a custom task (manager only).

    Custom tasks can be assigned to specific users.
    Auto-generated tasks are created automatically when blocks change state.

    **Permissions**: Requires **farm.manage** permission (manager/admin)

    **Validations**:
    - Farm must exist
    - Block must belong to farm
    - If assignedTo specified, user must be assigned to the farm

    **Response**: Created task
    """
    try:
        task = await TaskService.create_custom_task(
            task_data=task_data,
            created_by=UUID(current_user.userId),
            created_by_email=current_user.email
        )
        return SuccessResponse(
            data=task,
            message="Custom task created successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put(
    "/{task_id}",
    response_model=SuccessResponse[FarmTask],
    summary="Update a task"
)
async def update_task(
    task_id: UUID,
    update_data: FarmTaskUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Update task details (manager only).

    **Permissions**: Requires **farm.manage** permission

    **Validations**:
    - Cannot change status of completed tasks
    - Cannot change status of cancelled tasks

    **Response**: Updated task
    """
    try:
        task = await TaskService.update_task(
            task_id=task_id,
            update_data=update_data,
            updated_by=UUID(current_user.userId),
            updated_by_email=current_user.email
        )
        return SuccessResponse(
            data=task,
            message="Task updated successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{task_id}/complete",
    response_model=SuccessResponse[FarmTask],
    summary="Complete a task"
)
async def complete_task(
    task_id: UUID,
    completion_data: TaskCompletionData,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Mark a task as completed (for non-harvest tasks).

    For **daily_harvest** tasks, use the `/harvest` endpoint instead.

    **Validations**:
    - User must be assigned to the farm
    - If task is assigned, must be assigned to current user
    - Cannot complete already completed tasks
    - Cannot complete cancelled tasks

    **Request Body**:
    - `notes`: Optional completion notes
    - `photoUrls`: Optional array of photo URLs

    **Response**: Completed task
    """
    try:
        task = await TaskService.complete_task(
            task_id=task_id,
            user_id=UUID(current_user.userId),
            user_email=current_user.email,
            completion_data=completion_data
        )
        return SuccessResponse(
            data=task,
            message="Task completed successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{task_id}/harvest",
    response_model=SuccessResponse[FarmTask],
    summary="Add harvest entry to daily harvest task"
)
async def add_harvest_entry(
    task_id: UUID,
    entry_data: HarvestEntryCreate,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Add a harvest entry to a daily_harvest task.

    Multiple farmers can add entries throughout the day.
    All entries are aggregated at midnight (00:00) automatically.

    **Validations**:
    - Task must be a daily_harvest task
    - User must be assigned to the farm
    - Cannot add to completed or cancelled tasks

    **Request Body**:
    - `quantity`: Harvest quantity in kg (required, > 0)
    - `grade`: Quality grade - A, B, C, D, or Waste (required)
    - `notes`: Optional notes about this harvest entry

    **Response**: Updated task with new harvest entry
    """
    try:
        task = await TaskService.add_harvest_entry(
            task_id=task_id,
            user_id=UUID(current_user.userId),
            user_email=current_user.email,
            entry_data=entry_data
        )
        return SuccessResponse(
            data=task,
            message=f"Harvest entry added: {entry_data.quantity}kg grade {entry_data.grade}"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{task_id}/end-harvest",
    response_model=SuccessResponse[FarmTask],
    summary="Manually end daily harvest task"
)
async def end_daily_harvest(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Manually end a daily harvest task early (manager only).

    Aggregates all harvest entries and marks task as completed.
    Normally, tasks are auto-aggregated at midnight.

    **Permissions**: Requires **farm.manage** permission

    **Use Cases**:
    - Harvest completed early
    - Need to close task before midnight
    - Manual intervention required

    **Response**: Completed task with aggregated harvest totals
    """
    try:
        task = await TaskService.end_daily_harvest(
            task_id=task_id,
            user_id=UUID(current_user.userId),
            user_email=current_user.email
        )
        return SuccessResponse(
            data=task,
            message="Daily harvest ended and aggregated successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{task_id}/cancel",
    response_model=SuccessResponse[FarmTask],
    summary="Cancel a task"
)
async def cancel_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Cancel a task (manager only).

    **Permissions**: Requires **farm.manage** permission

    **Validations**:
    - Cannot cancel completed tasks
    - Cannot cancel already cancelled tasks

    **Response**: Cancelled task
    """
    try:
        task = await TaskService.cancel_task(
            task_id=task_id,
            user_id=UUID(current_user.userId),
            user_email=current_user.email
        )
        return SuccessResponse(
            data=task,
            message="Task cancelled successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/{task_id}",
    response_model=SuccessResponse[bool],
    summary="Delete a task"
)
async def delete_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete a task permanently (admin only).

    **Permissions**: Requires admin role

    **Warning**: This is a destructive operation. Prefer cancelling tasks instead.

    **Response**: Success boolean
    """
    try:
        success = await TaskService.delete_task(
            task_id=task_id,
            user_id=UUID(current_user.userId),
            user_email=current_user.email
        )
        return SuccessResponse(
            data=success,
            message="Task deleted successfully"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# ADMIN/MONITORING ENDPOINTS
# ============================================================

@router.post(
    "/admin/aggregate-harvest/{task_id}",
    response_model=SuccessResponse[bool],
    summary="[Admin] Manually aggregate a daily harvest task"
)
async def admin_aggregate_harvest(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Manually trigger harvest aggregation for a specific task (admin/testing).

    **Permissions**: Requires **farm.manage** permission

    **Use Cases**:
    - Testing aggregation logic
    - Manual intervention for stuck tasks
    - Debugging aggregation issues

    **Response**: Success boolean
    """
    task_id_str = str(task_id)
    success = await HarvestAggregatorService.aggregate_specific_task(task_id_str)

    if not success:
        raise HTTPException(status_code=400, detail="Failed to aggregate harvest task")

    return SuccessResponse(
        data=success,
        message="Harvest task aggregated successfully"
    )


@router.post(
    "/admin/run-daily-aggregation",
    response_model=SuccessResponse[dict],
    summary="[Admin] Run daily harvest aggregation for all tasks"
)
async def admin_run_daily_aggregation(
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Run daily harvest aggregation for all in_progress tasks (cron job endpoint).

    This endpoint is called at 11 PM (23:00) every day by the cron service.
    It:
    1. Finds all daily_harvest tasks scheduled for today that are in_progress
    2. Aggregates their harvest entries
    3. Creates harvest records and updates block KPIs
    4. Generates next day's task if block is still in HARVESTING state

    **Permissions**: Requires **farm.manage** permission

    **Use Cases**:
    - Automated daily harvest aggregation (cron job)
    - Manual trigger for testing
    - Recovery from failed cron runs

    **Response**: Aggregation statistics including:
    - Number of tasks aggregated
    - Total harvest quantity
    - Number of new tasks generated
    - Any errors encountered
    """
    stats = await HarvestAggregatorService.run_daily_aggregation()

    return SuccessResponse(
        data=stats,
        message=f"Daily aggregation completed: {stats['tasks_aggregated']} tasks processed, {stats['new_tasks_generated']} new tasks generated"
    )


@router.get(
    "/admin/pending-aggregations",
    response_model=SuccessResponse[List[FarmTask]],
    summary="[Admin] Get tasks pending aggregation"
)
async def admin_get_pending_aggregations(
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Get list of daily harvest tasks that need aggregation (admin/monitoring).

    Returns all in_progress daily_harvest tasks scheduled for yesterday or earlier.

    **Permissions**: Requires **farm.manage** permission

    **Use Cases**:
    - Monitoring aggregation job
    - Troubleshooting stuck tasks
    - Verifying midnight cron job ran correctly

    **Response**: List of tasks pending aggregation
    """
    tasks = await HarvestAggregatorService.get_pending_aggregations()

    return SuccessResponse(
        data=tasks,
        message=f"Found {len(tasks)} tasks pending aggregation"
    )
