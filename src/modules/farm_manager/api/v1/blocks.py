"""
Block API Routes

Endpoints for managing farm blocks.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional, List, Literal
from uuid import UUID

from ...models.block import (
    Block, BlockCreate, BlockUpdate, BlockStatus,
    BlockStatusUpdate, AddVirtualCropRequest, IoTControllerUpdate
)
from ...models.block_analytics import BlockAnalyticsResponse, TimePeriod
from ...services.block.block_service_new import BlockService
from ...services.block.virtual_block_service import VirtualBlockService
from ...services.block.analytics_service import BlockAnalyticsService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/farms/{farm_id}/blocks", tags=["blocks"])


@router.post(
    "",
    response_model=SuccessResponse[Block],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new block"
)
async def create_block(
    farm_id: UUID,
    block_data: BlockCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Create a new block in a farm.

    Requires **farm.manage** permission.

    **Validations**:
    - Farm must exist and be active
    - Block name must be unique within farm
    - maxPlants must be greater than 0
    """
    block = await BlockService.create_block(
        farm_id,
        block_data,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=block,
        message="Block created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Block],
    summary="List blocks in a farm"
)
async def list_blocks(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[BlockStatus] = Query(None, alias="status", description="Filter by status"),
    blockType: Optional[str] = Query(None, description="Filter by block type"),
    targetCrop: Optional[UUID] = Query(None, description="Filter by target crop"),
    blockCategory: Optional[Literal['physical', 'virtual', 'all']] = Query('all', description="Filter by block category"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of blocks in a farm with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `status`: Filter by block status (optional)
    - `blockType`: Filter by block type (optional)
    - `targetCrop`: Filter by target crop ID (optional)
    - `blockCategory`: Filter by category - 'physical', 'virtual', or 'all' (default: 'all')
    """
    blocks, total, total_pages = await BlockService.list_blocks(
        farm_id=farm_id,
        page=page,
        per_page=perPage,
        status=status_filter,
        block_type=blockType,
        target_crop=targetCrop,
        block_category=blockCategory
    )

    return PaginatedResponse(
        data=blocks,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{block_id}",
    response_model=SuccessResponse[Block],
    summary="Get block by ID"
)
async def get_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get a specific block by ID.

    Returns complete block information including current state,
    planting information, and dates.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    return SuccessResponse(data=block)


@router.patch(
    "/{block_id}",
    response_model=SuccessResponse[Block],
    summary="Update a block"
)
async def update_block(
    farm_id: UUID,
    block_id: UUID,
    update_data: BlockUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Update block information.

    Requires **farm.manage** permission.

    **Validations**:
    - Block name must remain unique within farm
    - maxPlants must be greater than 0 if provided
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    updated_block = await BlockService.update_block(
        block_id,
        update_data
    )

    return SuccessResponse(
        data=updated_block,
        message="Block updated successfully"
    )


@router.delete(
    "/{block_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a block with cascade"
)
async def delete_block(
    farm_id: UUID,
    block_id: UUID,
    reason: Optional[str] = Query(None, description="Deletion reason"),
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete a block with CASCADE deletion.

    All archives and harvests are moved to deleted_* collections.
    """
    from fastapi import HTTPException
    from ...services.cascade_deletion_service import CascadeDeletionService

    block = await BlockService.get_block(block_id)

    if str(block.farmId) != str(farm_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    result = await CascadeDeletionService.delete_block_with_cascade(
        block_id=block_id,
        user_id=UUID(current_user.userId),
        user_email=current_user.email,
        reason=reason,
        deleted_with_farm=False
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to delete block")
        )

    return SuccessResponse(
        data={
            "blockId": str(block_id),
            "statistics": result.get("statistics")
        },
        message="Block deleted with cascade"
    )


@router.get(
    "/{block_id}/kpi",
    response_model=SuccessResponse[dict],
    summary="Get block KPI dashboard"
)
async def get_block_kpi(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive KPI dashboard data for a block.

    Returns:
    - Current status and whether on track with expected timeline
    - Days since planting and days until harvest
    - KPI metrics (predicted vs actual yield, efficiency percentage)
    - Harvest summary (total quantity, quality breakdown)
    - Alert summary (active alerts count)
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    kpi_data = await BlockService.get_block_kpi(block_id)

    return SuccessResponse(data=kpi_data)


# Status change endpoint
@router.patch(
    "/{block_id}/status",
    response_model=SuccessResponse[Block],
    summary="Change block status"
)
async def change_block_status(
    farm_id: UUID,
    block_id: UUID,
    status_update: BlockStatusUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Change block status with validation and automatic archival.

    Requires **farm.operate** permission.

    **Valid Status Transitions**:
    - `empty` → `planned`, `planted`, `alert`
    - `planned` → `planted`, `alert` (when planting date arrives)
    - `planted` → `growing`, `alert`
    - `growing` → `fruiting`, `alert`
    - `fruiting` → `harvesting`, `alert`
    - `harvesting` → `cleaning`, `alert`
    - `cleaning` → `empty`, `alert` (triggers automatic archival)
    - `alert` → any status (restores from previousStatus)

    **Special Requirements**:
    - Transitioning to 'planned' requires `targetCrop` and `actualPlantCount` (future planting date)
    - Transitioning to 'planted' requires `targetCrop` and `actualPlantCount`
    - Cleaning → empty triggers automatic archival of the cycle

    **Automatic Features**:
    - Calculates expected harvest dates based on plant growth cycle
    - Calculates predicted yield based on plant count
    - Archives completed cycles when transitioning from cleaning to empty
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"[Block API] Received status change request for block {block_id}")
    logger.info(f"[Block API] Request data: {status_update.model_dump()}")

    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    updated_block = await BlockService.change_status(
        block_id,
        status_update,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=updated_block,
        message=f"Block status changed to '{status_update.newStatus.value}'"
    )


# Get valid transitions for a block
@router.get(
    "/{block_id}/valid-transitions",
    response_model=SuccessResponse[dict],
    summary="Get valid status transitions"
)
async def get_valid_status_transitions(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of valid status transitions for a block's current status.

    Dynamically determines valid transitions based on:
    - Block's current state
    - Plant's growth cycle (e.g., skip fruiting if fruitingDays = 0)

    Useful for UI to show available actions and prevent invalid transitions.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Get valid transitions based on block's plant data
    valid_transitions = await BlockService.get_valid_transitions(block)

    return SuccessResponse(
        data={
            "currentStatus": block.state.value,
            "validTransitions": [state.value for state in valid_transitions]
        }
    )


# Block Analytics Endpoint
@router.get(
    "/{block_id}/analytics",
    response_model=SuccessResponse[BlockAnalyticsResponse],
    summary="Get block analytics and statistics"
)
async def get_block_analytics(
    farm_id: UUID,
    block_id: UUID,
    period: TimePeriod = Query(TimePeriod.ALL, description="Time period to analyze"),
    startDate: Optional[str] = Query(None, description="Custom start date (ISO 8601)"),
    endDate: Optional[str] = Query(None, description="Custom end date (ISO 8601)"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive analytics for a block.

    **READ-ONLY endpoint** - Aggregates data from multiple sources to provide insights.

    **Analytics Included**:
    - **Yield Analytics**: Total yield, quality breakdown, efficiency, harvest trends
    - **Timeline Analytics**: Time in each state, transition patterns, delays
    - **Task Analytics**: Completion rates, delays by task type
    - **Performance Metrics**: Overall score, strengths, areas for improvement
    - **Alert Analytics**: Alert history, resolution times

    **Time Period Options**:
    - `30d` - Last 30 days
    - `90d` - Last 90 days
    - `6m` - Last 6 months
    - `1y` - Last year
    - `all` - Complete history (default)

    **Custom Date Range**:
    Provide both `startDate` and `endDate` in ISO 8601 format for custom range.

    **Data Sources**:
    - Block information from `blocks` collection
    - Harvest data from `block_harvests` collection
    - Task data from `farm_tasks` collection
    - Alert data from `alerts` collection

    **Use Cases**:
    - Performance dashboards
    - Yield forecasting
    - Efficiency analysis
    - Trend identification
    - Decision support
    """
    from datetime import datetime

    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Parse custom dates if provided
    parsed_start_date = None
    parsed_end_date = None

    if startDate:
        try:
            parsed_start_date = datetime.fromisoformat(startDate.replace('Z', '+00:00'))
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid startDate format. Use ISO 8601 format (e.g., 2025-01-01T00:00:00Z)"
            )

    if endDate:
        try:
            parsed_end_date = datetime.fromisoformat(endDate.replace('Z', '+00:00'))
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid endDate format. Use ISO 8601 format (e.g., 2025-12-31T23:59:59Z)"
            )

    # Generate analytics
    analytics = await BlockAnalyticsService.get_block_analytics(
        block_id=block_id,
        period=period,
        start_date=parsed_start_date,
        end_date=parsed_end_date
    )

    return SuccessResponse(
        data=analytics,
        message="Block analytics generated successfully"
    )


# ==================== VIRTUAL BLOCK ENDPOINTS ====================

@router.post(
    "/{block_id}/add-virtual-crop",
    response_model=SuccessResponse[Block],
    status_code=status.HTTP_201_CREATED,
    summary="Add a virtual crop to a physical block"
)
async def add_virtual_crop(
    farm_id: UUID,
    block_id: UUID,
    request: AddVirtualCropRequest,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Create a virtual block with a new crop as a child of this physical block.

    **Requirements:**
    - Block must be physical (not virtual)
    - Block must have sufficient availableArea
    - If first virtual child, initializes area budget from block.area

    **Creates:**
    - New virtual block with code "{parentCode}/001" (or next available)
    - Deducts allocated area from parent's budget
    - Plants the crop on the virtual block (status → PLANNED or GROWING)

    **Request Body:**
    ```json
    {
      "cropId": "uuid-of-plant-data",
      "allocatedArea": 200.0,
      "plantCount": 300,
      "plantingDate": "2025-01-15T00:00:00Z"  // Optional: null = plant now
    }
    ```

    **Returns:**
    The created virtual block with planting details.
    """
    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Create virtual block
    virtual_block = await VirtualBlockService.add_crop_to_physical_block(
        block_id=block_id,
        request=request,
        user_id=current_user.userId,
        user_email=current_user.email
    )

    return SuccessResponse(
        data=virtual_block,
        message=f"Virtual crop added successfully as {virtual_block.blockCode}"
    )


@router.get(
    "/{block_id}/children",
    response_model=SuccessResponse[List[Block]],
    summary="Get virtual children of a physical block"
)
async def get_block_children(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get all active virtual blocks that are children of this physical block.

    **Returns:**
    - List of virtual child blocks (empty list if block has no children or is virtual)

    **Use Cases:**
    - Display all crops planted in a multi-crop physical block
    - Show area allocation breakdown
    - Monitor individual crop progress within a shared physical space
    """
    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Get children
    children = await VirtualBlockService.get_virtual_children(block_id)

    return SuccessResponse(
        data=children,
        message=f"Retrieved {len(children)} virtual child block(s)"
    )


@router.post(
    "/{block_id}/empty-virtual",
    response_model=SuccessResponse[dict],
    summary="Empty a virtual block and transfer history to parent"
)
async def empty_virtual_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Empty a virtual block, transfer all history to parent, and delete it.

    **This endpoint performs the following operations:**
    1. Archives the virtual block's current cycle
    2. Transfers completed tasks to parent block (with sourceBlockCode field)
    3. Auto-completes in-progress tasks and transfers them
    4. Deletes pending tasks
    5. Transfers harvest records to parent block (with sourceBlockCode field)
    6. Returns allocated area to parent's budget
    7. Updates parent status if needed (to EMPTY if no children and no crop)
    8. Hard deletes the virtual block

    **Requirements:**
    - Block must be a virtual block (blockCategory = 'virtual')
    - Block must be active (not already deleted)

    **Returns:**
    Statistics about transferred/deleted items:
    ```json
    {
      "virtualBlockId": "uuid",
      "virtualBlockCode": "A01/001",
      "parentBlockId": "uuid",
      "parentBlockCode": "A01",
      "tasksTransferred": 5,
      "tasksDeleted": 2,
      "harvestsTransferred": 3,
      "areaReturned": 200.0,
      "deleted": true
    }
    ```

    **Use Cases:**
    - Complete a virtual crop session and clean up
    - Archive crop history while maintaining parent records
    - Return area budget to parent for reuse
    """
    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Empty the virtual block
    result = await VirtualBlockService.empty_virtual_block(
        virtual_block_id=block_id,
        user_id=current_user.userId,
        user_email=current_user.email
    )

    return SuccessResponse(
        data=result,
        message=f"Virtual block {result['virtualBlockCode']} emptied successfully"
    )


@router.get(
    "/{block_id}/empty-virtual/preview",
    response_model=SuccessResponse[dict],
    summary="Preview what will happen when emptying virtual block"
)
async def preview_empty_virtual_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Preview the effects of emptying a virtual block without actually doing it.

    **Shows counts of:**
    - Tasks to be transferred (completed + in-progress)
    - Tasks to be deleted (pending)
    - Harvests to be transferred
    - Area to be returned to parent

    **Use Cases:**
    - Confirm what will happen before emptying
    - Verify data won't be lost
    - Check if there are pending tasks that will be deleted

    **Returns:**
    ```json
    {
      "virtualBlockCode": "A01/001",
      "parentBlockCode": "A01",
      "tasksToTransfer": 5,
      "tasksToDelete": 2,
      "harvestsToTransfer": 3,
      "areaToReturn": 200.0,
      "warningPendingTasks": true
    }
    ```
    """
    from ...services.database import farm_db

    # Verify block belongs to farm and is virtual
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    if block.blockCategory != 'virtual':
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Block {block.blockCode} is not a virtual block"
        )

    # Get parent block
    from ...services.block.block_repository_new import BlockRepository
    parent_block_id = block.parentBlockId if isinstance(block.parentBlockId, UUID) else UUID(str(block.parentBlockId))
    parent_block = await BlockRepository.get_by_id(parent_block_id)
    if not parent_block:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent block not found"
        )

    # Count tasks
    db = farm_db.get_database()

    completed_count = await db.farm_tasks.count_documents({
        "blockId": str(block_id),
        "status": "completed"
    })

    in_progress_count = await db.farm_tasks.count_documents({
        "blockId": str(block_id),
        "status": "in_progress"
    })

    pending_count = await db.farm_tasks.count_documents({
        "blockId": str(block_id),
        "status": "pending"
    })

    # Count harvests
    harvest_count = await db.block_harvests.count_documents({
        "blockId": str(block_id)
    })

    tasks_to_transfer = completed_count + in_progress_count

    preview = {
        "virtualBlockCode": block.blockCode,
        "parentBlockCode": parent_block.blockCode,
        "tasksToTransfer": tasks_to_transfer,
        "tasksToDelete": pending_count,
        "harvestsToTransfer": harvest_count,
        "areaToReturn": block.area,
        "warningPendingTasks": pending_count > 0
    }

    return SuccessResponse(
        data=preview,
        message="Preview of virtual block cleanup"
    )


# ==================== IOT CONTROLLER ENDPOINTS ====================

@router.patch(
    "/{block_id}/iot-controller",
    response_model=SuccessResponse[Block],
    summary="Update IoT controller configuration for a block"
)
async def update_iot_controller(
    farm_id: UUID,
    block_id: UUID,
    controller_config: IoTControllerUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Update or set the IoT controller configuration for a block.

    **Requirements:**
    - Requires **farm.manage** permission
    - Block must exist and belong to the specified farm

    **Request Body:**
    ```json
    {
      "address": "192.168.1.100",
      "port": 8090,
      "enabled": true
    }
    ```

    **Updates:**
    - Sets the IoT controller address and port
    - Enables/disables fetching from the controller
    - lastConnected is set when the frontend successfully connects

    **Use Cases:**
    - Register a Raspberry Pi or ESP32 controller for the block
    - Update controller address when IP changes
    - Enable/disable IoT integration without removing configuration
    """
    from datetime import datetime
    from fastapi import HTTPException

    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Create IoTController object with current timestamp
    from ...models.block import IoTController
    iot_controller = IoTController(
        address=controller_config.address,
        port=controller_config.port,
        enabled=controller_config.enabled,
        lastConnected=None  # Will be updated when frontend successfully connects
    )

    # Update block with new IoT controller configuration
    from ...models.block import BlockUpdate
    update_data = BlockUpdate(iotController=iot_controller)
    updated_block = await BlockService.update_block(block_id, update_data)

    return SuccessResponse(
        data=updated_block,
        message="IoT controller configuration updated successfully"
    )


@router.get(
    "/{block_id}/iot-controller",
    response_model=SuccessResponse[dict],
    summary="Get IoT controller configuration for a block"
)
async def get_iot_controller(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get the current IoT controller configuration for a block.

    **Returns:**
    - IoT controller configuration if set
    - null if no controller is configured

    **Response:**
    ```json
    {
      "data": {
        "address": "192.168.1.100",
        "port": 8090,
        "enabled": true,
        "lastConnected": "2026-01-06T16:00:00Z"
      }
    }
    ```

    **Use Cases:**
    - Check if a block has an IoT controller configured
    - Get controller address for frontend to fetch sensor/relay data
    - Verify controller configuration before fetching data
    """
    from fastapi import HTTPException

    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Return IoT controller configuration or 404 if not configured
    if not block.iotController:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No IoT controller configured for this block"
        )

    controller_data = {
        "address": block.iotController.address,
        "port": block.iotController.port,
        "enabled": block.iotController.enabled,
        "apiKey": block.iotController.apiKey,
        "relayLabels": block.iotController.relayLabels or {},
        "lastConnected": block.iotController.lastConnected.isoformat() if block.iotController.lastConnected else None
    }

    return SuccessResponse(
        data=controller_data,
        message="IoT controller configuration retrieved successfully"
    )


@router.delete(
    "/{block_id}/iot-controller",
    response_model=SuccessResponse[dict],
    summary="Remove IoT controller configuration from a block"
)
async def delete_iot_controller(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Remove the IoT controller configuration from a block.

    **Requirements:**
    - Requires **farm.manage** permission
    - Block must exist and belong to the specified farm

    **Effect:**
    - Removes IoT controller configuration
    - Block can still function normally without IoT integration
    - No data is lost (only configuration is removed)

    **Use Cases:**
    - Decommission an IoT controller
    - Switch to manual sensor management
    - Remove outdated controller configuration
    """
    from fastapi import HTTPException

    # Verify block belongs to farm
    block = await BlockService.get_block(block_id)
    if str(block.farmId) != str(farm_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    # Update block to remove IoT controller
    from ...models.block import BlockUpdate
    update_data = BlockUpdate(iotController=None)
    await BlockService.update_block(block_id, update_data)

    return SuccessResponse(
        data={"blockId": str(block_id)},
        message="IoT controller configuration removed successfully"
    )
