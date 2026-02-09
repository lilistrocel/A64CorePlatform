"""
Block Harvest Model

Represents individual harvest events for blocks (daily harvests).
"""

from datetime import datetime
from typing import Optional, List, Union, Any
from uuid import UUID, uuid4
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class QualityGrade(str, Enum):
    """Quality grade enumeration"""
    A = "A"
    B = "B"
    C = "C"


class BlockHarvestBase(BaseModel):
    """Base block harvest fields"""
    harvestDate: datetime = Field(..., description="When harvest occurred")
    quantityKg: float = Field(..., gt=0, description="Quantity harvested in kilograms")
    qualityGrade: QualityGrade = Field(..., description="Quality grade (A/B/C)")
    notes: Optional[str] = Field(None, description="Optional harvest notes")
    farmingYear: Optional[int] = Field(None, description="Farming year (auto-calculated from harvestDate if not provided)")


class BlockHarvestCreate(BlockHarvestBase):
    """Schema for recording a new harvest"""
    blockId: UUID = Field(..., description="Block where harvest occurred")


class BlockHarvestUpdate(BaseModel):
    """Schema for updating a harvest record"""
    quantityKg: Optional[float] = Field(None, gt=0)
    qualityGrade: Optional[QualityGrade] = None
    notes: Optional[str] = None


class HarvestMetadata(BaseModel):
    """Optional metadata for harvest records (e.g., from migrations)"""
    migratedFrom: Optional[str] = None
    migratedAt: Optional[Union[str, datetime]] = None  # Accept both string and datetime
    recordedByMigratedAt: Optional[Union[str, datetime]] = None  # From recordedBy fix migration
    oldRef: Optional[str] = None
    oldFarmBlockRef: Optional[str] = None
    harvestSeason: Optional[int] = None
    viewingYear: Optional[int] = None
    crop: Optional[str] = None
    mainBlock: Optional[str] = None
    legacyBlockCode: Optional[str] = None  # From field rename migration
    season: Optional[Union[str, int]] = None  # Accept both string and int from legacy data

    class Config:
        extra = "allow"  # Allow additional fields


class BlockHarvest(BlockHarvestBase):
    """Complete block harvest model"""
    harvestId: UUID = Field(default_factory=uuid4, description="Unique harvest identifier")
    blockId: UUID = Field(..., description="Block where harvest occurred")
    farmId: UUID = Field(..., description="Farm reference")

    # Recorded by
    recordedBy: UUID = Field(..., description="User ID who recorded harvest")
    recordedByEmail: str = Field(..., description="Email of user who recorded harvest")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    # Optional metadata (for migrated data)
    metadata: Optional[HarvestMetadata] = Field(None, description="Additional metadata from migrations")

    class Config:
        json_schema_extra = {
            "example": {
                "harvestId": "h1a2b3c4-d5e6-7890-abcd-ef1234567890",
                "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "harvestDate": "2025-11-12T08:00:00Z",
                "quantityKg": 45.5,
                "qualityGrade": "A",
                "farmingYear": 2025,
                "notes": "Excellent quality tomatoes, perfect ripeness",
                "recordedBy": "user-uuid-here",
                "recordedByEmail": "farmer@example.com",
                "createdAt": "2025-11-12T08:15:00Z"
            }
        }


class BlockHarvestListResponse(BaseModel):
    """Response for list of harvests"""
    data: List[BlockHarvest]
    total: int
    page: int
    perPage: int
    totalPages: int


class BlockHarvestResponse(BaseModel):
    """Response for single harvest"""
    data: BlockHarvest
    message: Optional[str] = None


class BlockHarvestSummary(BaseModel):
    """Harvest summary for a block"""
    blockId: UUID
    totalHarvests: int
    totalQuantityKg: float
    qualityAKg: float
    qualityBKg: float
    qualityCKg: float
    averageQualityGrade: str
    firstHarvestDate: Optional[datetime]
    lastHarvestDate: Optional[datetime]
