# Multi-Crop Virtual Block Schema Implementation

**Status:** ✅ COMPLETED
**Date:** 2025-11-27
**Migration Script:** `scripts/migrations/add_multicrop_fields.py`

---

## Overview

Implemented schema changes to support multiple crops being planted in parallel on the same physical block using "virtual blocks" architecture.

## Architecture Summary

### Core Concepts

1. **Physical Blocks** - Permanent, represent actual farm areas (e.g., "A01")
2. **Virtual Blocks** - Temporary, represent individual crop sessions (e.g., "A01/001", "A01/002")
3. **First Crop Rule** - First crop goes to physical block directly
4. **Additional Crops** - Create virtual child blocks
5. **Auto-Deletion** - Virtual blocks self-delete when status becomes "empty"
6. **Area Budget** - Physical block has total area, virtual blocks allocate portions

### Workflow Example

```
User plants multi-crop on Block A01 (1000m²):
  - Tomato 300m² → A01 (physical block)
  - Cucumber 200m² → A01/001 (virtual block)

When A01/001 becomes empty:
  1. Transfer completed tasks/harvests to parent A01
  2. Return 200m² to A01's available area budget
  3. Delete virtual block A01/001
```

---

## Schema Changes

### 1. New BlockStatus: PARTIAL

**File:** `src/modules/farm_manager/models/block.py`

```python
class BlockStatus(str, Enum):
    EMPTY = "empty"
    PLANNED = "planned"
    GROWING = "growing"
    FRUITING = "fruiting"
    HARVESTING = "harvesting"
    CLEANING = "cleaning"
    ALERT = "alert"
    PARTIAL = "partial"  # ← NEW: Physical block has virtual children but no direct crop
```

**Purpose:** Status for physical blocks that have active virtual children but no crop planted directly on the physical block.

---

### 2. New Fields in Block Model

**File:** `src/modules/farm_manager/models/block.py`

#### Multi-Crop Support Fields

```python
# Block category
blockCategory: Literal['physical', 'virtual'] = Field(
    'physical',
    description="Block category - physical (permanent) or virtual (temporary for multi-crop)"
)

# Parent relationship
parentBlockId: Optional[UUID] = Field(
    None,
    description="For virtual blocks: parent physical block ID"
)
```

#### Physical Block Only Fields

```python
# Area budget tracking
availableArea: Optional[float] = Field(
    None,
    description="Physical blocks: remaining area budget for additional crops"
)

# Virtual block counter for code generation
virtualBlockCounter: int = Field(
    0,
    description="Physical blocks: counter for generating virtual block codes (001, 002...)"
)

# Child tracking
childBlockIds: List[str] = Field(
    default_factory=list,
    description="Physical blocks: list of active virtual block IDs"
)
```

#### Virtual Block Only Fields

```python
# Allocated area from parent
allocatedArea: Optional[float] = Field(
    None,
    description="Virtual blocks: area allocated from parent's budget"
)
```

---

### 3. Updated BlockCreate Schema

**File:** `src/modules/farm_manager/models/block.py`

```python
class BlockCreate(BlockBase):
    """Schema for creating a new block"""
    allocatedArea: Optional[float] = Field(
        None,
        description="Area to allocate (for virtual block creation)"
    )
    parentBlockId: Optional[UUID] = Field(
        None,
        description="For virtual blocks: parent physical block ID"
    )
```

**Purpose:** Support creating virtual blocks with allocated area and parent reference.

---

### 4. New Schemas for Multi-Crop Operations

**File:** `src/modules/farm_manager/models/block.py`

#### VirtualCropCreate

```python
class VirtualCropCreate(BaseModel):
    """Schema for creating a virtual block with a crop"""
    cropId: UUID = Field(..., description="Plant data ID for the crop")
    allocatedArea: float = Field(..., gt=0, description="Area to allocate from parent's budget")
    plantCount: int = Field(..., gt=0, description="Number of plants")
    plantingDate: Optional[datetime] = Field(None, description="Planned planting date (defaults to now)")
```

**Purpose:** Define a single virtual crop to be planted on a physical block.

#### MultiCropPlantRequest

