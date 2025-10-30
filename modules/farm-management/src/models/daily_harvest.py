"""
Daily Harvest Model

Records daily harvest increments (harvests occur over multiple days).
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class DailyHarvestEntry(BaseModel):
    """Single day's harvest entry for one plant type"""
    plantDataId: UUID = Field(..., description="Plant type harvested")
    plantName: str = Field(..., description="Plant name")
    quantityHarvested: float = Field(..., ge=0, description="Quantity harvested today")
    qualityGrade: Optional[str] = Field(None, description="Quality grade (A, B, C, D)")
    notes: Optional[str] = Field(None, description="Notes for this harvest")


class DailyHarvestCreate(BaseModel):
    """Schema for creating a daily harvest record"""
    cycleId: UUID = Field(..., description="Reference to block cycle")
    plantingId: UUID = Field(..., description="Reference to planting")
    blockId: UUID = Field(..., description="Block harvested")
    harvestDate: datetime = Field(..., description="Date of this harvest")
    entries: List[DailyHarvestEntry] = Field(..., description="Harvest entries by plant type")
    totalQuantity: float = Field(..., ge=0, description="Total quantity harvested today")
    yieldUnit: str = Field(..., description="Unit of yield")
    weatherConditions: Optional[str] = Field(None, description="Weather during harvest")
    notes: Optional[str] = Field(None, description="General notes")


class DailyHarvest(DailyHarvestCreate):
    """Complete daily harvest model with all fields"""
    dailyHarvestId: UUID = Field(default_factory=uuid4, description="Unique daily harvest identifier")
    farmId: UUID = Field(..., description="Farm ID")

    # Harvest information
    harvestedBy: UUID = Field(..., description="User ID who recorded harvest")
    harvestedByEmail: str = Field(..., description="Email of harvester")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "dailyHarvestId": "dh1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "harvestDate": "2025-04-15T08:00:00Z",
                "entries": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantityHarvested": 45.0,
                        "qualityGrade": "A",
                        "notes": "First day harvest, excellent condition"
                    }
                ],
                "totalQuantity": 45.0,
                "yieldUnit": "kg",
                "harvestedBy": "farmer-uuid",
                "harvestedByEmail": "farmer@example.com",
                "weatherConditions": "Sunny, 25°C",
                "notes": "Good harvest day",
                "createdAt": "2025-04-15T08:30:00Z",
                "updatedAt": "2025-04-15T08:30:00Z"
            }
        }
