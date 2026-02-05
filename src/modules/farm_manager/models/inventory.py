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

class InventoryScope(str, Enum):
    """Inventory scope levels"""
    ORGANIZATION = "organization"  # Default inventory (farmId = null)
    FARM = "farm"                 # Farm-specific inventory


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


class BaseUnit(str, Enum):
    """
    Base units for inventory calculations.
    All quantities are stored internally in these base units for precise calculations.
    - mg (milligrams) for solid materials (fertilizers, powders)
    - ml (milliliters) for liquid materials (pesticides, nutrient solutions)
    - units for countable items (seeds, seedlings)
    """
    MILLIGRAM = "mg"      # Base for solids
    MILLILITER = "ml"     # Base for liquids
    UNIT = "unit"         # Base for countable items (seeds, seedlings)


class DisplayUnit(str, Enum):
    """
    User-friendly display units.
    These are converted to/from base units for storage and calculations.
    """
    # Mass units (convert to mg)
    KILOGRAM = "kg"
    GRAM = "g"
    MILLIGRAM = "mg"
    POUND = "lb"
    OUNCE = "oz"

    # Volume units (convert to ml)
    LITER = "L"
    MILLILITER = "ml"
    GALLON = "gal"

    # Countable units (convert to unit)
    UNIT = "unit"
    PIECE = "piece"
    PACKET = "packet"
    BAG = "bag"
    BOX = "box"


# Conversion factors to base units
# Mass -> mg
MASS_TO_MG = {
    "kg": 1_000_000,      # 1 kg = 1,000,000 mg
    "g": 1_000,           # 1 g = 1,000 mg
    "mg": 1,              # 1 mg = 1 mg
    "lb": 453_592,        # 1 lb = 453,592 mg
    "oz": 28_350,         # 1 oz = 28,350 mg
}

# Volume -> ml
VOLUME_TO_ML = {
    "L": 1_000,           # 1 L = 1,000 ml
    "ml": 1,              # 1 ml = 1 ml
    "gal": 3_785,         # 1 gal = 3,785 ml (US gallon)
}

# Countable -> unit
COUNT_TO_UNIT = {
    "unit": 1,
    "piece": 1,
    "packet": 1,          # Treat as 1 unit (can be adjusted per item)
    "bag": 1,             # Treat as 1 unit (can be adjusted per item)
    "box": 1,             # Treat as 1 unit (can be adjusted per item)
}

# Category to base unit mapping
CATEGORY_BASE_UNIT = {
    InputCategory.FERTILIZER: BaseUnit.MILLIGRAM,
    InputCategory.PESTICIDE: BaseUnit.MILLILITER,
    InputCategory.HERBICIDE: BaseUnit.MILLILITER,
    InputCategory.FUNGICIDE: BaseUnit.MILLILITER,
    InputCategory.SEED: BaseUnit.UNIT,
    InputCategory.SEEDLING: BaseUnit.UNIT,
    InputCategory.SOIL: BaseUnit.MILLIGRAM,
    InputCategory.SUBSTRATE: BaseUnit.MILLIGRAM,
    InputCategory.NUTRIENT_SOLUTION: BaseUnit.MILLILITER,
    InputCategory.GROWTH_REGULATOR: BaseUnit.MILLILITER,
    InputCategory.PACKAGING: BaseUnit.UNIT,
    InputCategory.OTHER: BaseUnit.UNIT,
}


def get_base_unit_for_category(category: InputCategory) -> BaseUnit:
    """Get the appropriate base unit for an input category"""
    return CATEGORY_BASE_UNIT.get(category, BaseUnit.UNIT)


def convert_to_base_unit(quantity: float, display_unit: str, category: InputCategory) -> float:
    """
    Convert a quantity from display unit to base unit.

    Args:
        quantity: The quantity in display units
        display_unit: The display unit (kg, g, L, ml, etc.)
        category: The input category (determines if solid/liquid/countable)

    Returns:
        The quantity in base units (mg, ml, or unit)
    """
    base_unit = get_base_unit_for_category(category)

    if base_unit == BaseUnit.MILLIGRAM:
        factor = MASS_TO_MG.get(display_unit, 1)
    elif base_unit == BaseUnit.MILLILITER:
        factor = VOLUME_TO_ML.get(display_unit, 1)
    else:  # BaseUnit.UNIT
        factor = COUNT_TO_UNIT.get(display_unit, 1)

    return quantity * factor


