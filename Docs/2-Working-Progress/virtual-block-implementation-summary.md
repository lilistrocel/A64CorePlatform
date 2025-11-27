# Virtual Block Implementation Summary

**Date:** 2025-11-27
**Feature:** Multi-Crop Virtual Block Service and API Endpoints

---

## Implementation Overview

Successfully implemented the virtual block service layer and API endpoints to handle multi-crop operations on physical blocks. This enables farmers to plant multiple crops within the same physical block using a virtual block abstraction.

---

## Files Created

### 1. Virtual Block Service
**File:** `src/modules/farm_manager/services/block/virtual_block_service.py`

**Key Methods:**
- `create_virtual_block()` - Core method for creating virtual child blocks
- `add_crop_to_physical_block()` - Public API for adding crops to existing blocks
- `get_virtual_children()` - Retrieve all virtual children of a physical block
- `initialize_area_budget()` - One-time initialization of area budget for physical blocks

**Features:**
- Validates parent block is physical and active
- Initializes area budget on first virtual child creation
- Validates area allocation against parent's available budget
- Generates virtual block codes in format "{parentCode}/{counter:03d}"
- Automatically plants the crop on virtual block (PLANNED or GROWING)
- Calculates expected dates and predicted yield
- Updates parent block's area budget and child tracking

---

## Files Modified

### 1. Block Repository
**File:** `src/modules/farm_manager/services/block/block_repository_new.py`

**New Methods Added:**
```python
# Virtual block database operations
create_virtual_block(parent, block_code, allocated_area, user_id, user_email)
update_parent_for_virtual_child(parent_id, child_id, allocated_area, new_counter)
get_children_by_parent(parent_id)
initialize_available_area(block_id, area)
```

**Modified Methods:**
- `get_by_farm()` - Added `block_category` filter parameter
- `get_all()` - Added `block_category` filter parameter

**Database Operations:**
- Creates virtual blocks with inherited parent properties
- Atomic parent updates (area deduction, counter increment, child tracking)
- Efficient child queries with proper indexing

---

### 2. Block Service
**File:** `src/modules/farm_manager/services/block/block_service_new.py`

**Modified Methods:**
- `list_blocks()` - Added `block_category='all'` parameter for filtering

**Integration:**
- Service layer now supports filtering by block category ('physical', 'virtual', 'all')
- Maintains backward compatibility with existing code

---

### 3. Block API Routes
**File:** `src/modules/farm_manager/api/v1/blocks.py`

**New Endpoints:**

#### POST `/farms/{farm_id}/blocks/{block_id}/add-virtual-crop`
**Purpose:** Add a virtual crop to a physical block
**Permission:** `farm.operate`
**Request Body:**
```json
{
  "cropId": "uuid-of-plant-data",
  "allocatedArea": 200.0,
  "plantCount": 300,
  "plantingDate": "2025-01-15T00:00:00Z"  // Optional: null = plant now
}
```
**Response:** Created virtual block with planting details
**Status Code:** 201 Created

**Validations:**
- Block must be physical (not virtual)
- Sufficient area budget available
- Valid crop ID
- Positive area and plant count

**Actions:**
- Initializes area budget if first child
- Creates virtual block with generated code
- Deducts area from parent's budget
- Plants crop on virtual block
- Calculates expected dates and yield

---

#### GET `/farms/{farm_id}/blocks/{block_id}/children`
**Purpose:** Get all virtual children of a physical block
**Permission:** Authenticated user
**Response:** List of virtual child blocks
**Status Code:** 200 OK

**Returns:**
- Empty list if block has no children or is virtual
- Array of Block objects for each active virtual child
- Includes full block details (crop, status, dates, KPIs)

**Use Cases:**
- Display all crops in a multi-crop block
- Show area allocation breakdown
- Monitor individual crop progress

---

**Modified Endpoints:**

#### GET `/farms/{farm_id}/blocks`
**New Query Parameter:** `blockCategory`
**Values:** 'physical', 'virtual', 'all' (default: 'all')
**Purpose:** Filter blocks by category

