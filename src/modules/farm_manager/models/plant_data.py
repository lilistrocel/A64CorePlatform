"""
Plant Data Model

Defines plant cultivation requirements and characteristics.
"""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

# Import spacing category from spacing_standards module
from .spacing_standards import SpacingCategory


class PlantDataBase(BaseModel):
    """Base plant data fields"""
    # Identification
    plantName: str = Field(..., min_length=1, max_length=200, description="Common plant name")
    scientificName: Optional[str] = Field(None, description="Scientific name")
    plantType: str = Field(..., description="Plant type (Crop, Tree, Herb, etc.)")

    # Growth cycle
    growthCycleDays: int = Field(..., gt=0, description="Days from planting to harvest")

    # Environmental requirements
    minTemperatureCelsius: Optional[float] = Field(None, description="Minimum temperature")
    maxTemperatureCelsius: Optional[float] = Field(None, description="Maximum temperature")
    optimalPHMin: Optional[float] = Field(None, ge=0, le=14, description="Optimal soil pH minimum")
    optimalPHMax: Optional[float] = Field(None, ge=0, le=14, description="Optimal soil pH maximum")

    # Care requirements
    wateringFrequencyDays: Optional[int] = Field(None, gt=0, description="Days between watering")
    sunlightHoursDaily: Optional[str] = Field(None, description="Daily sunlight hours (e.g. '6-8')")

    # Yield information
    expectedYieldPerPlant: float = Field(..., gt=0, description="Expected yield per plant")
    yieldUnit: str = Field(..., description="Unit of yield (kg, lbs, units)")

    # Spacing category for density calculations
    spacingCategory: Optional[SpacingCategory] = Field(
        None,
        description="Spacing category for plant density calculations (xs, s, m, l, xl, bush, large_bush, small_tree, medium_tree, large_tree)"
    )

    # Additional information
    notes: Optional[str] = Field(None, description="Additional cultivation notes")
    tags: Optional[List[str]] = Field(None, description="Search tags")


class PlantDataCreate(PlantDataBase):
    """Schema for creating new plant data"""
    pass


class PlantDataUpdate(BaseModel):
    """Schema for updating plant data"""
    plantName: Optional[str] = Field(None, min_length=1, max_length=200)
    scientificName: Optional[str] = None
    plantType: Optional[str] = None
    growthCycleDays: Optional[int] = Field(None, gt=0)
    minTemperatureCelsius: Optional[float] = None
    maxTemperatureCelsius: Optional[float] = None
    optimalPHMin: Optional[float] = Field(None, ge=0, le=14)
    optimalPHMax: Optional[float] = Field(None, ge=0, le=14)
    wateringFrequencyDays: Optional[int] = Field(None, gt=0)
    sunlightHoursDaily: Optional[str] = None
    expectedYieldPerPlant: Optional[float] = Field(None, gt=0)
    yieldUnit: Optional[str] = None
    spacingCategory: Optional[SpacingCategory] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class PlantData(PlantDataBase):
    """Complete plant data model with all fields"""
    plantDataId: UUID = Field(default_factory=uuid4, description="Unique plant data identifier")

    # Versioning (for frozen data on planting)
    dataVersion: int = Field(1, description="Data version number")

    # Metadata
    createdBy: UUID = Field(..., description="User ID who created this data")
    createdByEmail: str = Field(..., description="Email of creator")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Tomato",
                "scientificName": "Solanum lycopersicum",
                "plantType": "Crop",
                "growthCycleDays": 90,
                "minTemperatureCelsius": 15.0,
                "maxTemperatureCelsius": 30.0,
                "optimalPHMin": 6.0,
                "optimalPHMax": 6.8,
                "wateringFrequencyDays": 3,
                "sunlightHoursDaily": "6-8",
                "expectedYieldPerPlant": 5.0,
                "yieldUnit": "kg",
                "spacingCategory": "l",
                "notes": "Requires staking, prune suckers",
                "tags": ["vegetable", "fruit", "summer"],
                "dataVersion": 1,
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdByEmail": "agronomist@example.com",
                "createdAt": "2025-01-10T10:00:00Z",
                "updatedAt": "2025-01-10T10:00:00Z"
            }
        }
