"""
Genetics Repo Module - Accession API Routes

CRUD for physical genetic material, plus the batch split and the
code-lookup endpoint used by label scanning.
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from ...models.accession import (
    Accession,
    AccessionCreate,
    AccessionSplit,
    AccessionUpdate,
)
from ...services.accession.accession_service import AccessionService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_view,
)

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
    roomId: Optional[str] = Query(None, description="Material currently held in this room"),
    facilityId: Optional[str] = Query(None, description="Material currently held in this facility"),
    generation: Optional[int] = Query(None, ge=0, description="Filter by clone generation (G)"),
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
