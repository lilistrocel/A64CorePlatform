"""
Block API Routes

Endpoints for managing farm blocks.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID

from ...models.block import Block, BlockCreate, BlockUpdate, BlockStatus, BlockStatusUpdate
from ...models.block_analytics import BlockAnalyticsResponse, TimePeriod
from ...services.block.block_service_new import BlockService
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
    """
    blocks, total, total_pages = await BlockService.list_blocks(
        farm_id=farm_id,
        page=page,
        per_page=perPage,
        status=status_filter,
        block_type=blockType,
        target_crop=targetCrop
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
    summary="Delete a block"
)
async def delete_block(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete a block.

    Requires **farm.manage** permission.

    **Important**: Block must be in 'empty' state to be deleted.
    Cannot delete blocks that are planted or in use.
    """
    block = await BlockService.get_block(block_id)

    # Verify block belongs to the specified farm
    if str(block.farmId) != str(farm_id):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found in this farm"
        )

    await BlockService.delete_block(block_id)

    return SuccessResponse(
        data={"blockId": str(block_id)},
        message="Block deleted successfully"
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
