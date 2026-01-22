# Default Inventory System - Database Schema Design

## Document Information
- **Created**: 2026-01-22
- **Status**: Design Phase (NOT IMPLEMENTED)
- **Purpose**: Schema design for organization-level default inventory system

## Table of Contents
1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Requirements](#requirements)
4. [Schema Design](#schema-design)
5. [Field Modifications](#field-modifications)
6. [Validation Rules](#validation-rules)
7. [Indexes](#indexes)
8. [Sample Documents](#sample-documents)
9. [Migration Strategy](#migration-strategy)
10. [Query Patterns](#query-patterns)

---

## Overview

### What is Default Inventory?

**Default Inventory** is organization-scoped inventory that exists outside individual farms. It serves as a centralized warehouse where the organization can:
- Purchase supplies in bulk
- Store items before distributing to farms
- Transfer items between farms via the central warehouse
- Track organization-wide inventory independent of farm operations

### Use Cases

1. **Centralized Purchasing**: Buy fertilizers, seeds, equipment centrally → distribute to farms as needed
2. **Inter-Farm Transfers**: Farm A → Default Inventory → Farm B
3. **Bulk Storage**: Store harvested products at organization level before sale/distribution
4. **Asset Pool**: Maintain shared equipment/machinery that can be allocated to farms

---

## Current State Analysis

### Existing Collections

Currently, there are **4 inventory collections**:

1. **inventory_harvest** - Harvested products for sale
2. **inventory_input** - Fertilizers, pesticides, seeds, etc.
3. **inventory_asset** - Tractors, machinery, infrastructure
4. **inventory_movements** - Transaction history

### Current Schema Structure (All Types)

**Common Required Fields:**
- `farmId: UUID` - **Currently REQUIRED** for all inventory items
- `createdBy: UUID` - User who created the entry
- `createdAt: DateTime` - Creation timestamp
- `updatedAt: DateTime` - Last update timestamp

**Key Limitation:**
- All inventory items MUST belong to a farm
- No organization-level inventory support
- Cannot track centralized purchasing or transfers

---

## Requirements

### Functional Requirements

1. **Scope**: Default inventory is per-organization (tenant-scoped)
2. **All Three Types**: HarvestInventory, InputInventory, AssetInventory must support default inventory
3. **Bidirectional Transfers**: Items can move between default ↔ farm inventories
4. **Backward Compatibility**: Existing farm-scoped inventory must continue working without changes
5. **Validation**: Default inventory MUST have organizationId, farm inventory MUST have farmId

### Technical Requirements

1. **Schema Changes**: Make `farmId` optional (nullable)
2. **Organization Field**: Add `organizationId` for tenant scoping
3. **Transfer Tracking**: Extend InventoryMovement to track default↔farm transfers
4. **Indexes**: Efficient queries for both default and farm inventories
5. **Migration Path**: Handle existing farm inventory data

---

## Schema Design

### Design Decision: Single Collection Approach

**Approach:** Use existing collections with modified schema (NOT separate collections)

**Rationale:**
- ✅ Simpler API design (same endpoints, filtered by farmId presence)
- ✅ Easier transfers (just update farmId field)
- ✅ Single movement history (unified tracking)
- ✅ Less code duplication
- ✅ Backward compatible queries

**Alternative Considered:** Separate collections (inventory_harvest_default, etc.)
- ❌ Doubles the number of collections (8 instead of 4)
- ❌ More complex transfer logic (cross-collection movements)
- ❌ API duplication or complex routing logic
- ❌ Split movement history

---

## Field Modifications

### 1. HarvestInventory Schema Changes

**Modified Fields:**

```javascript
{
  // MODIFIED: Now optional (null for default inventory)
  farmId: UUID | null,

  // NEW: Required for default inventory, optional for farm inventory
  organizationId: UUID,

  // MODIFIED: Now optional (null for default inventory)
  blockId: UUID | null,

  // NEW: Tracking field
  inventoryScope: "organization" | "farm",  // Computed based on farmId presence

  // Existing fields remain unchanged
  inventoryId: UUID,
  plantDataId: UUID,
  plantName: String,
  productType: HarvestProductType,
  quantity: Float,
  unit: String,
  // ... all other existing fields
}
```

### 2. InputInventory Schema Changes

**Modified Fields:**

```javascript
{
  // MODIFIED: Now optional (null for default inventory)
  farmId: UUID | null,

  // NEW: Required for default inventory, optional for farm inventory
  organizationId: UUID,

  // NEW: Tracking field
  inventoryScope: "organization" | "farm",

  // NEW: Transfer tracking
  transferHistory: [
    {
      transferId: UUID,
      fromScope: "organization" | "farm",
      toScope: "organization" | "farm",
      fromFarmId: UUID | null,
      toFarmId: UUID | null,
      transferredAt: DateTime,
      transferredBy: UUID,
      reason: String
    }
  ],

  // Existing fields remain unchanged
  inventoryId: UUID,
  itemName: String,
  category: InputCategory,
  quantity: Float,
  baseQuantity: Float,
  // ... all other existing fields
}
```

### 3. AssetInventory Schema Changes

**Modified Fields:**

```javascript
{
  // MODIFIED: Now optional (null for default inventory)
  farmId: UUID | null,

  // NEW: Required for default inventory, optional for farm inventory
  organizationId: UUID,

  // NEW: Tracking field
  inventoryScope: "organization" | "farm",

  // NEW: Allocation tracking (for shared assets)
  currentAllocation: {
    allocatedTo: "organization" | "farm",
    farmId: UUID | null,
    allocatedAt: DateTime,
    allocatedBy: UUID,
    expectedReturnDate: DateTime | null
  } | null,

  // NEW: Allocation history
  allocationHistory: [
    {
      allocationId: UUID,
      farmId: UUID | null,
      allocatedAt: DateTime,
      returnedAt: DateTime | null,
      allocatedBy: UUID,
      returnedBy: UUID | null,
      condition: String,
      notes: String
    }
  ],

  // Existing fields remain unchanged
  inventoryId: UUID,
  assetName: String,
  category: AssetCategory,
  status: AssetStatus,
  // ... all other existing fields
}
```

### 4. InventoryMovement Schema Changes

**Enhanced Fields:**

```javascript
{
  // Existing fields
  movementId: UUID,
  inventoryId: UUID,
  inventoryType: InventoryType,
  movementType: MovementType,
  quantityBefore: Float,
  quantityChange: Float,
  quantityAfter: Float,
  performedBy: UUID,
  performedAt: DateTime,

  // NEW: Scope tracking
  fromScope: "organization" | "farm" | null,
  toScope: "organization" | "farm" | null,
  fromFarmId: UUID | null,
  toFarmId: UUID | null,

  // NEW: Organization context
  organizationId: UUID,

  // Existing fields
  reason: String | null,
  referenceId: String | null
}
```

---

## Validation Rules

### Rule 1: Mutually Exclusive Scoping

**Logic:**
```python
# Exactly ONE of these must be true:
# 1. Item belongs to organization (default inventory)
if farmId is None:
    assert organizationId is not None, "Default inventory must have organizationId"
    assert inventoryScope == "organization"

# 2. Item belongs to farm
if farmId is not None:
    assert organizationId is not None, "Farm inventory must have organizationId"
    assert inventoryScope == "farm"
```

### Rule 2: Farm Validation

**Logic:**
```python
# If farmId is provided, verify it belongs to the organization
if farmId is not None:
    farm = db.farms.find_one({"farmId": farmId})
    assert farm is not None, "Farm does not exist"
    assert farm["organizationId"] == organizationId, "Farm does not belong to this organization"
```

### Rule 3: Transfer Validation

**Logic:**
```python
# For transfers, validate scope transition
if movementType == MovementType.TRANSFER:
    assert fromScope is not None, "Transfer must specify source scope"
    assert toScope is not None, "Transfer must specify destination scope"

    # Organization → Farm transfer
    if fromScope == "organization" and toScope == "farm":
        assert fromFarmId is None, "Organization inventory has no farmId"
        assert toFarmId is not None, "Must specify destination farm"

    # Farm → Organization transfer
    if fromScope == "farm" and toScope == "organization":
        assert fromFarmId is not None, "Must specify source farm"
        assert toFarmId is None, "Organization inventory has no farmId"

    # Farm → Farm transfer (via organization)
    if fromScope == "farm" and toScope == "farm":
        assert fromFarmId is not None, "Must specify source farm"
        assert toFarmId is not None, "Must specify destination farm"
        assert fromFarmId != toFarmId, "Cannot transfer to same farm"
```

### Rule 4: BlockId Validation

**Logic:**
```python
# blockId only valid for farm inventory
if blockId is not None:
    assert farmId is not None, "blockId only valid for farm-scoped inventory"
    assert inventoryScope == "farm", "Blocks belong to farms, not organization"
```

---

## Indexes

### Collection: inventory_harvest

```javascript
// Existing indexes (keep all)
db.inventory_harvest.createIndex({ inventoryId: 1 }, { unique: true });
db.inventory_harvest.createIndex({ farmId: 1 });
db.inventory_harvest.createIndex({ blockId: 1 });
db.inventory_harvest.createIndex({ plantDataId: 1 });
db.inventory_harvest.createIndex({ qualityGrade: 1 });
db.inventory_harvest.createIndex({ harvestDate: -1 });
db.inventory_harvest.createIndex({ createdAt: -1 });

// NEW indexes for default inventory
db.inventory_harvest.createIndex({ organizationId: 1 });
db.inventory_harvest.createIndex({ inventoryScope: 1 });

// NEW compound indexes for efficient queries
db.inventory_harvest.createIndex({ organizationId: 1, inventoryScope: 1 });
db.inventory_harvest.createIndex({ organizationId: 1, farmId: 1 });
db.inventory_harvest.createIndex({ organizationId: 1, plantDataId: 1, inventoryScope: 1 });
```

**Rationale:**
- `organizationId` - Filter all inventory for an organization
- `inventoryScope` - Quickly filter default vs farm inventory
- `organizationId + inventoryScope` - Common query pattern: "Show me all default inventory for org X"
- `organizationId + farmId` - Common query: "Show me all farm inventory for org X, farm Y"
- `organizationId + plantDataId + inventoryScope` - Product-specific queries across scopes

### Collection: inventory_input

```javascript
// Existing indexes (keep all)
db.inventory_input.createIndex({ inventoryId: 1 }, { unique: true });
db.inventory_input.createIndex({ farmId: 1 });
db.inventory_input.createIndex({ category: 1 });
db.inventory_input.createIndex({ isLowStock: 1 });
db.inventory_input.createIndex({ createdAt: -1 });

// NEW indexes for default inventory
db.inventory_input.createIndex({ organizationId: 1 });
db.inventory_input.createIndex({ inventoryScope: 1 });

// NEW compound indexes
db.inventory_input.createIndex({ organizationId: 1, inventoryScope: 1 });
db.inventory_input.createIndex({ organizationId: 1, category: 1, inventoryScope: 1 });
db.inventory_input.createIndex({ organizationId: 1, isLowStock: 1 });
db.inventory_input.createIndex({ organizationId: 1, farmId: 1 });
```

**Rationale:**
- `organizationId + category + inventoryScope` - "Show me all fertilizers in default inventory"
- `organizationId + isLowStock` - Organization-wide low stock alerts

### Collection: inventory_asset

```javascript
// Existing indexes (keep all)
db.inventory_asset.createIndex({ inventoryId: 1 }, { unique: true });
db.inventory_asset.createIndex({ farmId: 1 });
db.inventory_asset.createIndex({ category: 1 });
db.inventory_asset.createIndex({ status: 1 });
db.inventory_asset.createIndex({ maintenanceOverdue: 1 });
db.inventory_asset.createIndex({ createdAt: -1 });

// NEW indexes for default inventory
db.inventory_asset.createIndex({ organizationId: 1 });
db.inventory_asset.createIndex({ inventoryScope: 1 });
db.inventory_asset.createIndex({ "currentAllocation.allocatedTo": 1 });
db.inventory_asset.createIndex({ "currentAllocation.farmId": 1 });

// NEW compound indexes
db.inventory_asset.createIndex({ organizationId: 1, inventoryScope: 1 });
db.inventory_asset.createIndex({ organizationId: 1, status: 1, inventoryScope: 1 });
db.inventory_asset.createIndex({ organizationId: 1, "currentAllocation.farmId": 1 });
```

**Rationale:**
- `currentAllocation.allocatedTo` - Find all allocated assets
- `currentAllocation.farmId` - Find assets allocated to specific farm
- `organizationId + status + inventoryScope` - "Show me all operational equipment in default inventory"

### Collection: inventory_movements

```javascript
// Existing indexes (keep all)
db.inventory_movements.createIndex({ movementId: 1 }, { unique: true });
db.inventory_movements.createIndex({ inventoryId: 1 });
db.inventory_movements.createIndex({ inventoryType: 1 });
db.inventory_movements.createIndex({ movementType: 1 });
db.inventory_movements.createIndex({ performedAt: -1 });

// NEW indexes for transfers
db.inventory_movements.createIndex({ organizationId: 1 });
db.inventory_movements.createIndex({ fromScope: 1, toScope: 1 });
db.inventory_movements.createIndex({ fromFarmId: 1 });
db.inventory_movements.createIndex({ toFarmId: 1 });

// NEW compound indexes for transfer queries
db.inventory_movements.createIndex({ organizationId: 1, movementType: 1, performedAt: -1 });
db.inventory_movements.createIndex({ inventoryId: 1, movementType: 1, performedAt: -1 });
db.inventory_movements.createIndex({ fromFarmId: 1, movementType: 1, performedAt: -1 });
db.inventory_movements.createIndex({ toFarmId: 1, movementType: 1, performedAt: -1 });
```

**Rationale:**
- `fromScope + toScope` - Filter transfers by direction (org→farm, farm→org, farm→farm)
- `fromFarmId` / `toFarmId` - Track items going in/out of specific farms
- `organizationId + movementType + performedAt` - Organization-wide transfer history
- `inventoryId + movementType + performedAt` - Complete history for specific item

---

## Sample Documents

### Example 1: Default Harvest Inventory (Organization Scope)

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "inventoryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",

  // SCOPE FIELDS
  "farmId": null,                                    // NULL = default inventory
  "organizationId": "org-123e4567-e89b-12d3-a456-426614174000",
  "inventoryScope": "organization",
  "blockId": null,                                   // No block (organization level)

  // PRODUCT DETAILS
  "plantDataId": "plant-550e8400-e29b-41d4-a716-446655440000",
  "plantName": "Roma Tomatoes",
  "productType": "fresh",
  "variety": "Roma VF",

  // QUANTITY
  "quantity": 2500.0,
  "unit": "kg",
  "qualityGrade": "grade_a",
  "reservedQuantity": 0.0,
  "availableQuantity": 2500.0,

  // DATES
  "harvestDate": "2026-01-20T08:00:00.000Z",
  "expiryDate": "2026-01-30T00:00:00.000Z",

  // STORAGE
  "storageLocation": "Central Warehouse - Cold Storage A",
  "storageConditions": "4°C, 85% humidity",

  // PRICING
  "unitPrice": 5.50,
  "currency": "AED",

  // METADATA
  "sourceHarvestId": null,                           // Manually added to default inventory
  "notes": "Bulk purchase from supplier for distribution to farms",
  "createdBy": "user-123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-20T10:00:00.000Z",
  "updatedAt": "2026-01-20T10:00:00.000Z"
}
```

### Example 2: Farm Harvest Inventory

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "inventoryId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",

  // SCOPE FIELDS
  "farmId": "farm-660e8400-e29b-41d4-a716-446655440000",  // Farm-scoped
  "organizationId": "org-123e4567-e89b-12d3-a456-426614174000",
  "inventoryScope": "farm",
  "blockId": "block-770e8400-e29b-41d4-a716-446655440000",

  // PRODUCT DETAILS
  "plantDataId": "plant-550e8400-e29b-41d4-a716-446655440000",
  "plantName": "Roma Tomatoes",
  "productType": "fresh",
  "variety": "Roma VF",

  // QUANTITY
  "quantity": 500.0,
  "unit": "kg",
  "qualityGrade": "grade_a",
  "reservedQuantity": 100.0,
  "availableQuantity": 400.0,

  // DATES
  "harvestDate": "2026-01-22T08:00:00.000Z",
  "expiryDate": "2026-02-01T00:00:00.000Z",

  // STORAGE
  "storageLocation": "Farm 1 - Cold Storage Unit B",
  "storageConditions": "4°C, 85% humidity",

  // PRICING
  "unitPrice": 5.50,
  "currency": "AED",

  // METADATA
  "sourceHarvestId": "harvest-880e8400-e29b-41d4-a716-446655440000",
  "notes": "From Block B-12 harvest cycle",
  "createdBy": "user-456e7890-e12b-34c5-d678-901234567890",
  "createdAt": "2026-01-22T09:00:00.000Z",
  "updatedAt": "2026-01-22T09:00:00.000Z"
}
```

### Example 3: Default Input Inventory

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439013"),
  "inventoryId": "c3d4e5f6-a7b8-9012-cdef-123456789012",

  // SCOPE FIELDS
  "farmId": null,                                    // Default inventory
  "organizationId": "org-123e4567-e89b-12d3-a456-426614174000",
  "inventoryScope": "organization",

  // ITEM DETAILS
  "itemName": "NPK 20-20-20 Fertilizer",
  "category": "fertilizer",
  "brand": "GreenGrow",
  "sku": "GG-NPK-2020-50",

  // QUANTITY (display units)
  "quantity": 5000.0,
  "unit": "kg",
  "minimumStock": 1000.0,

  // QUANTITY (base units for calculations)
  "baseUnit": "mg",
  "baseQuantity": 5000000000.0,                      // 5000 kg in mg
  "baseMinimumStock": 1000000000.0,                  // 1000 kg in mg
  "isLowStock": false,

  // DATES
  "purchaseDate": "2026-01-15T00:00:00.000Z",
  "expiryDate": "2027-01-15T00:00:00.000Z",

  // STORAGE
  "storageLocation": "Central Warehouse - Section C - Shelf 5",

  // COST
  "unitCost": 2.50,
  "currency": "AED",
  "supplier": "AgriSupply Co.",

  // SPECIFICATIONS
  "activeIngredients": "Nitrogen 20%, Phosphorus 20%, Potassium 20%",
  "concentration": "20-20-20",
  "applicationRate": "5g per plant every 2 weeks",
  "safetyNotes": "Wear gloves and mask. Store in dry place.",

  // TRANSFER HISTORY
  "transferHistory": [
    {
      "transferId": "xfer-990e8400-e29b-41d4-a716-446655440000",
      "fromScope": "organization",
      "toScope": "farm",
      "fromFarmId": null,
      "toFarmId": "farm-660e8400-e29b-41d4-a716-446655440000",
      "quantityTransferred": 500000000.0,            // 500 kg in mg
      "transferredAt": "2026-01-18T10:00:00.000Z",
      "transferredBy": "user-123e4567-e89b-12d3-a456-426614174000",
      "reason": "Farm 1 requested fertilizer for Block B-15"
    }
  ],

  // METADATA
  "notes": "Bulk purchase - distribute to farms as needed",
  "createdBy": "user-123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-18T10:00:00.000Z",
  "lastUsedAt": "2026-01-18T10:00:00.000Z"
}
```

### Example 4: Default Asset Inventory (Shared Equipment)

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439014"),
  "inventoryId": "d4e5f6a7-b8c9-0123-def0-234567890123",

  // SCOPE FIELDS
  "farmId": null,                                    // Default inventory (asset pool)
  "organizationId": "org-123e4567-e89b-12d3-a456-426614174000",
  "inventoryScope": "organization",

  // ASSET DETAILS
  "assetName": "John Deere 5075E Tractor",
  "category": "tractor",
  "assetTag": "TRAC-SHARED-001",
  "serialNumber": "1LV5075EVHH123456",
  "brand": "John Deere",
  "model": "5075E",
  "year": 2022,

  // STATUS
  "status": "operational",
  "condition": "Excellent - Regular maintenance performed",

  // CURRENT ALLOCATION (currently at Farm 2)
  "currentAllocation": {
    "allocatedTo": "farm",
    "farmId": "farm-770e8400-e29b-41d4-a716-446655440000",
    "allocatedAt": "2026-01-20T08:00:00.000Z",
    "allocatedBy": "user-456e7890-e12b-34c5-d678-901234567890",
    "expectedReturnDate": "2026-01-30T00:00:00.000Z"
  },

  // ALLOCATION HISTORY
  "allocationHistory": [
    {
      "allocationId": "alloc-aa0e8400-e29b-41d4-a716-446655440000",
      "farmId": "farm-660e8400-e29b-41d4-a716-446655440000",
      "allocatedAt": "2026-01-10T08:00:00.000Z",
      "returnedAt": "2026-01-15T17:00:00.000Z",
      "allocatedBy": "user-123e4567-e89b-12d3-a456-426614174000",
      "returnedBy": "user-789e0123-e45b-67c8-d901-234567890123",
      "condition": "Good - minor wear on tires",
      "notes": "Used for plowing blocks B-10 to B-15"
    },
    {
      "allocationId": "alloc-bb0e8400-e29b-41d4-a716-446655440000",
      "farmId": "farm-770e8400-e29b-41d4-a716-446655440000",
      "allocatedAt": "2026-01-20T08:00:00.000Z",
      "returnedAt": null,                            // Currently allocated
      "allocatedBy": "user-456e7890-e12b-34c5-d678-901234567890",
      "returnedBy": null,
      "condition": "Excellent",
      "notes": "Allocated for spring planting season"
    }
  ],

  // LOCATION
  "location": "Farm 2 - Main Equipment Shed",        // Current physical location
  "assignedTo": "Farm 2 Operations Team",

  // FINANCIAL
  "purchaseDate": "2022-03-15T00:00:00.000Z",
  "purchasePrice": 150000.0,
  "currentValue": 135000.0,
  "currency": "AED",

  // MAINTENANCE
  "lastMaintenanceDate": "2026-01-01T00:00:00.000Z",
  "nextMaintenanceDate": "2026-04-01T00:00:00.000Z",
  "maintenanceOverdue": false,
  "maintenanceNotes": "Oil change and filter replacement completed",

  // SPECIFICATIONS
  "specifications": "75 HP, 4WD, Cab with A/C, Front loader compatible",
  "warrantyExpiry": "2025-03-15T00:00:00.000Z",
  "documentationUrl": "https://a64platform.com/docs/assets/TRAC-SHARED-001",

  // METADATA
  "notes": "Shared tractor for all farms - allocate via booking system",
  "createdBy": "user-123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2022-03-15T10:00:00.000Z",
  "updatedAt": "2026-01-20T08:00:00.000Z"
}
```

### Example 5: Inventory Movement - Organization → Farm Transfer

```javascript
{
  "_id": ObjectId("507f1f77bcf86cd799439015"),
  "movementId": "mov-e5f6a7b8-c9d0-1234-ef01-345678901234",

  // BASIC MOVEMENT INFO
  "inventoryId": "c3d4e5f6-a7b8-9012-cdef-123456789012",  // NPK Fertilizer
  "inventoryType": "input",
  "movementType": "transfer",

  // QUANTITY CHANGE
  "quantityBefore": 5000000000.0,                    // 5000 kg in base units (mg)
  "quantityChange": -500000000.0,                    // -500 kg transferred
  "quantityAfter": 4500000000.0,                     // 4500 kg remaining

  // SCOPE TRACKING (NEW)
  "fromScope": "organization",
  "toScope": "farm",
  "fromFarmId": null,
  "toFarmId": "farm-660e8400-e29b-41d4-a716-446655440000",

  // ORGANIZATION CONTEXT (NEW)
  "organizationId": "org-123e4567-e89b-12d3-a456-426614174000",

  // METADATA
  "reason": "Farm 1 requested fertilizer for Block B-15 planting",
  "referenceId": "TRANSFER-2026-001",
  "performedBy": "user-123e4567-e89b-12d3-a456-426614174000",
  "performedAt": "2026-01-18T10:00:00.000Z"
}
```

---

## Migration Strategy

### Phase 1: Schema Preparation (No Downtime)

**Step 1: Add New Fields (Non-Breaking)**

```javascript
// Add organizationId to all existing inventory documents
// Set from farmId lookup
db.inventory_harvest.updateMany(
  { organizationId: { $exists: false } },
  [{
    $lookup: {
      from: "farms",
      localField: "farmId",
      foreignField: "farmId",
      as: "farmData"
    }
  }, {
    $set: {
      organizationId: { $arrayElemAt: ["$farmData.organizationId", 0] },
      inventoryScope: "farm"
    }
  }]
);

// Repeat for inventory_input and inventory_asset
```

**Step 2: Create New Indexes**

```javascript
// Add new indexes (can be done online)
db.inventory_harvest.createIndex({ organizationId: 1 });
db.inventory_harvest.createIndex({ inventoryScope: 1 });
db.inventory_harvest.createIndex({ organizationId: 1, inventoryScope: 1 });
// ... (all new indexes from Indexes section)
```

### Phase 2: Application Update (Coordinated Deployment)

**Step 3: Deploy Updated Models**
- Update Pydantic models to include new fields
- Make farmId Optional (Union[UUID, None])
- Add validation logic for scope rules
- Update API endpoints to handle null farmId

**Step 4: Deploy Updated API**
- New endpoints: POST /inventory/transfer
- Updated endpoints: All CRUD operations support scope filtering
- Backward compatible: Existing farm inventory queries work unchanged

### Phase 3: Validation (Post-Deployment)

**Step 5: Verify Data Integrity**

```javascript
// Check all items have organizationId
db.inventory_harvest.find({ organizationId: null }).count();  // Should be 0

// Check inventoryScope matches farmId
db.inventory_harvest.find({
  $or: [
    { farmId: null, inventoryScope: "farm" },
    { farmId: { $ne: null }, inventoryScope: "organization" }
  ]
}).count();  // Should be 0
```

### Rollback Plan

If issues occur, rollback is safe because:
1. New fields are optional - old code ignores them
2. Old indexes still exist - old queries work
3. No data is deleted - only new fields added
4. farmId still exists - existing queries unchanged

To rollback:
1. Redeploy old application code
2. New data added to default inventory will be orphaned but harmless
3. Remove new indexes (optional - they don't break anything)

---

## Query Patterns

### Pattern 1: List All Default Inventory for Organization

**Query:**
```javascript
// MongoDB
db.inventory_harvest.find({
  organizationId: "org-123...",
  farmId: null,                    // Or: inventoryScope: "organization"
  deletedAt: null
});
```

**API:**
```http
GET /api/v1/farm/inventory/harvest?organizationId=org-123&scope=organization
```

**Indexes Used:**
- `organizationId_1_inventoryScope_1`

### Pattern 2: List All Farm Inventory for Organization

**Query:**
```javascript
// MongoDB
db.inventory_input.find({
  organizationId: "org-123...",
  farmId: { $ne: null },           // Or: inventoryScope: "farm"
  deletedAt: null
});
```

**API:**
```http
GET /api/v1/farm/inventory/input?organizationId=org-123&scope=farm
```

**Indexes Used:**
- `organizationId_1_inventoryScope_1`

### Pattern 3: List All Inventory (Default + All Farms) for Organization

**Query:**
```javascript
// MongoDB
db.inventory_asset.find({
  organizationId: "org-123...",
  deletedAt: null
});
```

**API:**
```http
GET /api/v1/farm/inventory/asset?organizationId=org-123
```

**Indexes Used:**
- `organizationId_1`

### Pattern 4: Find Low Stock Items (Organization-Wide)

**Query:**
```javascript
// MongoDB
db.inventory_input.find({
  organizationId: "org-123...",
  isLowStock: true,
  deletedAt: null
});
```

**API:**
```http
GET /api/v1/farm/inventory/input?organizationId=org-123&lowStockOnly=true
```

**Indexes Used:**
- `organizationId_1_isLowStock_1`

### Pattern 5: Transfer Item from Default → Farm

**Business Logic:**
1. Find item in default inventory (farmId = null)
2. Validate sufficient quantity
3. Create movement record (TRANSFER type)
4. Option A: Update existing item, reduce quantity
5. Option B: Create new farm inventory item with transferred quantity
6. Record transfer in transferHistory

**API:**
```http
POST /api/v1/farm/inventory/transfer
{
  "inventoryId": "c3d4e5f6-...",
  "fromScope": "organization",
  "toScope": "farm",
  "toFarmId": "farm-660...",
  "quantity": 500,
  "unit": "kg",
  "reason": "Farm 1 requested fertilizer"
}
```

### Pattern 6: Find All Transfers for a Farm

**Query:**
```javascript
// MongoDB - Items transferred TO this farm
db.inventory_movements.find({
  organizationId: "org-123...",
  movementType: "transfer",
  toFarmId: "farm-660...",
  deletedAt: null
}).sort({ performedAt: -1 });

// Items transferred FROM this farm
db.inventory_movements.find({
  organizationId: "org-123...",
  movementType: "transfer",
  fromFarmId: "farm-660...",
  deletedAt: null
}).sort({ performedAt: -1 });
```

**API:**
```http
GET /api/v1/farm/inventory/movements?farmId=farm-660&movementType=transfer
```

**Indexes Used:**
- `toFarmId_1_movementType_1_performedAt_-1`
- `fromFarmId_1_movementType_1_performedAt_-1`

### Pattern 7: Find Shared Assets Currently Allocated to Farm

**Query:**
```javascript
// MongoDB
db.inventory_asset.find({
  organizationId: "org-123...",
  farmId: null,                              // Default inventory
  "currentAllocation.farmId": "farm-660...", // But allocated to farm
  deletedAt: null
});
```

**API:**
```http
GET /api/v1/farm/inventory/asset?organizationId=org-123&allocatedToFarm=farm-660
```

**Indexes Used:**
- `organizationId_1_currentAllocation.farmId_1`

### Pattern 8: Organization Inventory Summary (Dashboard)

**Aggregation:**
```javascript
// Total value across all scopes
db.inventory_input.aggregate([
  {
    $match: {
      organizationId: "org-123...",
      deletedAt: null
    }
  },
  {
    $group: {
      _id: "$inventoryScope",
      totalItems: { $sum: 1 },
      totalValue: {
        $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] }
      },
      lowStockCount: {
        $sum: { $cond: ["$isLowStock", 1, 0] }
      }
    }
  }
]);
```

**API:**
```http
GET /api/v1/farm/inventory/summary?organizationId=org-123
```

**Response:**
```json
{
  "organization": {
    "totalItems": 150,
    "totalValue": 125000.00,
    "lowStockCount": 5
  },
  "farms": {
    "totalItems": 450,
    "totalValue": 375000.00,
    "lowStockCount": 12
  },
  "combined": {
    "totalItems": 600,
    "totalValue": 500000.00,
    "lowStockCount": 17
  }
}
```

---

## Security Considerations

### 1. Organization Isolation

**Requirement:** Users must ONLY access inventory for their organization

**Implementation:**
```python
# ALWAYS include organizationId in queries
user_org_id = current_user.organizationId

# WRONG - Allows access to any inventory
inventory = await db.inventory_harvest.find_one({"inventoryId": inventory_id})

# CORRECT - Enforces organization boundary
inventory = await db.inventory_harvest.find_one({
    "inventoryId": inventory_id,
    "organizationId": user_org_id  # Security boundary
})
```

### 2. Farm Access Control

**Requirement:** Farm managers can only access their assigned farms

**Implementation:**
```python
# Check farm assignment
if user_role == "farm_manager":
    assigned_farms = await get_user_assigned_farms(user_id, organization_id)

    # Restrict to assigned farms only
    if farm_id not in assigned_farms:
        raise HTTPException(status_code=403, detail="Not authorized for this farm")
```

### 3. Transfer Authorization

**Requirement:** Only authorized users can transfer inventory

**Implementation:**
```python
# Organization admin: Can transfer from/to any farm in organization
# Farm manager: Can only transfer TO their assigned farms (not FROM default)
# Regular user: Cannot transfer

if movement_type == "transfer":
    if from_scope == "organization":
        # Requires organization-level permission
        if user_role not in ["super_admin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot transfer from organization inventory")

    if to_scope == "farm":
        # Verify user has access to destination farm
        if user_role == "farm_manager" and to_farm_id not in user.assigned_farms:
            raise HTTPException(status_code=403, detail="Not authorized for destination farm")
```

---

## API Endpoint Design Considerations

### Approach 1: Unified Endpoints with Scope Parameter (RECOMMENDED)

**Pros:**
- ✅ Single API for both scopes
- ✅ Consistent API design
- ✅ Easy to query across scopes
- ✅ Less code duplication

**Example:**
```http
GET /api/v1/farm/inventory/harvest?organizationId=org-123&scope=organization
GET /api/v1/farm/inventory/harvest?organizationId=org-123&farmId=farm-660
GET /api/v1/farm/inventory/harvest?organizationId=org-123  # All scopes
```

### Approach 2: Separate Endpoint Paths (Alternative)

**Pros:**
- Clear separation of concerns
- Explicit intent in URL

**Cons:**
- ❌ Doubles endpoint count
- ❌ Code duplication
- ❌ Harder to query across scopes

**Example:**
```http
GET /api/v1/farm/inventory/harvest/default?organizationId=org-123
GET /api/v1/farm/inventory/harvest/farm?farmId=farm-660
```

**Recommendation:** Use Approach 1 (Unified Endpoints)

---

## Performance Considerations

### 1. Index Coverage

**All common queries MUST be covered by indexes:**
- ✅ Filter by organizationId: `organizationId_1`
- ✅ Filter by scope: `organizationId_1_inventoryScope_1`
- ✅ Filter by farm: `organizationId_1_farmId_1`
- ✅ Transfer queries: `fromFarmId_1_movementType_1_performedAt_-1`

### 2. Aggregation Performance

**Large organizations may have thousands of inventory items**

**Optimization:**
```javascript
// BAD: No indexes, full collection scan
db.inventory_input.aggregate([
  { $group: { _id: "$inventoryScope", count: { $sum: 1 } } }
]);

// GOOD: Uses organizationId index first
db.inventory_input.aggregate([
  { $match: { organizationId: "org-123..." } },  // Index scan
  { $group: { _id: "$inventoryScope", count: { $sum: 1 } } }
]);
```

### 3. Transfer History Size

**Problem:** `transferHistory` array could grow very large

**Solution 1:** Cap array size
```javascript
// Keep only last 50 transfers in document
db.inventory_input.updateOne(
  { inventoryId: "..." },
  {
    $push: {
      transferHistory: {
        $each: [newTransfer],
        $slice: -50  // Keep last 50 only
      }
    }
  }
);
```

**Solution 2:** Separate collection (if very high volume)
```javascript
// Create separate collection: inventory_transfer_history
// Query via inventoryId index
db.inventory_transfer_history.find({ inventoryId: "..." })
  .sort({ transferredAt: -1 })
  .limit(50);
```

---

## Testing Strategy

### Unit Tests

1. **Validation Rules**
   - Test: Default inventory must have organizationId
   - Test: Farm inventory must have farmId AND organizationId
   - Test: blockId only valid when farmId present
   - Test: Transfer validation logic

2. **Scope Logic**
   - Test: inventoryScope computed correctly from farmId
   - Test: Default inventory queries exclude farm items
   - Test: Farm inventory queries exclude default items

### Integration Tests

1. **CRUD Operations**
   - Test: Create default inventory item
   - Test: Create farm inventory item
   - Test: Update inventory maintains scope
   - Test: Delete inventory (soft delete)

2. **Transfer Operations**
   - Test: Transfer from default → farm
   - Test: Transfer from farm → default
   - Test: Transfer from farm → farm (via default)
   - Test: Insufficient quantity error
   - Test: Authorization checks

3. **Query Performance**
   - Test: Query with organizationId uses index
   - Test: Query with farmId uses index
   - Test: Aggregation queries use indexes
   - Test: Transfer history queries performant

### End-to-End Tests

1. **User Workflows**
   - Test: Admin creates default inventory
   - Test: Admin transfers to farm
   - Test: Farm manager views farm inventory
   - Test: Farm manager cannot access other farms
   - Test: Dashboard shows correct org-wide stats

---

## Open Questions for User

1. **Organization Field Source:**
   - Do we have an existing `organizations` collection?
   - Or do we derive `organizationId` from user context?
   - Should farms have an `organizationId` field? (Assuming YES based on User-Structure.md)

2. **Transfer Workflow:**
   - Should transfers create NEW inventory items or UPDATE existing ones?
   - Example: Transfer 500kg fertilizer from default → farm
     - Option A: Reduce default item by 500kg, create new farm item with 500kg
     - Option B: Reduce default item by 500kg, increase existing farm item by 500kg

3. **Asset Allocation vs Transfer:**
   - For assets (tractors), should we use "allocation" (temporary) or "transfer" (permanent)?
   - Current design uses `currentAllocation` for temporary assignments
   - Should permanent asset transfers move `farmId` and use normal transfers?

4. **Soft Delete:**
   - Should we add `deletedAt` fields for soft deletes?
   - This wasn't in the original schema but is a best practice

5. **Multi-Tenancy:**
   - Is the platform truly multi-tenant (multiple organizations)?
   - Or single organization with multiple farms?
   - This affects whether `organizationId` is required in queries

---

## Next Steps

1. **Get User Approval** on this schema design
2. **Clarify Open Questions** listed above
3. **Create Migration Scripts** based on finalized design
4. **Update Pydantic Models** in `inventory.py`
5. **Update API Endpoints** in `api/v1/inventory.py`
6. **Implement Transfer Logic** as new endpoints
7. **Add Validation** for scope rules
8. **Create Indexes** via migration script
9. **Write Tests** (unit, integration, E2E)
10. **Update Documentation** (API-Structure.md, etc.)

---

## Document Status

**Status:** DESIGN COMPLETE - AWAITING APPROVAL

**Do NOT implement** until user reviews and approves this design.

**Estimated Implementation Time:**
- Schema migration: 2-4 hours
- Model updates: 2-3 hours
- API endpoint updates: 4-6 hours
- Transfer logic: 6-8 hours
- Testing: 6-8 hours
- Documentation: 2-3 hours
- **Total: 22-32 hours** (3-4 days)