def convert_from_base_unit(base_quantity: float, display_unit: str, category: InputCategory) -> float:
    """
    Convert a quantity from base unit to display unit.

    Args:
        base_quantity: The quantity in base units (mg, ml, or unit)
        display_unit: The target display unit (kg, g, L, ml, etc.)
        category: The input category (determines if solid/liquid/countable)

    Returns:
        The quantity in display units
    """
    base_unit = get_base_unit_for_category(category)

    if base_unit == BaseUnit.MILLIGRAM:
        factor = MASS_TO_MG.get(display_unit, 1)
    elif base_unit == BaseUnit.MILLILITER:
        factor = VOLUME_TO_ML.get(display_unit, 1)
    else:  # BaseUnit.UNIT
        factor = COUNT_TO_UNIT.get(display_unit, 1)

    return base_quantity / factor if factor > 0 else base_quantity


def format_base_quantity_for_display(base_quantity: float, base_unit: BaseUnit) -> str:
    """
    Format a base quantity with automatic unit selection for best readability.

    Args:
        base_quantity: The quantity in base units
        base_unit: The base unit type

    Returns:
        Formatted string with appropriate unit
    """
    if base_unit == BaseUnit.MILLIGRAM:
        if base_quantity >= 1_000_000:
            return f"{base_quantity / 1_000_000:.2f} kg"
        elif base_quantity >= 1_000:
            return f"{base_quantity / 1_000:.2f} g"
        else:
            return f"{base_quantity:.2f} mg"

    elif base_unit == BaseUnit.MILLILITER:
        if base_quantity >= 1_000:
            return f"{base_quantity / 1_000:.2f} L"
        else:
            return f"{base_quantity:.2f} ml"

    else:  # BaseUnit.UNIT
        return f"{int(base_quantity)} units"


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
# PRODUCT CATALOG (Master Product Database)
# ============================================================================

class Product(BaseModel):
    """
    Master product catalog for organization-wide product definitions.
    Used for standardizing inventory items across all farms.
    """
    productId: UUID = Field(default_factory=uuid4, description="Unique product identifier")

    # Organization scoping
    organizationId: UUID = Field(..., description="Organization this product belongs to")

    # Product identification
    name: str = Field(..., min_length=1, max_length=200, description="Product name")
    category: InputCategory = Field(..., description="Product category")
    description: Optional[str] = Field(None, max_length=1000, description="Product description")

    # Units and conversion
    unit: str = Field(..., min_length=1, max_length=20, description="Default display unit (kg, L, units)")
    baseUnit: BaseUnit = Field(..., description="Base unit for calculations (mg, ml, unit)")
    conversionFactor: float = Field(..., gt=0, description="Convert display unit to base unit")

    # Optional metadata
    brand: Optional[str] = Field(None, max_length=100, description="Brand/manufacturer")
    sku: Optional[str] = Field(None, max_length=50, description="Stock keeping unit/product code")

    # Tracking
    createdBy: UUID = Field(..., description="User who created this product")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "productId": "prod-001",
                "organizationId": "org-001",
                "name": "NPK 20-20-20 Fertilizer",
                "category": "fertilizer",
                "description": "Balanced NPK fertilizer for general use",
                "unit": "kg",
                "baseUnit": "mg",
                "conversionFactor": 1000000.0,
                "brand": "GreenGrow",
                "sku": "GG-NPK-2020"
            }
        }


class ProductCreate(BaseModel):
    """Schema for creating a product"""
    name: str = Field(..., min_length=1, max_length=200)
    category: InputCategory = Field(...)
    description: Optional[str] = Field(None, max_length=1000)
    unit: str = Field(..., min_length=1, max_length=20)
    brand: Optional[str] = Field(None, max_length=100)
    sku: Optional[str] = Field(None, max_length=50)


