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
    """Schema for creating a new mother plant (product)"""

    pass


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
