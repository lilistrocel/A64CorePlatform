"""
Mushroom Management Module - Growing Room API Routes

CRUD and lifecycle endpoints for growing rooms within a facility.
Includes phase-transition endpoint for the 12-state lifecycle.
"""

import logging
from fastapi import APIRouter, Depends, Query, status

from ...models.growing_room import GrowingRoom, GrowingRoomCreate, GrowingRoomUpdate, PhaseTransitionRequest
from ...services.room.room_service import RoomService
from ...utils.responses import PaginatedResponse, PaginationMeta, SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities/{facility_id}/rooms
# ---------------------------------------------------------------------------

@router.post(
    "/facilities/{facility_id}/rooms",
    response_model=SuccessResponse[GrowingRoom],
    status_code=status.HTTP_201_CREATED,
    summary="Create a growing room",
    description="Create a new growing room inside a facility.",
)
async def create_room(
    facility_id: str,
    room_data: GrowingRoomCreate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[GrowingRoom]:
    """
    Create a new growing room inside the given facility.

    The room starts in the EMPTY phase.
    """
    room = await RoomService.create_room(facility_id, room_data, current_user)
    return SuccessResponse(data=room, message="Growing room created successfully")


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms",
    response_model=PaginatedResponse[GrowingRoom],
    summary="List growing rooms",
    description="Return all growing rooms within a facility, paginated.",
)
async def list_rooms(
    facility_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> PaginatedResponse[GrowingRoom]:
    """
    Return all rooms within a facility with pagination.

    Results are sorted by roomCode ascending.
    """
    skip = (page - 1) * perPage
    rooms, total = await RoomService.list_rooms(
        facility_id=facility_id,
        skip=skip,
        limit=perPage,
    )
    total_pages = max(1, (total + perPage - 1) // perPage)

    return PaginatedResponse(
        data=rooms,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms/{room_id}
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms/{room_id}",
    response_model=SuccessResponse[GrowingRoom],
    summary="Get a growing room",
    description="Retrieve a specific growing room by ID, scoped to a facility.",
)
async def get_room(
    facility_id: str,
    room_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[GrowingRoom]:
    """
    Get a growing room by its roomId, scoped to the given facility.
    """
    room = await RoomService.get_room(facility_id, room_id)
    return SuccessResponse(data=room)


# ---------------------------------------------------------------------------
# PATCH /facilities/{facility_id}/rooms/{room_id}
# ---------------------------------------------------------------------------

@router.patch(
    "/facilities/{facility_id}/rooms/{room_id}",
    response_model=SuccessResponse[GrowingRoom],
    summary="Update a growing room",
    description="Partially update a growing room's attributes (not phase).",
)
async def update_room(
    facility_id: str,
    room_id: str,
    update_data: GrowingRoomUpdate,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[GrowingRoom]:
    """
    Partially update a growing room document.

    To change the room's lifecycle phase use the dedicated /phase endpoint.
    """
    room = await RoomService.update_room(facility_id, room_id, update_data)
    return SuccessResponse(data=room, message="Growing room updated successfully")


# ---------------------------------------------------------------------------
# PATCH /facilities/{facility_id}/rooms/{room_id}/phase
# ---------------------------------------------------------------------------

@router.patch(
    "/facilities/{facility_id}/rooms/{room_id}/phase",
    response_model=SuccessResponse[GrowingRoom],
    summary="Advance growing room lifecycle phase",
    description=(
        "Transition a growing room to the next lifecycle phase. "
        "Only valid transitions (per VALID_TRANSITIONS) are accepted. "
        "Flush counters are auto-incremented when cycling back into fruiting_initiation."
    ),
)
async def advance_phase(
    facility_id: str,
    room_id: str,
    transition: PhaseTransitionRequest,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[GrowingRoom]:
    """
    Advance the room's lifecycle phase.

    Validates the transition against VALID_TRANSITIONS and appends a
    PhaseHistoryEntry. Flush counters are auto-incremented when transitioning
    from resting back to fruiting_initiation.
    """
    room = await RoomService.advance_phase(
        facility_id=facility_id,
        room_id=room_id,
        target_phase=transition.targetPhase,
        notes=transition.notes,
        current_user=current_user,
    )
    return SuccessResponse(
        data=room,
        message=f"Room transitioned to phase '{transition.targetPhase}' successfully",
    )
