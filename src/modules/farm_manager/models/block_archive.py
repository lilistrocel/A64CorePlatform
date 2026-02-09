"""
Block Archive Model

Stores historical data for completed block cycles.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from .block import BlockStatus, BlockType, BlockLocation, StatusChange


class QualityBreakdown(BaseModel):
    """Quality grade breakdown"""
    qualityAKg: float = Field(0.0, ge=0, description="Quality A harvest in kg")
    qualityBKg: float = Field(0.0, ge=0, description="Quality B harvest in kg")
    qualityCKg: float = Field(0.0, ge=0, description="Quality C harvest in kg")


class AlertsSummary(BaseModel):
    """Alerts summary for the cycle"""
    totalAlerts: int = Field(0, ge=0, description="Total number of alerts")
    resolvedAlerts: int = Field(0, ge=0, description="Number of resolved alerts")
    averageResolutionTimeHours: Optional[float] = Field(None, ge=0, description="Average resolution time")


class BlockArchive(BaseModel):
    """Complete block archive model"""
    archiveId: UUID = Field(default_factory=uuid4, description="Unique archive identifier")
    blockId: UUID = Field(..., description="Original block ID")
    blockCode: str = Field(..., description="Block code at time of archive")
    farmId: UUID = Field(..., description="Farm reference")
    farmName: str = Field(..., description="Farm name at time of archive")

    # Block Snapshot
    blockType: BlockType = Field(..., description="Type of cultivation block")
    maxPlants: int = Field(..., gt=0, description="Maximum plants capacity")
    actualPlantCount: int = Field(..., ge=0, description="Actual plants in cycle")
    location: Optional[BlockLocation] = Field(None, description="Block location")
    area: Optional[float] = Field(None, gt=0, description="Block area")
    areaUnit: str = Field("sqm", description="Area unit")

    # Crop Information
    targetCrop: UUID = Field(..., description="Plant data reference")
    targetCropName: str = Field(..., description="Plant name (denormalized)")

    # Cycle Performance
    plantedDate: datetime = Field(..., description="When planting started")
    harvestCompletedDate: datetime = Field(..., description="When status changed to empty")
    cycleDurationDays: int = Field(..., gt=0, description="Actual cycle duration in days")

    # Farming Year (for historical analysis - Feature #378)
    farmingYearPlanted: Optional[int] = Field(None, description="Farming year when planting started")
    farmingYearHarvested: Optional[int] = Field(None, description="Farming year when harvest completed")

    # Yield KPIs
    predictedYieldKg: float = Field(0.0, ge=0, description="Expected total yield")
    actualYieldKg: float = Field(0.0, ge=0, description="Actual total yield")
    yieldEfficiencyPercent: float = Field(0.0, ge=0, description="(actual/predicted) * 100")
    totalHarvests: int = Field(0, ge=0, description="Number of harvest events")

    # Quality Breakdown
    qualityBreakdown: QualityBreakdown = Field(default_factory=QualityBreakdown, description="Harvest quality breakdown")

    # Status Timeline
    statusChanges: List[StatusChange] = Field(default_factory=list, description="Complete status history")

    # Alerts Summary
    alertsSummary: AlertsSummary = Field(default_factory=AlertsSummary, description="Alerts summary for cycle")

    # Archive Metadata
    archivedAt: datetime = Field(default_factory=datetime.utcnow, description="When archived")
    archivedBy: UUID = Field(..., description="User who triggered archival")
    archivedByEmail: str = Field(..., description="Email of user who triggered archival")

    class Config:
        json_schema_extra = {
            "example": {
                "archiveId": "ar1a2b3c4-d5e6-7890-abcd-ef1234567890",
                "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                "blockCode": "F001-005",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "farmName": "Green Valley Farm",
                "blockType": "greenhouse",
                "maxPlants": 100,
                "actualPlantCount": 95,
                "location": {
                    "latitude": 40.7128,
                    "longitude": -74.0060
                },
                "area": 500.0,
                "areaUnit": "sqm",
                "targetCrop": "plant-uuid-here",
                "targetCropName": "Tomato",
                "plantedDate": "2025-09-01T00:00:00Z",
                "harvestCompletedDate": "2025-11-30T00:00:00Z",
                "cycleDurationDays": 90,
                "farmingYearPlanted": 2025,
                "farmingYearHarvested": 2025,
                "predictedYieldKg": 475.0,
                "actualYieldKg": 450.2,
                "yieldEfficiencyPercent": 94.8,
                "totalHarvests": 15,
                "qualityBreakdown": {
                    "qualityAKg": 315.0,
                    "qualityBKg": 112.5,
                    "qualityCKg": 22.7
                },
                "statusChanges": [
                    {
                        "status": "planted",
                        "changedAt": "2025-09-01T08:00:00Z",
                        "changedBy": "user-uuid",
                        "changedByEmail": "manager@example.com",
                        "notes": "Planted 95 tomato seedlings"
                    },
                    {
                        "status": "growing",
                        "changedAt": "2025-09-10T10:00:00Z",
                        "changedBy": "user-uuid",
                        "changedByEmail": "farmer@example.com",
                        "notes": "Vegetative growth started"
                    }
                ],
                "alertsSummary": {
                    "totalAlerts": 2,
                    "resolvedAlerts": 2,
                    "averageResolutionTimeHours": 4.5
                },
                "archivedAt": "2025-11-30T12:00:00Z",
                "archivedBy": "user-uuid",
                "archivedByEmail": "manager@example.com"
            }
        }


class BlockArchiveListResponse(BaseModel):
    """Response for list of archives"""
    data: List[BlockArchive]
    total: int
    page: int
    perPage: int
    totalPages: int


class BlockArchiveResponse(BaseModel):
    """Response for single archive"""
    data: BlockArchive
    message: Optional[str] = None


class BlockArchiveAnalytics(BaseModel):
    """Analytics data for comparing archived cycles"""
    totalCycles: int
    averageYieldEfficiency: float
    bestPerformingCycle: Optional[BlockArchive]
    worstPerformingCycle: Optional[BlockArchive]
    averageCycleDuration: float
    totalYieldKg: float


class CropPerformanceComparison(BaseModel):
    """Compare performance across different crops"""
    cropName: str
    cropId: UUID
    totalCycles: int
    averageYieldEfficiency: float
    averageYieldKg: float
    averageCycleDuration: float
    totalYieldKg: float
