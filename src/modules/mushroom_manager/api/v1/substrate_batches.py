"""
Mushroom Management Module - Substrate Batch API Routes

CRUD endpoints for substrate batches within a facility.
"""

import logging
from fastapi import APIRouter, Depends, Query, status

from ...models.substrate import SubstrateBatch, SubstrateBatchCreate, SubstrateBatchUpdate
from ...services.substrate.substrate_service import SubstrateService
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities/{facility_id}/substrates
# ---------------------------------------------------------------------------

@router.post(
    "/facilities/{facility_id}/substrates",
    response_model=SuccessResponse[SubstrateBatch],
    status_code=status.HTTP_201_CREATED,
    summary="Create a substrate batch",
    description="Prepare a new substrate batch for a facility.",
)
async def create_batch(
    facility_id: str,
    batch_data: SubstrateBatchCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[SubstrateBatch]:
    """
    Create a new substrate batch in the given facility.
    """
    batch = await SubstrateService.create_batch(facility_id, batch_data, current_user)
    return SuccessResponse(data=batch, message="Substrate batch created successfully")


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/substrates
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/substrates",
    response_model=PaginatedResponse[SubstrateBatch],
    summary="List substrate batches",
    description="Return all substrate batches for a facility, newest first.",
)
async def list_batches(
    facility_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[SubstrateBatch]:
    """
    Return substrate batches for a facility with pagination.
    """
    skip = (page - 1) * perPage
    batches, total = await SubstrateService.list_batches(
        facility_id=facility_id,
        skip=skip,
        limit=perPage,
    )
    total_pages = max(1, (total + perPage - 1) // perPage)

    return PaginatedResponse(
        data=batches,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /substrates/{batch_id}
# ---------------------------------------------------------------------------

@router.get(
    "/substrates/{batch_id}",
    response_model=SuccessResponse[SubstrateBatch],
    summary="Get a substrate batch by ID",
    description="Retrieve a specific substrate batch by its UUID.",
)
async def get_batch(
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[SubstrateBatch]:
    """
    Get a substrate batch by its batchId.
    """
    batch = await SubstrateService.get_batch(batch_id)
    return SuccessResponse(data=batch)


# ---------------------------------------------------------------------------
# PATCH /substrates/{batch_id}
# ---------------------------------------------------------------------------

@router.patch(
    "/substrates/{batch_id}",
    response_model=SuccessResponse[SubstrateBatch],
    summary="Update a substrate batch",
    description="Partially update a substrate batch record.",
)
async def update_batch(
    batch_id: str,
    update_data: SubstrateBatchUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[SubstrateBatch]:
    """
    Partially update a substrate batch.

    All fields are optional; only supplied fields will be changed.
    """
    batch = await SubstrateService.update_batch(batch_id, update_data)
    return SuccessResponse(data=batch, message="Substrate batch updated successfully")
