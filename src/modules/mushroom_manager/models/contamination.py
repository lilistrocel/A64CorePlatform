"""
Contamination Report Model

Tracks contamination incidents in mushroom growing rooms.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class ContaminationType(str, Enum):
    """Types of contamination"""
    TRICHODERMA = "trichoderma"
    COBWEB_MOLD = "cobweb_mold"
    BACTERIA = "bacteria"
    BLACK_MOLD = "black_mold"
    GREEN_MOLD = "green_mold"
    LIPSTICK_MOLD = "lipstick_mold"
    OTHER = "other"


class ContaminationSeverity(str, Enum):
    """Severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ContaminationAction(str, Enum):
    """Action taken in response"""
    MONITORING = "monitoring"
    TREATMENT = "treatment"
    QUARANTINE = "quarantine"
    DISPOSAL = "disposal"


class ContaminationReportBase(BaseModel):
    """Base contamination report fields"""
    contaminationType: ContaminationType = Field(..., description="Type of contamination")
    severity: ContaminationSeverity = Field(..., description="Severity level")
    description: Optional[str] = Field(None, max_length=1000, description="Detailed description")


class ContaminationReportCreate(ContaminationReportBase):
    """Schema for creating a contamination report"""
    actionTaken: Optional[ContaminationAction] = None
    quarantined: bool = Field(False, description="Whether room was quarantined")


class ContaminationResolveRequest(BaseModel):
    """Request to resolve a contamination report"""
    resolutionNotes: Optional[str] = Field(None, max_length=1000)
    actionTaken: Optional[ContaminationAction] = None


class ContaminationReport(ContaminationReportBase):
    """Complete contamination report model"""
    reportId: str = Field(default_factory=lambda: str(uuid4()), description="Unique report ID")
    roomId: str = Field(..., description="Affected growing room ID")
    facilityId: str = Field(..., description="Facility ID")

    # Action and resolution
    actionTaken: ContaminationAction = Field(ContaminationAction.MONITORING)
    quarantined: bool = Field(False)
    isResolved: bool = Field(False)
    resolvedAt: Optional[datetime] = None
    resolvedBy: Optional[str] = Field(None, description="User ID who resolved")
    resolutionNotes: Optional[str] = None

    # Reporter
    reportedBy: Optional[str] = Field(None, description="User ID who reported")

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    reportedAt: datetime = Field(default_factory=datetime.utcnow)
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
