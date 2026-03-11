"""
Mushroom Strain Model

Represents a mushroom species/variety with flat growth requirement fields.
Equivalent of Plant Data in the vegetable module.

Field names match the frontend CreateStrainPayload / MushroomStrain interfaces
exactly so no client-side transformation is needed.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4
from enum import Enum
from pydantic import BaseModel, Field


class DifficultyLevel(str, Enum):
    """Growing difficulty level"""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"


# ---------------------------------------------------------------------------
# Supporting classes — kept for potential future use; not used by Strain itself
# ---------------------------------------------------------------------------

class PhaseRequirement(BaseModel):
    """Climate requirements for a specific growth phase (reserved for future use)"""
    tempMin: Optional[float] = Field(None, description="Min temp (Celsius)")
    tempMax: Optional[float] = Field(None, description="Max temp (Celsius)")
    humidityMin: Optional[float] = Field(None, ge=0, le=100)
    humidityMax: Optional[float] = Field(None, ge=0, le=100)
    co2Max: Optional[int] = Field(None, description="Max CO2 (ppm)")
    lightLevel: Optional[str] = Field(None, description="none, low, medium, high")
    durationDaysMin: Optional[int] = Field(None, ge=1)
    durationDaysMax: Optional[int] = Field(None, ge=1)


class SubstrateIngredient(BaseModel):
    """Ingredient in a substrate recipe (reserved for future use)"""
    name: str = Field(..., min_length=1, max_length=100)
    proportion: float = Field(..., ge=0, le=100, description="Percentage of total")
    unit: str = Field("percent", description="Unit of measurement")


# ---------------------------------------------------------------------------
# Strain schemas — flat fields matching the frontend contract
# ---------------------------------------------------------------------------

class StrainBase(BaseModel):
    """Base strain fields shared by create, update, and document models"""

    # Identity
    commonName: str = Field(..., min_length=1, max_length=200, description="Common name (e.g., Oyster Mushroom)")
    scientificName: Optional[str] = Field(None, max_length=200, description="Scientific name")
    species: Optional[str] = Field(None, max_length=100, description="Species (e.g., Pleurotus)")
    description: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=1000)

    # Growing properties
    difficulty: Optional[DifficultyLevel] = Field(None, description="Growing difficulty level")
    expectedYieldKgPerKgSubstrate: Optional[float] = Field(None, gt=0, description="Expected yield kg per kg substrate")
    maxFlushes: Optional[int] = Field(None, ge=1, le=10)

    # Colonization environment
    colonizationTempMin: Optional[float] = Field(None, description="Colonization min temp (Celsius)")
    colonizationTempMax: Optional[float] = Field(None, description="Colonization max temp (Celsius)")
    colonizationHumidityMin: Optional[float] = Field(None, ge=0, le=100, description="Colonization min humidity %")
    colonizationDaysMin: Optional[int] = Field(None, ge=1, description="Min colonization duration (days)")
    colonizationDaysMax: Optional[int] = Field(None, ge=1, description="Max colonization duration (days)")

    # Fruiting environment
    fruitingTempMin: Optional[float] = Field(None, description="Fruiting min temp (Celsius)")
    fruitingTempMax: Optional[float] = Field(None, description="Fruiting max temp (Celsius)")
    fruitingHumidityMin: Optional[float] = Field(None, ge=0, le=100, description="Fruiting min humidity %")
    fruitingDaysMin: Optional[int] = Field(None, ge=1, description="Min fruiting duration (days)")
    fruitingDaysMax: Optional[int] = Field(None, ge=1, description="Max fruiting duration (days)")

    # Air quality
    co2TolerancePpm: Optional[int] = Field(None, ge=0, description="CO2 tolerance (ppm)")


class StrainCreate(StrainBase):
    """Schema for creating a new strain — all non-identity fields optional"""
    pass


class StrainUpdate(BaseModel):
    """Schema for partially updating a strain — all fields optional"""

    # Identity
    commonName: Optional[str] = Field(None, min_length=1, max_length=200)
    scientificName: Optional[str] = Field(None, max_length=200)
    species: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=1000)

    # Growing properties
    difficulty: Optional[DifficultyLevel] = None
    expectedYieldKgPerKgSubstrate: Optional[float] = Field(None, gt=0)
    maxFlushes: Optional[int] = Field(None, ge=1, le=10)

    # Colonization environment
    colonizationTempMin: Optional[float] = None
    colonizationTempMax: Optional[float] = None
    colonizationHumidityMin: Optional[float] = Field(None, ge=0, le=100)
    colonizationDaysMin: Optional[int] = Field(None, ge=1)
    colonizationDaysMax: Optional[int] = Field(None, ge=1)

    # Fruiting environment
    fruitingTempMin: Optional[float] = None
    fruitingTempMax: Optional[float] = None
    fruitingHumidityMin: Optional[float] = Field(None, ge=0, le=100)
    fruitingDaysMin: Optional[int] = Field(None, ge=1)
    fruitingDaysMax: Optional[int] = Field(None, ge=1)

    # Air quality
    co2TolerancePpm: Optional[int] = Field(None, ge=0)

    # Status (only updatable via PATCH)
    isActive: Optional[bool] = None


class Strain(StrainBase):
    """
    Complete strain document model stored in MongoDB.

    The field is named ``id`` to match the frontend MushroomStrain interface.
    The service layer renames id <-> strainId when reading/writing MongoDB.
    """

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique strain ID")

    # Stable defaults for required document fields
    difficulty: DifficultyLevel = Field(DifficultyLevel.INTERMEDIATE)
    maxFlushes: int = Field(4, ge=1, le=10)
    isActive: bool = Field(True)

    # Audit fields
    createdBy: Optional[str] = Field(None, description="User ID who created this strain")
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
