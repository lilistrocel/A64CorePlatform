"""
Genetics Repo Module - Accession API Routes

CRUD for physical genetic material, plus the batch split and the
code-lookup endpoint used by label scanning.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ...models.accession import (
    Accession,
    AccessionCreate,
    AccessionSplit,
    AccessionUpdate,
)
from ...services.accession.accession_service import AccessionService
from ...services.accession.vessel_resolver import resolve_vessel
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_view,
)

# Reused verbatim from the public (unauthenticated) label-info route — see
# public.py's module docstring for why token lookup is case-insensitive
# (uppercase-normalised) plain-equality, NOT a regex, so the unique index on
# `publicToken` is used. This module only imports the pure lookup function;
# public.py's router is mounted separately (register.py) and is untouched.
from .public import _load_accession_by_token

logger = logging.getLogger(__name__)

router = APIRouter()


class SplitResult(BaseModel):
    """Both sides of a batch split."""

    source: Accession
    split: Accession


class RoomOccupancy(BaseModel):
    """Live material held in one room."""

    vessels: int = Field(0, description="Total vessels/head across all records")
    records: int = Field(0, description="Number of accession records")
    byForm: Dict[str, int] = Field(
        default_factory=dict, description="Vessel count per form, e.g. petri_dish -> 40"
    )
    byStatus: Dict[str, int] = Field(
        default_factory=dict,
        description="Vessel count per AccessionStatus, e.g. active -> 40",
    )
    colonizedCount: int = Field(
        0, description="Records (not vessels) with a non-null colonizedAt"
    )
    oldestColonizedAt: Optional[datetime] = Field(
        None, description="Earliest colonizedAt among live records in this room, if any"
    )
    newestColonizedAt: Optional[datetime] = Field(
        None, description="Latest colonizedAt among live records in this room, if any"
    )


@router.post(
    "",
    response_model=SuccessResponse[Accession],
    status_code=status.HTTP_201_CREATED,
    summary="Register an accession",
    description=(
        "Register founding material by hand — a G0, or something acquired "
        "from outside. Material produced by a clone or cross should go "
        "through POST /propagations instead, which derives generations and "
        "parentage automatically."
    ),
)
async def create_accession(
    payload: AccessionCreate,
    current_user: CurrentUser = Depends(require_permission("genetics.create")),
) -> SuccessResponse[Accession]:
    accession = await AccessionService.create_accession(payload, current_user)
    return SuccessResponse(data=accession, message="Accession registered successfully")


@router.get(
    "",
    response_model=PaginatedResponse[Accession],
    summary="List accessions",
    description="Paginated list of physical material, filterable by line, status and form.",
)
async def list_accessions(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    lineId: Optional[str] = Query(None),
    status_: Optional[str] = Query(None, alias="status"),
    form: Optional[str] = Query(None),
    mediumBatchId: Optional[str] = Query(None),
    roomId: Optional[str] = Query(
        None, description="Material currently held in this room"
    ),
    facilityId: Optional[str] = Query(
        None, description="Material currently held in this facility"
    ),
    generation: Optional[int] = Query(
        None, ge=0, description="Filter by clone generation (G)"
    ),
    search: Optional[str] = Query(None, description="Match accession code or label"),
    activeOnly: bool = Query(False),
    current_user: CurrentUser = Depends(require_view),
) -> PaginatedResponse[Accession]:
    accessions, total = await AccessionService.list_accessions(
        skip=(page - 1) * perPage,
        limit=perPage,
        line_id=lineId,
        status_filter=status_,
        form=form,
        medium_batch_id=mediumBatchId,
        room_id=roomId,
        facility_id=facilityId,
        generation=generation,
        search=search,
        active_only=activeOnly,
    )
    return PaginatedResponse(data=accessions, meta=paginate(total, page, perPage))


@router.get(
    "/room-occupancy",
    response_model=SuccessResponse[Dict[str, RoomOccupancy]],
    summary="What is physically held in each room",
    description=(
        "Live material per room, keyed by roomId, in one aggregation — so a "
        "facility page can annotate every room from a single request. Counts "
        "exclude discarded and consumed records."
    ),
)
async def get_room_occupancy(
    facilityId: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[Dict[str, RoomOccupancy]]:
    raw = await AccessionService.room_occupancy(facility_id=facilityId)
    return SuccessResponse(data={k: RoomOccupancy(**v) for k, v in raw.items()})


@router.get(
    "/by-code/{accession_code}",
    response_model=SuccessResponse[Accession],
    summary="Look up an accession by its printed code",
    description="Resolve a scanned or typed label code, e.g. 'PO-BLU-G2-014'.",
)
async def get_accession_by_code(
    accession_code: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[Accession]:
    accession = await AccessionService.get_by_code(accession_code)
    return SuccessResponse(data=accession)


@router.get(
    "/by-token/{token}",
    response_model=SuccessResponse[Accession],
    summary="Resolve a scanned label token to its accession (authenticated)",
    description=(
        "T-806: the authenticated counterpart to the public label-info page. "
        "Scanning a printed label opens the unauthenticated page at "
        "`/i/{token}[/{vesselNo}]`, which deliberately exposes no internal "
        "UUIDs. To let a logged-in user act on what they just scanned (e.g. "
        "'mark this plate contaminated'), this route turns the same "
        "`{token, vesselNo}` pair into the full internal accession record — "
        "resolution happens behind auth so the public page never learns the "
        "UUID. Token match is case-insensitive (the label prints its URL "
        "uppercase for QR alphanumeric mode). When `vesselNo` is supplied, "
        "it is run through the same split-forward resolver the public route "
        "uses, so a split-off plate resolves to the child accession that "
        "currently holds that physical vessel."
    ),
    # IMPORTANT — route ordering: this must be declared before
    # `/{accession_id}` below. It happens to be structurally safe even out
    # of order here (two path segments vs. one never collide in FastAPI's
    # routing), but the ordering is kept deliberate and verified live rather
    # than relied on implicitly — see T-806 and the `/users/me/tutorials` vs
    # `/users/{user_id}` precedent this codebase has already been bitten by.
)
async def get_accession_by_token(
    token: str,
    vesselNo: Optional[int] = Query(
        None,
        ge=1,
        description="Printed vessel ordinal. A split-off plate resolves to the child accession that currently holds it.",
    ),
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[Accession]:
    accession = await _load_accession_by_token(token)
    if accession is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No accession found for this label token.",
        )

    if vesselNo is not None:
        if vesselNo > accession.labelledVesselCount:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vessel number is out of range for this label.",
            )
        accession = await resolve_vessel(accession, vesselNo)

    return SuccessResponse(data=accession)


@router.get(
    "/{accession_id}",
    response_model=SuccessResponse[Accession],
    summary="Get an accession",
)
async def get_accession(
    accession_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[Accession]:
    accession = await AccessionService.get_accession(accession_id)
    return SuccessResponse(data=accession)


@router.get(
    "/{accession_id}/children",
    response_model=SuccessResponse[List[Accession]],
    summary="List direct descendants",
    description="Accessions produced directly from this one.",
)
async def list_children(
    accession_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[List[Accession]]:
    children = await AccessionService.list_children(accession_id)
    return SuccessResponse(data=children)


@router.patch(
    "/{accession_id}",
    response_model=SuccessResponse[Accession],
    summary="Update an accession",
    description="Partially update material — status, location, quantity, notes.",
)
async def update_accession(
    accession_id: str,
    payload: AccessionUpdate,
    current_user: CurrentUser = Depends(require_permission("genetics.edit")),
) -> SuccessResponse[Accession]:
    accession = await AccessionService.update_accession(accession_id, payload)
    return SuccessResponse(data=accession, message="Accession updated successfully")


@router.post(
    "/{accession_id}/split",
    response_model=SuccessResponse[SplitResult],
    status_code=status.HTTP_201_CREATED,
    summary="Split vessels out of a batch",
    description=(
        "Move N vessels out of a batch record into their own accession — used "
        "when one plate diverges or contaminates. Not a propagation: "
        "generations and parents are copied verbatim, so lineage is unbroken."
    ),
)
async def split_accession(
    accession_id: str,
    payload: AccessionSplit,
    current_user: CurrentUser = Depends(require_permission("genetics.edit")),
) -> SuccessResponse[SplitResult]:
    source, split = await AccessionService.split_accession(
        accession_id, payload, current_user
    )
    return SuccessResponse(
        data=SplitResult(source=source, split=split),
        message=f"Split {payload.quantity} out of {source.accessionCode}",
    )
