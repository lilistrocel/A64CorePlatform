# A64 Core Platform - Inventory Management System

## Overview

The Inventory Management System is a comprehensive module for tracking farm-related inventory across three distinct categories: **Harvest Inventory**, **Input Inventory**, and **Asset Inventory**. It includes a sophisticated unit conversion system, movement tracking, and automated calculations.

---

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python) with async MongoDB operations
- **Database**: MongoDB with separate collections per inventory type
- **Frontend**: React + TypeScript + styled-components

### MongoDB Collections
| Collection | Purpose |
|------------|---------|
| `inventory_harvest` | Stores harvested crops from farm blocks |
| `inventory_input` | Stores consumable inputs (fertilizers, pesticides, seeds, etc.) |
| `inventory_asset` | Stores durable assets (equipment, tools, infrastructure) |
| `inventory_movements` | Tracks all inventory changes (additions, deductions, transfers) |

---

## Data Models

### 1. Harvest Inventory

Tracks harvested crops from farm blocks.

```python
# Backend Model (Pydantic)
class HarvestInventory:
    id: str                      # UUID
    farm_id: str                 # Reference to farm
    block_id: str                # Reference to block
    plant_id: str                # Reference to plant data
    plant_name: str              # Cached plant name
    harvest_date: datetime       # When harvested
    quantity_kg: float           # Amount in kilograms
    quality_grade: str           # A, B, C, etc.
    storage_location: str        # Where stored
    expiry_date: Optional[datetime]  # When it expires
    notes: Optional[str]
    status: str                  # "available", "sold", "disposed", "reserved"
    created_at: datetime
    updated_at: datetime
```

```typescript
// Frontend Type
interface HarvestInventory {
  id: string;
  farmId: string;
  blockId: string;
  plantId: string;
  plantName: string;
  harvestDate: string;
  quantityKg: number;
  qualityGrade: string;
  storageLocation: string;
  expiryDate?: string;
  notes?: string;
  status: 'available' | 'sold' | 'disposed' | 'reserved';
  createdAt: string;
  updatedAt: string;
}
```

### 2. Input Inventory

Tracks consumable inputs with automated unit conversion.

```python
# Backend Model (Pydantic)
class InputInventory:
    id: str                      # UUID
    farm_id: str                 # Reference to farm
    name: str                    # Input name
    category: InputCategory      # fertilizer, pesticide, seed, water, other
    brand: Optional[str]

    # Unit System
    display_unit: DisplayUnit    # Unit shown to user (kg, g, L, mL, units)
    display_quantity: float      # Quantity in display units
    base_unit: BaseUnit          # Calculated base unit (mg, ml, unit)
    base_quantity: float         # Auto-calculated quantity in base units

    # Stock Management
    minimum_stock: Optional[float]     # Low stock threshold (in display units)
    reorder_quantity: Optional[float]  # Suggested reorder amount

    # Metadata
    supplier: Optional[str]
    cost_per_unit: Optional[float]
    purchase_date: Optional[datetime]
    expiry_date: Optional[datetime]
    storage_location: Optional[str]
    notes: Optional[str]
    status: str                  # "available", "low_stock", "out_of_stock", "expired"
    created_at: datetime
    updated_at: datetime
```

```typescript
// Frontend Type
interface InputInventory {
  id: string;
  farmId: string;
  name: string;
  category: InputCategory;
  brand?: string;
  displayUnit: DisplayUnit;
  displayQuantity: number;
  baseUnit: BaseUnit;
  baseQuantity: number;
  minimumStock?: number;
  reorderQuantity?: number;
  supplier?: string;
  costPerUnit?: number;
  purchaseDate?: string;
  expiryDate?: string;
  storageLocation?: string;
  notes?: string;
  status: 'available' | 'low_stock' | 'out_of_stock' | 'expired';
  createdAt: string;
  updatedAt: string;
}
```

### 3. Asset Inventory

Tracks durable assets and equipment.

```python
# Backend Model (Pydantic)
class AssetInventory:
    id: str                      # UUID
    farm_id: str                 # Reference to farm
    name: str                    # Asset name
    category: AssetCategory      # equipment, tool, vehicle, infrastructure, other

    # Quantity
    display_unit: DisplayUnit    # Usually "units"
    display_quantity: float
    base_unit: BaseUnit          # Usually "unit"
    base_quantity: float

    # Asset Details
    brand: Optional[str]
    model: Optional[str]
    serial_number: Optional[str]
    purchase_date: Optional[datetime]
    purchase_price: Optional[float]
    current_value: Optional[float]
    warranty_expiry: Optional[datetime]

    # Maintenance
    last_maintenance: Optional[datetime]
    next_maintenance: Optional[datetime]
    maintenance_interval_days: Optional[int]

    # Location & Status
    location: Optional[str]
    assigned_to: Optional[str]
    condition: str               # "excellent", "good", "fair", "poor", "needs_repair"
    status: str                  # "available", "in_use", "maintenance", "retired"
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
```

