"""
Marketing Module - Event API Routes

Endpoints for marketing event CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.event import Event, EventCreate, EventUpdate, EventStatus, EventType
from ...services.marketing import EventService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Event],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new marketing event",
    description="Create a new marketing event. Requires marketing.create permission."
)
async def create_event(
    event_data: EventCreate,
    current_user: CurrentUser = Depends(require_permission("marketing.create")),
    service: EventService = Depends()
):
    """
    Create a new marketing event

    - **name**: Event name (required)
    - **description**: Event description (optional)
    - **type**: Event type (required: trade_show, webinar, workshop, conference, farm_visit)
    - **campaignId**: Associated campaign ID (optional)
    - **date**: Event date and time (required)
    - **location**: Event location (optional)
    - **budget**: Event budget (required)
    - **actualCost**: Actual cost incurred (default: 0)
    - **expectedAttendees**: Expected number of attendees (default: 0)
    - **actualAttendees**: Actual number of attendees (default: 0)
    - **status**: Event status (default: planned)
    - **notes**: Additional notes (optional)
    """
    event = await service.create_event(
        event_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=event,
        message="Event created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Event],
    summary="Get all marketing events",
    description="Get all marketing events with pagination and filters. Requires marketing.view permission."
)
async def get_events(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[EventStatus] = Query(None, description="Filter by event status"),
    type: Optional[EventType] = Query(None, description="Filter by event type"),
    campaignId: Optional[UUID] = Query(None, description="Filter by campaign ID"),
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: EventService = Depends()
):
    """
    Get all marketing events with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by event status (optional)
    - **type**: Filter by event type (optional)
    - **campaignId**: Filter by campaign ID (optional)
    """
    events, total, total_pages = await service.get_all_events(
        page, perPage, status, type, campaignId
    )

    return PaginatedResponse(
        data=events,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{event_id}",
    response_model=SuccessResponse[Event],
    summary="Get event by ID",
    description="Get a specific event by ID. Requires marketing.view permission."
)
async def get_event(
    event_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: EventService = Depends()
):
    """
    Get event by ID

    - **event_id**: Event UUID
    """
    event = await service.get_event(event_id)

    return SuccessResponse(data=event)


@router.patch(
    "/{event_id}",
    response_model=SuccessResponse[Event],
    summary="Update event",
    description="Update an event. Requires marketing.edit permission."
)
async def update_event(
    event_id: UUID,
    update_data: EventUpdate,
    current_user: CurrentUser = Depends(require_permission("marketing.edit")),
    service: EventService = Depends()
):
    """
    Update an event

    - **event_id**: Event UUID
    - All fields are optional (partial update)
    """
    event = await service.update_event(
        event_id,
        update_data
    )

    return SuccessResponse(
        data=event,
        message="Event updated successfully"
    )


@router.delete(
    "/{event_id}",
    response_model=SuccessResponse[dict],
    summary="Delete event",
    description="Delete an event. Requires marketing.delete permission."
)
async def delete_event(
    event_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.delete")),
    service: EventService = Depends()
):
    """
    Delete an event

    - **event_id**: Event UUID
    """
    result = await service.delete_event(event_id)

    return SuccessResponse(
        data=result,
        message="Event deleted successfully"
    )
