"""
Genetics Repo Module - Observation API Routes

Dated observations against accessions, plus promotion of a flagged novel
trait into its own genetic line.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from ...models.accession import Accession
from ...models.line import Line
from ...models.observation import (
    Observation,
    ObservationCreate,
    ObservationUpdate,
    PromoteTraitRequest,
)
from ...services.observation.observation_service import ObservationService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from src.modules.farm_manager.middleware.auth import (
    CurrentUser,
    get_current_active_user,
    require_permission,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class PromotionResult(BaseModel):
    """The new line, and the founding accession if one was minted."""
    line: Line
    foundingAccession: Optional[Accession] = None


@router.post(
    "",
    response_model=SuccessResponse[Observation],
    status_code=status.HTTP_201_CREATED,
    summary="Record an observation",
    description="Log growth, morphology, contamination, sectoring or a photo against an accession.",
)
async def create_observation(
    payload: ObservationCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Observation]:
    observation = await ObservationService.create_observation(payload, current_user)
    return SuccessResponse(data=observation, message="Observation recorded")


@router.get(
    "",
    response_model=PaginatedResponse[Observation],
    summary="List observations",
    description="Newest first. Filter by accession, line, type, or novel-trait flag.",
)
async def list_observations(
    page: int = Query(1, ge=1),
    perPage: int = Query(50, ge=1, le=100),
    accessionId: Optional[str] = Query(None),
    lineId: Optional[str] = Query(None),
    type_: Optional[str] = Query(None, alias="type"),
    novelOnly: bool = Query(False, description="Only observations flagged as novel traits"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[Observation]:
    observations, total = await ObservationService.list_observations(
        skip=(page - 1) * perPage,
        limit=perPage,
        accession_id=accessionId,
        line_id=lineId,
        obs_type=type_,
        novel_only=novelOnly,
    )
    return PaginatedResponse(data=observations, meta=paginate(total, page, perPage))


@router.get(
    "/{observation_id}",
    response_model=SuccessResponse[Observation],
    summary="Get an observation",
)
async def get_observation(
    observation_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Observation]:
    observation = await ObservationService.get_observation(observation_id)
    return SuccessResponse(data=observation)


@router.patch(
    "/{observation_id}",
    response_model=SuccessResponse[Observation],
    summary="Update an observation",
)
async def update_observation(
    observation_id: str,
    payload: ObservationUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[Observation]:
    observation = await ObservationService.update_observation(observation_id, payload)
    return SuccessResponse(data=observation, message="Observation updated")


@router.post(
    "/{observation_id}/promote",
    response_model=SuccessResponse[PromotionResult],
    status_code=status.HTTP_201_CREATED,
    summary="Promote a novel trait into its own line",
    description=(
        "Turn a flagged observation into a new genetic line parented to the "
        "observed material's line. Unless suppressed, a founding accession is "
        "minted whose parent is the observed accession, so the physical chain "
        "back to the original dish stays unbroken."
    ),
)
async def promote_trait(
    observation_id: str,
    payload: PromoteTraitRequest,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[PromotionResult]:
    line, founding = await ObservationService.promote_trait(
        observation_id, payload, current_user
    )
    return SuccessResponse(
        data=PromotionResult(line=line, foundingAccession=founding),
        message=f"Promoted to new line '{line.code}'",
    )
