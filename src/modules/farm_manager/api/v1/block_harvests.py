"""
Block Harvest API Routes

Endpoints for recording and managing harvest events.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional
from uuid import UUID
from datetime import date, datetime

from ...models.block_harvest import (
    BlockHarvest,
    BlockHarvestCreate,
    BlockHarvestUpdate,
    BlockHarvestSummary,
    HarvestBatchLookupResponse,
    HarvestBatchSubmitRequest,
    HarvestBatchSubmitResponse,
)
from ...services.block.harvest_service import HarvestService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(
    prefix="/farms/{farm_id}/blocks/{block_id}/harvests", tags=["block-harvests"]
)


@router.post(
    "",
    response_model=SuccessResponse[BlockHarvest],
    status_code=status.HTTP_201_CREATED,
    summary="Record a harvest",
)
async def record_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_data: BlockHarvestCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
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
            detail="Block ID in request body must match URL parameter",
        )

    harvest = await HarvestService.record_harvest(
        harvest_data, current_user.userId, current_user.email
    )

    return SuccessResponse(data=harvest, message="Harvest recorded successfully")


@router.get(
    "",
    response_model=PaginatedResponse[BlockHarvest],
    summary="List harvests for a block",
)
async def list_block_harvests(
    farm_id: UUID,
    block_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    startDate: Optional[datetime] = Query(None, description="Filter by start date"),
    endDate: Optional[datetime] = Query(None, description="Filter by end date"),
    farmingYear: Optional[int] = Query(
        None, description="Filter by farming year (e.g., 2025 for Aug 2025 - Jul 2026)"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Get list of harvest events for a block with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `startDate`: Filter harvests from this date (optional)
    - `endDate`: Filter harvests until this date (optional)
    - `farmingYear`: Filter by farming year (optional, e.g., 2025 for Aug 2025 - Jul 2026)

    **Note**: Date range filters (startDate, endDate) can be used together with farmingYear
    for more precise filtering within a specific farming year.
    """
    harvests, total, total_pages = await HarvestService.list_harvests_by_block(
        block_id,
        page=page,
        per_page=perPage,
        start_date=startDate,
        end_date=endDate,
        farming_year=farmingYear,
    )

    return PaginatedResponse(
        data=harvests,
        meta=PaginationMeta(
            total=total, page=page, perPage=perPage, totalPages=total_pages
        ),
    )


@router.get(
    "/summary",
    response_model=SuccessResponse[BlockHarvestSummary],
    summary="Get harvest summary for a block",
)
async def get_block_harvest_summary(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
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


# NOTE: Static routes (batch, batch-lookup, summary above) MUST come before
# the dynamic /{harvest_id} route below, same convention as inventory.py.


@router.post(
    "/batch",
    response_model=SuccessResponse[HarvestBatchSubmitResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record a multi-line harvest (Plant Library product extension)",
)
async def submit_harvest_batch(
    farm_id: UUID,
    block_id: UUID,
    request: HarvestBatchSubmitRequest,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
):
    """
    Record a multi-line harvest submission — one or more product lines off
    the same block/date, each resolved from the block's mother
    (`block.productMotherId` -> `plant_mothers.products[]`) and routed by
    its product's category, all sharing one server-generated
    `harvestBatchId`:

    - **sellable** -> a `block_harvests` row (same place the existing
      single-line endpoint writes to) -> `inventory_harvest` FIFO batch
    - **process** -> a new `processing_inventory` row
    - **waste** -> `inventory_waste` directly

    Requires **farm.operate** permission.

    **Validations**:
    - `productId` on every line must belong to this block's mother and be
      active (400 otherwise)
    - `qualityGrade` is required for sellable/process lines
    - `qualityGrade` must be omitted for waste lines (harvest waste is not
      graded) — supplying one is rejected (400), not silently dropped

    See `Docs/2-Working-Progress/plant-library-product-extension-design.md`
    §3/§5 for the full design.
    """
    response = await HarvestService.submit_harvest_batch(
        farm_id,
        block_id,
        request,
        UUID(current_user.userId),
        current_user.email,
    )
    return SuccessResponse(data=response, message="Harvest batch recorded successfully")


@router.get(
    "/batch-lookup",
    response_model=SuccessResponse[HarvestBatchLookupResponse],
    summary="Look up every harvest line for a block on a date, across all destinations",
)
async def get_harvest_batch_lookup(
    farm_id: UUID,
    block_id: UUID,
    harvestDate: date = Query(..., description="Calendar date (YYYY-MM-DD) to look up"),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Given a block + calendar date, return every line recorded for that
    block on that date, unioned across all three destinations
    (`block_harvests`, `processing_inventory`, `inventory_waste`) and
    grouped by `harvestBatchId` — so a mixed multi-line submission can be
    reviewed or edited as a unit (design doc §7).

    The default harvest list (`GET .../harvests`) is UNCHANGED and stays
    `block_harvests`-only (sellable rows); this is a separate, deliberately
    more expensive lookup used only for editing a batch.
    """
    result = await HarvestService.get_batch_lookup(block_id, harvestDate)
    return SuccessResponse(data=result)


@router.get(
    "/{harvest_id}",
    response_model=SuccessResponse[BlockHarvest],
    summary="Get harvest by ID",
)
async def get_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
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
            detail="Harvest not found in this block",
        )

    return SuccessResponse(data=harvest)


@router.patch(
    "/{harvest_id}",
    response_model=SuccessResponse[BlockHarvest],
    summary="Update a harvest",
)
async def update_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    update_data: BlockHarvestUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
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
            detail="Harvest not found in this block",
        )

    updated_harvest = await HarvestService.update_harvest(harvest_id, update_data)

    return SuccessResponse(data=updated_harvest, message="Harvest updated successfully")


@router.delete(
    "/{harvest_id}", response_model=SuccessResponse[dict], summary="Delete a harvest"
)
async def delete_harvest(
    farm_id: UUID,
    block_id: UUID,
    harvest_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
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
            detail="Harvest not found in this block",
        )

    await HarvestService.delete_harvest(harvest_id)

    return SuccessResponse(
        data={"harvestId": str(harvest_id)}, message="Harvest deleted successfully"
    )


# Farm-level harvest endpoints
farm_router = APIRouter(prefix="/farms/{farm_id}/harvests", tags=["farm-harvests"])


@farm_router.get(
    "",
    response_model=PaginatedResponse[BlockHarvest],
    summary="List all harvests in a farm",
)
async def list_farm_harvests(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    startDate: Optional[datetime] = Query(None, description="Filter by start date"),
    endDate: Optional[datetime] = Query(None, description="Filter by end date"),
    farmingYear: Optional[int] = Query(
        None, description="Filter by farming year (e.g., 2025 for Aug 2025 - Jul 2026)"
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Get list of all harvest events across all blocks in a farm.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `startDate`: Filter harvests from this date (optional)
    - `endDate`: Filter harvests until this date (optional)
    - `farmingYear`: Filter by farming year (optional, e.g., 2025 for Aug 2025 - Jul 2026)

    **Note**: Date range filters (startDate, endDate) can be used together with farmingYear
    for more precise filtering within a specific farming year.
    """
    harvests, total, total_pages = await HarvestService.list_harvests_by_farm(
        farm_id,
        page=page,
        per_page=perPage,
        start_date=startDate,
        end_date=endDate,
        farming_year=farmingYear,
    )

    return PaginatedResponse(
        data=harvests,
        meta=PaginationMeta(
            total=total, page=page, perPage=perPage, totalPages=total_pages
        ),
    )
