"""
Calculator Request / Response Models

Types used by the fertilizer-cost calculation engine and its API endpoints.
"""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------


class CalculateItem(BaseModel):
    """
    A single crop entry in a calculation request.

    Args:
        plantDataId: References plant_data_enhanced.plantDataId.
        points: Number of irrigation points.
    """

    plantDataId: UUID = Field(..., description="Plant data reference")
    points: int = Field(
        ..., ge=1, le=10_000_000, description="Irrigation points (1 – 10 000 000)"
    )


class CalculateRequest(BaseModel):
    """
    Request body for POST /calculate and POST /export.

    Args:
        items: List of crop + irrigation-points pairs to calculate.
    """

    items: List[CalculateItem] = Field(
        ..., min_length=1, description="Crop entries — at least one item required"
    )


# ---------------------------------------------------------------------------
# Response fragments
# ---------------------------------------------------------------------------


class IngredientResult(BaseModel):
    """
    Calculated quantity + cost for one chemical in a crop.

    Args:
        chemicalId: May be None when no chemical was matched for this ingredient.
        name: Ingredient / chemical name as it appears in the schedule.
        qty: Total quantity needed for all points across the full cycle.
        unit: Unit of the quantity (kg or L after conversion).
        unitPrice: Price per unit in AED (None when source='none').
        totalCost: qty * unitPrice (None when unitPrice is None).
    """

    chemicalId: Optional[UUID] = Field(
        None, description="Matched chemical ID; None if unmatched"
    )
    name: str = Field(..., description="Chemical / ingredient name")
    qty: float = Field(..., ge=0, description="Total quantity needed")
    unit: str = Field(..., description="Unit after conversion (kg or L)")
    unitPrice: Optional[float] = Field(
        None, ge=0, description="AED per unit; None if no price"
    )
    totalCost: Optional[float] = Field(
        None, ge=0, description="qty × unitPrice; None if no price"
    )


class CropResult(BaseModel):
    """
    Calculation result for a single crop item.

    Args:
        plantDataId: Source plant data identifier.
        plantName: Human-readable crop name.
        points: Irrigation points used in the calculation.
        cycleDays: Effective growth cycle length (from growthCycle.totalCycleDays).
        ingredients: Per-chemical breakdown.
        subtotalCost: Sum of ingredient costs; None if any ingredient lacks a price.
    """

    plantDataId: UUID = Field(..., description="Plant data identifier")
    plantName: str = Field(..., description="Crop name")
    points: int = Field(..., ge=1, description="Irrigation points")
    cycleDays: int = Field(..., ge=0, description="Full growth cycle in days")
    ingredients: List[IngredientResult] = Field(
        default_factory=list, description="Per-chemical quantities and costs"
    )
    subtotalCost: Optional[float] = Field(
        None,
        ge=0,
        description="Total cost for this crop; None if any ingredient has no price",
    )


class CalculateResponse(BaseModel):
    """
    Full response from the fertilizer-cost calculator.

    Args:
        perCrop: Per-crop breakdown of ingredients and costs.
        grandTotalCost: Sum across all crops; None if any ingredient has no price.
        warnings: Non-fatal issues (missing schedules, unit mismatches, etc.).
        discoveredChemicals: Chemicals auto-discovered from the plant library
            during this calculation that were not yet in the catalog.
    """

    perCrop: List[CropResult] = Field(default_factory=list)
    grandTotalCost: Optional[float] = Field(
        None, ge=0, description="Grand total; None if any ingredient lacks a price"
    )
    warnings: List[str] = Field(default_factory=list)
    discoveredChemicals: List[dict] = Field(
        default_factory=list,
        description="Newly auto-discovered FertilizerChemical documents",
    )


# ---------------------------------------------------------------------------
# Excel import result
# ---------------------------------------------------------------------------


class SkippedRow(BaseModel):
    """
    A row that was skipped during Excel import.

    Args:
        rowIndex: 0-based row index in the Excel sheet (header = row 0).
        name: The crop name value that was in that row (for diagnostics).
        reason: Why the row was skipped.
    """

    rowIndex: int
    name: str
    reason: str


class ParsedImportItem(BaseModel):
    """A successfully parsed crop entry from an Excel import."""

    plantDataId: UUID
    plantName: str
    points: int


class ParsedImport(BaseModel):
    """
    Result of POST /import.

    Args:
        items: Successfully parsed crop + points entries.
        skipped: Rows that could not be parsed.
        warnings: Non-fatal issues encountered during parsing.
    """

    items: List[ParsedImportItem] = Field(default_factory=list)
    skipped: List[SkippedRow] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
