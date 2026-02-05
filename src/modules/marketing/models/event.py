"""
Marketing Event Model

Represents a marketing event in the Marketing system.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class EventType(str, Enum):
    """Marketing event type enumeration"""
    TRADE_SHOW = "trade_show"
    WEBINAR = "webinar"
    WORKSHOP = "workshop"
    CONFERENCE = "conference"
    FARM_VISIT = "farm_visit"


class EventStatus(str, Enum):
    """Event status enumeration"""
    PLANNED = "planned"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EventBase(BaseModel):
    """Base event fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Event name")
    description: Optional[str] = Field(None, max_length=1000, description="Event description")
    type: EventType = Field(..., description="Event type")
    campaignId: Optional[UUID] = Field(None, description="Associated campaign ID")
    date: Optional[datetime] = Field(None, description="Event date and time")
    location: Optional[str] = Field(None, max_length=500, description="Event location")
    budget: float = Field(0, ge=0, description="Event budget")
    actualCost: float = Field(0, ge=0, description="Actual cost incurred")
    expectedAttendees: int = Field(0, ge=0, description="Expected number of attendees")
    actualAttendees: int = Field(0, ge=0, description="Actual number of attendees")
    status: EventStatus = Field(EventStatus.PLANNED, description="Event status")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class EventCreate(EventBase):
    """Schema for creating a new event"""
    pass


class EventUpdate(BaseModel):
    """Schema for updating an event"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    type: Optional[EventType] = None
    campaignId: Optional[UUID] = None
    date: Optional[datetime] = None
    location: Optional[str] = Field(None, max_length=500)
    budget: Optional[float] = Field(None, ge=0)
    actualCost: Optional[float] = Field(None, ge=0)
    expectedAttendees: Optional[int] = Field(None, ge=0)
    actualAttendees: Optional[int] = Field(None, ge=0)
    status: Optional[EventStatus] = None
    notes: Optional[str] = Field(None, max_length=1000)


class Event(EventBase):
    """Complete event model with all fields"""
    eventId: UUID = Field(default_factory=uuid4, description="Unique event identifier")
    eventCode: Optional[str] = Field(None, description="Human-readable event code (e.g., EV001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this event")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "eventId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "eventCode": "EV001",
                "name": "Organic Farming Workshop",
                "description": "Workshop on organic farming techniques",
                "type": "workshop",
                "campaignId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "date": "2025-03-15T14:00:00Z",
                "location": "Main Farm Location",
                "budget": 5000.00,
                "actualCost": 4500.00,
                "expectedAttendees": 50,
                "actualAttendees": 45,
                "status": "completed",
                "notes": "Very successful event with positive feedback",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
