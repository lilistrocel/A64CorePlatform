"""
Genetics Repo Module - Line API Routes

CRUD for genetic lines — the named identities behind the physical material.
"""

import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from ...models.line import Line, LineCreate, LineUpdate, LineWithStats
from ...services.line.line_service import LineService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from src.modules.farm_manager.middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class LinkedProfileCounts(BaseModel):
    """How many genetic lines carry each growing profile."""
    strains: Dict[str, int] = Field(
        default_factory=dict, description="mushroom_strains strainId -> line count"
    )
    plants: Dict[str, int] = Field(
        default_factory=dict, description="plant_data plantDataId -> line count"
    )


@router.post(
    "",
    response_model=SuccessResponse[Line],
    status_code=status.HTTP_201_CREATED,
    summary="Create a genetic line",
    description="Register a new named genetic identity (strain, variety or bloodline).",
)
async def create_line(
    payload: LineCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Line]:
    line = await LineService.create_line(payload, current_user)
    return SuccessResponse(data=line, message="Genetic line created successfully")


@router.get(
    "",
    # LineWithStats, not Line — the response model filters unknown fields, so
    # declaring Line here would silently strip the accession rollups the
    # service computes and the repo cards depend on.
    response_model=PaginatedResponse[LineWithStats],
    summary="List genetic lines",
    description="Paginated list of genetic lines with accession rollups.",
)
async def list_lines(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    kind: Optional[str] = Query(None, description="plant, fungus, animal or other"),
    search: Optional[str] = Query(None, description="Match name, code or scientific name"),
    tag: Optional[str] = Query(None),
    parentLineId: Optional[str] = Query(None, description="Only lines derived from this line"),
    linkedStrainId: Optional[str] = Query(
        None, description="Only lines linked to this mushroom_strains growing profile"
    ),
    linkedPlantDataId: Optional[str] = Query(
        None, description="Only lines linked to this plant_data growing profile"
    ),
    activeOnly: bool = Query(False),
    withStats: bool = Query(True, description="Include accession rollups"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[LineWithStats]:
    lines, total = await LineService.list_lines(
        skip=(page - 1) * perPage,
        limit=perPage,
        kind=kind,
        search=search,
        tag=tag,
        parent_line_id=parentLineId,
        linked_strain_id=linkedStrainId,
        linked_plant_data_id=linkedPlantDataId,
        active_only=activeOnly,
        with_stats=withStats,
    )
    return PaginatedResponse(data=lines, meta=paginate(total, page, perPage))


@router.get(
    # Declared before /{line_id} so the literal path is not swallowed by the
    # path-parameter route.
    "/linked-counts",
    response_model=SuccessResponse[LinkedProfileCounts],
    summary="Count genetic lines per linked growing profile",
    description=(
        "Reverse link for the Strain Library and Plant Library: how many genetic "
        "lines carry each growing profile. Returned as two id->count maps so a "
        "library page can annotate every row from a single request."
    ),
)
async def get_linked_counts(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[LinkedProfileCounts]:
    counts = await LineService.count_by_linked_profile()
    return SuccessResponse(data=LinkedProfileCounts(**counts))


@router.get(
    "/{line_id}",
    response_model=SuccessResponse[LineWithStats],
    summary="Get a genetic line",
    description="Retrieve one line with its accession rollups.",
)
async def get_line(
    line_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[LineWithStats]:
    line = await LineService.get_line_with_stats(line_id)
    return SuccessResponse(data=line)


@router.patch(
    "/{line_id}",
    response_model=SuccessResponse[Line],
    summary="Update a genetic line",
    description="Partially update a line. Only supplied fields change.",
)
async def update_line(
    line_id: str,
    payload: LineUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Line]:
    line = await LineService.update_line(line_id, payload)
    return SuccessResponse(data=line, message="Genetic line updated successfully")


@router.delete(
    "/{line_id}",
    response_model=SuccessResponse[Line],
    summary="Deactivate a genetic line",
    description=(
        "Soft-delete a line. Hard deletion is unsupported: accessions and "
        "propagation events reference it, and removing it would break "
        "traceability chains."
    ),
)
async def deactivate_line(
    line_id: str,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Line]:
    line = await LineService.deactivate_line(line_id)
    return SuccessResponse(data=line, message="Genetic line deactivated")
