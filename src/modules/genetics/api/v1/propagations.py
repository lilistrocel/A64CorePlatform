"""
Genetics Repo Module - Propagation API Routes

Performing clones and crosses, and querying the resulting event log.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from ...models.accession import Accession
from ...models.enums import PropagationMethod, ReproductionMode
from ...models.propagation import PropagationCreate, PropagationEvent
from ...services.propagation.propagation_service import PropagationService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_view,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class PropagationOutcome(BaseModel):
    """The event plus the accessions it created."""
    event: PropagationEvent
    accessions: List[Accession]


class MethodInfo(BaseModel):
    """Describes one propagation method for the clone/cross UI."""
    value: str
    reproductionMode: ReproductionMode
    maxParents: int
    advancesCloneGeneration: bool
    advancesFilialGeneration: bool
    resetsCloneGeneration: bool


@router.get(
    "/methods",
    response_model=SuccessResponse[List[MethodInfo]],
    summary="List propagation methods and their generation effects",
    description=(
        "Drives the clone/cross form: how many parents each method accepts, "
        "and which generation counter it moves. Asexual methods advance G and "
        "inherit F; sexual methods advance F and reset G to 0."
    ),
)
async def list_methods(
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[List[MethodInfo]]:
    methods = [
        MethodInfo(
            value=method.value,
            reproductionMode=method.reproduction_mode,
            maxParents=method.max_parents,
            advancesCloneGeneration=(
                method.reproduction_mode == ReproductionMode.ASEXUAL
            ),
            advancesFilialGeneration=(
                method.reproduction_mode == ReproductionMode.SEXUAL
            ),
            resetsCloneGeneration=(
                method.reproduction_mode == ReproductionMode.SEXUAL
            ),
        )
        for method in PropagationMethod
    ]
    return SuccessResponse(data=methods)


@router.post(
    "",
    response_model=SuccessResponse[PropagationOutcome],
    status_code=status.HTTP_201_CREATED,
    summary="Perform a propagation",
    description=(
        "Clone or cross material. Generations are derived from the method: "
        "asexual transfers advance G, sexual events advance F and reset G. "
        "Parents may be one (clone), two (cross), or unidentified."
    ),
)
async def create_propagation(
    payload: PropagationCreate,
    current_user: CurrentUser = Depends(require_permission("genetics.propagate")),
) -> SuccessResponse[PropagationOutcome]:
    event, accessions = await PropagationService.propagate(payload, current_user)
    return SuccessResponse(
        data=PropagationOutcome(event=event, accessions=accessions),
        message=(
            f"Created {len(accessions)} accession(s), "
            f"{event.vesselCount} vessel(s)"
        ),
    )


@router.get(
    "",
    response_model=PaginatedResponse[PropagationEvent],
    summary="List propagation events",
    description="The lab's transfer log, newest first.",
)
async def list_propagations(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    lineId: Optional[str] = Query(None),
    accessionId: Optional[str] = Query(None, description="Events touching this accession"),
    method: Optional[str] = Query(None),
    mediumBatchId: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(require_view),
) -> PaginatedResponse[PropagationEvent]:
    events, total = await PropagationService.list_events(
        skip=(page - 1) * perPage,
        limit=perPage,
        line_id=lineId,
        accession_id=accessionId,
        method=method,
        medium_batch_id=mediumBatchId,
    )
    return PaginatedResponse(data=events, meta=paginate(total, page, perPage))


@router.get(
    "/{event_id}",
    response_model=SuccessResponse[PropagationEvent],
    summary="Get a propagation event",
)
async def get_propagation(
    event_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[PropagationEvent]:
    event = await PropagationService.get_event(event_id)
    return SuccessResponse(data=event)