```python
class MultiCropPlantRequest(BaseModel):
    """Schema for planting multiple crops at once"""
    primaryCrop: BlockStatusUpdate = Field(..., description="Primary crop for the physical block")
    additionalCrops: List[VirtualCropCreate] = Field(
        default_factory=list,
        description="Additional crops for virtual blocks"
    )
```

**Purpose:** Plant multiple crops simultaneously - primary crop on physical block, additional crops on virtual blocks.

#### AddVirtualCropRequest

```python
class AddVirtualCropRequest(BaseModel):
    """Schema for adding a virtual crop to an existing physical block"""
    cropId: UUID = Field(..., description="Plant data ID")
    allocatedArea: float = Field(..., gt=0, description="Area to allocate")
    plantCount: int = Field(..., gt=0, description="Number of plants")
    plantingDate: Optional[datetime] = Field(None, description="Planned planting date")
```

**Purpose:** Add a new crop to an already-planted physical block (creates virtual block).

---

## Database Migration

### Migration Script

**File:** `scripts/migrations/add_multicrop_fields.py`

**Status:** ✅ Successfully executed on 2025-11-27

### Migration Results

```
Blocks updated: 12

New fields added to all existing blocks:
  - blockCategory: 'physical' (all existing blocks are physical)
  - parentBlockId: null (no parent for existing blocks)
  - availableArea: null (will be set when first virtual child is created)
  - virtualBlockCounter: 0 (no virtual children yet)
  - childBlockIds: [] (empty array for child tracking)
  - allocatedArea: null (only virtual blocks have this)
```

### Indexes Created

```
1. idx_block_category
   - Single field index on blockCategory
   - Purpose: Query blocks by category (physical vs virtual)

2. idx_parent_block (sparse)
   - Single field index on parentBlockId
   - Purpose: Query virtual blocks by parent
   - Sparse: Only indexes documents where parentBlockId exists

3. idx_parent_active (sparse)
   - Compound index on parentBlockId + isActive
   - Purpose: Query active virtual blocks by parent
   - Sparse: Only indexes documents where parentBlockId exists
```

### Verification Query

```bash
mongosh --eval "db.blocks.findOne()" mongodb://localhost:27017/a64core_db --quiet
```

**Result:** ✅ All multi-crop fields present in database documents

---

## Field Usage Guidelines

### Physical Block Workflow

**When creating a physical block:**
- `blockCategory`: "physical" (default)
- `parentBlockId`: null
- `availableArea`: null initially (will be set to `area` value when first virtual child is created)
- `virtualBlockCounter`: 0
- `childBlockIds`: []
- `allocatedArea`: null (not used for physical blocks)

**When planting first crop on physical block:**
- No changes to multi-crop fields
- Crop planted directly on physical block
- Status transitions normally (PLANNED → GROWING → HARVESTING → EMPTY)

**When adding additional crop (creating first virtual child):**
1. Set `availableArea` = `area` (initialize budget)
2. Create virtual child block with code `{parentCode}/001`
3. Subtract `allocatedArea` from `availableArea`
4. Add child `blockId` to `childBlockIds[]`
5. Increment `virtualBlockCounter` to 1
6. If physical block has no direct crop, set status to PARTIAL

**When virtual child is deleted:**
1. Return child's `allocatedArea` back to parent's `availableArea`
2. Remove child `blockId` from parent's `childBlockIds[]`
3. If `childBlockIds[]` becomes empty and physical block has no direct crop, status → EMPTY

---

### Virtual Block Workflow

