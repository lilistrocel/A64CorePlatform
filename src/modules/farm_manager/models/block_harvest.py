"""
Block Harvest Model

Represents individual harvest events for blocks (daily harvests).

Plant Library product extension Stage 3 (see
Docs/2-Working-Progress/plant-library-product-extension-design.md §3/§4.2):
`block_harvests` is the SELLABLE ledger only — every row here is (and must
stay) sellable by construction. productId/productName/harvestBatchId below
are optional, additive fields so the 13,947 pre-existing legacy rows keep
nulls and are not backfilled. `productName` is a FROZEN SNAPSHOT taken at
harvest time (mirrors `block_archives.targetCropName`) — a later product
rename must never rewrite history here.
"""

from datetime import date, datetime
from typing import Literal, Optional, List, Union, Any
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class QualityGrade(str, Enum):
    """Quality grade enumeration"""

    A = "A"
    B = "B"
    C = "C"


class BlockHarvestBase(BaseModel):
    """Base block harvest fields"""

    harvestDate: datetime = Field(..., description="When harvest occurred")
    quantityKg: float = Field(..., gt=0, description="Quantity harvested in kilograms")
    qualityGrade: QualityGrade = Field(..., description="Quality grade (A/B/C)")
    notes: Optional[str] = Field(None, description="Optional harvest notes")
    farmingYear: Optional[int] = Field(
        None,
        description="Farming year (auto-calculated from harvestDate if not provided)",
    )


class BlockHarvestCreate(BlockHarvestBase):
    """Schema for recording a new harvest"""

    blockId: UUID = Field(..., description="Block where harvest occurred")


class BlockHarvestUpdate(BaseModel):
    """Schema for updating a harvest record"""

    quantityKg: Optional[float] = Field(None, gt=0)
    qualityGrade: Optional[QualityGrade] = None
    notes: Optional[str] = None


class HarvestMetadata(BaseModel):
    """Optional metadata for harvest records (e.g., from migrations)"""

    migratedFrom: Optional[str] = None
    migratedAt: Optional[Union[str, datetime]] = None  # Accept both string and datetime
    recordedByMigratedAt: Optional[Union[str, datetime]] = (
        None  # From recordedBy fix migration
    )
    oldRef: Optional[str] = None
    oldFarmBlockRef: Optional[str] = None
    harvestSeason: Optional[int] = None
    viewingYear: Optional[int] = None
    crop: Optional[str] = None
    mainBlock: Optional[str] = None
    legacyBlockCode: Optional[str] = None  # From field rename migration
    season: Optional[Union[str, int]] = (
        None  # Accept both string and int from legacy data
    )

    class Config:
        extra = "allow"  # Allow additional fields


class BlockHarvest(BlockHarvestBase):
    """Complete block harvest model"""

    harvestId: UUID = Field(
        default_factory=uuid4, description="Unique harvest identifier"
    )
    blockId: UUID = Field(..., description="Block where harvest occurred")
    farmId: UUID = Field(..., description="Farm reference")

    # Recorded by
    recordedBy: UUID = Field(..., description="User ID who recorded harvest")
    recordedByEmail: str = Field(..., description="Email of user who recorded harvest")

    # Product reference (Plant Library product extension Stage 3). Optional —
    # null on all 13,947 legacy rows and on any harvest recorded through the
    # single-line endpoint without a product line. Never backfilled.
    productId: Optional[UUID] = Field(
        None, description="Sellable PlantProduct this harvest line records"
    )
    productName: Optional[str] = Field(
        None,
        description=(
            "FROZEN snapshot of the product's name at harvest time — NOT "
            "synced when the product is later renamed. Anything needing the "
            "current name joins on productId."
        ),
    )
    harvestBatchId: Optional[UUID] = Field(
        None,
        description=(
            "Groups every line (sellable/process/waste) from one multi-line "
            "harvest submission. Null on legacy rows and single-line harvests."
        ),
    )

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)

    # Optional metadata (for migrated data)
    metadata: Optional[HarvestMetadata] = Field(
        None, description="Additional metadata from migrations"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "harvestId": "h1a2b3c4-d5e6-7890-abcd-ef1234567890",
                "blockId": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "harvestDate": "2025-11-12T08:00:00Z",
                "quantityKg": 45.5,
                "qualityGrade": "A",
                "farmingYear": 2025,
                "notes": "Excellent quality tomatoes, perfect ripeness",
                "recordedBy": "user-uuid-here",
                "recordedByEmail": "farmer@example.com",
                "createdAt": "2025-11-12T08:15:00Z",
            }
        }