class ProductUpdate(BaseModel):
    """Schema for updating a product"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    brand: Optional[str] = Field(None, max_length=100)
    sku: Optional[str] = Field(None, max_length=50)


# ============================================================================
# HARVEST INVENTORY (Harvested Plants for Sale)
# ============================================================================

class HarvestInventoryBase(BaseModel):
    """Base schema for harvest inventory"""
    # MODIFIED: farmId now optional (null for default/organization inventory)
    # Using UUID | None for Pydantic v2 compatibility with JSON null
    farmId: UUID | None = Field(default=None, description="Farm this inventory belongs to (null for organization inventory)")
    organizationId: UUID = Field(..., description="Organization this inventory belongs to")
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
    # Override: quantity must be > 0 when creating (ge=0 in base allows deductions to reach 0)
    quantity: float = Field(..., gt=0, description="Initial quantity must be greater than 0")


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

    # NEW: Inventory scope (computed from farmId)
    inventoryScope: InventoryScope = Field(..., description="Scope level: organization or farm")

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
    # MODIFIED: farmId now optional (null for default/organization inventory)
    # Using UUID | None for Pydantic v2 compatibility with JSON null
    farmId: UUID | None = Field(default=None, description="Farm this inventory belongs to (null for organization inventory)")
    organizationId: UUID = Field(..., description="Organization this inventory belongs to")

    # NEW: Product reference (optional - for standardized products)
    productId: Optional[UUID] = Field(None, description="Reference to product catalog")

    # Item identification
    itemName: str = Field(..., min_length=1, max_length=200, description="Item name")
    category: InputCategory = Field(..., description="Category of input item")
    brand: Optional[str] = Field(None, max_length=100, description="Brand/manufacturer")
    sku: Optional[str] = Field(None, max_length=50, description="Stock keeping unit/product code")

    # Quantity tracking (display units - what user sees)
    quantity: float = Field(..., ge=0, description="Current quantity in display units")
    unit: str = Field(..., min_length=1, max_length=20, description="Display unit (kg, g, L, ml, etc.)")
    minimumStock: float = Field(0.0, ge=0, description="Minimum stock level in display units")

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
    # Override: quantity must be > 0 when creating (ge=0 in base allows deductions to reach 0)
    quantity: float = Field(..., gt=0, description="Initial quantity must be greater than 0")


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

    # NEW: Inventory scope (computed from farmId)
    inventoryScope: InventoryScope = Field(..., description="Scope level: organization or farm")

    # Base unit tracking (for automated calculations and deductions)
    # These are calculated from quantity + unit when item is created/updated
    baseUnit: BaseUnit = Field(..., description="Base unit for calculations (mg, ml, or unit)")
    baseQuantity: float = Field(..., ge=0, description="Quantity in base units for precise calculations")
    baseMinimumStock: float = Field(0.0, ge=0, description="Minimum stock in base units")

    # Low stock alert
    isLowStock: bool = Field(False, description="True if quantity below minimum")

    # NEW: Transfer history tracking
    transferHistory: List[dict] = Field(default_factory=list, description="History of transfers")

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
                "baseUnit": "mg",
                "baseQuantity": 250000000000.0,
                "baseMinimumStock": 50000000000.0,
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
    # MODIFIED: farmId now optional (null for default/organization inventory)
    # Using UUID | None for Pydantic v2 compatibility with JSON null
    farmId: UUID | None = Field(default=None, description="Farm this asset belongs to (null for organization inventory)")
    organizationId: UUID = Field(..., description="Organization this asset belongs to")

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

    # NEW: Inventory scope (computed from farmId)
    inventoryScope: InventoryScope = Field(..., description="Scope level: organization or farm")

    # Maintenance alerts
    maintenanceOverdue: bool = Field(False, description="True if maintenance is overdue")

    # NEW: Asset allocation tracking (for shared assets)
    currentAllocation: Optional[dict] = Field(None, description="Current allocation information")
    allocationHistory: List[dict] = Field(default_factory=list, description="History of allocations")

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

    # NEW: Organization context
    organizationId: UUID = Field(..., description="Organization this movement belongs to")

    # NEW: Scope tracking (for transfers)
    fromScope: Optional[InventoryScope] = Field(None, description="Source scope (for transfers)")
    toScope: Optional[InventoryScope] = Field(None, description="Destination scope (for transfers)")
    fromFarmId: Optional[UUID] = Field(None, description="Source farm (for transfers)")
    toFarmId: Optional[UUID] = Field(None, description="Destination farm (for transfers)")

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
    wasteInventory: dict = Field(default_factory=dict, description="Waste inventory summary")

    totalHarvestValue: float = Field(0.0, description="Total value of harvest inventory")
    totalInputValue: float = Field(0.0, description="Total value of input inventory")
    totalAssetValue: float = Field(0.0, description="Total value of assets")
    totalWasteValue: float = Field(0.0, description="Total estimated value of waste")

    lowStockAlerts: int = Field(0, description="Number of low stock items")
    expiringItems: int = Field(0, description="Items expiring within 7 days")
    maintenanceOverdue: int = Field(0, description="Assets with overdue maintenance")


class InventorySearchParams(BaseModel):
    """Search parameters for inventory queries"""
    farmId: Optional[UUID] = None
    inventoryType: Optional[InventoryType] = None
    inventoryScope: Optional[InventoryScope] = None  # NEW: Filter by scope
    search: Optional[str] = Field(None, max_length=100, description="Search term")
    category: Optional[str] = Field(None, description="Filter by category")
    lowStockOnly: bool = Field(False, description="Show only low stock items")
    page: int = Field(1, ge=1)
    perPage: int = Field(20, ge=1, le=100)


# ============================================================================
# TRANSFER MODELS
# ============================================================================

class TransferRequest(BaseModel):
    """Request to transfer inventory between scopes"""
    inventoryId: UUID = Field(..., description="Source inventory item ID")
    inventoryType: InventoryType = Field(..., description="Type of inventory")

    fromScope: InventoryScope = Field(..., description="Source scope")
    toScope: InventoryScope = Field(..., description="Destination scope")

    fromFarmId: Optional[UUID] = Field(None, description="Source farm ID (if from farm)")
    toFarmId: Optional[UUID] = Field(None, description="Destination farm ID (if to farm)")

    quantity: float = Field(..., gt=0, description="Quantity to transfer in display units")
    unit: str = Field(..., description="Unit of quantity")

    reason: str = Field(..., min_length=1, max_length=500, description="Reason for transfer")

    class Config:
        json_schema_extra = {
            "example": {
                "inventoryId": "inv-input-001",
                "inventoryType": "input",
                "fromScope": "organization",
                "toScope": "farm",
                "fromFarmId": None,
                "toFarmId": "farm-001",
                "quantity": 500.0,
                "unit": "kg",
                "reason": "Farm 1 requested fertilizer for Block B-15"
            }
        }


class TransferResponse(BaseModel):
    """Response after successful transfer"""
    transferId: UUID = Field(..., description="Transfer transaction ID")
    sourceInventory: dict = Field(..., description="Updated source inventory item")
    destinationInventory: Optional[dict] = Field(None, description="Destination inventory item (if created)")
    movement: dict = Field(..., description="Movement record")
    message: str = Field(..., description="Success message")


class TransferRecord(BaseModel):
    """Record of a transfer in item's transfer history"""
    transferId: UUID = Field(default_factory=uuid4, description="Transfer ID")
    fromScope: InventoryScope = Field(..., description="Source scope")
    toScope: InventoryScope = Field(..., description="Destination scope")
    fromFarmId: Optional[UUID] = Field(None, description="Source farm")
    toFarmId: Optional[UUID] = Field(None, description="Destination farm")
    quantityTransferred: float = Field(..., description="Quantity transferred in base units")
    transferredAt: datetime = Field(default_factory=datetime.utcnow)
    transferredBy: UUID = Field(..., description="User who performed transfer")
    reason: str = Field(..., description="Transfer reason")


