"""
Marketing Channel Service

Business logic layer for Marketing Channel operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.channel import Channel, ChannelCreate, ChannelUpdate, ChannelType
from .channel_repository import ChannelRepository

logger = logging.getLogger(__name__)


class ChannelService:
    """Service for Channel business logic"""

    def __init__(self):
        self.repository = ChannelRepository()

    async def create_channel(
        self,
        channel_data: ChannelCreate,
        created_by: UUID
    ) -> Channel:
        """
        Create a new channel

        Args:
            channel_data: Channel creation data
            created_by: ID of the user creating the channel

        Returns:
            Created channel

        Raises:
            HTTPException: If validation fails
        """
        try:
            channel = await self.repository.create(channel_data, created_by)
            logger.info(f"Channel created: {channel.channelId} by user {created_by}")
            return channel

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating channel: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create channel"
            )

    async def get_channel(self, channel_id: UUID) -> Channel:
        """
        Get channel by ID

        Args:
            channel_id: Channel ID

        Returns:
            Channel

        Raises:
            HTTPException: If channel not found
        """
        channel = await self.repository.get_by_id(channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel {channel_id} not found"
            )
        return channel

    async def get_all_channels(
        self,
        page: int = 1,
        per_page: int = 20,
        channel_type: Optional[ChannelType] = None,
        is_active: Optional[bool] = None
    ) -> tuple[List[Channel], int, int]:
        """
        Get all channels with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            channel_type: Filter by channel type (optional)
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (channels, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        channels, total = await self.repository.get_all(skip, per_page, channel_type, is_active)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return channels, total, total_pages

    async def update_channel(
        self,
        channel_id: UUID,
        update_data: ChannelUpdate
    ) -> Channel:
        """
        Update a channel

        Args:
            channel_id: Channel ID
            update_data: Fields to update

        Returns:
            Updated channel

        Raises:
            HTTPException: If channel not found or validation fails
        """
        # Check channel exists
        await self.get_channel(channel_id)

        updated_channel = await self.repository.update(channel_id, update_data)
        if not updated_channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel {channel_id} not found"
            )

        logger.info(f"Channel updated: {channel_id}")
        return updated_channel

    async def delete_channel(self, channel_id: UUID) -> dict:
        """
        Delete a channel

        Args:
            channel_id: Channel ID

        Returns:
            Success message

        Raises:
            HTTPException: If channel not found
        """
        # Check channel exists
        await self.get_channel(channel_id)

        success = await self.repository.delete(channel_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Channel {channel_id} not found"
            )

        logger.info(f"Channel deleted: {channel_id}")
        return {"message": "Channel deleted successfully"}
