"""
Marketing Module - Channel API Routes

Endpoints for marketing channel CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.channel import Channel, ChannelCreate, ChannelUpdate, ChannelType
from ...services.marketing import ChannelService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Channel],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new marketing channel",
    description="Create a new marketing channel. Requires marketing.create permission."
)
async def create_channel(
    channel_data: ChannelCreate,
    current_user: CurrentUser = Depends(require_permission("marketing.create")),
    service: ChannelService = Depends()
):
    """
    Create a new marketing channel

    - **name**: Channel name (required)
    - **type**: Channel type (required: social_media, email, print, digital, event, other)
    - **platform**: Platform name (optional, e.g., facebook, instagram)
    - **costPerImpression**: Cost per impression/CPM (default: 0)
    - **isActive**: Whether channel is active (default: true)
    """
    channel = await service.create_channel(
        channel_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=channel,
        message="Channel created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Channel],
    summary="Get all marketing channels",
    description="Get all marketing channels with pagination and filters. Requires marketing.view permission."
)
async def get_channels(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    type: Optional[ChannelType] = Query(None, description="Filter by channel type"),
    isActive: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: ChannelService = Depends()
):
    """
    Get all marketing channels with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **type**: Filter by channel type (optional)
    - **isActive**: Filter by active status (optional)
    """
    channels, total, total_pages = await service.get_all_channels(
        page, perPage, type, isActive
    )

    return PaginatedResponse(
        data=channels,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{channel_id}",
    response_model=SuccessResponse[Channel],
    summary="Get channel by ID",
    description="Get a specific channel by ID. Requires marketing.view permission."
)
async def get_channel(
    channel_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: ChannelService = Depends()
):
    """
    Get channel by ID

    - **channel_id**: Channel UUID
    """
    channel = await service.get_channel(channel_id)

    return SuccessResponse(data=channel)


@router.patch(
    "/{channel_id}",
    response_model=SuccessResponse[Channel],
    summary="Update channel",
    description="Update a channel. Requires marketing.edit permission."
)
async def update_channel(
    channel_id: UUID,
    update_data: ChannelUpdate,
    current_user: CurrentUser = Depends(require_permission("marketing.edit")),
    service: ChannelService = Depends()
):
    """
    Update a channel

    - **channel_id**: Channel UUID
    - All fields are optional (partial update)
    """
    channel = await service.update_channel(
        channel_id,
        update_data
    )

    return SuccessResponse(
        data=channel,
        message="Channel updated successfully"
    )


@router.delete(
    "/{channel_id}",
    response_model=SuccessResponse[dict],
    summary="Delete channel",
    description="Delete a channel. Requires marketing.delete permission."
)
async def delete_channel(
    channel_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.delete")),
    service: ChannelService = Depends()
):
    """
    Delete a channel

    - **channel_id**: Channel UUID
    """
    result = await service.delete_channel(channel_id)

    return SuccessResponse(
        data=result,
        message="Channel deleted successfully"
    )
