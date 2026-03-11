"""
Mushroom Harvest Model

Flush-aware harvest tracking for mushroom growing rooms.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class QualityGrade(str, Enum):
    """Harvest quality grading"""
    A = "A"
    B = "B"
    C = "C"
    REJECT = "reject"


class HarvestBase(BaseModel):
    """Base harvest fields"""
    weightKg: float = Field(..., gt=0, description="Harvest weight in kg")
    qualityGrade: QualityGrade = Field(QualityGrade.A, description="Quality grading")
    notes: Optional[str] = Field(None, max_length=500)


class HarvestCreate(HarvestBase):
    """Schema for creating a harvest record"""
    flushNumber: Optional[int] = Field(None, ge=1, description="Flush number (auto-filled if omitted)")


class Harvest(HarvestBase):
    """Complete harvest model"""
    harvestId: str = Field(default_factory=lambda: str(uuid4()), description="Unique harvest ID")
    roomId: str = Field(..., description="Growing room ID")
    facilityId: str = Field(..., description="Facility ID")
    strainId: Optional[str] = Field(None, description="Mushroom strain ID")

    # Flush tracking
    flushNumber: int = Field(1, ge=1, description="Which flush this harvest belongs to")

    # Performance
    biologicalEfficiency: Optional[float] = Field(
        None, ge=0, description="BE % for this harvest"
    )

    # Who harvested
    harvestedBy: Optional[str] = Field(None, description="User ID who recorded harvest")
    harvestedAt: datetime = Field(default_factory=datetime.utcnow)

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
