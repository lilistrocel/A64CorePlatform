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
    ACTIVE = "active"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class AlertType(str, Enum):
    """Alert source type"""
    MANUAL = "manual"
    SENSOR = "sensor"
    SYSTEM = "system"


class AlertCreate(BaseModel):
    """Schema for creating a new alert"""
    blockId: UUID = Field(..., description="Block with issue")
    alertType: AlertType = Field(AlertType.MANUAL, description="Alert source type")
    title: str = Field(..., min_length=1, max_length=200, description="Alert title")
    description: str = Field(..., description="Detailed description of issue")
    severity: AlertSeverity = Field(..., description="Alert severity level")
    source: Optional[str] = Field(None, description="Where alert came from (e.g., task_manager, sensor_id)")


class AlertResolve(BaseModel):
    """Schema for resolving an alert"""
    resolutionNotes: str = Field(..., description="Resolution notes")


class Alert(BaseModel):
    """Complete alert model with all fields"""
    alertId: UUID = Field(default_factory=uuid4, description="Unique alert identifier")
    blockId: UUID = Field(..., description="Block with issue")
    farmId: UUID = Field(..., description="Farm ID")

    # Alert details
    alertType: AlertType = Field(AlertType.MANUAL, description="Alert source type")
    title: str = Field(..., min_length=1, max_length=200, description="Alert title")
    description: str = Field(..., description="Detailed description of issue")
    severity: AlertSeverity = Field(..., description="Alert severity level")
    status: AlertStatus = Field(AlertStatus.ACTIVE, description="Alert status")
    source: Optional[str] = Field(None, description="Where alert came from (e.g., task_manager, sensor_id)")

    # Created By
    createdBy: UUID = Field(..., description="User ID who created alert")
    createdByEmail: str = Field(..., description="Email of user who created alert")
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    # Resolution
    resolvedBy: Optional[UUID] = Field(None, description="User who resolved alert")
    resolvedByEmail: Optional[str] = Field(None, description="Email of resolver")
    resolvedAt: Optional[datetime] = Field(None, description="When alert was resolved")
    resolutionNotes: Optional[str] = Field(None, description="Resolution notes")

    # Sensor Data (future)
    sensorData: Optional[dict] = Field(None, description="Flexible sensor data for future integration")

    class Config:
        json_schema_extra = {
            "example": {
                "alertId": "al1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "alertType": "manual",
                "title": "Aphid infestation detected",
                "description": "Significant aphid presence on tomato plants in north section",
                "severity": "high",
                "status": "active",
                "source": "task_manager",
                "createdBy": "farmer-uuid",
                "createdByEmail": "farmer@example.com",
                "createdAt": "2025-02-10T10:30:00Z",
                "resolvedBy": None,
                "resolvedByEmail": None,
                "resolvedAt": None,
                "resolutionNotes": None,
                "sensorData": None
            }
        }


class AlertListResponse(BaseModel):
    """Response for list of alerts"""
    data: List[Alert]
    total: int
    page: int
    perPage: int
    totalPages: int


class AlertResponse(BaseModel):
    """Response for single alert"""
    data: Alert
    message: Optional[str] = None
