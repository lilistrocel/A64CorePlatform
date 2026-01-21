"""
Marketing Channel Repository

Data access layer for Marketing Channel operations.
Handles all database interactions for channels.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.channel import Channel, ChannelCreate, ChannelUpdate, ChannelType
from ..database import marketing_db

logger = logging.getLogger(__name__)


class ChannelRepository:
    """Repository for Channel data access"""

    def __init__(self):
        self.collection_name = "marketing_channels"

    def _get_collection(self):
        """Get channels collection"""
        return marketing_db.get_collection(self.collection_name)

    async def create(self, channel_data: ChannelCreate, created_by: UUID) -> Channel:
        """
        Create a new channel

        Args:
            channel_data: Channel creation data
            created_by: ID of the user creating the channel

        Returns:
            Created channel
        """
        collection = self._get_collection()

        channel_dict = channel_data.model_dump()
        channel = Channel(
            **channel_dict,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        channel_doc = channel.model_dump(by_alias=True)
        channel_doc["channelId"] = str(channel_doc["channelId"])
        channel_doc["createdBy"] = str(channel_doc["createdBy"])

        await collection.insert_one(channel_doc)

        logger.info(f"Created channel: {channel.channelId}")
        return channel

    async def get_by_id(self, channel_id: UUID) -> Optional[Channel]:
        """
        Get channel by ID

        Args:
            channel_id: Channel ID

        Returns:
            Channel if found, None otherwise
        """
        collection = self._get_collection()
        channel_doc = await collection.find_one({"channelId": str(channel_id)})

        if channel_doc:
            channel_doc.pop("_id", None)
            return Channel(**channel_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        channel_type: Optional[ChannelType] = None,
        is_active: Optional[bool] = None
    ) -> tuple[List[Channel], int]:
        """
        Get all channels with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            channel_type: Filter by channel type (optional)
            is_active: Filter by active status (optional)

        Returns:
            Tuple of (list of channels, total count)
        """
        collection = self._get_collection()
        query = {}

        if channel_type:
            query["type"] = channel_type.value
        if is_active is not None:
            query["isActive"] = is_active

        # Get total count
        total = await collection.count_documents(query)

        # Get channels
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        channels = []

        async for channel_doc in cursor:
            channel_doc.pop("_id", None)
            channels.append(Channel(**channel_doc))

        return channels, total

    async def update(self, channel_id: UUID, update_data: ChannelUpdate) -> Optional[Channel]:
        """
        Update a channel

        Args:
            channel_id: Channel ID
            update_data: Fields to update

        Returns:
            Updated channel if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(channel_id)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"channelId": str(channel_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated channel: {channel_id}")
            return await self.get_by_id(channel_id)

        return None

    async def delete(self, channel_id: UUID) -> bool:
        """
        Delete a channel (hard delete)

        Args:
            channel_id: Channel ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"channelId": str(channel_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted channel: {channel_id}")
            return True

        return False

    async def exists(self, channel_id: UUID) -> bool:
        """
        Check if channel exists

        Args:
            channel_id: Channel ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"channelId": str(channel_id)})
        return count > 0
