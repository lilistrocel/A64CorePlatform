"""
Plant Mother Model (Plant Library Phase 1)

Represents the "mother plant" — the product/SKU level of the two-level
Plant Library hierarchy introduced in Phase 1:

    mother (plant_mothers, this model)   = the product/SKU. Harvest,
        inventory, and sales roll up here, so it is one "Cabbage" product
        rather than one per variety.
    variety (plant_data_enhanced)        = the cultivation recipe. A block
        is planted with a variety and reads ALL growing data (density,
        fertigation, yield, waste %) from it. UNCHANGED in meaning by this
        phase — see plant_data_enhanced.py's new motherPlantId/varietyName
        fields for the link back to its mother.

This phase is model + migration only (see
scripts/migrations/plant_library_mother_variety_migration.py for the
backfill). No CRUD API routes are built on top of this model yet — that is
future work; PlantMotherRepository below is a minimal skeleton so the
`plant_mothers` collection exists, is indexed, and is queryable in the
meantime.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

from .plant_data_enhanced import PlantDataEnhancedBase

# Reused EXACTLY as it is used elsewhere in this module (see
# plant_data_enhanced.py's `tags` field and the tag->plantType inference in
# the Phase 1 migration script) — not a new vocabulary.
PlantMotherTypeLiteral = Literal[
    "crop", "tree", "herb", "fruit", "vegetable", "ornamental", "medicinal"
]


# ==================== Stage 1: products[] (Plant Library product extension) ====================
#
# See Docs/2-Working-Progress/plant-library-product-extension-design.md §4.1.
# A mother (product/SKU) carries a list of the concrete products it can
# yield — e.g. "Capsicum" yields "Green Capsicum" (sellable), "Capsicum
# Puree" (process), "Capsicum Trim" (waste). Later stages route harvest
# lines by category; see the design doc §3.1 for why `process`/`waste`
# lines must NEVER become `block_harvests` rows.


class ProductUnit(str, Enum):
    """
    Unit of measure for a product. Deliberately a real enum with a single
    member today (kg) rather than a bare string/constant — a future
    animal-husbandry module adds a member here (e.g. head, litre) rather
    than backfilling every existing harvest row with a unit it never
    recorded.
    """

    KG = "kg"


class ProductCategory(str, Enum):
    """
    Fixed vocabulary — no user-created categories (design doc §2). Governs
    which destination a harvest line for this product routes to in later
    stages: sellable -> block_harvests, process -> processing inventory,
    waste -> inventory_waste. See design doc §3.1 for why sellable is the
    ONLY category that may ever produce a block_harvests row.
    """

    SELLABLE = "sellable"
    PROCESS = "process"
    WASTE = "waste"


class PlantProductBase(BaseModel):
    """Base product fields shared by create/full models."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Product name, unique within the mother (case-insensitive comparison)",
    )
    unit: ProductUnit = Field(
        ProductUnit.KG, description="Unit of measure — kg is the only member today"
    )
    category: ProductCategory = Field(
        ..., description="Routing category: sellable | process | waste"
    )


class PlantProductCreate(PlantProductBase):
    """Schema for adding a new product to a mother."""

    pass


