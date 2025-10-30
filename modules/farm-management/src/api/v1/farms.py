"""
Farm Management Module - Farm API Routes

Endpoints for farm CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
from uuid import UUID
import logging

from ...models.farm import Farm, FarmCreate, FarmUpdate
from ...services.farm import FarmService
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

    Returns farm details plus:
    - Block statistics (total, by state)
    - Predicted yield
    - Recent activity
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

    # TODO: Implement summary logic (after Block service is ready)
    summary = {
        "farm": farm,
        "statistics": {
            "totalBlocks": 0,
            "emptyBlocks": 0,
            "plannedBlocks": 0,
            "plantedBlocks": 0,
            "harvestingBlocks": 0,
            "alertBlocks": 0,
            "totalPredictedYield": 0.0,
            "yieldUnit": "kg"
        },
        "recentActivity": []
    }

    return SuccessResponse(data=summary)
