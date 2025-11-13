"""
Block Harvest API Routes

Endpoints for recording and managing harvest events.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID
from datetime import datetime

from ...models.block_harvest import (
    BlockHarvest, BlockHarvestCreate, BlockHarvestUpdate,
    BlockHarvestSummary
)
from ...services.block.harvest_service import HarvestService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/farms/{farm_id}/blocks/{block_id}/harvests", tags=["block-harvests"])


@router.post(
    "",
    response_model=SuccessResponse[BlockHarvest],
    status_code=status.HTTP_201_CREATED,
    summary="Record a harvest"
)
async def record_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_data: BlockHarvestCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Record a new harvest event.

    Requires **farm.operate** permission.

    **Automatic Updates**:
    - Updates block's actualYieldKg (cumulative)
    - Increments block's totalHarvests count
    - Recalculates block's yieldEfficiencyPercent

    **Validations**:
    - Block must exist
    - Quantity must be greater than 0
    - Quality grade must be A, B, or C
    """
    # Verify blockId in harvest_data matches URL parameter
    if harvest_data.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Block ID in request body must match URL parameter"
        )

    harvest = await HarvestService.record_harvest(
        harvest_data,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=harvest,
        message="Harvest recorded successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[BlockHarvest],
    summary="List harvests for a block"
)
async def list_block_harvests(
    farm_id: UUID,
    block_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    startDate: Optional[datetime] = Query(None, description="Filter by start date"),
    endDate: Optional[datetime] = Query(None, description="Filter by end date"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of harvest events for a block with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `startDate`: Filter harvests from this date (optional)
    - `endDate`: Filter harvests until this date (optional)
    """
    harvests, total, total_pages = await HarvestService.list_harvests_by_block(
        block_id,
        page=page,
        per_page=perPage,
        start_date=startDate,
        end_date=endDate
    )

    return PaginatedResponse(
        data=harvests,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/summary",
    response_model=SuccessResponse[BlockHarvestSummary],
    summary="Get harvest summary for a block"
)
async def get_block_harvest_summary(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive harvest summary for a block.

    Returns:
    - Total harvests count
    - Total quantity harvested (kg)
    - Quality breakdown (A/B/C grades)
    - Average quality grade
    - First and last harvest dates
    """
    summary = await HarvestService.get_harvest_summary(block_id)

    return SuccessResponse(data=summary)


@router.get(
    "/{harvest_id}",
    response_model=SuccessResponse[BlockHarvest],
    summary="Get harvest by ID"
)
async def get_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get a specific harvest event by ID.
    """
    harvest = await HarvestService.get_harvest(harvest_id)

    # Verify harvest belongs to the specified block
    if harvest.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Harvest not found in this block"
        )

    return SuccessResponse(data=harvest)


@router.patch(
    "/{harvest_id}",
    response_model=SuccessResponse[BlockHarvest],
    summary="Update a harvest"
)
async def update_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    update_data: BlockHarvestUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Update a harvest record.

    Requires **farm.operate** permission.

    **Important**: If quantity is changed, block KPI will be automatically recalculated.
    """
    harvest = await HarvestService.get_harvest(harvest_id)

    # Verify harvest belongs to the specified block
    if harvest.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Harvest not found in this block"
        )

    updated_harvest = await HarvestService.update_harvest(
        harvest_id,
        update_data
    )

    return SuccessResponse(
        data=updated_harvest,
        message="Harvest updated successfully"
    )


@router.delete(
    "/{harvest_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a harvest"
)
async def delete_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete a harvest record.

    Requires **farm.manage** permission.

    **Important**: Block KPI will be automatically recalculated after deletion.
    """
    harvest = await HarvestService.get_harvest(harvest_id)

    # Verify harvest belongs to the specified block
    if harvest.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Harvest not found in this block"
        )

    await HarvestService.delete_harvest(harvest_id)

    return SuccessResponse(
        data={"harvestId": str(harvest_id)},
        message="Harvest deleted successfully"
    )


# Farm-level harvest endpoints
farm_router = APIRouter(prefix="/farms/{farm_id}/harvests", tags=["farm-harvests"])


@farm_router.get(
    "",
    response_model=PaginatedResponse[BlockHarvest],
    summary="List all harvests in a farm"
)
async def list_farm_harvests(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    startDate: Optional[datetime] = Query(None, description="Filter by start date"),
    endDate: Optional[datetime] = Query(None, description="Filter by end date"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of all harvest events across all blocks in a farm.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `startDate`: Filter harvests from this date (optional)
    - `endDate`: Filter harvests until this date (optional)
    """
    harvests, total, total_pages = await HarvestService.list_harvests_by_farm(
        farm_id,
        page=page,
        per_page=perPage,
        start_date=startDate,
        end_date=endDate
    )

    return PaginatedResponse(
        data=harvests,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )
