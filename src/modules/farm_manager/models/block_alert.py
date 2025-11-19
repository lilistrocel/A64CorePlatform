"""
Block Alert Model

Issue reporting system for farmers to alert managers about block problems.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class AlertSeverity(str, Enum):
    """Alert severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    """Alert status"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class AlertCategory(str, Enum):
    """Alert category"""
    PEST = "pest"
    DISEASE = "disease"
    IRRIGATION = "irrigation"
    EQUIPMENT = "equipment"
    GROWTH_ISSUE = "growth_issue"
    HARVEST_ISSUE = "harvest_issue"
    OTHER = "other"


class BlockAlertCreate(BaseModel):
    """Schema for creating a block alert"""
    farmId: UUID = Field(..., description="Farm ID")
    blockId: UUID = Field(..., description="Block ID")
    category: AlertCategory = Field(..., description="Alert category")
    severity: AlertSeverity = Field(AlertSeverity.MEDIUM, description="Alert severity")
    title: str = Field(..., description="Brief alert title", min_length=3, max_length=100)
    description: str = Field(..., description="Detailed description", min_length=10)
    photoUrls: Optional[List[str]] = Field(None, description="Optional photos of the issue")


class AlertComment(BaseModel):
    """Comment/update on an alert"""
    commentId: UUID = Field(default_factory=uuid4, description="Unique comment ID")
    userId: UUID = Field(..., description="User who commented")
    userEmail: str = Field(..., description="Email of commenter")
    message: str = Field(..., description="Comment message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When comment was added")

    class Config:
        json_schema_extra = {
            "example": {
                "commentId": "c1234567-89ab-cdef-0123-456789abcdef",
                "userId": "u1234567-89ab-cdef-0123-456789abcdef",
                "userEmail": "manager@example.com",
                "message": "Inspected the block, will apply treatment tomorrow morning",
                "timestamp": "2025-01-15T14:30:00Z"
            }
        }


class BlockAlert(BlockAlertCreate):
    """Complete block alert model with all fields"""
    alertId: UUID = Field(default_factory=uuid4, description="Unique alert identifier")

    # Status tracking
    status: AlertStatus = Field(AlertStatus.OPEN, description="Alert status")

    # Reporter info
    reportedBy: UUID = Field(..., description="User who reported the alert")
    reportedByEmail: str = Field(..., description="Email of reporter")

    # Resolution tracking
    assignedTo: Optional[UUID] = Field(None, description="User assigned to resolve")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")
    resolvedBy: Optional[UUID] = Field(None, description="User who resolved alert")
    resolvedByEmail: Optional[str] = Field(None, description="Email of resolver")
    resolvedAt: Optional[datetime] = Field(None, description="When alert was resolved")
    resolution: Optional[str] = Field(None, description="Resolution description")

    # Comments/updates
    comments: List[AlertComment] = Field(
        default_factory=list,
        description="Comments and updates"
    )

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "alertId": "a1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "category": "pest",
                "severity": "high",
                "status": "in_progress",
                "title": "Aphid infestation on lettuce",
                "description": "Heavy aphid presence detected on north side of block. Affecting approximately 30% of plants.",
                "photoUrls": ["https://storage.example.com/alert-photo-1.jpg"],
                "reportedBy": "u1234567-89ab-cdef-0123-456789abcdef",
                "reportedByEmail": "farmer@example.com",
                "assignedTo": "m1234567-89ab-cdef-0123-456789abcdef",
                "assignedToEmail": "manager@example.com",
                "resolvedBy": None,
                "resolvedByEmail": None,
                "resolvedAt": None,
                "resolution": None,
                "comments": [
                    {
                        "commentId": "c1234567-89ab-cdef-0123-456789abcdef",
                        "userId": "m1234567-89ab-cdef-0123-456789abcdef",
                        "userEmail": "manager@example.com",
                        "message": "Inspecting now, will apply treatment",
                        "timestamp": "2025-01-15T14:30:00Z"
                    }
                ],
                "createdAt": "2025-01-15T09:00:00Z",
                "updatedAt": "2025-01-15T14:30:00Z"
            }
        }


class AlertCommentCreate(BaseModel):
    """Schema for adding a comment to an alert"""
    message: str = Field(..., description="Comment message", min_length=1)


class AlertUpdate(BaseModel):
    """Schema for updating an alert"""
    status: Optional[AlertStatus] = Field(None, description="New status")
    severity: Optional[AlertSeverity] = Field(None, description="Updated severity")
    assignedTo: Optional[UUID] = Field(None, description="Assign to user")
    resolution: Optional[str] = Field(None, description="Resolution description (when closing)")


class AlertResolve(BaseModel):
    """Schema for resolving an alert"""
    resolution: str = Field(..., description="How the issue was resolved", min_length=10)


class BlockAlertListResponse(BaseModel):
    """Response for listing alerts"""
    alerts: List[BlockAlert]
    total: int
    page: int
    perPage: int
