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
    accessionId: Optional[str] = Field(
        None,
        description=(
            "The fruiting block this came off, as a genetic_accessions id. Supplying "
            "it is what lets yield be attributed to a lineage rather than a species."
        ),
    )
    substrateWeightKg: Optional[float] = Field(
        None,
        gt=0,
        description=(
            "Dry substrate weight for THIS block, overriding the room-level figure. "
            "Needed for a meaningful per-block BE when a room holds blocks from "
            "several batches."
        ),
    )


class Harvest(HarvestBase):
    """Complete harvest model"""
    harvestId: str = Field(default_factory=lambda: str(uuid4()), description="Unique harvest ID")
    roomId: str = Field(..., description="Growing room ID")
    facilityId: str = Field(..., description="Facility ID")
    strainId: Optional[str] = Field(None, description="Mushroom strain ID (species-level)")

    # Lineage attribution. strainId answers "what species was this"; these
    # answer "which of my cultures produced it", which is the question the
    # genetics repo exists to make answerable.
    accessionId: Optional[str] = Field(None, description="genetic_accessions id of the harvested block")
    accessionCode: Optional[str] = Field(None, description="Denormalised for display, e.g. PO-BLU-G2-014")
    lineId: Optional[str] = Field(None, description="genetic_lines id, denormalised for grouping")
    lineCode: Optional[str] = Field(None, description="Denormalised line code, e.g. PO-BLU")
    cloneGeneration: Optional[int] = Field(None, ge=0, description="G at harvest — lets yield be compared across generations")
    filialGeneration: Optional[int] = Field(None, ge=0, description="F at harvest")

    substrateWeightKg: Optional[float] = Field(
        None, gt=0, description="Dry substrate weight used for the BE calculation"
    )

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
