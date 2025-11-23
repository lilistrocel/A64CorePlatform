"""
Block History Model

Represents archived block cycles for historical analysis and performance tracking.
When a block transitions from cleaning → empty, the complete cycle is archived.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

from .block import BlockStatus, BlockType, BlockLocation, BlockKPI, StatusChange


class BlockHistoryArchive(BaseModel):
    """
    Complete snapshot of a block's lifecycle from planting to completion.
    Created when block transitions from CLEANING → EMPTY.
    """
    # History Record Metadata
    historyId: UUID = Field(default_factory=uuid4, description="Unique history record ID")
    archivedAt: datetime = Field(default_factory=datetime.utcnow, description="When this cycle was archived")
    archivedBy: UUID = Field(..., description="User who completed the cycle (transitioned to empty)")
    archivedByEmail: str = Field(..., description="Email of user who archived")

    # Original Block Information
    blockId: UUID = Field(..., description="Original block ID")
    blockCode: str = Field(..., description="Block code (e.g., F001-005)")
    farmId: UUID = Field(..., description="Farm this block belonged to")
    farmCode: Optional[str] = Field(None, description="Farm code (e.g., F001)")
    sequenceNumber: Optional[int] = Field(None, description="Block sequence number")

    # Block Physical Properties (snapshot at time of archival)
    name: Optional[str] = Field(None, description="Block name")
    blockType: Optional[BlockType] = Field(None, description="Type of cultivation block")
    maxPlants: int = Field(..., description="Maximum plant capacity")
    location: Optional[BlockLocation] = Field(None, description="GPS coordinates")
    area: Optional[float] = Field(None, description="Block area")
    areaUnit: str = Field("sqm", description="Area unit")

    # Crop Information
    targetCrop: UUID = Field(..., description="Plant data ID that was grown")
    targetCropName: str = Field(..., description="Plant name")
    actualPlantCount: int = Field(..., description="Number of plants that were planted")

    # Cycle Timeline (Expected vs Actual)
    plannedDate: datetime = Field(..., description="When planning started")
    plantedDate: datetime = Field(..., description="When planting occurred")
    expectedStatusChanges: Optional[dict] = Field(None, description="Predicted dates for each status")

    # Cycle Duration
    cycleDurationDays: int = Field(..., description="Total days from planting to completion")
    plantingToHarvestDays: Optional[int] = Field(None, description="Days from planting to first harvest")
    harvestingDurationDays: Optional[int] = Field(None, description="Days spent in harvesting state")

    # Performance Metrics
    kpi: BlockKPI = Field(..., description="Final KPI metrics (yield, efficiency, etc.)")

    # Complete Status History
    statusChanges: List[StatusChange] = Field(..., description="Complete timeline of status changes")

    # Performance Analysis
    performanceCategory: str = Field(..., description="Final performance category")
    overallOffsetDays: Optional[int] = Field(None, description="Total offset from expected timeline")
    wasEarlyCompletion: bool = Field(False, description="Completed earlier than expected")
    wasLateCompletion: bool = Field(False, description="Completed later than expected")

    # Additional Data
    totalTasks: int = Field(0, description="Number of tasks generated for this cycle")
    completedTasks: int = Field(0, description="Number of tasks completed")
    totalHarvests: int = Field(0, description="Number of harvest events")
    totalAlertsRaised: int = Field(0, description="Number of alerts during cycle")

    # Notes and Comments
    cycleNotes: Optional[str] = Field(None, description="Summary notes about this cycle")

    # Timestamps
    createdAt: datetime = Field(..., description="When block was originally created")

    class Config:
        json_schema_extra = {
            "example": {
                "historyId": "h1234567-89ab-cdef-0123-456789abcdef",
                "archivedAt": "2025-12-30T15:00:00Z",
                "archivedBy": "u9876543-21ba-dcfe-0123-456789fedcba",
                "archivedByEmail": "farmer@example.com",
                "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                "blockCode": "F001-005",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "farmCode": "F001",
                "sequenceNumber": 5,
                "name": "North Greenhouse A",
                "blockType": "greenhouse",
                "maxPlants": 100,
                "area": 500.0,
                "areaUnit": "sqm",
                "targetCrop": "plant-uuid-here",
                "targetCropName": "Tomato - Cherry",
                "actualPlantCount": 95,
                "plannedDate": "2025-10-15T00:00:00Z",
                "plantedDate": "2025-11-01T00:00:00Z",
                "cycleDurationDays": 89,
                "plantingToHarvestDays": 75,
                "harvestingDurationDays": 14,
                "kpi": {
                    "predictedYieldKg": 475.0,
                    "actualYieldKg": 520.5,
                    "yieldEfficiencyPercent": 109.6,
                    "totalHarvests": 12
                },
                "performanceCategory": "EXCEEDING",
                "overallOffsetDays": 2,
                "wasEarlyCompletion": False,
                "wasLateCompletion": True,
                "totalTasks": 18,
                "completedTasks": 18,
                "totalHarvests": 12,
                "totalAlertsRaised": 1,
                "cycleNotes": "Excellent yield, slight delay due to weather",
                "createdAt": "2025-10-15T10:00:00Z"
            }
        }


class BlockHistoryCreate(BaseModel):
    """Schema for creating block history (internal use)"""
    archivedBy: UUID
    archivedByEmail: str
    cycleNotes: Optional[str] = None


class BlockHistoryListResponse(BaseModel):
    """Response for list of block history records"""
    data: List[BlockHistoryArchive]
    total: int
    page: int
    perPage: int
    totalPages: int


class BlockHistoryResponse(BaseModel):
    """Response for single block history record"""
    data: BlockHistoryArchive
    message: Optional[str] = None
