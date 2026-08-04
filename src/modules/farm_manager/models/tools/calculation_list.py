"""
CalculationList Model

Saved lists of crops + irrigation point counts for the Fertilizer Cost Calculator.
Stored in 'fertilizer_calculation_lists'.
"""

from datetime import datetime
from typing import List
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class CalculationListItem(BaseModel):
    """
    A single entry in a saved calculation list.

    Args:
        plantDataId: References plant_data_enhanced.plantDataId.
        points: Number of irrigation points (drip emitters) for this crop.
    """

    plantDataId: UUID = Field(
        ..., description="References plant_data_enhanced.plantDataId"
    )
    points: int = Field(
        ..., ge=1, le=10_000_000, description="Irrigation points (1 – 10 000 000)"
    )


class CalculationList(BaseModel):
    """
    Saved fertilizer-cost calculation list.

    Args:
        listId: UUID primary key.
        name: Human-readable name for this list.
        items: Ordered set of crop + points pairs.
        organizationId: Owning organisation.
        createdBy: User who created this list.
        createdAt / updatedAt: Audit timestamps.
    """

    listId: UUID = Field(default_factory=uuid4, description="Unique list identifier")
    name: str = Field(..., min_length=1, max_length=200, description="List name")
    items: List[CalculationListItem] = Field(
        default_factory=list, description="Crop entries (plantDataId + points)"
    )

    # Scoping
    organizationId: UUID = Field(..., description="Organisation this list belongs to")

    # Audit
    createdBy: UUID = Field(..., description="User who created this list")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class CalculationListCreate(BaseModel):
    """Schema for creating a saved list."""

    name: str = Field(..., min_length=1, max_length=200)
    items: List[CalculationListItem] = Field(default_factory=list)


class CalculationListUpdate(BaseModel):
    """Schema for partially updating a saved list."""

    name: str | None = Field(None, min_length=1, max_length=200)
    items: List[CalculationListItem] | None = None
