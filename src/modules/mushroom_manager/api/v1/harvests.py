"""
Mushroom Management Module - Harvest API Routes

Endpoints for recording and retrieving mushroom harvest events.
Harvests are flush-aware and scoped to a growing room within a facility.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, status

from ...models.harvest import Harvest, HarvestCreate
from ...services.harvest.harvest_service import HarvestService
from ...utils.responses import SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities/{facility_id}/rooms/{room_id}/harvests
# ---------------------------------------------------------------------------

@router.post(
    "/facilities/{facility_id}/rooms/{room_id}/harvests",
    response_model=SuccessResponse[Harvest],
    status_code=status.HTTP_201_CREATED,
    summary="Record a harvest",
    description=(
        "Record a new harvest event for a growing room. "
        "flushNumber is auto-filled from the room's current flush when omitted. "
        "Biological efficiency is calculated automatically when substrate weight is set."
    ),
)
async def create_harvest(
    facility_id: str,
    room_id: str,
    harvest_data: HarvestCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[Harvest]:
    """
    Record a new harvest for a growing room.

    - Flush number is auto-filled from room's current flush state.
    - BE% is calculated when substrateWeight is set on the room.
    - Room's totalYieldKg is incremented automatically.
    """
    harvest = await HarvestService.create_harvest(
        facility_id=facility_id,
        room_id=room_id,
        data=harvest_data,
        current_user=current_user,
    )
    return SuccessResponse(data=harvest, message="Harvest recorded successfully")


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms/{room_id}/harvests
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms/{room_id}/harvests",
    response_model=SuccessResponse[List[Harvest]],
    summary="List harvests for a room",
    description="Return all harvest records for a specific growing room, newest first.",
)
async def list_harvests_for_room(
    facility_id: str,
    room_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[List[Harvest]]:
    """
    Return all harvest records for a room, ordered by harvestedAt descending.
    """
    harvests = await HarvestService.list_harvests_for_room(
        facility_id=facility_id,
        room_id=room_id,
    )
    return SuccessResponse(data=harvests)


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/harvests
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/harvests",
    response_model=SuccessResponse[List[Harvest]],
    summary="List all harvests for a facility",
    description="Return harvest records across all rooms in a facility, newest first.",
)
async def list_harvests_for_facility(
    facility_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[List[Harvest]]:
    """
    Return all harvest records for a facility, ordered by harvestedAt descending.
    """
    harvests = await HarvestService.list_harvests_for_facility(facility_id=facility_id)
    return SuccessResponse(data=harvests)