---

## Unit Conversion System

### Base Units (For Calculations)
| Base Unit | Used For |
|-----------|----------|
| `mg` | Weight-based items (fertilizers, dry inputs) |
| `ml` | Volume-based items (liquid pesticides, water) |
| `unit` | Countable items (seeds, assets, equipment) |

### Display Units (For User Interface)
| Display Unit | Converts To | Conversion Factor |
|--------------|-------------|-------------------|
| `kg` | `mg` | 1 kg = 1,000,000 mg |
| `g` | `mg` | 1 g = 1,000 mg |
| `mg` | `mg` | 1:1 |
| `L` | `ml` | 1 L = 1,000 ml |
| `mL` | `ml` | 1:1 |
| `units` | `unit` | 1:1 |

### Conversion Functions

```python
# Backend conversion (Python)
def convert_to_base_unit(display_quantity: float, display_unit: DisplayUnit) -> tuple[float, BaseUnit]:
    """Convert display units to base units for storage/calculations."""
    conversions = {
        DisplayUnit.KG: (1_000_000, BaseUnit.MG),      # 1 kg = 1,000,000 mg
        DisplayUnit.G: (1_000, BaseUnit.MG),           # 1 g = 1,000 mg
        DisplayUnit.MG: (1, BaseUnit.MG),              # 1 mg = 1 mg
        DisplayUnit.L: (1_000, BaseUnit.ML),           # 1 L = 1,000 ml
        DisplayUnit.ML: (1, BaseUnit.ML),              # 1 ml = 1 ml
        DisplayUnit.UNITS: (1, BaseUnit.UNIT),         # 1 unit = 1 unit
    }
    factor, base_unit = conversions[display_unit]
    return display_quantity * factor, base_unit

def convert_from_base_unit(base_quantity: float, base_unit: BaseUnit, target_display_unit: DisplayUnit) -> float:
    """Convert base units back to display units for UI."""
    conversions = {
        (BaseUnit.MG, DisplayUnit.KG): 1 / 1_000_000,
        (BaseUnit.MG, DisplayUnit.G): 1 / 1_000,
        (BaseUnit.MG, DisplayUnit.MG): 1,
        (BaseUnit.ML, DisplayUnit.L): 1 / 1_000,
        (BaseUnit.ML, DisplayUnit.ML): 1,
        (BaseUnit.UNIT, DisplayUnit.UNITS): 1,
    }
    factor = conversions.get((base_unit, target_display_unit), 1)
    return base_quantity * factor
```

### Category-to-Unit Mapping

```typescript
// Frontend constant
const CATEGORY_BASE_UNIT: Record<InputCategory | AssetCategory, BaseUnit> = {
  fertilizer: 'mg',      // Weight-based
  pesticide: 'ml',       // Volume-based (usually liquid)
  seed: 'unit',          // Countable
  water: 'ml',           // Volume-based
  other: 'unit',         // Default to countable
  equipment: 'unit',     // Countable
  tool: 'unit',          // Countable
  vehicle: 'unit',       // Countable
  infrastructure: 'unit', // Countable
};
```

---

## API Endpoints

### Base URL
```
/api/v1/farm/inventory
```

### Harvest Inventory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/harvest` | List harvest inventory (paginated) |
| POST | `/harvest` | Create harvest record |
| GET | `/harvest/{id}` | Get harvest by ID |
| PATCH | `/harvest/{id}` | Update harvest |
| DELETE | `/harvest/{id}` | Delete harvest |

**Query Parameters for GET /harvest:**
- `farm_id` - Filter by farm
- `block_id` - Filter by block
- `plant_id` - Filter by plant
- `status` - Filter by status
- `page` - Page number (default: 1)
- `per_page` - Items per page (default: 20)

### Input Inventory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/input` | List input inventory (paginated) |
| POST | `/input` | Create input record |
| GET | `/input/{id}` | Get input by ID |
| PATCH | `/input/{id}` | Update input |
| DELETE | `/input/{id}` | Delete input |
| POST | `/input/{id}/use` | Use/deduct inventory (display units) |
| POST | `/input/{id}/deduct-base` | Deduct in base units (for automation) |

**Special: Use Input Endpoint**
```python
POST /input/{id}/use
Body: {
    "quantity": 5.0,          # Amount to deduct (in display units)
    "reason": "Applied to Block A",
    "block_id": "optional-block-id"
}
```

**Special: Deduct Base Units Endpoint**
```python
POST /input/{id}/deduct-base
Body: {
    "base_quantity": 5000.0,  # Amount in base units (mg, ml, or unit)
    "reason": "Automated application",
    "block_id": "optional-block-id"
}
```

