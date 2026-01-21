"""
Marketing Event Repository

Data access layer for Marketing Event operations.
Handles all database interactions for events.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.event import Event, EventCreate, EventUpdate, EventStatus, EventType
from ..database import marketing_db

logger = logging.getLogger(__name__)


class EventRepository:
    """Repository for Event data access"""

    def __init__(self):
        self.collection_name = "marketing_events"

    def _get_collection(self):
        """Get events collection"""
        return marketing_db.get_collection(self.collection_name)

    async def _get_next_event_sequence(self) -> int:
        """
        Get next event sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for event codes.

        Returns:
            Next sequence number for event code
        """
        db = marketing_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "marketing_event_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, event_data: EventCreate, created_by: UUID) -> Event:
        """
        Create a new event with auto-generated eventCode

        Args:
            event_data: Event creation data
            created_by: ID of the user creating the event

        Returns:
            Created event
        """
        collection = self._get_collection()

        # Generate event code (e.g., "EV001", "EV002")
        sequence = await self._get_next_event_sequence()
        event_code = f"EV{sequence:03d}"

        event_dict = event_data.model_dump()
        event = Event(
            **event_dict,
            eventCode=event_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        event_doc = event.model_dump(by_alias=True)
        event_doc["eventId"] = str(event_doc["eventId"])
        event_doc["createdBy"] = str(event_doc["createdBy"])

        # Convert campaignId to string if present
        if event_doc.get("campaignId"):
            event_doc["campaignId"] = str(event_doc["campaignId"])

        await collection.insert_one(event_doc)

        logger.info(f"Created event: {event.eventId} with code {event_code}")
        return event

    async def get_by_id(self, event_id: UUID) -> Optional[Event]:
        """
        Get event by ID

        Args:
            event_id: Event ID

        Returns:
            Event if found, None otherwise
        """
        collection = self._get_collection()
        event_doc = await collection.find_one({"eventId": str(event_id)})

        if event_doc:
            event_doc.pop("_id", None)
            return Event(**event_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[EventStatus] = None,
        event_type: Optional[EventType] = None,
        campaign_id: Optional[UUID] = None
    ) -> tuple[List[Event], int]:
        """
        Get all events with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by event status (optional)
            event_type: Filter by event type (optional)
            campaign_id: Filter by campaign ID (optional)

        Returns:
            Tuple of (list of events, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if event_type:
            query["type"] = event_type.value
        if campaign_id:
            query["campaignId"] = str(campaign_id)

        # Get total count
        total = await collection.count_documents(query)

        # Get events
        cursor = collection.find(query).sort("date", -1).skip(skip).limit(limit)
        events = []

        async for event_doc in cursor:
            event_doc.pop("_id", None)
            events.append(Event(**event_doc))

        return events, total

    async def update(self, event_id: UUID, update_data: EventUpdate) -> Optional[Event]:
        """
        Update an event

        Args:
            event_id: Event ID
            update_data: Fields to update

        Returns:
            Updated event if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(event_id)

        # Convert campaignId to string if present
        if "campaignId" in update_dict and update_dict["campaignId"]:
            update_dict["campaignId"] = str(update_dict["campaignId"])

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"eventId": str(event_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated event: {event_id}")
            return await self.get_by_id(event_id)

        return None

    async def delete(self, event_id: UUID) -> bool:
        """
        Delete an event (hard delete)

        Args:
            event_id: Event ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"eventId": str(event_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted event: {event_id}")
            return True

        return False

    async def exists(self, event_id: UUID) -> bool:
        """
        Check if event exists

        Args:
            event_id: Event ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"eventId": str(event_id)})
        return count > 0
