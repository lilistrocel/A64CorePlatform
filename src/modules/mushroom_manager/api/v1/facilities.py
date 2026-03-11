"""
Mushroom Management Module - Facility API Routes

CRUD endpoints for mushroom facilities.
Facilities are the top-level container (warehouse, greenhouse, cave) for cultivation.
"""

import logging
from fastapi import APIRouter, Depends, Query, status

from ...models.facility import Facility, FacilityCreate, FacilityUpdate
from ...services.facility.facility_service import FacilityService
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse

# Reason: Reuse the existing farm_manager auth middleware — JWT key is shared
# across the A64Core platform.  The mushroom module does not define its own tokens.
from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=SuccessResponse[Facility],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new mushroom facility",
    description="Create a new cultivation facility. Requires mushroom.create permission.",
)
async def create_facility(
    facility_data: FacilityCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Facility]:
    """
    Create a new mushroom facility.

    The authenticated user becomes the facility manager automatically.
    """
    facility = await FacilityService.create_facility(facility_data, current_user)
    return SuccessResponse(data=facility, message="Facility created successfully")


# ---------------------------------------------------------------------------
# GET /facilities
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=PaginatedResponse[Facility],
    summary="List mushroom facilities",
    description="Return a paginated list of all facilities.",
)
async def list_facilities(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[Facility]:
    """
    Return all facilities with pagination.

    Results are sorted alphabetically by facility name.
    """
    skip = (page - 1) * perPage
    facilities, total = await FacilityService.list_facilities(skip=skip, limit=perPage)
    total_pages = max(1, (total + perPage - 1) // perPage)

    return PaginatedResponse(
        data=facilities,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{facility_id}",
    response_model=SuccessResponse[Facility],
    summary="Get facility by ID",
    description="Retrieve a specific facility by its UUID.",
)
async def get_facility(
    facility_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Facility]:
    """
    Get a facility by its facilityId.
    """
    facility = await FacilityService.get_facility(facility_id)
    return SuccessResponse(data=facility)


# ---------------------------------------------------------------------------
# PATCH /facilities/{facility_id}
# ---------------------------------------------------------------------------

@router.patch(
    "/{facility_id}",
    response_model=SuccessResponse[Facility],
    summary="Update a facility",
    description="Partially update a facility. Only provided fields are modified.",
)
async def update_facility(
    facility_id: str,
    update_data: FacilityUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Facility]:
    """
    Partially update a facility document.

    All fields are optional; only supplied fields will be changed.
    """
    facility = await FacilityService.update_facility(facility_id, update_data)
    return SuccessResponse(data=facility, message="Facility updated successfully")