class BlockHarvestListResponse(BaseModel):
    """Response for list of harvests"""

    data: List[BlockHarvest]
    total: int
    page: int
    perPage: int
    totalPages: int


class BlockHarvestResponse(BaseModel):
    """Response for single harvest"""

    data: BlockHarvest
    message: Optional[str] = None


class BlockHarvestSummary(BaseModel):
    """Harvest summary for a block"""

    blockId: UUID
    totalHarvests: int
    totalQuantityKg: float
    qualityAKg: float
    qualityBKg: float
    qualityCKg: float
    averageQualityGrade: str
    firstHarvestDate: Optional[datetime]
    lastHarvestDate: Optional[datetime]


# ============================================================================
# Multi-line harvest batch submission (Plant Library product extension
# Stage 3 — design doc §5). One submission -> N product lines, each routed
# by its product's category (sellable -> block_harvests, process ->
# processing_inventory, waste -> inventory_waste directly), all sharing one
# server-generated harvestBatchId. See design doc §3.1 for why this routing
# is structural rather than a category filter on block_harvests.
# ============================================================================


class HarvestBatchLineCreate(BaseModel):
    """One product line in a multi-line harvest submission."""

    productId: UUID = Field(
        ..., description="Product from the block's mother — must belong to it"
    )
    quantity: float = Field(
        ..., gt=0, description="Quantity in the product's unit (kg)"
    )
    qualityGrade: Optional[QualityGrade] = Field(
        None,
        description=(
            "Required for sellable/process lines; must be omitted for waste "
            "lines (harvest waste is not graded) — a waste line supplying a "
            "grade is rejected (422)."
        ),
    )
    notes: Optional[str] = Field(None, max_length=1000)


class HarvestBatchSubmitRequest(BaseModel):
    """Request body for POST .../harvests/batch — one multi-line submission."""

    harvestDate: datetime = Field(..., description="When harvest occurred")
    lines: List[HarvestBatchLineCreate] = Field(
        ..., min_length=1, description="At least one product line"
    )
    farmingYear: Optional[int] = Field(
        None, description="Farming year (auto-calculated from harvestDate if omitted)"
    )


class HarvestBatchLineResult(BaseModel):
    """Where one submitted line ended up."""

    productId: UUID
    productName: str
    category: Literal["sellable", "process", "waste"]
    destination: Literal["block_harvests", "processing_inventory", "inventory_waste"]
    recordId: UUID = Field(
        ..., description="harvestId / processingInventoryId / wasteId, per destination"
    )
    quantity: float
    qualityGrade: Optional[str] = None


class HarvestBatchSubmitResponse(BaseModel):
    """Response for a completed multi-line harvest submission."""

    harvestBatchId: UUID
    blockId: UUID
    harvestDate: datetime
    lines: List[HarvestBatchLineResult]


# ============================================================================
# Batch lookup (design doc §7) — given a block + harvest date, unions the
# three destinations so a mixed submission can be reviewed/edited as a unit.
# The default harvest list (GET .../harvests) is UNCHANGED and stays
# block_harvests-only (sellable rows).
# ============================================================================


class HarvestBatchLookupLine(BaseModel):
    """One line from any of the three destinations, normalized for display."""

    destination: Literal["block_harvests", "processing_inventory", "inventory_waste"]
    category: Literal["sellable", "process", "waste"]
    recordId: UUID
    productId: Optional[UUID] = None
    productName: Optional[str] = None
    quantity: float
    unit: str = "kg"
    qualityGrade: Optional[str] = None
    harvestBatchId: Optional[UUID] = None


class HarvestBatchGroup(BaseModel):
    """Lines sharing one harvestBatchId (or, for legacy rows, one recordId)."""

    harvestBatchId: Optional[UUID] = None
    lines: List[HarvestBatchLookupLine]


class HarvestBatchLookupResponse(BaseModel):
    """Response for GET .../harvests/batch-lookup."""

    blockId: UUID
    harvestDate: date
    batches: List[HarvestBatchGroup]
