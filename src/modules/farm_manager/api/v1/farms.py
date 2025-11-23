"""
Farm Management Module - Farm API Routes

Endpoints for farm CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
from uuid import UUID
import logging

from ...models.farm import Farm, FarmCreate, FarmUpdate
from ...models.farm_analytics import FarmAnalyticsResponse
from ...services.farm import FarmService
from ...services.farm.farm_analytics_service import FarmAnalyticsService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Farm],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new farm",
    description="Create a new farm. Requires farm.manage permission. Creator is automatically assigned as farm manager."
)
async def create_farm(
    farm_data: FarmCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
    service: FarmService = Depends()
):
    """
    Create a new farm

    - **name**: Farm name (required)
    - **description**: Farm description (optional)
    - **location**: Geographic location (optional)
    - **totalArea**: Total farm area (optional)
    - **areaUnit**: Area unit (default: hectares)
    """
    farm = await service.create_farm(
        farm_data,
        UUID(current_user.userId),
        current_user.email
    )

    return SuccessResponse(
        data=farm,
        message="Farm created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Farm],
    summary="Get all farms",
    description="Get all farms with pagination. Users see only their assigned farms unless admin."
)
async def get_farms(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    isActive: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: FarmService = Depends()
):
    """
    Get all farms with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **isActive**: Filter by active status (optional)

    Regular users only see farms they manage.
    Admins see all farms.
    """
    # Check if user is admin
    if current_user.role in ["super_admin", "admin"]:
        # Admins see all farms
        farms, total, total_pages = await service.get_all_farms(
            page, perPage, isActive
        )
    else:
        # Regular users see only their farms
        farms = await service.get_user_farms(
            UUID(current_user.userId),
            isActive
        )
        total = len(farms)
        total_pages = (total + perPage - 1) // perPage

        # Apply pagination manually for user farms
        start = (page - 1) * perPage
        end = start + perPage
        farms = farms[start:end]

    return PaginatedResponse(
        data=farms,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{farm_id}",
    response_model=SuccessResponse[Farm],
    summary="Get farm by ID",
    description="Get a specific farm by ID. User must have access to the farm."
)
async def get_farm(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
    service: FarmService = Depends()
):
    """
    Get farm by ID

    - **farm_id**: Farm UUID
    """
    farm = await service.get_farm(farm_id)

    # Check access (admins can access all farms)
    if current_user.role not in ["super_admin", "admin"]:
        if str(farm.managerId) != current_user.userId:
            # TODO: Check farm assignments
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Not assigned to this farm"
            )

    return SuccessResponse(data=farm)


@router.patch(
    "/{farm_id}",
    response_model=SuccessResponse[Farm],
    summary="Update farm",
    description="Update a farm. Only the farm manager can update their farm."
)
async def update_farm(
    farm_id: UUID,
    update_data: FarmUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
    service: FarmService = Depends()
):
    """
    Update a farm

    - **farm_id**: Farm UUID
    - All fields are optional (partial update)
    """
    farm = await service.update_farm(
        farm_id,
        update_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=farm,
        message="Farm updated successfully"
    )


@router.delete(
    "/{farm_id}",
    response_model=SuccessResponse[dict],
    summary="Delete farm",
    description="Delete a farm (soft delete). Only the farm manager can delete their farm."
)
async def delete_farm(
    farm_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
    service: FarmService = Depends()
):
    """
    Delete a farm (soft delete)

    - **farm_id**: Farm UUID

    Farm must not have active blocks.
    """
    result = await service.delete_farm(
        farm_id,
        UUID(current_user.userId)
    )

    return SuccessResponse(data=result)


@router.get(
    "/{farm_id}/summary",
    response_model=SuccessResponse[dict],
    summary="Get farm summary",
    description="Get farm summary with statistics (blocks, predicted yield, etc.)"
)
async def get_farm_summary(
    farm_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
    service: FarmService = Depends()
):
    """
    Get farm summary with statistics

    - **farm_id**: Farm UUID

    Returns:
    - farmId: Farm UUID
    - totalBlocks: Total number of blocks
    - totalBlockArea: Sum of all block areas
    - blocksByState: Count of blocks by state (empty, planned, planted, harvesting, alert)
    - activePlantings: Number of blocks currently planted
    - totalPlantedPlants: Total plants across all blocks
    - predictedYield: Total predicted yield in kg
    """
    # Get farm
    farm = await service.get_farm(farm_id)

    # Check access
    if current_user.role not in ["super_admin", "admin"]:
        if str(farm.managerId) != current_user.userId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Not assigned to this farm"
            )

    # Get all blocks for this farm
    from ...services.block.block_repository_new import BlockRepository
    from ...models.block import BlockStatus

    blocks, total_count = await BlockRepository.get_by_farm(farm_id, skip=0, limit=1000)

    # Calculate statistics
    total_blocks = len(blocks)
    total_block_area = sum(block.area for block in blocks)
    total_planted_plants = sum(block.actualPlantCount or 0 for block in blocks)
    predicted_yield = sum(block.kpi.predictedYieldKg for block in blocks)

    # Count blocks by state (map new status system to old state system)
    blocks_by_state = {
        "empty": 0,
        "planned": 0,
        "planted": 0,
        "harvesting": 0,
        "alert": 0
    }

    active_plantings = 0

    for block in blocks:
        # Map new status to old state
        if block.state == BlockStatus.EMPTY:
            blocks_by_state["empty"] += 1
        elif block.state == BlockStatus.ALERT:
            blocks_by_state["alert"] += 1
        elif block.state in [BlockStatus.GROWING, BlockStatus.FRUITING]:
            blocks_by_state["planted"] += 1
            active_plantings += 1
        elif block.state == BlockStatus.HARVESTING:
            blocks_by_state["harvesting"] += 1
            active_plantings += 1
        # CLEANING status is transitional, count as empty for display
        elif block.state == BlockStatus.CLEANING:
            blocks_by_state["empty"] += 1

    summary = {
        "farmId": str(farm.farmId),
        "totalBlocks": total_blocks,
        "totalBlockArea": total_block_area,
        "blocksByState": blocks_by_state,
        "activePlantings": active_plantings,
        "totalPlantedPlants": total_planted_plants,
        "predictedYield": predicted_yield
    }

    return SuccessResponse(data=summary)


@router.get(
    "/{farm_id}/analytics",
    response_model=SuccessResponse[FarmAnalyticsResponse],
    summary="Get farm analytics",
    description="Get comprehensive farm-level analytics aggregated from all blocks"
)
async def get_farm_analytics(
    farm_id: UUID,
    period: str = Query(
        "30d",
        description="Time period: '30d', '90d', '6m', '1y', 'all'",
        regex="^(30d|90d|6m|1y|all)$"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
    service: FarmService = Depends()
):
    """
    Get comprehensive farm analytics aggregated from all blocks

    - **farm_id**: Farm UUID
    - **period**: Time period ('30d', '90d', '6m', '1y', 'all')

    Returns:
    - **aggregatedMetrics**: Total yield, average efficiency, performance score, utilization
    - **stateBreakdown**: Count of blocks in each state (empty, planned, growing, etc.)
    - **blockComparison**: Individual block performance comparison
    - **historicalTrends**: Yield timeline, state transitions, performance trend

    This endpoint aggregates data from:
    - All blocks in the farm
    - Harvest records within the time period
    - Task completion rates
    - Alert statistics
    - State transition history
    """
    # Get farm to check access
    farm = await service.get_farm(farm_id)

    # Check access (admins can access all farms)
    if current_user.role not in ["super_admin", "admin"]:
        if str(farm.managerId) != current_user.userId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Not assigned to this farm"
            )

    # Generate analytics
    analytics = await FarmAnalyticsService.get_farm_analytics(
        farm_id=farm_id,
        period=period
    )

    return SuccessResponse(
        data=analytics,
        message="Farm analytics retrieved successfully"
    )
