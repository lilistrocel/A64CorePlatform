"""
FertilizerChemical Model

Master catalog of chemicals used in fertigation schedules.
Each chemical has a canonical name, optional aliases, a category, and a
default pricing unit (kg or L).  Chemicals are soft-deleted via archivedAt.
"""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

from ..plant_data_enhanced import IngredientCategoryEnum


class FertilizerChemical(BaseModel):
    """
    Complete FertilizerChemical document stored in 'fertilizer_chemicals'.

    Args:
        chemicalId: UUID primary key.
        name: Canonical chemical name — unique per org (case-insensitive, non-archived).
        aliases: Alternative names used in fertigation schedules for matching.
        category: Ingredient category (from IngredientCategoryEnum).
        defaultUnit: Pricing unit; 'kg' for solids, 'L' for liquids.
        notes: Free-text notes for agronomists.
        archivedAt: Soft-delete timestamp; None means active.
        organizationId: Owning organisation.
        createdBy: User who created this record.
        createdAt / updatedAt: Audit timestamps.
    """

    chemicalId: UUID = Field(
        default_factory=uuid4, description="Unique chemical identifier"
    )
    name: str = Field(..., min_length=1, max_length=128, description="Canonical name")
    aliases: List[str] = Field(
        default_factory=list,
        max_length=20,
        description="Alternative names for schedule matching (max 20)",
    )
    category: IngredientCategoryEnum = Field(
        IngredientCategoryEnum.OTHER, description="Ingredient category"
    )
    defaultUnit: Literal["kg", "L"] = Field(
        "kg", description="Pricing unit: 'kg' for solids, 'L' for liquids"
    )
    notes: Optional[str] = Field(None, description="Optional notes")

    # Lifecycle
    archivedAt: Optional[datetime] = Field(
        None, description="Soft-delete timestamp; None means active"
    )

    # Scoping
    organizationId: UUID = Field(
        ..., description="Organisation this chemical belongs to"
    )

    # Audit
    createdBy: UUID = Field(..., description="User who created this record")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("aliases", mode="before")
    @classmethod
    def _validate_aliases(cls, v: list) -> list:
        """
        Strip whitespace from each alias and reject blanks.

        Args:
            v: Raw alias list.

        Returns:
            Cleaned alias list.

        Raises:
            ValueError: If any alias is blank after stripping.
        """
        cleaned = []
        for alias in v:
            stripped = str(alias).strip()
            if not stripped:
                raise ValueError("Alias must not be blank after stripping whitespace")
            if len(stripped) > 128:
                raise ValueError(f"Alias exceeds 128 characters: {stripped[:20]}...")
            cleaned.append(stripped)
        return cleaned


class ChemicalCreate(BaseModel):
    """
    Schema for creating a new FertilizerChemical.

    organizationId and createdBy are injected from the auth context in the
    service layer — callers must NOT pass them in the request body.
    """

    name: str = Field(..., min_length=1, max_length=128)
    aliases: List[str] = Field(default_factory=list, max_length=20)
    category: IngredientCategoryEnum = Field(IngredientCategoryEnum.OTHER)
    defaultUnit: Literal["kg", "L"] = Field("kg")
    notes: Optional[str] = Field(None)

    @field_validator("aliases", mode="before")
    @classmethod
    def _validate_aliases(cls, v: list) -> list:
        """Strip and validate aliases."""
        cleaned = []
        for alias in v:
            stripped = str(alias).strip()
            if not stripped:
                raise ValueError("Alias must not be blank")
            if len(stripped) > 128:
                raise ValueError(f"Alias exceeds 128 characters")
            cleaned.append(stripped)
        return cleaned


class ChemicalUpdate(BaseModel):
    """
    Schema for partially updating a FertilizerChemical.

    All fields are optional — only provided fields are written.
    To archive a chemical use DELETE /{chemicalId}.
    To unarchive (restore) a chemical, PATCH with archivedAt=null.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=128)
    aliases: Optional[List[str]] = Field(None, max_length=20)
    category: Optional[IngredientCategoryEnum] = None
    defaultUnit: Optional[Literal["kg", "L"]] = None
    notes: Optional[str] = None
    # Reason: repository checks 'archivedAt' in data.model_fields_set to distinguish
    # "caller explicitly sent archivedAt: null (unarchive)" from "caller omitted the field".
    # Default None means the field is omitted from model_fields_set when not provided.
    archivedAt: Optional[datetime] = Field(
        default=None,
        description=(
            "Set to null to unarchive (restore) a soft-deleted chemical. "
            "Set to a timestamp to manually archive. "
            "Omit the field entirely to leave the current value unchanged."
        ),
    )

    @field_validator("aliases", mode="before")
    @classmethod
    def _validate_aliases(cls, v: Optional[list]) -> Optional[list]:
        """Strip and validate aliases when provided."""
        if v is None:
            return v
        cleaned = []
        for alias in v:
            stripped = str(alias).strip()
            if not stripped:
                raise ValueError("Alias must not be blank")
            if len(stripped) > 128:
                raise ValueError("Alias exceeds 128 characters")
            cleaned.append(stripped)
        return cleaned