**Example:**
```bash
# Get only physical blocks
GET /api/v1/farm/farms/{farm_id}/blocks?blockCategory=physical

# Get only virtual blocks
GET /api/v1/farm/farms/{farm_id}/blocks?blockCategory=virtual

# Get all blocks (default)
GET /api/v1/farm/farms/{farm_id}/blocks?blockCategory=all
```

---

### 4. Service Package Exports
**File:** `src/modules/farm_manager/services/block/__init__.py`

**Added Export:**
```python
from .virtual_block_service import VirtualBlockService

__all__ = [
    # ... existing exports
    "VirtualBlockService",
]
```

---

## API Usage Examples

### Example 1: Add Virtual Crop to Physical Block

```bash
curl -X POST http://localhost/api/v1/farm/farms/{farm_id}/blocks/{block_id}/add-virtual-crop \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "cropId": "550e8400-e29b-41d4-a716-446655440000",
    "allocatedArea": 200.0,
    "plantCount": 300,
    "plantingDate": null
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "blockId": "...",
    "blockCode": "F001-021/001",
    "blockCategory": "virtual",
    "parentBlockId": "...",
    "allocatedArea": 200.0,
    "targetCrop": "550e8400-e29b-41d4-a716-446655440000",
    "targetCropName": "Tomato",
    "state": "growing",
    "actualPlantCount": 300,
    ...
  },
  "message": "Virtual crop added successfully as F001-021/001"
}
```

---

### Example 2: Get Virtual Children

```bash
curl http://localhost/api/v1/farm/farms/{farm_id}/blocks/{block_id}/children \
  -H "Authorization: Bearer {token}"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "blockId": "...",
      "blockCode": "F001-021/001",
      "blockCategory": "virtual",
      "parentBlockId": "...",
      "allocatedArea": 200.0,
      "targetCrop": "...",
      "targetCropName": "Tomato",
      "state": "growing",
      ...
    },
    {
      "blockId": "...",
      "blockCode": "F001-021/002",
      "blockCategory": "virtual",
      "parentBlockId": "...",
      "allocatedArea": 150.0,
      "targetCrop": "...",
      "targetCropName": "Lettuce",
      "state": "planned",
      ...
    }
  ],
  "message": "Retrieved 2 virtual child block(s)"
}
```

---

### Example 3: Filter Blocks by Category

```bash
# Get only physical blocks
curl "http://localhost/api/v1/farm/farms/{farm_id}/blocks?blockCategory=physical" \
  -H "Authorization: Bearer {token}"

# Get only virtual blocks
curl "http://localhost/api/v1/farm/farms/{farm_id}/blocks?blockCategory=virtual" \
  -H "Authorization: Bearer {token}"
```

---

## Validation Rules Implemented

### Virtual Block Creation
1. **Parent Validation:**
   - Parent block must exist and be active
   - Parent must be physical (blockCategory='physical')
   - Virtual blocks cannot have children

2. **Area Budget Validation:**
   - `allocatedArea` must be ≤ `parent.availableArea`
   - Area budget auto-initialized on first child (availableArea = area)
   - Parent area budget decremented atomically

3. **Crop Validation:**
   - Crop ID must exist in plant_data collection
   - Plant count must be > 0
   - Allocated area must be > 0

4. **Code Generation:**
   - Format: "{parentCode}/{counter:03d}"
   - Counter starts at 1, increments for each child
   - Example: F001-021/001, F001-021/002, F001-021/003

---

## Error Handling

### HTTP Error Codes

**404 Not Found:**
- Parent block not found
- Crop (plant data) not found
- Block not found in specified farm

**400 Bad Request:**
- Invalid area allocation (exceeds budget)
- Cannot add children to deleted blocks
- Block must have valid area before budget initialization
- Invalid request parameters

**409 Conflict:**
- Only physical blocks can have children
- Virtual blocks cannot create children

---

## Database Schema Changes

No schema changes required - all multi-crop fields were added in previous implementation:

**Physical Block Fields:**
```javascript
{
  "blockCategory": "physical",
  "availableArea": 800.0,        // Remaining budget
  "virtualBlockCounter": 2,       // Next: /003
  "childBlockIds": ["uuid1", "uuid2"]
}
```

