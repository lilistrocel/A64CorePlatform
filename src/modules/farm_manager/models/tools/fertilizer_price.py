"""
Fertilizer Price Models

PriceOverride  — stored in 'fertilizer_price_overrides'.
ResolvedPrice  — transient response model indicating where the price came from.
"""

from datetime import datetime
from typing import Optional, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PriceOverride(BaseModel):
    """
    Per-organisation price override for a chemical.

    Stored in 'fertilizer_price_overrides'.
    Unique index on (chemicalId, organizationId) ensures one active override
    per chemical per organisation at all times.

    Args:
        overrideId: UUID primary key.
        chemicalId: References fertilizer_chemicals.chemicalId.
        price: Price in AED per chemical.defaultUnit.
        organizationId: Owning organisation.
        updatedBy: Last user to write this override.
        updatedAt: Timestamp of last write.
    """

    overrideId: UUID = Field(default_factory=uuid4, description="Unique override identifier")
    chemicalId: UUID = Field(..., description="References fertilizer_chemicals.chemicalId")
    price: float = Field(..., ge=0, description="Price in AED per defaultUnit")

    # Scoping
    organizationId: UUID = Field(..., description="Organisation this override belongs to")

    # Audit
    updatedBy: UUID = Field(..., description="User who last updated this override")
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class ResolvedPrice(BaseModel):
    """
    Transient model returned by PriceBook.resolve_prices().

    Indicates the price of a chemical and where it came from:
    - 'override' : a fertilizer_price_overrides record was found.
    - 'inventory': an inventory_input (category=fertilizer) record matched.
    - 'none'     : no price could be determined.

    Args:
        chemicalId: The chemical this price resolves to.
        price: AED per defaultUnit, or None when source='none'.
        source: Price provenance.
    """

    chemicalId: UUID = Field(..., description="Chemical identifier")
    price: Optional[float] = Field(None, ge=0, description="Price in AED per defaultUnit")
    source: Literal["override", "inventory", "none"] = Field(
        ...,
        description="Where the price was resolved from"
    )
