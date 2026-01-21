"""
Harvest Inventory Model

Represents harvest inventory items in the Sales system.
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class InventoryStatus(str, Enum):
    """Inventory status enumeration"""
    AVAILABLE = "available"
    RESERVED = "reserved"
    SOLD = "sold"
    EXPIRED = "expired"


class InventoryQuality(str, Enum):
    """Inventory quality grade enumeration"""
    A = "A"
    B = "B"
    C = "C"


class InventoryUnit(str, Enum):
    """Inventory unit enumeration"""
    KG = "kg"
    PIECES = "pieces"
    BUNCHES = "bunches"


class HarvestInventoryBase(BaseModel):
    """Base harvest inventory fields"""
    productName: str = Field(..., min_length=1, max_length=200, description="Product name")
    category: str = Field(..., min_length=1, max_length=100, description="Product category")
    farmId: Optional[UUID] = Field(None, description="Farm ID (if applicable)")
    blockId: Optional[UUID] = Field(None, description="Block ID (if applicable)")
    harvestDate: date = Field(..., description="Harvest date")
    quantity: float = Field(..., gt=0, description="Available quantity")
    unit: InventoryUnit = Field(..., description="Unit of measurement")
    quality: InventoryQuality = Field(InventoryQuality.A, description="Quality grade")
    status: InventoryStatus = Field(InventoryStatus.AVAILABLE, description="Inventory status")
    expiryDate: Optional[date] = Field(None, description="Expiry date")
    storageLocation: Optional[str] = Field(None, max_length=200, description="Storage location")


class HarvestInventoryCreate(HarvestInventoryBase):
    """Schema for creating a new inventory item"""
    pass


class HarvestInventoryUpdate(BaseModel):
    """Schema for updating an inventory item"""
    productName: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    farmId: Optional[UUID] = None
    blockId: Optional[UUID] = None
    harvestDate: Optional[date] = None
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[InventoryUnit] = None
    quality: Optional[InventoryQuality] = None
    status: Optional[InventoryStatus] = None
    expiryDate: Optional[date] = None
    storageLocation: Optional[str] = Field(None, max_length=200)


class HarvestInventory(HarvestInventoryBase):
    """Complete harvest inventory model with all fields"""
    inventoryId: UUID = Field(default_factory=uuid4, description="Unique inventory identifier")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this inventory item")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "productName": "Fresh Lettuce",
                "category": "Leafy Greens",
                "farmId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "blockId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                "harvestDate": "2025-01-20",
                "quantity": 100.5,
                "unit": "kg",
                "quality": "A",
                "status": "available",
                "expiryDate": "2025-01-27",
                "storageLocation": "Cold Storage A - Shelf 3",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