### Asset Inventory Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/asset` | List asset inventory (paginated) |
| POST | `/asset` | Create asset record |
| GET | `/asset/{id}` | Get asset by ID |
| PATCH | `/asset/{id}` | Update asset |
| DELETE | `/asset/{id}` | Delete asset |

### Dashboard Endpoint

```
GET /summary?farm_id={farm_id}
```

Returns aggregated statistics:
```json
{
  "harvest": {
    "total_items": 45,
    "total_quantity_kg": 1250.5,
    "by_status": {
      "available": 30,
      "sold": 10,
      "disposed": 5
    }
  },
  "input": {
    "total_items": 120,
    "low_stock_count": 8,
    "expired_count": 2,
    "by_category": {
      "fertilizer": 40,
      "pesticide": 30,
      "seed": 50
    }
  },
  "asset": {
    "total_items": 25,
    "maintenance_due_count": 3,
    "total_value": 125000.00,
    "by_category": {
      "equipment": 10,
      "tool": 12,
      "vehicle": 3
    }
  }
}
```

---

## Movement Tracking

All inventory changes are tracked in `inventory_movements`:

```python
class InventoryMovement:
    id: str
    inventory_type: str          # "harvest", "input", "asset"
    inventory_id: str            # Reference to specific item
    movement_type: str           # "addition", "deduction", "adjustment", "transfer"
    quantity: float              # Amount changed (positive or negative)
    unit: str                    # Unit of measurement
    reason: Optional[str]        # Why the change was made
    block_id: Optional[str]      # If related to a specific block
    performed_by: str            # User ID who made the change
    created_at: datetime
```

**When Movements Are Created:**
1. Creating new inventory item → `addition`
2. Using input inventory → `deduction`
3. Manual quantity adjustments → `adjustment`
4. Transferring between locations → `transfer`

---

## Frontend Integration

### API Service Functions

```typescript
// inventoryApi.ts

// Harvest
listHarvestInventory(params): Promise<PaginatedResponse<HarvestInventory>>
createHarvestInventory(data): Promise<HarvestInventory>
getHarvestInventory(id): Promise<HarvestInventory>
updateHarvestInventory(id, data): Promise<HarvestInventory>
deleteHarvestInventory(id): Promise<void>

// Input
listInputInventory(params): Promise<PaginatedResponse<InputInventory>>
createInputInventory(data): Promise<InputInventory>
getInputInventory(id): Promise<InputInventory>
updateInputInventory(id, data): Promise<InputInventory>
deleteInputInventory(id): Promise<void>
useInputInventory(id, data): Promise<InputInventory>  // Deduct in display units

// Asset
listAssetInventory(params): Promise<PaginatedResponse<AssetInventory>>
createAssetInventory(data): Promise<AssetInventory>
getAssetInventory(id): Promise<AssetInventory>
updateAssetInventory(id, data): Promise<AssetInventory>
deleteAssetInventory(id): Promise<void>

// Dashboard
getInventorySummary(farmId): Promise<InventorySummary>
```

### React Hooks Pattern

```typescript
// Example custom hook for input inventory
function useInputInventory(farmId: string) {
  const [items, setItems] = useState<InputInventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInputInventory({ farmId })
      .then(response => setItems(response.data))
      .finally(() => setLoading(false));
  }, [farmId]);

  const useItem = async (id: string, quantity: number, reason: string) => {
    const updated = await useInputInventory(id, { quantity, reason });
    setItems(prev => prev.map(item => item.id === id ? updated : item));
  };

  return { items, loading, useItem };
}
```

---

## Status Management

### Harvest Status Flow
```
available → sold      (when sold to buyer)
available → disposed  (when expired/damaged)
available → reserved  (when reserved for order)
reserved → available  (when order cancelled)
reserved → sold       (when order completed)
```

### Input Status Flow (Automatic)
```
available → low_stock     (when display_quantity < minimum_stock)
low_stock → out_of_stock  (when display_quantity = 0)
available → expired       (when expiry_date < today)
```

### Asset Status Flow
```
available → in_use       (when assigned)
available → maintenance  (when under repair)
in_use → available       (when returned)
maintenance → available  (when repair complete)
any → retired            (when decommissioned)
```

### Condition Grades (Assets)
- `excellent` - Like new condition
- `good` - Minor wear, fully functional
- `fair` - Moderate wear, some issues
- `poor` - Significant wear, needs attention
- `needs_repair` - Not functional, requires repair

---

## File Locations

### Backend
```
src/modules/farm_manager/
├── models/
│   └── inventory.py          # All Pydantic models, enums, conversions
├── api/v1/
│   └── inventory.py          # All API endpoints
└── services/
    └── inventory_service.py  # Business logic (if needed)
```