class PlantProductUpdate(BaseModel):
    """
    Schema for updating an existing product. `unit` is deliberately not
    editable here — it is not part of this stage's update surface (see
    design doc §4.1; a future stage may reconsider once a second unit
    exists). `productId` is immutable and never reused.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[ProductCategory] = None
    isActive: Optional[bool] = Field(
        None, description="Deactivating hides the product from picklists without removing it"
    )


class PlantProduct(PlantProductBase):
    """
    Complete product record, embedded in PlantMother.products[]. Deletion
    is deactivation only (isActive=False) — never removed from the array —
    following the mother-delete precedent (refuse/deactivate, don't
    cascade), so later stages that reference productId by harvest rows
    need no migration once that lands.
    """

    productId: UUID = Field(
        default_factory=uuid4,
        description="Stable product identifier (UUID); never reused",
    )
    isActive: bool = Field(True, description="Whether this product is active")


class PlantMotherBase(BaseModel):
    """Base mother-plant (product) fields"""

    plantName: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Common product name (e.g. 'Cabbage') — what harvest/inventory/sales roll up to",
    )
    scientificName: Optional[str] = Field(None, description="Scientific species name")
    plantType: PlantMotherTypeLiteral = Field(
        "crop",
        description="Product classification (crop, tree, herb, fruit, vegetable, ornamental, medicinal)",
    )


class PlantMotherCreate(PlantMotherBase):
    """
    Schema for creating a new mother plant (product).

    `products` is optional — a client may supply an initial picklist in the
    same request (e.g. the products-editor's create-mode draft list), or
    omit it entirely and add products afterwards via
    `POST /plant-mothers/{id}/products`. Either way, the server enforces the
    "at least one active sellable product" invariant (see
    PlantMotherService._ensure_active_sellable_default / design doc §"new
    invariant") on the created mother: if the resulting products list has no
    active `sellable` entry — because none were supplied, or only
    `process`/`waste` ones were — the server auto-adds one named after
    `plantName` before returning. Each supplied product gets its own random
    `productId` (same as `POST .../products`); only the server's own
    auto-added default uses the deterministic id scheme.
    """

    products: List[PlantProductCreate] = Field(
        default_factory=list,
        description=(
            "Optional initial products for this mother. The server "
            "guarantees at least one active sellable product exists after "
            "creation — it auto-adds a default one if this list has none."
        ),
    )


class PlantMotherUpdate(BaseModel):
    """Schema for updating a mother plant (product) — all fields optional"""

    plantName: Optional[str] = Field(None, min_length=1, max_length=200)
    scientificName: Optional[str] = None
    plantType: Optional[PlantMotherTypeLiteral] = None
    isActive: Optional[bool] = Field(
        None, description="Whether this product is active"
    )


class PlantMother(PlantMotherBase):
    """Complete mother plant (product) model with metadata"""

    # Unique identifier (UUID for security)
    plantMotherId: UUID = Field(
        default_factory=uuid4,
        description="Unique mother plant (product) identifier (UUID)",
    )

    # Active status
    isActive: bool = Field(
        True, description="Whether this product is active"
    )

    # Products this mother can yield (Stage 1 — see module docstring section
    # above). Embedded, not a separate collection: products are meaningless
    # outside their mother, and the mother is already the product/SKU level.
    products: List[PlantProduct] = Field(
        default_factory=list, description="Products this mother yields"
    )

    # Multi-industry scoping
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    # Audit fields
    # Reason: Optional (unlike PlantDataEnhanced.createdBy, which is
    # required) — Phase 1 populates this collection entirely from the
    # migration script, which has no acting user. A future CRUD API can
    # require it on its own Create schema without touching this field's
    # optionality here.
    createdBy: Optional[UUID] = Field(
        None, description="User ID who created this product (None for migration-created records)"
    )
    createdByEmail: Optional[str] = Field(
        None, description="Email of creator for audit trail (None for migration-created records)"
    )
    createdAt: datetime = Field(
        default_factory=datetime.utcnow, description="Creation timestamp (UTC)"
    )
    updatedAt: datetime = Field(
        default_factory=datetime.utcnow, description="Last update timestamp (UTC)"
    )

    # Soft delete support
    deletedAt: Optional[datetime] = Field(
        None, description="Soft delete timestamp (UTC)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "plantMotherId": "m1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Cabbage",
                "scientificName": "Brassica oleracea",
                "plantType": "vegetable",
                "isActive": True,
                "createdAt": "2026-08-07T10:00:00Z",
                "updatedAt": "2026-08-07T10:00:00Z",
                "deletedAt": None,
            }
        }


# ==================== Phase 2: API composite/response models ====================


class PlantMotherWithVarietyCount(PlantMother):
    """
    Mother plant annotated with its active variety count — the shape
    returned by GET /plant-mothers (list). varietyCount is computed by
    PlantMotherRepository.list_mothers, not stored on the document.
    """

    varietyCount: int = Field(
        0, description="Count of active (isActive, non-deleted) varieties under this mother"
    )


class VarietySummary(BaseModel):
    """
    Lightweight variety reference embedded in GET /plant-mothers/{id}
    (mother detail) — enough to link to/identify a variety without
    duplicating its full plant_data_enhanced payload.
    """

    plantDataId: UUID = Field(..., description="Variety's plant_data_enhanced.plantDataId")
    varietyName: Optional[str] = Field(None, description="Variety display name")
    isActive: bool = Field(True, description="Whether this variety is active")


class PlantMotherWithVarieties(PlantMother):
    """
    Mother plant with its active varieties embedded — the shape returned by
    GET /plant-mothers/{id} (detail).
    """

    varieties: List[VarietySummary] = Field(
        default_factory=list, description="Active varieties under this mother"
    )


class VarietyCreateForMother(PlantDataEnhancedBase):
    """
    Request body for POST /plant-mothers/{motherPlantId}/varieties.

    Same detailed cultivation fields as PlantDataEnhancedCreate (reuses
    PlantDataEnhancedBase directly — "detailed plant-data fields... EXCEPT
    the basic info"), except plantName/scientificName are inherited from
    the mother (the path parameter identifies which mother) and are
    therefore optional here and always ignored/overridden by
    PlantMotherService.create_variety_for_mother — the client does not need
    to (and cannot) set them. varietyName is the one new required field:
    the variety's own display name within its mother (e.g. 'Cherry',
    'Roma'), unique per mother.
    """

    plantName: Optional[str] = Field(
        None,
        description="Ignored — inherited from the mother product identified by the URL path",
    )
    scientificName: Optional[str] = Field(
        None,
        description="Ignored — inherited from the mother product identified by the URL path",
    )
    varietyName: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name for this cultivation recipe within its mother's varieties (e.g. 'Cherry', 'Roma')",
    )