**Virtual Block Fields:**
```javascript
{
  "blockCategory": "virtual",
  "parentBlockId": "parent-uuid",
  "allocatedArea": 200.0,         // From parent's budget
  "sequenceNumber": null          // Virtual blocks don't have sequences
}
```

---

## Security & Permissions

**Required Permissions:**
- `farm.operate` - Required to add virtual crops (create virtual blocks)
- Authenticated user - Required to view virtual children (read-only)

**Validation:**
- Farm ownership verified before all operations
- Block ownership verified (belongs to specified farm)
- User authentication enforced on all endpoints

---

## Testing Checklist

- [ ] Create virtual block with valid parameters
- [ ] Validate area budget enforcement (reject over-allocation)
- [ ] Verify virtual block code generation (format and sequencing)
- [ ] Test area budget initialization on first child
- [ ] Verify parent's availableArea decrements correctly
- [ ] Test child tracking in parent's childBlockIds array
- [ ] Validate virtual blocks cannot have children
- [ ] Test filtering blocks by category (physical/virtual/all)
- [ ] Verify crop planting on virtual block (PLANNED/GROWING)
- [ ] Test expected dates and yield calculation
- [ ] Verify error handling for all validation rules
- [ ] Test permissions (farm.operate required)
- [ ] Verify farm ownership validation

---

## Integration Points

**Integrates with:**
1. **Block Service** - Uses existing planting, date calculation, yield calculation
2. **Plant Data Service** - Validates crops and retrieves growth cycle data
3. **Task Generation** - Virtual blocks generate tasks like physical blocks
4. **Harvest Tracking** - Virtual blocks track harvests independently
5. **Alert System** - Virtual blocks can have alerts independent of parent

**Does NOT affect:**
- Existing physical block operations
- Block status transitions (uses same state machine)
- Archive system (virtual blocks archive independently)
- Dashboard statistics (counts both categories)

---

## Next Steps (Future Enhancements)

### Phase 2 Enhancements:
1. **Auto-deletion of empty virtual blocks** - When status → EMPTY, soft delete and return area to parent
2. **Parent status management** - Set parent to PARTIAL when has children but no direct crop
3. **History transfer** - Move virtual block history to parent on deletion
4. **Bulk virtual crop planting** - Add multiple crops in one operation
5. **Area reallocation** - Allow resizing allocated area for virtual blocks

### UI/Frontend Integration:
1. **Multi-crop planting interface** - UI to add multiple crops to a block
2. **Area allocation visualization** - Show parent area budget breakdown
3. **Virtual block indicators** - Display virtual block badges/icons in lists
4. **Parent-child navigation** - Easy navigation between parent and children

### Analytics & Reporting:
1. **Multi-crop performance comparison** - Compare yields across virtual blocks
2. **Area utilization metrics** - Track how efficiently area budget is used
3. **Parent-level aggregation** - Roll up KPIs from virtual children to parent

---

## Code Quality Notes

**Security:**
✅ All inputs validated with Pydantic models
✅ Parameterized database queries (no SQL injection risk)
✅ Permission checks enforced
✅ Farm ownership verified

**Code Quality:**
✅ Type hints on all functions
✅ Comprehensive docstrings with Args/Returns/Raises
✅ Proper error handling with meaningful messages
✅ Logging for all key operations
✅ PEP 8 compliant

**Architecture:**
✅ Clean separation: API → Service → Repository
✅ Reuses existing BlockService methods
✅ Atomic database operations
✅ Proper transaction boundaries

---

## Summary

Successfully implemented a complete virtual block system with:
- **1 new service file** (VirtualBlockService)
- **4 new repository methods** (virtual block CRUD operations)
- **2 new API endpoints** (add-virtual-crop, get-children)
- **Enhanced filtering** (blockCategory parameter)
- **Comprehensive validation** (area budget, parent checks, permissions)
- **Full integration** with existing block lifecycle

The implementation follows all project standards, includes proper error handling, and maintains backward compatibility with existing code.

**Ready for testing and integration with frontend.**