**When creating a virtual block:**
- `blockCategory`: "virtual"
- `parentBlockId`: {parent block UUID}
- `blockCode`: "{parentCode}/{counter}" (e.g., "F001-021/001")
- `allocatedArea`: {area allocated from parent's budget}
- `area`: same as `allocatedArea` (for display consistency)
- `availableArea`: null (not used for virtual blocks)
- `virtualBlockCounter`: 0 (not used for virtual blocks)
- `childBlockIds`: [] (virtual blocks cannot have children)

**When virtual block status → EMPTY:**
1. Transfer all completed tasks to parent block
2. Transfer all harvest records to parent block
3. Return `allocatedArea` to parent's `availableArea`
4. Remove from parent's `childBlockIds[]`
5. Soft delete virtual block (isActive = false)
6. Check parent: if no children and no direct crop, parent status → EMPTY

---

## Data Validation Rules

### Physical Block Validation

```python
# Physical blocks must have:
- blockCategory == "physical"
- parentBlockId == None
- area > 0 (total area)
- availableArea <= area (when set)
- virtualBlockCounter >= 0
- len(childBlockIds) == virtualBlockCounter (consistency check)

# Area budget validation:
sum(child.allocatedArea for child in children) + availableArea == area
```

### Virtual Block Validation

```python
# Virtual blocks must have:
- blockCategory == "virtual"
- parentBlockId != None (must have parent)
- allocatedArea > 0
- allocatedArea <= parent.availableArea (when created)
- area == allocatedArea (consistency)
- childBlockIds == [] (cannot have children)
- virtualBlockCounter == 0 (not used)
```

### Status Transition Rules

```python
# Physical block with no direct crop but has children:
state == PARTIAL

# Physical block with direct crop (may or may not have children):
state in [PLANNED, GROWING, FRUITING, HARVESTING, CLEANING, ALERT]

# Physical block with no direct crop and no children:
state == EMPTY

# Virtual block status:
# Follows same lifecycle as physical (PLANNED → GROWING → HARVESTING → EMPTY)
# When reaches EMPTY → auto-delete
```

---

## API Endpoints to Implement

### 1. Plant Multiple Crops (New Endpoint)

```
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/plant-multi-crop
Body: MultiCropPlantRequest
```

**Purpose:** Plant multiple crops simultaneously on a physical block.

**Behavior:**
1. Validate physical block is EMPTY or CLEANING
2. Plant primary crop on physical block (existing logic)
3. For each additional crop:
   - Create virtual child block
   - Initialize with allocated area
   - Set status to PLANNED/GROWING
   - Update parent's availableArea and childBlockIds

**Response:** List of all blocks (physical + virtual children)

---

### 2. Add Virtual Crop to Block (New Endpoint)

```
POST /api/v1/farm/farms/{farm_id}/blocks/{block_id}/add-virtual-crop
Body: AddVirtualCropRequest
```

**Purpose:** Add a new crop to an already-planted physical block.

**Behavior:**
1. Validate physical block exists and is active
2. Validate sufficient `availableArea` exists
3. Create virtual child block
4. Allocate area from parent
5. Update parent's virtualBlockCounter and childBlockIds

**Response:** Created virtual block

---

### 3. List Block Children (New Endpoint)

```
GET /api/v1/farm/farms/{farm_id}/blocks/{block_id}/children
```

**Purpose:** Get all virtual child blocks for a physical block.

**Response:** List of virtual blocks

---

### 4. Get Block with Children (Enhanced Endpoint)

```
GET /api/v1/farm/farms/{farm_id}/blocks/{block_id}?includeChildren=true
```

**Purpose:** Get physical block with all virtual children in single response.

**Response:**
```json
{
  "data": {
    "block": { /* physical block */ },
    "children": [ /* virtual blocks */ ]
  }
}
```

---

## Service Methods to Implement

### BlockService Methods

```python
# Create virtual block
async def create_virtual_block(
    farm_id: UUID,
    parent_block_id: UUID,
    crop_id: UUID,
    allocated_area: float,
    plant_count: int,
    planting_date: Optional[datetime]
) -> Block

# Auto-delete empty virtual block
async def delete_virtual_block_if_empty(
    farm_id: UUID,
    block_id: UUID
) -> bool

# Transfer virtual block history to parent
async def transfer_virtual_block_history(
    virtual_block_id: UUID,
    parent_block_id: UUID
) -> None

# Check if physical block should transition to PARTIAL
async def update_parent_status_if_partial(
    farm_id: UUID,
    parent_block_id: UUID
) -> None

# Validate available area for virtual crop
async def validate_area_budget(
    parent_block_id: UUID,
    requested_area: float
) -> bool
```

---

## Frontend Updates Needed

### 1. Block Detail View

**Changes:**
- Show "Multi-Crop" badge for physical blocks with children
- Display allocated area vs available area budget
- Show list of active virtual children
- Add "Add Crop" button to plant additional crop

### 2. Block List View

**Changes:**
- Show nested virtual blocks under parent (tree view)
- Visual indicator for PARTIAL status
- Filter options: "Show Physical Only" / "Show All"

### 3. Planting Form

**Changes:**
- Add "Multi-Crop Planting" mode
- UI to add multiple crops with area allocation
- Real-time area budget validation
- Preview of virtual block codes

### 4. Block Status Card

**Changes:**
- For physical blocks with children: show aggregate KPIs
- For virtual blocks: show parent relationship
- Display area allocation visualization

---

## Testing Requirements

### Unit Tests

1. **Model Validation Tests**
   - Test physical block field defaults
   - Test virtual block required fields
   - Test area budget constraints
   - Test status transition rules

2. **Service Method Tests**
   - Test virtual block creation
   - Test area allocation/deallocation
   - Test auto-deletion on EMPTY status
   - Test history transfer to parent
   - Test parent status update to PARTIAL

### Integration Tests

1. **Multi-Crop Planting Flow**
   - Test planting primary + 2 virtual crops
   - Verify area budget calculations
   - Verify block code generation
   - Verify parent-child relationships

2. **Virtual Block Lifecycle**
   - Test PLANNED → GROWING → HARVESTING → EMPTY
   - Test auto-deletion when EMPTY
   - Test area return to parent
   - Test parent status update after child deletion

3. **Data Consistency Tests**
   - Verify area budget always balanced
   - Verify childBlockIds matches actual children
   - Verify virtual block counter accuracy

### E2E Tests (Playwright)

1. **UI Multi-Crop Planting**
   - Navigate to block detail
   - Click "Plant Multi-Crop"
   - Add primary crop + 2 additional crops
   - Verify all blocks created
   - Verify UI shows parent-child relationship

2. **Virtual Block Auto-Deletion**
   - Create virtual block
   - Complete crop cycle to EMPTY
   - Verify virtual block deleted
   - Verify parent area budget restored

---

## Security Considerations

### Access Control

- Virtual blocks inherit permissions from parent physical block
- Users with access to physical block can see all virtual children
- Only users with edit permission on physical block can create virtual children

### Data Integrity

- Enforce area budget at database and API level
- Prevent creating virtual blocks if insufficient area
- Prevent deleting physical block if has active children
- Maintain referential integrity between parent and children

---

## Performance Considerations

### Indexing Strategy

- `idx_block_category`: Fast filtering by physical/virtual
- `idx_parent_block`: Fast lookup of children by parent ID
- `idx_parent_active`: Fast query of active children only

### Query Optimization

- Use sparse indexes for virtual-only fields
- Batch operations when creating multiple virtual blocks
- Cache parent-child relationships in memory for active sessions

---

## Migration Rollback Plan

If issues occur, rollback using:

```javascript
// MongoDB shell command to remove multi-crop fields
db.blocks.updateMany(
  {},
  {
    $unset: {
      blockCategory: "",
      parentBlockId: "",
      availableArea: "",
      virtualBlockCounter: "",
      childBlockIds: "",
      allocatedArea: ""
    }
  }
)

// Remove indexes
db.blocks.dropIndex("idx_block_category")
db.blocks.dropIndex("idx_parent_block")
db.blocks.dropIndex("idx_parent_active")
```

---

## Next Steps

### Phase 1: Backend Implementation (Current)
- ✅ Schema design complete
- ✅ Migration script executed
- ✅ Database updated
- ⏳ Implement BlockService methods
- ⏳ Add API endpoints

### Phase 2: Frontend Implementation
- ⏳ Update Block detail view
- ⏳ Add multi-crop planting UI
- ⏳ Implement parent-child visualization
- ⏳ Add area budget indicator

### Phase 3: Testing & Validation
- ⏳ Write unit tests
- ⏳ Write integration tests
- ⏳ Write E2E tests with Playwright
- ⏳ Test area budget calculations

### Phase 4: Production Deployment
- ⏳ Run migration on production database
- ⏳ Deploy backend changes
- ⏳ Deploy frontend changes
- ⏳ Monitor for issues

---

## References

- **Block Model:** `src/modules/farm_manager/models/block.py`
- **Migration Script:** `scripts/migrations/add_multicrop_fields.py`
- **System Architecture:** `Docs/1-Main-Documentation/System-Architecture.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-11-27
**Author:** Database Schema Architect Agent
