"""
Mushroom Management Module - Environment Log API Routes

Endpoints for recording and retrieving climate readings for growing rooms.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status

from ...models.environment import EnvironmentLog, EnvironmentLogCreate
from ...services.environment.environment_service import EnvironmentService
from ...utils.responses import SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities/{facility_id}/rooms/{room_id}/environment
# ---------------------------------------------------------------------------

@router.post(
    "/facilities/{facility_id}/rooms/{room_id}/environment",
    response_model=SuccessResponse[EnvironmentLog],
    status_code=status.HTTP_201_CREATED,
    summary="Record an environment reading",
    description=(
        "Record a climate reading for a growing room. "
        "The room's current phase is captured automatically for retrospective analysis."
    ),
)
async def create_log(
    facility_id: str,
    room_id: str,
    log_data: EnvironmentLogCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[EnvironmentLog]:
    """
    Create an environment log entry for a growing room.

    The current phase of the room is denormalised into the log document
    so that readings can be analysed per growth phase later.
    """
    log = await EnvironmentService.create_log(
        facility_id=facility_id,
        room_id=room_id,
        data=log_data,
        current_user=current_user,
    )
    return SuccessResponse(data=log, message="Environment reading recorded successfully")


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms/{room_id}/environment
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms/{room_id}/environment",
    response_model=SuccessResponse[List[EnvironmentLog]],
    summary="List environment logs",
    description="Return recent environment readings for a growing room.",
)
async def list_logs(
    facility_id: str,
    room_id: str,
    limit: int = Query(50, ge=1, le=500, description="Max number of recent readings to return"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[List[EnvironmentLog]]:
    """
    Return the most recent environment logs for a growing room, newest first.
    """
    logs = await EnvironmentService.list_logs(
        facility_id=facility_id,
        room_id=room_id,
        limit=limit,
    )
    return SuccessResponse(data=logs)


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms/{room_id}/environment/latest
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms/{room_id}/environment/latest",
    response_model=SuccessResponse[Optional[EnvironmentLog]],
    summary="Get latest environment reading",
    description="Return the single most recent climate reading for a growing room.",
)
async def get_latest_log(
    facility_id: str,
    room_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Optional[EnvironmentLog]]:
    """
    Return the most recent environment log for a growing room.

    Returns data: null when no readings exist for the room.
    """
    log = await EnvironmentService.get_latest(
        facility_id=facility_id,
        room_id=room_id,
    )
    return SuccessResponse(data=log)
