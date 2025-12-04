# DevLog: Inventory Unit Conversion System

**Date:** 2025-12-04
**Session Type:** Feature Implementation
**Focus Area:** Inventory Management - Base Unit Conversion
**Status:** Completed

---

## Session Objective

Implement a dual-unit system for inventory management that allows:
- Users to input/view quantities in familiar display units (kg, g, L, ml, etc.)
- System to store and calculate using precise base units (mg, ml, unit)
- Future automated systems (irrigation, fertilization) to deduct exact amounts per plant

---

## What We Accomplished

### 1. Backend Unit Conversion System

**File Modified:** `src/modules/farm_manager/models/inventory.py`

Added comprehensive unit conversion infrastructure:

```python
# Base units for calculations
class BaseUnit(str, Enum):
    MILLIGRAM = "mg"      # Base for solids (fertilizers, soil, substrates)
    MILLILITER = "ml"     # Base for liquids (pesticides, herbicides, nutrient solutions)
    UNIT = "unit"         # Base for countable items (seeds, seedlings, packaging)

# Display units for user input
class DisplayUnit(str, Enum):
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
    # Countable units
    UNIT = "unit"
    PIECE = "piece"
    PACKET = "packet"
    BAG = "bag"
    BOX = "box"
```

**Conversion Factors:**
| From | To | Factor |
|------|-----|--------|
| kg | mg | 1,000,000 |
| g | mg | 1,000 |
| lb | mg | 453,592 |
| oz | mg | 28,350 |
| L | ml | 1,000 |
| gal | ml | 3,785 |

**Category to Base Unit Mapping:**
| Category | Base Unit |
|----------|-----------|
| Fertilizer | mg |
| Pesticide | ml |
| Herbicide | ml |
| Fungicide | ml |
| Seed | unit |
| Seedling | unit |
| Soil | mg |
| Substrate | mg |
| Nutrient Solution | ml |
| Growth Regulator | ml |
| Packaging | unit |
| Other | unit |

### 2. Updated InputInventory Model

Added new fields for base unit tracking:

```python
class InputInventory(InputInventoryBase):
    # Existing display fields
    quantity: float           # User-entered quantity (e.g., 5)
    unit: str                 # User-selected unit (e.g., "kg")
    minimumStock: float       # Minimum stock threshold

    # NEW: Base unit fields for calculations
    baseUnit: BaseUnit        # Calculated base unit (e.g., "mg")
    baseQuantity: float       # Converted quantity (e.g., 5,000,000)
    baseMinimumStock: float   # Converted minimum stock
```

### 3. API Endpoint Updates

**File Modified:** `src/modules/farm_manager/api/v1/inventory.py`

**Updated Endpoints:**
- `POST /input` - Automatically calculates base quantities on creation
- `PATCH /input/{id}` - Recalculates base quantities on update
- `POST /input/{id}/use` - Deducts from both display and base quantities

**New Endpoints:**
- `POST /input/{id}/deduct-base` - Deduct using base units (for automation)
- `GET /units/{category}` - Get available units for a category

### 4. Frontend Updates

**File Modified:** `frontend/user-portal/src/types/inventory.ts`

Added TypeScript types and helper functions:
- `BaseUnit` and `DisplayUnit` types
- `CATEGORY_BASE_UNIT` mapping
- `MASS_UNITS`, `VOLUME_UNITS`, `COUNT_UNITS` arrays
- `getUnitsForCategory()` - Returns appropriate units for a category
- `getDefaultUnitForCategory()` - Returns default unit for a category

**File Modified:** `frontend/user-portal/src/pages/inventory/InputInventoryList.tsx`

Updated Add Input Modal:
- Dynamic unit dropdown based on selected category
- Automatic unit reset when category changes
- Shows appropriate units (kg/g for fertilizer, L/ml for pesticide, etc.)

---

## Technical Design

### Dual-Unit Architecture

```
User Input                    Storage                     Automation
-----------                   -------                     ----------
5 kg fertilizer    -->    quantity: 5
                          unit: "kg"
                          baseUnit: "mg"              -->  Deduct 50 mg
                          baseQuantity: 5,000,000         per plant
```

### Conversion Flow

1. **On Create/Update:**
   - User enters quantity in display unit (e.g., 5 kg)
   - System determines base unit from category (fertilizer → mg)
   - System converts to base quantity (5 kg → 5,000,000 mg)
   - Both values stored in database

2. **On Manual Use:**
   - User deducts in display units
   - System converts and deducts from both quantities
   - Low stock check uses display quantities

3. **On Automated Deduction:**
   - Automation systems call `/deduct-base` endpoint
   - Deduction in mg/ml per plant
   - Display quantity recalculated for UI consistency

---

## Testing Results

### Test Case: Create Fertilizer with kg

**Input:**
```json
{
  "itemName": "NPK 20-20-20",
  "category": "fertilizer",
  "quantity": 5,
  "unit": "kg",
  "minimumStock": 1
}
```

**MongoDB Document:**
```json
{
  "itemName": "NPK 20-20-20",
  "category": "fertilizer",
  "quantity": 5,
  "unit": "kg",
  "minimumStock": 1,
  "baseUnit": "mg",
  "baseQuantity": 5000000,
  "baseMinimumStock": 1000000,
  "isLowStock": false
}
```

### UI Verification

- **Fertilizer selected:** Shows mass units (kg, g, mg, lb, oz)
- **Pesticide selected:** Shows volume units (L, ml, gal)
- **Seed selected:** Shows count units (Units, Pieces, Packets, Bags, Boxes)
- **Category change:** Automatically resets unit to category default

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `src/modules/farm_manager/models/inventory.py` | Added BaseUnit, DisplayUnit enums, conversion functions | Committed |
| `src/modules/farm_manager/api/v1/inventory.py` | Updated create/update/use, added deduct-base and units endpoints | Committed |
| `frontend/user-portal/src/types/inventory.ts` | Added unit types and helper functions | Committed |
| `frontend/user-portal/src/pages/inventory/InputInventoryList.tsx` | Dynamic unit dropdown | Committed |

---

## Commits Made

```
43bd5ae feat(inventory): add base unit conversion system for automated calculations
```

---

## Future Integration Points

### Automated Irrigation System

```python
# Example: Deduct fertilizer for 100 plants at 50 mg per plant
POST /api/v1/farm/inventory/input/{id}/deduct-base
?base_quantity=5000
&reason=automated_irrigation
&reference_id=block-uuid
```

### Task System Integration

When tasks use inventory items, they can:
1. Specify amounts in base units for precision
2. Link deductions to specific blocks/plants
3. Track usage history for analytics

---

## Session Metrics

- **Feature Implemented:** Dual-unit inventory system
- **Files Modified:** 4
- **New API Endpoints:** 2
- **Commits:** 1
- **Testing:** Manual verification via UI and MongoDB

---

## Key Design Decisions

1. **Why base units (mg/ml) instead of smaller units?**
   - mg and ml provide sufficient precision for agricultural applications
   - Familiar to agricultural professionals
   - Avoids floating point issues with very small numbers

2. **Why store both display and base quantities?**
   - Display quantities for fast UI rendering
   - Base quantities for precise calculations
   - Avoids repeated conversions on every read

3. **Why category-based unit mapping?**
   - Different input types have different measurement standards
   - Prevents user errors (can't measure seeds in liters)
   - Matches agricultural industry practices
