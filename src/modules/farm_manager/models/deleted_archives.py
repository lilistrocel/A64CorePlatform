"""
Deleted Archives Models

Models for storing deleted farm/block data in separate collections.
When farms or blocks are deleted, all their data is moved here for historical preservation
while keeping the main collections clean for AI Analytics.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field


class DeletedFarm(BaseModel):
    """Archived deleted farm with all metadata"""

    # Original farm data
    farmId: UUID = Field(..., description="Original farm ID")
    name: str = Field(..., description="Farm name")
    description: Optional[str] = None
    owner: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    totalArea: Optional[float] = None
    areaUnit: str = "hectares"
    numberOfStaff: Optional[int] = None
    managerId: UUID = Field(..., description="Original manager ID")
    managerEmail: str = Field(..., description="Manager email")
    isActive: bool = False

    # Original timestamps
    createdAt: datetime = Field(..., description="When farm was originally created")
    updatedAt: datetime = Field(..., description="When farm was last updated")

    # Deletion metadata
    deletedAt: datetime = Field(default_factory=datetime.utcnow)
    deletedBy: UUID = Field(..., description="User who deleted the farm")
    deletedByEmail: str = Field(..., description="Email of user who deleted")
    deletionReason: Optional[str] = None

    # Statistics at time of deletion
    blockCount: int = Field(0, description="Number of blocks at deletion")
    archiveCount: int = Field(0, description="Number of archived cycles at deletion")
    harvestCount: int = Field(0, description="Number of harvest records at deletion")

    class Config:
        json_schema_extra = {
            "example": {
                "farmId": "cd22c152-defa-47fa-88af-0b3b422b5700",
                "name": "Al Ain Farm",
                "deletedAt": "2025-11-26T10:00:00Z",
                "deletedBy": "user-uuid",
                "blockCount": 3,
                "archiveCount": 5
            }
        }


class DeletedBlock(BaseModel):
    """Archived deleted block with all metadata"""

    # Original block data
    blockId: UUID = Field(..., description="Original block ID")
    blockCode: Optional[str] = None
    name: str = Field(..., description="Block name")
    farmId: UUID = Field(..., description="Parent farm ID")
    farmName: str = Field(..., description="Parent farm name")
    blockType: str = Field("openfield", description="Block type")
    maxPlants: int = Field(0)
    actualPlantCount: Optional[int] = None
    area: Optional[float] = None
    areaUnit: str = "hectares"
    location: Optional[Dict[str, Any]] = None

    # Last crop information
    lastCrop: Optional[str] = None
    lastCropName: Optional[str] = None
    lastPlantedDate: Optional[datetime] = None
    lastHarvestDate: Optional[datetime] = None

    # Status at deletion
    lastState: str = Field("empty", description="State when deleted")
    statusChanges: List[Dict[str, Any]] = Field(default_factory=list)

    # KPI at deletion
    totalYieldKg: float = Field(0.0, description="Total lifetime yield")
    totalCycles: int = Field(0, description="Total completed cultivation cycles")
    avgYieldEfficiency: float = Field(0.0, description="Average yield efficiency")

    # Original timestamps
    createdAt: datetime = Field(..., description="When block was created")
    updatedAt: datetime = Field(..., description="When block was last updated")

    # Deletion metadata
    deletedAt: datetime = Field(default_factory=datetime.utcnow)
    deletedBy: UUID = Field(..., description="User who deleted")
    deletedByEmail: str = Field(..., description="Email of deleting user")
    deletedWithFarm: bool = Field(False, description="Whether deleted as part of farm deletion")
    deletionReason: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "blockId": "c8ca8864-22ce-4765-b735-ca4bd4a7db2f",
                "name": "A01",
                "farmId": "cd22c152-defa-47fa-88af-0b3b422b5700",
                "farmName": "Al Ain Farm",
                "lastCropName": "Corn - Sweet (Sweet Corn)",
                "totalCycles": 2,
                "deletedAt": "2025-11-26T10:00:00Z"
            }
        }


class DeletedBlockArchive(BaseModel):
    """
    Moved block archive (cultivation cycle history) for deleted blocks.

    This is the SAME structure as BlockArchive, but in a separate collection
    so AI Analytics won't query it.
    """

    # Original archive ID
    archiveId: UUID = Field(..., description="Original archive ID")
    originalCollection: str = Field("block_archives", description="Where this came from")

    # Block/Farm references
    blockId: UUID = Field(..., description="Block this archive belongs to")
    blockCode: Optional[str] = None
    farmId: UUID = Field(..., description="Farm this belongs to")
    farmName: str = Field(..., description="Farm name")

    # Cycle information
    blockType: str = "openfield"
    maxPlants: int = 0
    actualPlantCount: int = 0
    location: Optional[Dict[str, Any]] = None
    area: Optional[float] = None
    areaUnit: str = "sqm"

    # Crop details
    targetCrop: Optional[str] = None
    targetCropName: Optional[str] = None
    plantedDate: Optional[datetime] = None
    harvestCompletedDate: Optional[datetime] = None
    cycleDurationDays: Optional[int] = None

    # Yield data
    predictedYieldKg: float = 0.0
    actualYieldKg: float = 0.0
    yieldEfficiencyPercent: float = 0.0
    totalHarvests: int = 0
    qualityBreakdown: Dict[str, float] = Field(default_factory=dict)

    # Status history
    statusChanges: List[Dict[str, Any]] = Field(default_factory=list)
    alertsSummary: Dict[str, Any] = Field(default_factory=dict)

    # Original archive timestamp
    archivedAt: datetime = Field(..., description="When cycle was originally archived")
    archivedBy: Optional[UUID] = None
    archivedByEmail: Optional[str] = None

    # Deletion metadata
    movedToDeletedAt: datetime = Field(default_factory=datetime.utcnow)
    movedReason: str = Field("block_deleted", description="block_deleted or farm_deleted")


class DeletedBlockHarvest(BaseModel):
    """
    Moved harvest record for deleted blocks.
    """

    # Original harvest data
    harvestId: UUID = Field(..., description="Original harvest ID")
    blockId: UUID = Field(..., description="Block this harvest belongs to")
    farmId: UUID = Field(..., description="Farm this belongs to")

    harvestDate: datetime = Field(..., description="When harvest occurred")
    quantityKg: float = Field(..., description="Harvest quantity in kg")
    qualityGrade: Optional[str] = None
    notes: Optional[str] = None

    recordedBy: UUID = Field(..., description="User who recorded harvest")
    recordedByEmail: str = Field(..., description="Email of recorder")
    createdAt: datetime = Field(..., description="Original creation time")

    # Deletion metadata
    movedToDeletedAt: datetime = Field(default_factory=datetime.utcnow)
    movedReason: str = Field("block_deleted", description="block_deleted or farm_deleted")
