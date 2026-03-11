"""
Substrate Batch Model

Tracks substrate preparation and sterilization for mushroom growing.
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class SubstrateStatus(str, Enum):
    """Substrate batch status"""
    PREPARING = "preparing"
    STERILIZED = "sterilized"
    LOADED = "loaded"
    SPENT = "spent"
    DISPOSED = "disposed"


class SterilizationMethod(str, Enum):
    """Sterilization method"""
    AUTOCLAVE = "autoclave"
    PASTEURIZATION = "pasteurization"
    COLD_PASTEURIZATION = "cold_pasteurization"
    CHEMICAL = "chemical"
    OTHER = "other"


class RawMaterial(BaseModel):
    """Raw material in a substrate batch"""
    name: str = Field(..., min_length=1, max_length=100)
    weightKg: float = Field(..., gt=0)
    supplier: Optional[str] = Field(None, max_length=200)
    cost: Optional[float] = Field(None, ge=0)


class SubstrateBatchBase(BaseModel):
    """Base substrate batch fields"""
    batchCode: str = Field(..., min_length=1, max_length=20, description="Batch identifier")
    recipe: Optional[str] = Field(None, max_length=500, description="Recipe name or description")
    totalWeight: Optional[float] = Field(None, gt=0, description="Total batch weight in kg")


class SubstrateBatchCreate(SubstrateBatchBase):
    """Schema for creating a substrate batch"""
    rawMaterials: Optional[List[RawMaterial]] = None
    sterilizationMethod: Optional[SterilizationMethod] = None
    sterilizationTemp: Optional[float] = Field(None, description="Sterilization temperature (Celsius)")
    sterilizationDuration: Optional[int] = Field(None, gt=0, description="Duration in minutes")


class SubstrateBatchUpdate(BaseModel):
    """Schema for updating a substrate batch"""
    batchCode: Optional[str] = Field(None, min_length=1, max_length=20)
    recipe: Optional[str] = Field(None, max_length=500)
    totalWeight: Optional[float] = Field(None, gt=0)
    rawMaterials: Optional[List[RawMaterial]] = None
    sterilizationMethod: Optional[SterilizationMethod] = None
    sterilizationTemp: Optional[float] = None
    sterilizationDuration: Optional[int] = Field(None, gt=0)
    status: Optional[SubstrateStatus] = None


class SubstrateBatch(SubstrateBatchBase):
    """Complete substrate batch model"""
    batchId: str = Field(default_factory=lambda: str(uuid4()), description="Unique batch ID")
    facilityId: str = Field(..., description="Facility where batch was prepared")

    # Materials and preparation
    rawMaterials: List[RawMaterial] = Field(default_factory=list)
    sterilizationMethod: Optional[SterilizationMethod] = None
    sterilizationTemp: Optional[float] = Field(None, description="Celsius")
    sterilizationDuration: Optional[int] = Field(None, gt=0, description="Minutes")

    # Status and tracking
    status: SubstrateStatus = Field(SubstrateStatus.PREPARING)
    assignedRooms: List[str] = Field(default_factory=list, description="Room IDs using this batch")

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
