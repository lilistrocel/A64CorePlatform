"""
Stock Inventory Model

Farm stock inventory - harvest data for integration with other modules.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class StockInventoryCreate(BaseModel):
    """Schema for creating stock inventory item"""
    farmId: UUID = Field(..., description="Farm ID")
    plantDataId: UUID = Field(..., description="Plant type")
    plantName: str = Field(..., description="Plant/product name")
    productType: str = Field("fresh", description="Product type (fresh, processed, etc.)")
    totalQuantity: float = Field(..., ge=0, description="Quantity to add")
    unit: str = Field(..., description="Unit of measurement")
    qualityGrade: str = Field(..., description="Quality grade")
    harvestDate: datetime = Field(..., description="Harvest date (for FIFO)")
    expiryDate: Optional[datetime] = Field(None, description="Expected expiry date")
    blockId: UUID = Field(..., description="Source block")
    cycleId: UUID = Field(..., description="Source cycle")
    dailyHarvestId: UUID = Field(..., description="Source daily harvest")


class StockInventoryItem(StockInventoryCreate):
    """Complete stock inventory item with all fields"""
    inventoryId: UUID = Field(default_factory=uuid4, description="Unique inventory item identifier")

    # Quantity tracking
    reservedQuantity: float = Field(0.0, ge=0, description="Quantity reserved for orders")
    availableQuantity: float = Field(..., ge=0, description="Available for sale/use")

    # Integration with other modules
    usedByModules: List[str] = Field(default_factory=list, description="Modules using this inventory")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    lastMovementAt: Optional[datetime] = Field(None, description="Last stock movement")

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "plantDataId": "d1234567-89ab-cdef-0123-456789abcdef",
                "plantName": "Tomato",
                "productType": "fresh",
                "totalQuantity": 45.0,
                "reservedQuantity": 10.0,
                "availableQuantity": 35.0,
                "unit": "kg",
                "qualityGrade": "A",
                "harvestDate": "2025-04-15T08:00:00Z",
                "expiryDate": "2025-04-22T00:00:00Z",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "cycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "dailyHarvestId": "dh1234567-89ab-cdef-0123-456789abcdef",
                "usedByModules": ["sales", "logistics"],
                "createdAt": "2025-04-15T08:30:00Z",
                "updatedAt": "2025-04-16T10:00:00Z",
                "lastMovementAt": "2025-04-16T10:00:00Z"
            }
        }
