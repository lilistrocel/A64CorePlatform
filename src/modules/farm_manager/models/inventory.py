"""
Inventory Models

Comprehensive inventory management system with three distinct inventory types:
1. Harvest Inventory - Harvested plants for sale
2. Input Inventory - Fertilizers, pesticides, seedlings, seeds, soils, etc.
3. Asset Inventory - Tractors, machinery, infrastructure, tools
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from enum import Enum
from pydantic import BaseModel, Field


# ============================================================================
# ENUMS
# ============================================================================

class InventoryType(str, Enum):
    """Main inventory categories"""
    HARVEST = "harvest"
    INPUT = "input"
    ASSET = "asset"


class HarvestProductType(str, Enum):
    """Types of harvested products"""
    FRESH = "fresh"
    PROCESSED = "processed"
    DRIED = "dried"
    FROZEN = "frozen"
    PACKAGED = "packaged"


class InputCategory(str, Enum):
    """Categories of input items"""
    FERTILIZER = "fertilizer"
    PESTICIDE = "pesticide"
    HERBICIDE = "herbicide"
    FUNGICIDE = "fungicide"
    SEED = "seed"
    SEEDLING = "seedling"
    SOIL = "soil"
    SUBSTRATE = "substrate"
    NUTRIENT_SOLUTION = "nutrient_solution"
    GROWTH_REGULATOR = "growth_regulator"
    PACKAGING = "packaging"
    OTHER = "other"


class AssetCategory(str, Enum):
    """Categories of farm assets"""
    TRACTOR = "tractor"
    HARVESTER = "harvester"
    IRRIGATION_SYSTEM = "irrigation_system"
    GREENHOUSE = "greenhouse"
    STORAGE_FACILITY = "storage_facility"
    VEHICLE = "vehicle"
    TOOL = "tool"
    EQUIPMENT = "equipment"
    INFRASTRUCTURE = "infrastructure"
    SENSOR = "sensor"
    OTHER = "other"


class AssetStatus(str, Enum):
    """Status of farm assets"""
    OPERATIONAL = "operational"
    MAINTENANCE = "maintenance"
    REPAIR = "repair"
    DECOMMISSIONED = "decommissioned"
    STORED = "stored"


class QualityGrade(str, Enum):
    """Quality grades for harvest"""
    PREMIUM = "premium"
    GRADE_A = "grade_a"
    GRADE_B = "grade_b"
    GRADE_C = "grade_c"
    PROCESSING = "processing"
    REJECTED = "rejected"


class MovementType(str, Enum):
    """Types of inventory movements"""
    ADDITION = "addition"
    REMOVAL = "removal"
    ADJUSTMENT = "adjustment"
    TRANSFER = "transfer"
    SALE = "sale"
    WASTE = "waste"
    USAGE = "usage"
    RETURN = "return"


# ============================================================================
# HARVEST INVENTORY (Harvested Plants for Sale)
# ============================================================================

class HarvestInventoryBase(BaseModel):
    """Base schema for harvest inventory"""
    farmId: UUID = Field(..., description="Farm this inventory belongs to")
    blockId: Optional[UUID] = Field(None, description="Source block (if applicable)")

    # Product identification
    plantDataId: UUID = Field(..., description="Reference to plant data")
    plantName: str = Field(..., min_length=1, max_length=200, description="Product name")
    productType: HarvestProductType = Field(HarvestProductType.FRESH, description="Type of product")
    variety: Optional[str] = Field(None, max_length=100, description="Plant variety/cultivar")

    # Quantity tracking
    quantity: float = Field(..., ge=0, description="Current quantity")
    unit: str = Field(..., min_length=1, max_length=20, description="Unit of measurement (kg, units, bunches)")

    # Quality and grading
    qualityGrade: QualityGrade = Field(QualityGrade.GRADE_A, description="Quality grade")

    # Dates
    harvestDate: datetime = Field(..., description="When the product was harvested")
    expiryDate: Optional[datetime] = Field(None, description="Expected expiry/best before date")

    # Storage
    storageLocation: Optional[str] = Field(None, max_length=200, description="Where the product is stored")
    storageConditions: Optional[str] = Field(None, max_length=500, description="Storage conditions (temp, humidity)")

    # Pricing
    unitPrice: Optional[float] = Field(None, ge=0, description="Price per unit")
    currency: str = Field("AED", max_length=3, description="Currency code")

    # Notes
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class HarvestInventoryCreate(HarvestInventoryBase):
    """Schema for creating harvest inventory item"""
    pass


class HarvestInventoryUpdate(BaseModel):
    """Schema for updating harvest inventory item"""
    quantity: Optional[float] = Field(None, ge=0)
    qualityGrade: Optional[QualityGrade] = None
    expiryDate: Optional[datetime] = None
    storageLocation: Optional[str] = Field(None, max_length=200)
    storageConditions: Optional[str] = Field(None, max_length=500)
    unitPrice: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=3)
    notes: Optional[str] = Field(None, max_length=1000)


class HarvestInventory(HarvestInventoryBase):
    """Complete harvest inventory item"""
    inventoryId: UUID = Field(default_factory=uuid4, description="Unique identifier")

    # Reserved for orders
    reservedQuantity: float = Field(0.0, ge=0, description="Quantity reserved for orders")
    availableQuantity: float = Field(..., ge=0, description="Available for sale")

    # Source tracking (links to block harvest if auto-created)
    sourceHarvestId: Optional[UUID] = Field(None, description="Reference to block harvest (if auto-created from harvest)")

    # Tracking
    createdBy: UUID = Field(..., description="User who created this entry")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv-harvest-001",
                "farmId": "farm-001",
                "blockId": "block-001",
                "plantDataId": "plant-001",
                "plantName": "Roma Tomatoes",
                "productType": "fresh",
                "variety": "Roma VF",
                "quantity": 500.0,
                "unit": "kg",
                "qualityGrade": "grade_a",
                "harvestDate": "2025-01-15T08:00:00Z",
                "expiryDate": "2025-01-25T00:00:00Z",
                "storageLocation": "Cold Storage Unit A",
                "unitPrice": 5.50,
                "currency": "AED",
                "reservedQuantity": 100.0,
                "availableQuantity": 400.0
            }
        }


# ============================================================================
# INPUT INVENTORY (Fertilizers, Pesticides, Seeds, etc.)
# ============================================================================

class InputInventoryBase(BaseModel):
    """Base schema for input inventory"""
    farmId: UUID = Field(..., description="Farm this inventory belongs to")

    # Item identification
    itemName: str = Field(..., min_length=1, max_length=200, description="Item name")
    category: InputCategory = Field(..., description="Category of input item")
    brand: Optional[str] = Field(None, max_length=100, description="Brand/manufacturer")
    sku: Optional[str] = Field(None, max_length=50, description="Stock keeping unit/product code")

    # Quantity tracking
    quantity: float = Field(..., ge=0, description="Current quantity")
    unit: str = Field(..., min_length=1, max_length=20, description="Unit of measurement")
    minimumStock: float = Field(0.0, ge=0, description="Minimum stock level for alerts")

    # Dates
    purchaseDate: Optional[datetime] = Field(None, description="When the item was purchased")
    expiryDate: Optional[datetime] = Field(None, description="Expiry date")

    # Storage
    storageLocation: Optional[str] = Field(None, max_length=200, description="Storage location")

    # Cost tracking
    unitCost: Optional[float] = Field(None, ge=0, description="Cost per unit")
    currency: str = Field("AED", max_length=3, description="Currency code")
    supplier: Optional[str] = Field(None, max_length=200, description="Supplier name")

    # Specifications (for fertilizers, pesticides)
    activeIngredients: Optional[str] = Field(None, max_length=500, description="Active ingredients")
    concentration: Optional[str] = Field(None, max_length=100, description="Concentration/strength")
    applicationRate: Optional[str] = Field(None, max_length=200, description="Recommended application rate")
    safetyNotes: Optional[str] = Field(None, max_length=1000, description="Safety precautions")

    # Notes
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class InputInventoryCreate(InputInventoryBase):
    """Schema for creating input inventory item"""
    pass


class InputInventoryUpdate(BaseModel):
    """Schema for updating input inventory item"""
    itemName: Optional[str] = Field(None, min_length=1, max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    quantity: Optional[float] = Field(None, ge=0)
    minimumStock: Optional[float] = Field(None, ge=0)
    expiryDate: Optional[datetime] = None
    storageLocation: Optional[str] = Field(None, max_length=200)
    unitCost: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=3)
    supplier: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=1000)


class InputInventory(InputInventoryBase):
    """Complete input inventory item"""
    inventoryId: UUID = Field(default_factory=uuid4, description="Unique identifier")

    # Low stock alert
    isLowStock: bool = Field(False, description="True if quantity below minimum")

    # Tracking
    createdBy: UUID = Field(..., description="User who created this entry")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    lastUsedAt: Optional[datetime] = Field(None, description="Last time this item was used")

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv-input-001",
                "farmId": "farm-001",
                "itemName": "NPK 20-20-20 Fertilizer",
                "category": "fertilizer",
                "brand": "GreenGrow",
                "sku": "GG-NPK-2020-50",
                "quantity": 250.0,
                "unit": "kg",
                "minimumStock": 50.0,
                "isLowStock": False,
                "purchaseDate": "2025-01-01T00:00:00Z",
                "expiryDate": "2026-01-01T00:00:00Z",
                "storageLocation": "Warehouse B - Shelf 3",
                "unitCost": 2.50,
                "currency": "AED",
                "supplier": "AgriSupply Co.",
                "activeIngredients": "Nitrogen 20%, Phosphorus 20%, Potassium 20%",
                "applicationRate": "5g per plant every 2 weeks"
            }
        }


# ============================================================================
# ASSET INVENTORY (Tractors, Machinery, Infrastructure)
# ============================================================================

class AssetInventoryBase(BaseModel):
    """Base schema for asset inventory"""
    farmId: UUID = Field(..., description="Farm this asset belongs to")

    # Asset identification
    assetName: str = Field(..., min_length=1, max_length=200, description="Asset name")
    category: AssetCategory = Field(..., description="Category of asset")
    assetTag: Optional[str] = Field(None, max_length=50, description="Internal asset tag/ID")
    serialNumber: Optional[str] = Field(None, max_length=100, description="Manufacturer serial number")

    # Details
    brand: Optional[str] = Field(None, max_length=100, description="Brand/manufacturer")
    model: Optional[str] = Field(None, max_length=100, description="Model name/number")
    year: Optional[int] = Field(None, ge=1900, le=2100, description="Year of manufacture")

    # Status
    status: AssetStatus = Field(AssetStatus.OPERATIONAL, description="Current status")
    condition: Optional[str] = Field(None, max_length=200, description="Current condition description")

    # Location
    location: Optional[str] = Field(None, max_length=200, description="Current location")
    assignedTo: Optional[str] = Field(None, max_length=200, description="Person/team assigned to")

    # Financial
    purchaseDate: Optional[datetime] = Field(None, description="Purchase date")
    purchasePrice: Optional[float] = Field(None, ge=0, description="Purchase price")
    currentValue: Optional[float] = Field(None, ge=0, description="Current estimated value")
    currency: str = Field("AED", max_length=3, description="Currency code")

    # Maintenance
    lastMaintenanceDate: Optional[datetime] = Field(None, description="Last maintenance date")
    nextMaintenanceDate: Optional[datetime] = Field(None, description="Next scheduled maintenance")
    maintenanceNotes: Optional[str] = Field(None, max_length=1000, description="Maintenance history/notes")

    # Specifications
    specifications: Optional[str] = Field(None, max_length=2000, description="Technical specifications")

    # Documentation
    warrantyExpiry: Optional[datetime] = Field(None, description="Warranty expiry date")
    documentationUrl: Optional[str] = Field(None, max_length=500, description="Link to documentation")

    # Notes
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class AssetInventoryCreate(AssetInventoryBase):
    """Schema for creating asset inventory item"""
    pass


class AssetInventoryUpdate(BaseModel):
    """Schema for updating asset inventory item"""
    assetName: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[AssetStatus] = None
    condition: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    assignedTo: Optional[str] = Field(None, max_length=200)
    currentValue: Optional[float] = Field(None, ge=0)
    lastMaintenanceDate: Optional[datetime] = None
    nextMaintenanceDate: Optional[datetime] = None
    maintenanceNotes: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=1000)


class AssetInventory(AssetInventoryBase):
    """Complete asset inventory item"""
    inventoryId: UUID = Field(default_factory=uuid4, description="Unique identifier")

    # Maintenance alerts
    maintenanceOverdue: bool = Field(False, description="True if maintenance is overdue")

    # Tracking
    createdBy: UUID = Field(..., description="User who created this entry")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv-asset-001",
                "farmId": "farm-001",
                "assetName": "John Deere 5075E Tractor",
                "category": "tractor",
                "assetTag": "TRAC-001",
                "serialNumber": "1LV5075EVHH123456",
                "brand": "John Deere",
                "model": "5075E",
                "year": 2022,
                "status": "operational",
                "condition": "Excellent - Regular maintenance performed",
                "location": "Main Equipment Shed",
                "assignedTo": "Field Operations Team",
                "purchaseDate": "2022-03-15T00:00:00Z",
                "purchasePrice": 150000.0,
                "currentValue": 135000.0,
                "currency": "AED",
                "lastMaintenanceDate": "2025-01-01T00:00:00Z",
                "nextMaintenanceDate": "2025-04-01T00:00:00Z",
                "maintenanceOverdue": False
            }
        }


# ============================================================================
# INVENTORY MOVEMENT (Transaction History)
# ============================================================================

class InventoryMovement(BaseModel):
    """Record of inventory movement/transaction"""
    movementId: UUID = Field(default_factory=uuid4, description="Unique movement identifier")
    inventoryId: UUID = Field(..., description="Reference to inventory item")
    inventoryType: InventoryType = Field(..., description="Type of inventory")

    movementType: MovementType = Field(..., description="Type of movement")
    quantityBefore: float = Field(..., description="Quantity before movement")
    quantityChange: float = Field(..., description="Amount changed (positive or negative)")
    quantityAfter: float = Field(..., description="Quantity after movement")

    reason: Optional[str] = Field(None, max_length=500, description="Reason for movement")
    referenceId: Optional[str] = Field(None, max_length=100, description="Reference to related record (order, task)")

    performedBy: UUID = Field(..., description="User who performed the movement")
    performedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "movementId": "mov-001",
                "inventoryId": "inv-harvest-001",
                "inventoryType": "harvest",
                "movementType": "sale",
                "quantityBefore": 500.0,
                "quantityChange": -50.0,
                "quantityAfter": 450.0,
                "reason": "Sold to Al Ain Hypermarket",
                "referenceId": "ORDER-2025-001"
            }
        }


# ============================================================================
# SUMMARY AND DASHBOARD MODELS
# ============================================================================

class InventorySummary(BaseModel):
    """Summary statistics for inventory dashboard"""
    harvestInventory: dict = Field(default_factory=dict, description="Harvest inventory summary")
    inputInventory: dict = Field(default_factory=dict, description="Input inventory summary")
    assetInventory: dict = Field(default_factory=dict, description="Asset inventory summary")

    totalHarvestValue: float = Field(0.0, description="Total value of harvest inventory")
    totalInputValue: float = Field(0.0, description="Total value of input inventory")
    totalAssetValue: float = Field(0.0, description="Total value of assets")

    lowStockAlerts: int = Field(0, description="Number of low stock items")
    expiringItems: int = Field(0, description="Items expiring within 7 days")
    maintenanceOverdue: int = Field(0, description="Assets with overdue maintenance")


class InventorySearchParams(BaseModel):
    """Search parameters for inventory queries"""
    farmId: Optional[UUID] = None
    inventoryType: Optional[InventoryType] = None
    search: Optional[str] = Field(None, max_length=100, description="Search term")
    category: Optional[str] = Field(None, description="Filter by category")
    lowStockOnly: bool = Field(False, description="Show only low stock items")
    page: int = Field(1, ge=1)
    perPage: int = Field(20, ge=1, le=100)