# ============================================================================
# WASTE INVENTORY
# ============================================================================

class WasteSourceType(str, Enum):
    """Source of waste"""
    HARVEST = "harvest"       # Waste from harvest (spoiled before sale)
    RETURN = "return"         # Waste from returned items
    EXPIRED = "expired"       # Items expired in inventory
    DAMAGED = "damaged"       # Items damaged in storage/transport
    QUALITY_REJECT = "quality_reject"  # Failed quality inspection
    OTHER = "other"


class DisposalMethod(str, Enum):
    """Method of waste disposal"""
    COMPOST = "compost"           # Composted for fertilizer
    ANIMAL_FEED = "animal_feed"   # Used as animal feed
    DISCARD = "discard"           # Discarded/thrown away
    SOLD_DISCOUNT = "sold_discount"  # Sold at discount price
    DONATED = "donated"           # Donated to charity
    PENDING = "pending"           # Disposal pending


class WasteInventoryBase(BaseModel):
    """Base schema for waste inventory"""
    organizationId: UUID = Field(..., description="Organization this waste belongs to")
    farmId: Optional[UUID] = Field(None, description="Farm where waste originated")

    # Source tracking
    sourceType: WasteSourceType = Field(..., description="Source of waste")
    sourceInventoryId: Optional[UUID] = Field(None, description="Original inventory item ID")
    sourceOrderId: Optional[UUID] = Field(None, description="Sales order ID (for returns)")
    sourceReturnId: Optional[UUID] = Field(None, description="Return order ID (for returns)")
    sourceBlockId: Optional[UUID] = Field(None, description="Block ID (for harvest waste)")

    # Product info
    plantName: str = Field(..., min_length=1, max_length=200, description="Product/plant name")
    variety: Optional[str] = Field(None, max_length=100, description="Plant variety")
    quantity: float = Field(..., gt=0, description="Waste quantity")
    unit: str = Field(..., min_length=1, max_length=20, description="Unit of measurement")
    originalGrade: Optional[str] = Field(None, description="Original quality grade")

    # Waste details
    wasteReason: str = Field(..., max_length=500, description="Reason for waste")
    wasteDate: datetime = Field(default_factory=datetime.utcnow, description="Date item became waste")

    # Disposal
    disposalMethod: DisposalMethod = Field(DisposalMethod.PENDING, description="Disposal method")
    disposalDate: Optional[datetime] = Field(None, description="Date of disposal")
    disposalNotes: Optional[str] = Field(None, max_length=500, description="Disposal notes")

    # Value tracking (for reporting)
    estimatedValue: Optional[float] = Field(None, ge=0, description="Estimated value of waste")
    currency: str = Field("AED", max_length=3, description="Currency code")

    # Notes
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")