### Frontend
```
frontend/user-portal/src/
├── types/
│   └── inventory.ts          # TypeScript interfaces
├── services/
│   └── inventoryApi.ts       # API service functions
├── components/inventory/
│   └── InventoryDashboard.tsx # Main dashboard component
└── pages/
    └── InventoryPage.tsx     # Route page component
```

---

## Development Guidelines

### Adding New Inventory Fields

1. **Backend Model** (`models/inventory.py`):
   - Add field to appropriate Pydantic model
   - Add to `Create` and `Update` schemas if editable
   - Update any related enums if needed

2. **Database Migration**:
   - Existing documents will need the new field
   - Consider default values for backwards compatibility

3. **API Endpoint** (`api/v1/inventory.py`):
   - Update endpoint handlers to use new field
   - Add validation if needed

4. **Frontend Types** (`types/inventory.ts`):
   - Add field to TypeScript interface
   - Mark as optional with `?` if not required

5. **Frontend API** (`services/inventoryApi.ts`):
   - Usually no changes needed (types flow through)

6. **UI Components**:
   - Add form fields for input/edit
   - Add display in list/detail views

### Adding New Inventory Category

1. Add to enum in `models/inventory.py`:
   ```python
   class InputCategory(str, Enum):
       # existing...
       NEW_CATEGORY = "new_category"
   ```

2. Add label in `types/inventory.ts`:
   ```typescript
   export const INPUT_CATEGORY_LABELS: Record<InputCategory, string> = {
       // existing...
       new_category: 'New Category',
   };
   ```

3. Map to base unit in `types/inventory.ts`:
   ```typescript
   export const CATEGORY_BASE_UNIT: Record<InputCategory, BaseUnit> = {
       // existing...
       new_category: 'mg',  // or 'ml' or 'unit'
   };
   ```

---

## Common Operations

### Create Harvest from Block
```typescript
const harvest = await createHarvestInventory({
  farmId: block.farmId,
  blockId: block.id,
  plantId: block.currentPlantId,
  plantName: block.currentPlantName,
  harvestDate: new Date().toISOString(),
  quantityKg: 150.5,
  qualityGrade: 'A',
  storageLocation: 'Cold Storage 1',
  status: 'available'
});
```

### Add Fertilizer to Inventory
```typescript
const fertilizer = await createInputInventory({
  farmId: currentFarm.id,
  name: 'NPK 20-20-20',
  category: 'fertilizer',
  brand: 'GrowMax',
  displayUnit: 'kg',
  displayQuantity: 50,  // 50 kg
  // baseUnit and baseQuantity auto-calculated
  minimumStock: 10,     // Alert when below 10 kg
  supplier: 'AgriSupply Co.',
  costPerUnit: 25.00,
  purchaseDate: '2025-01-15',
  expiryDate: '2026-01-15',
  storageLocation: 'Warehouse A'
});
```

### Use Input Inventory
```typescript
// Deduct 2 kg of fertilizer
const updated = await useInputInventory(fertilizer.id, {
  quantity: 2,  // In display units (kg)
  reason: 'Applied to Block F001-A',
  blockId: 'block-uuid'
});
// baseQuantity automatically updated: -2,000,000 mg
```

### Register New Equipment
```typescript
const tractor = await createAssetInventory({
  farmId: currentFarm.id,
  name: 'John Deere 5055E',
  category: 'vehicle',
  displayUnit: 'units',
  displayQuantity: 1,
  brand: 'John Deere',
  model: '5055E',
  serialNumber: 'JD5055E-12345',
  purchaseDate: '2024-06-01',
  purchasePrice: 35000.00,
  currentValue: 32000.00,
  maintenanceIntervalDays: 90,
  location: 'Equipment Shed',
  condition: 'excellent',
  status: 'available'
});
```

---

## Notes for Developers

1. **Unit Conversion is Automatic**: When creating/updating input inventory, just provide `displayUnit` and `displayQuantity`. The backend automatically calculates `baseUnit` and `baseQuantity`.

2. **Status Updates are Automatic**: Input inventory status (`low_stock`, `out_of_stock`, `expired`) is automatically updated based on quantity and dates.

3. **Movement Tracking is Automatic**: All CRUD operations automatically create movement records. No need to manually track.

4. **Farm ID is Required**: All inventory items are scoped to a farm. Always filter by `farmId` when querying.

5. **Soft Delete Not Implemented**: Delete operations are permanent. Consider adding `isDeleted` flag if soft delete is needed.

6. **No Batch Operations Yet**: Currently single-item operations only. Batch create/update could be added if needed.

---

## Future Enhancements (Suggested)

- [ ] Batch operations for bulk import
- [ ] Inventory transfer between farms
- [ ] Automated reorder notifications
- [ ] Integration with supplier APIs
- [ ] Barcode/QR code scanning
- [ ] Inventory valuation reports
- [ ] Depreciation tracking for assets
- [ ] Maintenance scheduling with calendar
