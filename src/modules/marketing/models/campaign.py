"""
Marketing Campaign Model

Represents a marketing campaign in the Marketing system.
"""

from datetime import datetime, date
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class CampaignStatus(str, Enum):
    """Campaign status enumeration"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class CampaignMetrics(BaseModel):
    """Campaign performance metrics"""
    impressions: int = Field(0, ge=0, description="Number of impressions")
    clicks: int = Field(0, ge=0, description="Number of clicks")
    conversions: int = Field(0, ge=0, description="Number of conversions")
    roi: float = Field(0, description="Return on investment (percentage)")


class CampaignBase(BaseModel):
    """Base campaign fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Campaign name")
    description: Optional[str] = Field(None, max_length=1000, description="Campaign description")
    budgetId: Optional[UUID] = Field(None, description="Associated budget ID")
    channelIds: List[UUID] = Field(default_factory=list, description="List of marketing channel IDs")
    startDate: date = Field(..., description="Campaign start date")
    endDate: date = Field(..., description="Campaign end date")
    targetAudience: Optional[str] = Field(None, max_length=500, description="Target audience description")
    goals: List[str] = Field(default_factory=list, description="Campaign goals")
    status: CampaignStatus = Field(CampaignStatus.DRAFT, description="Campaign status")
    budget: float = Field(..., ge=0, description="Campaign budget amount")
    spent: float = Field(0, ge=0, description="Amount spent on campaign")
    metrics: CampaignMetrics = Field(default_factory=CampaignMetrics, description="Campaign metrics")


class CampaignCreate(CampaignBase):
    """Schema for creating a new campaign"""
    pass


class CampaignUpdate(BaseModel):
    """Schema for updating a campaign"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    budgetId: Optional[UUID] = None
    channelIds: Optional[List[UUID]] = None
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    targetAudience: Optional[str] = Field(None, max_length=500)
    goals: Optional[List[str]] = None
    status: Optional[CampaignStatus] = None
    budget: Optional[float] = Field(None, ge=0)
    spent: Optional[float] = Field(None, ge=0)
    metrics: Optional[CampaignMetrics] = None


class Campaign(CampaignBase):
    """Complete campaign model with all fields"""
    campaignId: UUID = Field(default_factory=uuid4, description="Unique campaign identifier")
    campaignCode: Optional[str] = Field(None, description="Human-readable campaign code (e.g., MC001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this campaign")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "campaignId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "campaignCode": "MC001",
                "name": "Spring Harvest Promotion",
                "description": "Promote fresh spring harvest products",
                "budgetId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "channelIds": ["b2c3d4e5-f6a7-8901-bcde-f12345678901"],
                "startDate": "2025-03-01",
                "endDate": "2025-05-31",
                "targetAudience": "Urban customers aged 25-45",
                "goals": ["Increase brand awareness", "Drive online sales"],
                "status": "active",
                "budget": 25000.00,
                "spent": 10000.00,
                "metrics": {
                    "impressions": 50000,
                    "clicks": 2500,
                    "conversions": 150,
                    "roi": 15.5
                },
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
