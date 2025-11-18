"""
Harvest Model

Final harvest summary (aggregated from daily harvests).
Legacy model - kept for backward compatibility and reporting.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class HarvestEntry(BaseModel):
    """Aggregated harvest record for one plant type"""
    plantDataId: UUID = Field(..., description="Plant type harvested")
    plantName: str = Field(..., description="Plant name")
    quantityHarvested: float = Field(..., ge=0, description="Total quantity harvested")
    qualityGrade: Optional[str] = Field(None, description="Overall quality grade (A, B, C)")
    notes: Optional[str] = Field(None, description="Harvest notes")


class Harvest(BaseModel):
    """Complete harvest summary model"""
    harvestId: UUID = Field(default_factory=uuid4, description="Unique harvest identifier")
    plantingId: UUID = Field(..., description="Reference to planting")
    blockId: UUID = Field(..., description="Block harvested")
    farmId: UUID = Field(..., description="Farm ID")
    cycleId: UUID = Field(..., description="Block cycle ID")

    # Harvest details (aggregated from daily harvests)
    entries: List[HarvestEntry] = Field(..., description="Harvest entries by plant type")
    totalQuantity: float = Field(..., ge=0, description="Total quantity harvested")
    yieldUnit: str = Field(..., description="Unit of yield")

    # Comparison with prediction
    predictedYield: float = Field(..., description="Originally predicted yield")
    yieldEfficiency: float = Field(..., description="Actual/Predicted ratio (percentage)")

    # Harvest information
    harvestedBy: UUID = Field(..., description="User ID who ended harvest")
    harvestedByEmail: str = Field(..., description="Email of harvester")
    harvestStartDate: datetime = Field(..., description="When harvesting started")
    harvestEndDate: datetime = Field(..., description="When harvesting ended")
    totalHarvestDays: int = Field(..., gt=0, description="Number of days harvested")

    # Additional information
    notes: Optional[str] = Field(None, description="General harvest notes")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "harvestId": "h1234567-89ab-cdef-0123-456789abcdef",
                "plantingId": "p1234567-89ab-cdef-0123-456789abcdef",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "entries": [
                    {
                        "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Tomato",
                        "quantityHarvested": 240.0,
                        "qualityGrade": "A",
                        "notes": "Excellent quality"
                    },
                    {
                        "plantDataId": "d2234567-89ab-cdef-0123-456789abcdef",
                        "plantName": "Basil",
                        "quantityHarvested": 14.0,
                        "qualityGrade": "A",
                        "notes": "Aromatic"
                    }
                ],
                "totalQuantity": 254.0,
                "yieldUnit": "kg",
                "predictedYield": 265.0,
                "yieldEfficiency": 95.8,
                "harvestedBy": "farmer-uuid",
                "harvestedByEmail": "farmer@example.com",
                "harvestStartDate": "2025-04-15T06:00:00Z",
                "harvestEndDate": "2025-04-20T18:00:00Z",
                "totalHarvestDays": 5,
                "notes": "Overall excellent harvest, slight delay due to rain",
                "createdAt": "2025-04-20T18:30:00Z",
                "updatedAt": "2025-04-20T18:30:00Z"
            }
        }
