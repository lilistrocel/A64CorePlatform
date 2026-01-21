"""
Marketing Event Service

Business logic layer for Marketing Event operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.event import Event, EventCreate, EventUpdate, EventStatus, EventType
from .event_repository import EventRepository
from .campaign_repository import CampaignRepository

logger = logging.getLogger(__name__)


class EventService:
    """Service for Event business logic"""

    def __init__(self):
        self.repository = EventRepository()
        self.campaign_repository = CampaignRepository()

    async def _validate_campaign_exists(self, campaign_id: UUID) -> None:
        """
        Validate that campaign exists

        Args:
            campaign_id: Campaign ID to validate

        Raises:
            HTTPException: If campaign not found
        """
        if not await self.campaign_repository.exists(campaign_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Campaign {campaign_id} not found"
            )

    async def create_event(
        self,
        event_data: EventCreate,
        created_by: UUID
    ) -> Event:
        """
        Create a new event

        Args:
            event_data: Event creation data
            created_by: ID of the user creating the event

        Returns:
            Created event

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Validate campaign exists if provided
            if event_data.campaignId:
                await self._validate_campaign_exists(event_data.campaignId)

            # Business logic validation
            if event_data.actualCost > event_data.budget:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Actual cost cannot exceed event budget"
                )

            event = await self.repository.create(event_data, created_by)
            logger.info(f"Event created: {event.eventId} by user {created_by}")
            return event

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating event: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create event"
            )

    async def get_event(self, event_id: UUID) -> Event:
        """
        Get event by ID

        Args:
            event_id: Event ID

        Returns:
            Event

        Raises:
            HTTPException: If event not found
        """
        event = await self.repository.get_by_id(event_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event {event_id} not found"
            )
        return event

    async def get_all_events(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[EventStatus] = None,
        event_type: Optional[EventType] = None,
        campaign_id: Optional[UUID] = None
    ) -> tuple[List[Event], int, int]:
        """
        Get all events with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by event status (optional)
            event_type: Filter by event type (optional)
            campaign_id: Filter by campaign ID (optional)

        Returns:
            Tuple of (events, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        events, total = await self.repository.get_all(skip, per_page, status, event_type, campaign_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return events, total, total_pages

    async def update_event(
        self,
        event_id: UUID,
        update_data: EventUpdate
    ) -> Event:
        """
        Update an event

        Args:
            event_id: Event ID
            update_data: Fields to update

        Returns:
            Updated event

        Raises:
            HTTPException: If event not found or validation fails
        """
        # Check event exists
        current_event = await self.get_event(event_id)

        # Validate campaign if updating
        if update_data.campaignId:
            await self._validate_campaign_exists(update_data.campaignId)

        # Validate costs if updating
        if update_data.actualCost is not None or update_data.budget is not None:
            budget = update_data.budget if update_data.budget is not None else current_event.budget
            actual_cost = update_data.actualCost if update_data.actualCost is not None else current_event.actualCost

            if actual_cost > budget:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Actual cost cannot exceed event budget"
                )

        updated_event = await self.repository.update(event_id, update_data)
        if not updated_event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event {event_id} not found"
            )

        logger.info(f"Event updated: {event_id}")
        return updated_event

    async def delete_event(self, event_id: UUID) -> dict:
        """
        Delete an event

        Args:
            event_id: Event ID

        Returns:
            Success message

        Raises:
            HTTPException: If event not found
        """
        # Check event exists
        await self.get_event(event_id)

        success = await self.repository.delete(event_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event {event_id} not found"
            )

        logger.info(f"Event deleted: {event_id}")
        return {"message": "Event deleted successfully"}
