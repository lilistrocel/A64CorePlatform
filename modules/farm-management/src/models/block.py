"""
Block Model

Represents a designated planting area within a farm.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class BlockStatus(str, Enum):
    """Block status lifecycle"""
    EMPTY = "empty"
    PLANNED = "planned"
    PLANTED = "planted"
    GROWING = "growing"
    FRUITING = "fruiting"
    HARVESTING = "harvesting"
    CLEANING = "cleaning"
    ALERT = "alert"


class BlockType(str, Enum):
    """Types of cultivation blocks"""
    HYDROPONIC = "hydroponic"
    OPENFIELD = "openfield"
    GREENHOUSE = "greenhouse"
    NETHOUSE = "nethouse"
    AEROPONIC = "aeroponic"
    HYBRID = "hybrid"
    SPECIAL = "special"
    CONTAINERFARM = "containerfarm"


class BlockLocation(BaseModel):
    """GPS coordinates within farm"""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude")


class StatusChange(BaseModel):
    """Status change history record with offset tracking"""
    status: BlockStatus = Field(..., description="New status")
    changedAt: datetime = Field(default_factory=datetime.utcnow, description="When status changed")
    changedBy: UUID = Field(..., description="User ID who changed status")
    changedByEmail: str = Field(..., description="Email of user who changed status")
    notes: Optional[str] = Field(None, description="Optional notes about status change")

    # Offset tracking fields
    expectedDate: Optional[datetime] = Field(
        None,
        description="Expected date for this transition from planting timeline"
    )
    offsetDays: Optional[int] = Field(
        None,
        description="Actual - Expected in days (negative = early, positive = late)"
    )
    offsetType: Optional[Literal["early", "on_time", "late"]] = Field(
        None,
        description="Categorization of offset"
    )

    @property
    def offset_description(self) -> str:
        """Human-readable offset description"""
        if self.offsetDays is None:
            return "No timeline set"
        elif self.offsetDays == 0:
            return "On schedule"
        elif self.offsetDays < 0:
            return f"{abs(self.offsetDays)} days early"
        else:
            return f"{self.offsetDays} days late"


class PerformanceCategory(str, Enum):
    """Yield performance categorization"""
    EXCEPTIONAL = "exceptional"  # >= 200%
    EXCEEDING = "exceeding"      # 100-199%
    EXCELLENT = "excellent"      # 90-99%
    GOOD = "good"                # 70-89%
    ACCEPTABLE = "acceptable"    # 50-69%
    POOR = "poor"                # < 50%


class BlockKPI(BaseModel):
    """Block KPI metrics with performance categorization"""
    predictedYieldKg: float = Field(0.0, ge=0, description="Expected total yield from plant data")
    actualYieldKg: float = Field(0.0, ge=0, description="Cumulative actual harvest")
    yieldEfficiencyPercent: float = Field(0.0, ge=0, le=1000, description="(actual/predicted) * 100 - supports up to 1000%")
    totalHarvests: int = Field(0, ge=0, description="Number of harvest events")

    @property
    def performance_category(self) -> PerformanceCategory:
        """Categorize performance based on efficiency"""
        if self.yieldEfficiencyPercent >= 200:
            return PerformanceCategory.EXCEPTIONAL
        elif self.yieldEfficiencyPercent >= 100:
            return PerformanceCategory.EXCEEDING
        elif self.yieldEfficiencyPercent >= 90:
            return PerformanceCategory.EXCELLENT
        elif self.yieldEfficiencyPercent >= 70:
            return PerformanceCategory.GOOD
        elif self.yieldEfficiencyPercent >= 50:
            return PerformanceCategory.ACCEPTABLE
        else:
            return PerformanceCategory.POOR

    @property
    def performance_icon(self) -> str:
        """Get icon for performance category"""
        icons = {
            PerformanceCategory.EXCEPTIONAL: "🏆",
            PerformanceCategory.EXCEEDING: "🎯",
            PerformanceCategory.EXCELLENT: "⭐",
            PerformanceCategory.GOOD: "✅",
            PerformanceCategory.ACCEPTABLE: "🟡",
            PerformanceCategory.POOR: "🔴"
        }
        return icons[self.performance_category]

    @property
    def performance_label(self) -> str:
        """Get human-readable label"""
        return self.performance_category.value.upper()


class BlockBase(BaseModel):
    """Base block fields"""
    name: Optional[str] = Field(None, max_length=200, description="Optional block name")
    blockType: Optional[BlockType] = Field(None, description="Type of cultivation block")
    maxPlants: int = Field(..., gt=0, description="Maximum number of plants")
    location: Optional[BlockLocation] = Field(None, description="GPS coordinates within farm")
    area: Optional[float] = Field(None, gt=0, description="Block area")
    areaUnit: str = Field("sqm", description="Area unit (sqm, hectares, acres)")


class BlockCreate(BlockBase):
    """
    Schema for creating a new block

    Note: farmId is provided via the URL path parameter, not in the request body
    """
    pass


class BlockUpdate(BaseModel):
    """Schema for updating a block"""
    name: Optional[str] = Field(None, max_length=200)
    blockType: Optional[BlockType] = None
    maxPlants: Optional[int] = Field(None, gt=0)
    location: Optional[BlockLocation] = None
    area: Optional[float] = Field(None, gt=0)
    areaUnit: Optional[str] = None
    actualPlantCount: Optional[int] = Field(None, ge=0)


class BlockStatusUpdate(BaseModel):
    """Schema for updating block status"""
    newStatus: BlockStatus = Field(..., description="New status to set")
    notes: Optional[str] = Field(None, description="Notes about status change")
    targetCrop: Optional[UUID] = Field(None, description="Plant data ID (required when status=planted)")
    actualPlantCount: Optional[int] = Field(None, ge=0, description="Number of plants (when planting)")


class Block(BlockBase):
    """Complete block model with all fields"""
    blockId: UUID = Field(default_factory=uuid4, description="Unique block identifier")
    blockCode: Optional[str] = Field(None, description="Human-readable code (e.g., F001-005)")
    farmId: UUID = Field(..., description="Farm this block belongs to")
    farmCode: Optional[str] = Field(None, description="Farm numeric code (e.g., F001)")
    sequenceNumber: Optional[int] = Field(None, ge=1, description="Block sequence number")

    # Current Status
    state: BlockStatus = Field(BlockStatus.EMPTY, description="Current block status")
    previousState: Optional[BlockStatus] = Field(None, description="Status before alert")
    targetCrop: Optional[UUID] = Field(None, description="Current plant data ID")
    targetCropName: Optional[str] = Field(None, description="Current plant name (denormalized)")
    actualPlantCount: Optional[int] = Field(None, ge=0, description="Current number of plants")

    # KPI Tracking
    kpi: BlockKPI = Field(default_factory=BlockKPI, description="Block KPI metrics")

    # Cycle Tracking
    plantedDate: Optional[datetime] = Field(None, description="When planting started")
    expectedHarvestDate: Optional[datetime] = Field(None, description="Expected harvest date")
    expectedStatusChanges: Optional[dict] = Field(None, description="Expected dates for each status")

    # Status History
    statusChanges: List[StatusChange] = Field(default_factory=list, description="Status change history")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    isActive: bool = Field(True, description="Soft delete flag")

    class Config:
        json_schema_extra = {
            "example": {
                "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                "blockCode": "F001-005",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "farmCode": "F001",
                "sequenceNumber": 5,
                "name": "North Greenhouse A",
                "blockType": "greenhouse",
                "maxPlants": 100,
                "location": {
                    "latitude": 40.7128,
                    "longitude": -74.0060
                },
                "area": 500.0,
                "areaUnit": "sqm",
                "state": "growing",
                "targetCrop": "plant-uuid-here",
                "targetCropName": "Tomato",
                "actualPlantCount": 95,
                "kpi": {
                    "predictedYieldKg": 475.0,
                    "actualYieldKg": 120.5,
                    "yieldEfficiencyPercent": 25.4,
                    "totalHarvests": 3
                },
                "plantedDate": "2025-11-01T00:00:00Z",
                "expectedHarvestDate": "2025-12-30T00:00:00Z",
                "createdAt": "2025-11-01T10:00:00Z",
                "updatedAt": "2025-11-12T10:00:00Z",
                "isActive": True
            }
        }


class BlockListResponse(BaseModel):
    """Response for list of blocks"""
    data: List[Block]
    total: int
    page: int
    perPage: int
    totalPages: int


class BlockResponse(BaseModel):
    """Response for single block"""
    data: Block
    message: Optional[str] = None


# Compatibility alias for old code
BlockState = BlockStatus
