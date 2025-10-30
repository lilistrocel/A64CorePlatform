"""
Alert Model

Issues reported by farmers with severity levels and escalation tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


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


class AlertCreate(BaseModel):
    """Schema for creating a new alert"""
    blockId: UUID = Field(..., description="Block with issue")
    title: str = Field(..., min_length=1, max_length=200, description="Alert title")
    description: str = Field(..., description="Detailed description of issue")
    severity: AlertSeverity = Field(..., description="Alert severity level")


class AlertResolve(BaseModel):
    """Schema for resolving an alert"""
    resolutionNotes: str = Field(..., description="Resolution notes")


class Alert(BaseModel):
    """Complete alert model with all fields"""
    alertId: UUID = Field(default_factory=uuid4, description="Unique alert identifier")
    cycleId: Optional[UUID] = Field(None, description="Reference to block cycle (if during cycle)")
    blockId: UUID = Field(..., description="Block with issue")
    farmId: UUID = Field(..., description="Farm ID")

    # Alert details
    title: str = Field(..., min_length=1, max_length=200, description="Alert title")
    description: str = Field(..., description="Detailed description of issue")
    severity: AlertSeverity = Field(..., description="Alert severity level")
    status: AlertStatus = Field(AlertStatus.OPEN, description="Alert status")

    # Alert tracking
    triggeredBy: UUID = Field(..., description="User ID who triggered alert")
    triggeredByEmail: str = Field(..., description="Email of trigger user")
    triggeredAt: datetime = Field(default_factory=datetime.utcnow, description="When alert was triggered")

    # Assignment and resolution
    assignedTo: Optional[UUID] = Field(None, description="User assigned to resolve")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")

    resolvedBy: Optional[UUID] = Field(None, description="User who resolved alert")
    resolvedByEmail: Optional[str] = Field(None, description="Email of resolver")
    resolvedAt: Optional[datetime] = Field(None, description="When alert was resolved")
    resolutionNotes: Optional[str] = Field(None, description="Resolution notes")

    # Notification tracking
    notificationsSent: List[str] = Field(default_factory=list, description="Channels used (email, in-app)")
    escalated: bool = Field(False, description="Has alert been escalated")
    escalatedAt: Optional[datetime] = Field(None, description="When escalated")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "alertId": "al1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "title": "Aphid infestation detected",
                "description": "Significant aphid presence on tomato plants in north section",
                "severity": "high",
                "status": "open",
                "triggeredBy": "farmer-uuid",
                "triggeredByEmail": "farmer@example.com",
                "triggeredAt": "2025-02-10T10:30:00Z",
                "assignedTo": "manager-uuid",
                "assignedToEmail": "manager@example.com",
                "notificationsSent": ["in-app", "email"],
                "escalated": False,
                "createdAt": "2025-02-10T10:30:00Z",
                "updatedAt": "2025-02-10T10:30:00Z"
            }
        }
