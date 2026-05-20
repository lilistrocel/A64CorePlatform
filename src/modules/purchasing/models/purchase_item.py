"""
Purchasing Module — Purchase Item Pydantic Models

Defines the purchase item master document shape for the MongoDB
`purchase_items` collection.  This is a NEW collection for items
we buy — it does NOT touch plant_data_enhanced, inventory_input,
inventory_harvest, or fertilizer_chemicals.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Input models
# ---------------------------------------------------------------------------


class PurchaseItemCreate(BaseModel):
    """
    Request model for creating a purchase item.

    Args:
        organizationId: Owning organisation UUID.
        itemCode: Optional — auto-generated if omitted.
        name: Item display name.
        itemType: Classification of the item.
        uom: Unit of measure string.
        ...other optional fields.
    """

    organizationId: str
    itemCode: Optional[str] = Field(None, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    itemType: Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]
    uom: str = Field(..., min_length=1, max_length=20)
    description: Optional[str] = None
    defaultWarehouseId: Optional[str] = Field(None, max_length=100)
    defaultUnitCost: Optional[Decimal] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)


class PurchaseItemUpdate(BaseModel):
    """
    Request model for partial purchase item update.

    All fields optional — only supplied fields are updated.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    itemType: Optional[Literal["raw_material", "consumable", "service", "fixed_asset_acquisition"]] = None
    uom: Optional[str] = Field(None, min_length=1, max_length=20)
    description: Optional[str] = None
    defaultWarehouseId: Optional[str] = Field(None, max_length=100)
    defaultUnitCost: Optional[Decimal] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    isActive: Optional[bool] = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PurchaseItemResponse(BaseModel):
    """
    Purchase item response model.

    Serialised from MongoDB document. Never exposes raw _id.
    """

    itemId: str
    organizationId: str
    itemCode: str
    name: str
    itemType: str
    uom: str
    description: Optional[str] = None
    defaultWarehouseId: Optional[str] = None
    defaultUnitCost: Optional[Decimal] = None
    barcode: Optional[str] = None
    manufacturer: Optional[str] = None
    isActive: bool
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None

    class Config:
        """Pydantic config."""

        from_attributes = True
