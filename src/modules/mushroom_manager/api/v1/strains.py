"""
Mushroom Management Module - Strain API Routes

CRUD endpoints for the mushroom strain library.
Strains are a global catalogue (not scoped to a facility).
"""

import logging
from fastapi import APIRouter, Depends, Query, status

from ...models.strain import Strain, StrainCreate, StrainUpdate
from ...services.strain.strain_service import StrainService
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /strains
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=SuccessResponse[Strain],
    status_code=status.HTTP_201_CREATED,
    summary="Create a mushroom strain",
    description="Add a new strain to the global catalogue.",
)
async def create_strain(
    strain_data: StrainCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Strain]:
    """
    Create a new mushroom strain in the global catalogue.
    """
    strain = await StrainService.create_strain(strain_data, current_user)
    return SuccessResponse(data=strain, message="Strain created successfully")


# ---------------------------------------------------------------------------
# GET /strains
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=PaginatedResponse[Strain],
    summary="List mushroom strains",
    description="Return a paginated list of all strains, sorted by commonName.",
)
async def list_strains(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    activeOnly: bool = Query(False, description="Filter to active strains only"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[Strain]:
    """
    Return all strains with pagination.

    Use activeOnly=true to filter out deactivated strains.
    """
    skip = (page - 1) * perPage
    strains, total = await StrainService.list_strains(
        skip=skip,
        limit=perPage,
        active_only=activeOnly,
    )
    total_pages = max(1, (total + perPage - 1) // perPage)

    return PaginatedResponse(
        data=strains,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /strains/{strain_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{strain_id}",
    response_model=SuccessResponse[Strain],
    summary="Get a strain by ID",
    description="Retrieve a specific strain by its UUID.",
)
async def get_strain(
    strain_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Strain]:
    """
    Get a strain by its strainId.
    """
    strain = await StrainService.get_strain(strain_id)
    return SuccessResponse(data=strain)


# ---------------------------------------------------------------------------
# PATCH /strains/{strain_id}
# ---------------------------------------------------------------------------

@router.patch(
    "/{strain_id}",
    response_model=SuccessResponse[Strain],
    summary="Update a strain",
    description="Partially update a strain entry in the catalogue.",
)
async def update_strain(
    strain_id: str,
    update_data: StrainUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Strain]:
    """
    Partially update a strain document.

    All fields are optional; only supplied fields will be changed.
    """
    strain = await StrainService.update_strain(strain_id, update_data)
    return SuccessResponse(data=strain, message="Strain updated successfully")
