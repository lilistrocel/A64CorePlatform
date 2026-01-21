"""
Marketing Channel Model

Represents a marketing channel in the Marketing system.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class ChannelType(str, Enum):
    """Marketing channel type enumeration"""
    SOCIAL_MEDIA = "social_media"
    EMAIL = "email"
    PRINT = "print"
    DIGITAL = "digital"
    EVENT = "event"
    OTHER = "other"


class ChannelBase(BaseModel):
    """Base channel fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Channel name")
    type: ChannelType = Field(..., description="Channel type")
    platform: Optional[str] = Field(None, max_length=100, description="Platform name (e.g., facebook, instagram)")
    costPerImpression: float = Field(0, ge=0, description="Cost per impression (CPM)")
    isActive: bool = Field(True, description="Whether channel is active")


class ChannelCreate(ChannelBase):
    """Schema for creating a new channel"""
    pass


class ChannelUpdate(BaseModel):
    """Schema for updating a channel"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[ChannelType] = None
    platform: Optional[str] = Field(None, max_length=100)
    costPerImpression: Optional[float] = Field(None, ge=0)
    isActive: Optional[bool] = None


class Channel(ChannelBase):
    """Complete channel model with all fields"""
    channelId: UUID = Field(default_factory=uuid4, description="Unique channel identifier")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this channel")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "channelId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Facebook Ads",
                "type": "social_media",
                "platform": "facebook",
                "costPerImpression": 0.015,
                "isActive": True,
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
