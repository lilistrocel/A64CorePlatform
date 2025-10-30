"""
Block Model

Represents a designated planting area within a farm.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class BlockState(str, Enum):
    """Block state enumeration"""
    EMPTY = "empty"
    PLANNED = "planned"
    PLANTED = "planted"
    HARVESTING = "harvesting"
    ALERT = "alert"


class BlockBase(BaseModel):
    """Base block fields"""
    name: str = Field(..., min_length=1, max_length=100, description="Block name/number")
    description: Optional[str] = Field(None, description="Block description")
    area: Optional[float] = Field(None, gt=0, description="Block area")
    areaUnit: str = Field("hectares", description="Area unit")
    maxPlants: int = Field(..., gt=0, description="Maximum number of plants allowed")


class BlockCreate(BlockBase):
    """
    Schema for creating a new block

    Note: farmId is provided via the URL path parameter, not in the request body
    """
    pass


class BlockUpdate(BaseModel):
    """Schema for updating a block"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    area: Optional[float] = Field(None, gt=0)
    areaUnit: Optional[str] = None
    maxPlants: Optional[int] = Field(None, gt=0)
    isActive: Optional[bool] = None


class Block(BlockBase):
    """Complete block model with all fields"""
    blockId: UUID = Field(default_factory=uuid4, description="Unique block identifier")
    farmId: UUID = Field(..., description="Parent farm ID")

    # State management
    state: BlockState = Field(BlockState.EMPTY, description="Current block state")
    previousState: Optional[BlockState] = Field(None, description="State before alert")

    # Planting information (populated when state = planned/planted/harvesting)
    currentPlanting: Optional[UUID] = Field(None, description="Current planting ID")
    currentCycleId: Optional[UUID] = Field(None, description="Current cycle ID")
    plantedDate: Optional[datetime] = Field(None, description="Date planted")
    estimatedHarvestDate: Optional[datetime] = Field(None, description="Estimated harvest start date")

    # Alert information (populated when state = alert)
    alertId: Optional[UUID] = Field(None, description="Current alert ID")
    alertDescription: Optional[str] = Field(None, description="Alert description")
    alertTriggeredAt: Optional[datetime] = Field(None, description="When alert was triggered")

    # Metadata
    isActive: bool = Field(True, description="Is block active")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Block A-1",
                "description": "North field, full sun",
                "area": 0.5,
                "areaUnit": "hectares",
                "maxPlants": 500,
                "state": "planted",
                "currentPlanting": "p1234567-89ab-cdef-0123-456789abcdef",
                "currentCycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "plantedDate": "2025-01-15T08:00:00Z",
                "estimatedHarvestDate": "2025-04-15T00:00:00Z",
                "isActive": True,
                "createdAt": "2025-01-10T10:00:00Z",
                "updatedAt": "2025-01-15T08:00:00Z"
            }
        }
