"""
Planting Model

Represents what is planted in a block (planting plan and execution).
"""

from datetime import datetime
from typing import List, Dict, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class PlantingItem(BaseModel):
    """Individual plant type within a planting"""
    plantDataId: UUID = Field(..., description="Reference to plant data")
    plantName: str = Field(..., description="Plant name (cached)")
    quantity: int = Field(..., gt=0, description="Number of plants")

    # Frozen plant data at time of planting (for yield calculation)
    plantDataSnapshot: Dict = Field(..., description="Snapshot of plant data at planting time")


class PlantingBase(BaseModel):
    """Base planting fields"""
    plants: List[PlantingItem] = Field(..., description="Plants in this planting")
    totalPlants: int = Field(..., gt=0, description="Total number of plants")


class PlantingCreate(PlantingBase):
    """Schema for creating a planting plan"""
    blockId: UUID = Field(..., description="Block where to plant")


class Planting(PlantingBase):
    """Complete planting model with all fields"""
    plantingId: UUID = Field(default_factory=uuid4, description="Unique planting identifier")
    blockId: UUID = Field(..., description="Block where planted")
    farmId: UUID = Field(..., description="Farm ID (for queries)")

    # Planning information
    plannedBy: UUID = Field(..., description="User ID who planned")
    plannedByEmail: str = Field(..., description="Email of planner")
    plannedAt: datetime = Field(default_factory=datetime.utcnow, description="When planning was created")

    # Planting information (populated when farmer marks planted)
    plantedBy: Optional[UUID] = Field(None, description="User ID who planted")
    plantedByEmail: Optional[str] = Field(None, description="Email of planter")
    plantedAt: Optional[datetime] = Field(None, description="When planting occurred")

    # Harvest window (calculated from plant data)
    estimatedHarvestStartDate: Optional[datetime] = Field(None, description="Estimated harvest start")
    estimatedHarvestEndDate: Optional[datetime] = Field(None, description="Estimated harvest end")

    # Yield prediction
    predictedYield: float = Field(..., description="Predicted total yield")
    yieldUnit: str = Field(..., description="Unit of yield")

    # Status
    status: str = Field("planned", description="Status: planned, planted, harvesting, completed")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "plants": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantity": 50,
                        "plantDataSnapshot": {"expectedYieldPerPlant": 5.0, "yieldUnit": "kg", "growthCycleDays": 90}
                    },
                    {
                        "plantDataId": "d2234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Basil",
                        "quantity": 30,
                        "plantDataSnapshot": {"expectedYieldPerPlant": 0.5, "yieldUnit": "kg", "growthCycleDays": 60}
                    }
                ],
                "totalPlants": 80,
                "predictedYield": 265.0,
                "yieldUnit": "kg",
                "status": "planted",
                "plannedBy": "manager-uuid",
                "plannedByEmail": "manager@example.com",
                "plantedBy": "farmer-uuid",
                "plantedByEmail": "farmer@example.com",
                "plannedAt": "2025-01-10T10:00:00Z",
                "plantedAt": "2025-01-15T08:00:00Z",
                "estimatedHarvestStartDate": "2025-04-15T00:00:00Z",
                "createdAt": "2025-01-10T10:00:00Z",
                "updatedAt": "2025-01-15T08:00:00Z"
            }
        }