class WasteInventoryCreate(WasteInventoryBase):
    """Schema for creating waste inventory item - organizationId set from auth context"""
    organizationId: Optional[UUID] = Field(None, description="Organization (set automatically from auth)")


class WasteInventoryUpdate(BaseModel):
    """Schema for updating waste inventory item"""
    disposalMethod: Optional[DisposalMethod] = None
    disposalDate: Optional[datetime] = None
    disposalNotes: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)


class WasteInventory(WasteInventoryBase):
    """Complete waste inventory item"""
    wasteId: UUID = Field(default_factory=uuid4, description="Unique identifier")

    # Tracking
    recordedBy: UUID = Field(..., description="User who recorded this waste")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "wasteId": "waste-001",
                "organizationId": "org-001",
                "farmId": "farm-001",
                "sourceType": "return",
                "sourceOrderId": "order-001",
                "sourceReturnId": "return-001",
                "plantName": "Roma Tomatoes",
                "variety": "Roma VF",
                "quantity": 10.0,
                "unit": "kg",
                "originalGrade": "grade_a",
                "wasteReason": "customer_rejected: damaged",
                "wasteDate": "2025-01-20T14:00:00Z",
                "disposalMethod": "compost",
                "disposalDate": "2025-01-21T10:00:00Z",
                "estimatedValue": 55.00,
                "currency": "AED"
            }
        }


class MoveToWasteRequest(BaseModel):
    """Request to move inventory to waste"""
    inventoryId: UUID = Field(..., description="Harvest inventory ID to move to waste")
    inventoryType: InventoryType = Field(InventoryType.HARVEST, description="Type of inventory")
    quantity: float = Field(..., gt=0, description="Quantity to move to waste")
    wasteReason: str = Field(..., max_length=500, description="Reason for waste")
    sourceType: WasteSourceType = Field(WasteSourceType.EXPIRED, description="Source type")


class WasteSummary(BaseModel):
    """Summary statistics for waste"""
    totalWasteRecords: int = Field(0, description="Total number of waste records")
    totalQuantity: float = Field(0, description="Total waste quantity")
    totalEstimatedValue: float = Field(0, description="Total estimated value of waste")
    bySourceType: dict = Field(default_factory=dict, description="Breakdown by source type")
    byDisposalMethod: dict = Field(default_factory=dict, description="Breakdown by disposal method")
    pendingDisposal: int = Field(0, description="Count of items pending disposal")
