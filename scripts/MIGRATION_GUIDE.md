# Data Migration Guide: PostgreSQL → MongoDB

**Version:** 1.0.0
**Date:** 2026-01-22
**Author:** Database Schema Architect

---

## Overview

This guide documents the complete data migration from the old PostgreSQL-based system to the new MongoDB-based A64 Core Platform. The migration script handles 11 PostgreSQL tables and transforms them into 8 MongoDB collections, preserving data integrity and relationships.

---

## Table of Contents

1. [Migration Scope](#migration-scope)
2. [Schema Mapping](#schema-mapping)
3. [Prerequisites](#prerequisites)
4. [Running the Migration](#running-the-migration)
5. [Migration Process](#migration-process)
6. [Data Transformations](#data-transformations)
7. [Verification](#verification)
8. [Rollback Procedure](#rollback-procedure)
9. [Troubleshooting](#troubleshooting)

---

## Migration Scope

### Source: PostgreSQL (Old System)

**11 Tables (Total ~7.5 MB):**

| Table | Records | Size | Description |
|-------|---------|------|-------------|
| `farm_details` | 7 | 464 B | Farm master data |
| `farm_block` | ~1,000+ | 535 KB | Active block plantings |
| `block_standard` | ~100 | 48 KB | Block templates |
| `standard_planning` | ~50 | 152 KB | Plant cultivation data |
| `harvest_reports` | ~10,000+ | 2.9 MB | Historical harvests |
| `block_history` | ~2,000+ | 359 KB | Completed cycles |
| `client_details` | 19 | 1.5 KB | Customers |
| `vehicle_details` | 11 | 941 B | Vehicles |
| `orderlist_re` | ~5,000+ | 952 KB | Order headers |
| `order_list_content` | ~15,000+ | 1.8 MB | Order line items |
| `crop_price` | ~8,000+ | 807 KB | Historical pricing |

**Total Records:** ~42,000+

---

### Target: MongoDB (New System)

**8 Collections:**

| Collection | Source Tables | Description |
|------------|---------------|-------------|
| `farms` | farm_details | Farm master data |
| `blocks` | farm_block, block_standard | Block lifecycle management |
| `plant_data` | standard_planning | Plant cultivation requirements |
| `block_harvests` | harvest_reports | Harvest records |
| `block_archives` | block_history | Completed planting cycles |
| `customers` | client_details | CRM customer data |
| `crop_prices` | crop_price | **NEW** - Historical pricing data |
| `sales_orders` | orderlist_re, order_list_content | **FUTURE** - Sales orders (not yet implemented) |

---

## Schema Mapping

### 1. Farms (farm_details → farms)

**PostgreSQL Schema:**
```sql
farm_details (
  Name VARCHAR,
  ref UUID
)
```

**MongoDB Schema:**
```javascript
farms {
  farmId: UUID (new),              // Generated
  name: String,                    // ← Name
  description: String,             // NULL (not in old schema)
  owner: String,                   // NULL
  location: Object,                // NULL
  totalArea: Number,               // 0 (not in old schema)
  areaUnit: String,                // 'hectares'
  numberOfStaff: Number,           // 0
  managerId: UUID,                 // Migration user
  managerEmail: String,            // Migration email
  isActive: Boolean,               // true
  createdAt: Date,
  updatedAt: Date,
  _migrated: Boolean,              // true
  _oldRef: UUID                    // ← ref (preserved for reference)
}
```

**Transformations:**
- ✅ Generate new UUID for `farmId`
- ✅ Preserve old `ref` in `_oldRef` for traceability
- ✅ Set default values for new required fields
- ✅ Mark as migrated with `_migrated: true`

---

### 2. Plant Data (standard_planning → plant_data)

**PostgreSQL Schema:**
```sql
standard_planning (
  Item VARCHAR,                   -- Plant name
  TotalDurationday INTEGER,       -- Growth cycle
  NetYieldPerDripkg DECIMAL,      -- Expected yield
  HarvestDurationday INTEGER,     -- Harvest period
  Cleaningday INTEGER,            -- Cleaning time
  PlanningFertilizer JSON,        -- Fertilizer schedule
  ref UUID
)
```

**MongoDB Schema:**
```javascript
plant_data {
  plantDataId: UUID,               // Generated
  plantName: String,               // ← Item
  scientificName: String,          // NULL
  plantType: String,               // 'Crop'
  growthCycleDays: Number,         // ← TotalDurationday
  expectedYieldPerPlant: Number,   // ← NetYieldPerDripkg
  yieldUnit: String,               // 'kg'
  spacingCategory: String,         // 'm' (default medium)
  notes: String,                   // Migration notes with old data
  dataVersion: Number,             // 1
  createdBy: UUID,
  createdByEmail: String,
  createdAt: Date,
  updatedAt: Date,
  _migrated: Boolean,
  _oldRef: UUID,                   // ← ref
  _oldFertilizerData: JSON         // ← PlanningFertilizer (preserved)
}
```

**Transformations:**
- ✅ Map plant name from `Item`
- ✅ Extract growth cycle from `TotalDurationday`
- ✅ Convert yield per drip to yield per plant
- ✅ Preserve fertilizer schedule in `_oldFertilizerData` for reference
- ✅ Set default spacing category

---

### 3. Blocks (farm_block + block_standard → blocks)

**PostgreSQL Schema:**
```sql
farm_block (
  block_id VARCHAR,               -- Block identifier (e.g., A-21-002)
  farm_details_ref UUID,          -- Farm reference
  standard_planning_ref UUID,     -- Plant data reference
  drips INTEGER,                  -- Number of drips (≈ plants)
  state VARCHAR,                  -- Planted/Cleaned/etc.
  time_start TIMESTAMP,           -- Planting date
  time_finish TIMESTAMP,          -- Expected harvest
  Item VARCHAR,                   -- Crop name
  InventoryData JSON,             -- Fertilizer schedule
  ref UUID
)

block_standard (
  BlockID VARCHAR,                -- Block template ID
  Area DECIMAL,                   -- Block area
  TotalDrips INTEGER,             -- Max capacity
  farm_details_ref UUID,          -- Farm reference
  type VARCHAR                    -- Open Field/Green House/etc.
)
```

**MongoDB Schema:**
```javascript
blocks {
  blockId: UUID,                   // Generated
  farmId: UUID,                    // ← Resolved from farm_details_ref
  farmCode: String,                // Generated from farm name
  blockCode: String,               // Generated (e.g., ALF-001)
  sequenceNumber: Number,          // Auto-increment per farm
  name: String,                    // ← block_id (old identifier)
  blockType: String,               // 'openfield' (default)
  maxPlants: Number,               // ← drips
  area: Number,                    // Calculated from drips (drips × 0.3)
  areaUnit: String,                // 'sqm'
  state: String,                   // ← Mapped from state
  targetCrop: UUID,                // ← Resolved from standard_planning_ref
  targetCropName: String,          // ← Item
  actualPlantCount: Number,        // ← drips
  plantedDate: Date,               // ← time_start
  expectedHarvestDate: Date,       // ← time_finish
  kpi: {
    predictedYieldKg: Number,      // 0 (calculated later)
    actualYieldKg: Number,         // 0
    yieldEfficiencyPercent: Number,// 0
    totalHarvests: Number          // 0
  },
  createdAt: Date,
  updatedAt: Date,
  isActive: Boolean,               // Based on state
  _migrated: Boolean,
  _oldRef: UUID,                   // ← ref
  _oldBlockId: String,             // ← block_id (preserved)
  _oldInventoryData: JSON          // ← InventoryData (preserved)
}
```

**State Mapping:**
- `Planted` → `planted`
- `Cleaned` → `empty`
- `Harvesting` → `harvesting`
- `Growing` → `growing`

**Transformations:**
- ✅ Generate new block code (FARM-XXX format)
- ✅ Resolve farm and plant references using UUID maps
- ✅ Calculate approximate area from drip count
- ✅ Map old state to new state enum
- ✅ Preserve fertilizer schedule for reference

---

### 4. Harvests (harvest_reports → block_harvests)

**PostgreSQL Schema:**
```sql
harvest_reports (
  farm_block_ref UUID,            -- Block reference
  Quantity DECIMAL,               -- Harvest amount
  harvestSeason INTEGER,          -- Season number
  time TIMESTAMP,                 -- Harvest date
  crop VARCHAR,                   -- Crop name
  farm VARCHAR,                   -- Farm name
  reporter_user VARCHAR,          -- Email of reporter
  grade VARCHAR,                  -- A/B/C
  ref UUID
)
```

**MongoDB Schema:**
```javascript
block_harvests {
  harvestId: UUID,                 // Generated
  blockId: UUID,                   // ← Resolved from farm_block_ref
  farmId: UUID,                    // Resolved from block
  plantingId: UUID,                // NULL (not tracked in old system)
  harvestDate: Date,               // ← time
  amount: Number,                  // ← Quantity
  unit: String,                    // 'kg'
  qualityGrade: String,            // ← Mapped from grade
  harvestedBy: UUID,               // Migration user
  harvestedByEmail: String,        // ← reporter_user
  notes: String,                   // Season info + migration note
  createdAt: Date,
  _migrated: Boolean,
  _oldRef: UUID                    // ← ref
}
```

**Quality Grade Mapping:**
- `A` → `A`
- `B` → `B`
- `C` → `C`
- `NULL` → `B` (default)

**Transformations:**
- ✅ Resolve block and farm references
- ✅ Map quality grades
- ✅ Preserve season information in notes
- ✅ Handle missing grades with default

---

### 5. Block Archives (block_history → block_archives)

**PostgreSQL Schema:**
```sql
block_history (
  farm_block_ref UUID,            -- Block reference
  farm_id UUID,                   -- Farm reference
  crop_id UUID,                   -- Plant reference
  time_start TIMESTAMP,           -- Planting date
  time_finish TIMESTAMP,          -- Harvest start
  time_cleaned TIMESTAMP,         -- Cycle end
  harvest_duration INTEGER,       -- Days
  predicted_yield DECIMAL,        -- Expected yield
  net_yield DECIMAL,              -- Actual yield
  kpi JSON,                       -- KPI data
  ref UUID
)
```

**MongoDB Schema:**
```javascript
block_archives {
  archiveId: UUID,                 // Generated
  blockId: UUID,                   // ← Resolved from farm_block_ref
  farmId: UUID,                    // ← Resolved from farm_id
  plantDataId: UUID,               // ← Resolved from crop_id
  plantName: String,               // From plant data
  plantedDate: Date,               // ← time_start
  harvestStartDate: Date,          // ← time_finish
  harvestEndDate: Date,            // ← time_cleaned
  cycleDuration: Number,           // Calculated or ← harvest_duration
  predictedYield: {
    amount: Number,                // ← predicted_yield
    unit: String                   // 'kg'
  },
  actualYield: {
    amount: Number,                // ← net_yield
    unit: String                   // 'kg'
  },
  yieldEfficiency: Number,         // Calculated: (actual/predicted) × 100
  qualityBreakdown: {
    gradeA: Number,                // 0 (not in old system)
    gradeB: Number,                // 0
    gradeC: Number,                // 0
    total: Number                  // ← net_yield
  },
  archivedAt: Date,                // ← time_cleaned
  archivedBy: UUID,                // Migration user
  archivedByEmail: String,
  _migrated: Boolean,
  _oldRef: UUID,                   // ← ref
  _oldKpiData: JSON                // ← kpi (preserved)
}
```

**Transformations:**
- ✅ Resolve all UUID references
- ✅ Calculate cycle duration from dates
- ✅ Calculate yield efficiency percentage
- ✅ Preserve old KPI data for reference

---

### 6. Customers (client_details → customers)

**PostgreSQL Schema:**
```sql
client_details (
  clientname VARCHAR,             -- Customer name
  ref UUID
)
```

**MongoDB Schema:**
```javascript
customers {
  customerId: UUID,                // Generated
  customerCode: String,            // Generated (C001, C002, etc.)
  name: String,                    // ← clientname
  email: String,                   // NULL
  phone: String,                   // NULL
  company: String,                 // ← clientname
  address: Object,                 // NULL
  type: String,                    // 'business' (all old clients)
  status: String,                  // 'active'
  notes: String,                   // Migration note
  tags: Array,                     // ['migrated']
  createdBy: UUID,
  createdAt: Date,
  updatedAt: Date,
  _migrated: Boolean,
  _oldRef: UUID                    // ← ref
}
```

**Transformations:**
- ✅ Generate sequential customer codes (C001-C019)
- ✅ Set all old clients as business type
- ✅ Mark all as active status
- ✅ Add migration tag

---

### 7. Crop Prices (crop_price → crop_prices) **NEW COLLECTION**

**PostgreSQL Schema:**
```sql
crop_price (
  date TIMESTAMP,                 -- Price date
  customer VARCHAR,               -- Customer name
  crop VARCHAR,                   -- Crop name
  grade VARCHAR,                  -- Quality grade
  quantity DECIMAL,               -- Quantity sold
  price_unit DECIMAL,             -- Price per unit
  price_total DECIMAL,            -- Total price
  farm VARCHAR,                   -- Farm name
  ref UUID
)
```

**MongoDB Schema:**
```javascript
crop_prices {
  priceId: UUID,                   // Generated
  date: Date,                      // ← date
  customerId: UUID,                // Resolved by name lookup
  customerName: String,            // ← customer
  farmId: UUID,                    // Resolved by name lookup
  farmName: String,                // ← farm
  crop: String,                    // ← crop
  grade: String,                   // ← grade
  quantity: Number,                // ← quantity
  unit: String,                    // 'kg'
  pricePerUnit: Number,            // ← price_unit
  totalPrice: Number,              // ← price_total
  currency: String,                // 'AED'
  createdBy: UUID,
  createdAt: Date,
  _migrated: Boolean,
  _oldRef: UUID                    // ← ref
}
```

**Transformations:**
- ✅ Resolve customer and farm by name (since old system uses names)
- ✅ Set default currency to AED
- ✅ Preserve all pricing data

---

### 8. Sales Orders (orderlist_re + order_list_content → sales_orders) **FUTURE**

**PostgreSQL Schema:**
```sql
orderlist_re (
  RNumber VARCHAR,                -- Order number
  client_id VARCHAR,              -- Customer name
  farm_id VARCHAR,                -- Farm name
  vehicle_id VARCHAR,             -- Vehicle name
  StartDate TIMESTAMP,            -- Order date
  DatePacked TIMESTAMP,           -- Packed date
  DateFinished TIMESTAMP,         -- Delivered date
  status VARCHAR,                 -- Pending/Packed/Delivered
  order_driver VARCHAR,           -- Driver email
  packager_email VARCHAR,         -- Packager email
  note TEXT,                      -- Notes
  ref UUID
)

order_list_content (
  order_list_ref UUID,            -- Order header reference
  crop_id VARCHAR,                -- Product name
  quantity DECIMAL,               -- Quantity
  Grade VARCHAR,                  -- Quality grade
  packagesize VARCHAR,            -- Package size
  packagetype VARCHAR,            -- Package type
  avg_price DECIMAL,              -- Average price
  total_price DECIMAL             -- Total price
)
```

**MongoDB Schema:**
```javascript
sales_orders {
  orderId: UUID,                   // Generated
  orderNumber: String,             // ← RNumber or generated
  customerId: UUID,                // Resolved from client_id
  customerName: String,            // ← client_id
  farmId: UUID,                    // Resolved from farm_id
  orderDate: Date,                 // ← StartDate
  status: String,                  // ← Mapped from status
  items: [                         // ← Merged from order_list_content
    {
      itemId: UUID,
      productName: String,         // ← crop_id
      quantity: Number,            // ← quantity
      unit: String,                // 'kg'
      grade: String,               // ← Grade
      unitPrice: Number,           // ← avg_price
      totalPrice: Number,          // ← total_price
      packageSize: String,         // ← packagesize
      packageType: String          // ← packagetype
    }
  ],
  totalAmount: Number,             // Sum of all item totals
  currency: String,                // 'AED'
  packedDate: Date,                // ← DatePacked
  deliveredDate: Date,             // ← DateFinished
  driver: String,                  // ← order_driver
  vehicle: String,                 // ← vehicle_id
  packager: String,                // ← packager_email
  notes: String,                   // ← note
  createdBy: UUID,
  createdAt: Date,
  updatedAt: Date,
  _migrated: Boolean,
  _oldRef: UUID                    // ← ref
}
```

**Status Mapping:**
- `Pending` → `pending`
- `Packed` → `packed`
- `Delivered` → `delivered`
- `Cancelled` → `cancelled`

**Note:** This collection is prepared but not inserted yet, as the sales module is not implemented. The migration script prepares the data structure for future use.

---

## Prerequisites

### 1. MongoDB Running
```bash
# Check MongoDB is running
docker compose ps mongodb

# Should show:
# mongodb   Running
```

### 2. Database Access
```bash
# Test connection
mongosh "mongodb://localhost:27017/a64core_db" --eval "db.runCommand({ ping: 1 })"
```

### 3. Python Environment
```bash
# Ensure Python 3.11+ is available
python3 --version

# Install dependencies (if not already)
pip install motor pymongo
```

### 4. Old Data Files
```bash
# Verify SQL files exist
ls -lh /home/noobcity/Code/A64CorePlatform/OldData/220126/

# Should show 11 .sql files
```

---

## Running the Migration

### Step 1: Backup Current Database

**CRITICAL: Always backup before migration!**

```bash
# Backup MongoDB database
mongodump --uri="mongodb://localhost:27017/a64core_db" --out=/tmp/mongodb_backup_$(date +%Y%m%d_%H%M%S)

# Verify backup
ls -lh /tmp/mongodb_backup_*
```

### Step 2: Run Migration Script

```bash
cd /home/noobcity/Code/A64CorePlatform

# Make script executable
chmod +x scripts/migrate_old_data.py

# Run migration
python3 scripts/migrate_old_data.py
```

### Step 3: Monitor Progress

The script will output real-time progress:

```
Connecting to MongoDB at mongodb://localhost:27017...
✅ Connected to MongoDB successfully

======================================================================
STARTING DATA MIGRATION
======================================================================

📦 PHASE 1: Master Data
----------------------------------------------------------------------

🏞️  Migrating Farms...
📄 Reading farm_details_rows.sql...
   Parsed 7 rows
   ✅ Migrated 7 farms

🌱 Migrating Plant Data...
📄 Reading standard_planning_rows.sql...
   Parsed 50 rows
   ✅ Migrated 50 plant data records

👥 Migrating Customers...
📄 Reading client_details_rows.sql...
   Parsed 19 rows
   ✅ Migrated 19 customers

🚚 Migrating Vehicles...
📄 Reading vehicle_details_rows.sql...
   Parsed 11 rows
   ⚠️  Vehicles collection not yet implemented - 11 vehicles ready

📦 PHASE 2: Transactional Data
----------------------------------------------------------------------

📦 Migrating Blocks...
📄 Reading farm_block_rows.sql...
   Parsed 1234 rows
   ✅ Migrated batch 1: 100 blocks
   ✅ Migrated batch 2: 100 blocks
   ...
   ✅ Total migrated: 1234 blocks

🌾 Migrating Harvests...
📄 Reading harvest_reports_rows.sql...
   Parsed 12345 rows
   ✅ Migrated batch 1: 500 harvests
   ✅ Migrated batch 2: 500 harvests
   ...
   ✅ Total migrated: 12345 harvests

📚 Migrating Block Archives...
📄 Reading block_history_rows.sql...
   Parsed 567 rows
   ✅ Migrated batch 1: 200 archives
   ✅ Total migrated: 567 archives

📦 PHASE 3: Operational Data
----------------------------------------------------------------------

📋 Migrating Sales Orders...
📄 Reading orderlist_re_rows.sql...
   Parsed 890 rows
📄 Reading order_list_content_rows.sql...
   Parsed 2345 rows
   ⚠️  Sales orders collection not yet implemented - 890 orders ready

💰 Migrating Crop Prices...
📄 Reading crop_price_rows.sql...
   Parsed 5678 rows
   ✅ Migrated batch 1: 500 prices
   ...
   ✅ Total migrated: 5678 crop prices

📦 PHASE 4: Database Optimization
----------------------------------------------------------------------

🔧 Creating Indexes...
   ✅ Created indexes on farms collection
   ✅ Created indexes on blocks collection
   ✅ Created indexes on plant_data collection
   ✅ Created indexes on block_harvests collection
   ✅ Created indexes on block_archives collection
   ✅ Created indexes on customers collection
   ✅ Created indexes on crop_prices collection

   ✅ Total indexes created: 35

======================================================================
MIGRATION SUMMARY
======================================================================

✅ FARMS
   Total: 7
   Success: 7
   Failed: 0
   Success Rate: 100.0%

✅ PLANT_DATA
   Total: 50
   Success: 50
   Failed: 0
   Success Rate: 100.0%

✅ CUSTOMERS
   Total: 19
   Success: 19
   Failed: 0
   Success Rate: 100.0%

✅ BLOCKS
   Total: 1234
   Success: 1234
   Failed: 0
   Success Rate: 100.0%

✅ HARVESTS
   Total: 12345
   Success: 12345
   Failed: 0
   Success Rate: 100.0%

✅ BLOCK_ARCHIVES
   Total: 567
   Success: 567
   Failed: 0
   Success Rate: 100.0%

✅ CROP_PRICES
   Total: 5678
   Success: 5678
   Failed: 0
   Success Rate: 100.0%

----------------------------------------------------------------------
OVERALL TOTALS
   Total Records: 19900
   Successfully Migrated: 19900
   Failed: 0
   Overall Success Rate: 100.0%

======================================================================
MIGRATION COMPLETE
======================================================================

✅ Closed MongoDB connection
```

---

## Migration Process

### Phase 1: Master Data (No Dependencies)

**Order matters!** Master data must be migrated first because transactional data references them.

1. **Farms** - 7 records
   - Generate new `farmId`
   - Store UUID mapping: `old_ref` → `new_farmId`

2. **Plant Data** - ~50 records
   - Generate new `plantDataId`
   - Store UUID mapping: `old_ref` → `new_plantDataId`

3. **Customers** - 19 records
   - Generate new `customerId`
   - Generate customer codes (C001-C019)
   - Store UUID mapping: `old_ref` → `new_customerId`

4. **Vehicles** - 11 records (prepared but not inserted)
   - Data prepared for future logistics module

### Phase 2: Transactional Data (Depends on Master Data)

5. **Blocks** - ~1,000+ records
   - Resolve `farm_details_ref` → `farmId` using mapping
   - Resolve `standard_planning_ref` → `targetCrop` using mapping
   - Generate new block codes
   - Store UUID mapping: `old_ref` → `new_blockId`

6. **Harvests** - ~10,000+ records
   - Resolve `farm_block_ref` → `blockId` using mapping
   - Look up `farmId` from blocks collection
   - Map quality grades

7. **Block Archives** - ~2,000+ records
   - Resolve `farm_block_ref` → `blockId`
   - Resolve `farm_id` → `farmId`
   - Resolve `crop_id` → `plantDataId`
   - Calculate yield efficiency

### Phase 3: Operational Data

8. **Crop Prices** - ~8,000+ records
   - Look up customers by name (since old system used names)
   - Look up farms by name
   - Preserve all pricing history

9. **Sales Orders** - ~5,000+ orders (prepared but not inserted)
   - Merge order headers and line items
   - Data prepared for future sales module

### Phase 4: Database Optimization

10. **Index Creation**
    - Create unique indexes on ID fields
    - Create query indexes on foreign keys
    - Create indexes on migration tracking fields

---

## Data Transformations

### UUID Handling

**Strategy:** Generate new UUIDs, preserve old UUIDs for reference

```python
# Old system UUID
old_uuid = 'c82d1236-ceff-4b71-b883-8db0fbc383c5'

# Generate new UUID
new_uuid = str(uuid4())

# Store mapping for reference resolution
farm_id_map[old_uuid] = new_uuid

# In MongoDB document
{
  'farmId': new_uuid,           # New UUID
  '_oldRef': old_uuid,          # Old UUID (preserved)
  '_migrated': True             # Migration flag
}
```

### Reference Resolution

**Strategy:** Two-phase resolution with fallback

```python
# Phase 1: Direct UUID mapping
old_farm_ref = 'c82d1236-ceff-4b71-b883-8db0fbc383c5'
new_farm_id = farm_id_map.get(old_farm_ref)  # O(1) lookup

# Phase 2: Database lookup (fallback for names)
if not new_farm_id:
    farm_doc = await db.farms.find_one({'name': old_farm_name})
    if farm_doc:
        new_farm_id = farm_doc['farmId']
```

### Date/Time Handling

**Strategy:** Parse PostgreSQL timestamps to Python datetime (UTC)

```python
# Input: '2025-02-18 00:00:00+00'
# Output: datetime(2025, 2, 18, 0, 0, 0, tzinfo=timezone.utc)

formats = [
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %H:%M:%S.%f',
    '%Y-%m-%d',
]

for fmt in formats:
    try:
        dt = datetime.strptime(timestamp, fmt)
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        continue
```

### Enum Mapping

**Strategy:** Map old string values to new enum values

```python
# Block state mapping
state_map = {
    'Planted': 'planted',
    'Cleaned': 'empty',
    'Harvesting': 'harvesting',
    'Growing': 'growing'
}

new_state = state_map.get(old_state, 'empty')  # Default: empty
```

### Area Calculation

**Strategy:** Approximate area from drip count

```python
# Assumption: 1 drip ≈ 0.3 sqm
drips = 7280
area = drips * 0.3  # = 2184 sqm

# Can be updated later with actual measurements
```

---

## Verification

### Post-Migration Checks

#### 1. Record Counts

```bash
# Compare record counts
mongosh "mongodb://localhost:27017/a64core_db" --eval "
  db.farms.countDocuments({_migrated: true})
  db.blocks.countDocuments({_migrated: true})
  db.plant_data.countDocuments({_migrated: true})
  db.block_harvests.countDocuments({_migrated: true})
  db.block_archives.countDocuments({_migrated: true})
  db.customers.countDocuments({_migrated: true})
  db.crop_prices.countDocuments({_migrated: true})
"
```

Expected:
- Farms: 7
- Blocks: ~1,000+
- Plant Data: ~50
- Harvests: ~10,000+
- Archives: ~2,000+
- Customers: 19
- Crop Prices: ~8,000+

#### 2. Reference Integrity

```javascript
// Check all blocks have valid farm references
db.blocks.find({ _migrated: true }).forEach(block => {
  const farm = db.farms.findOne({ farmId: block.farmId });
  if (!farm) {
    print(`❌ Block ${block.blockId} has invalid farmId: ${block.farmId}`);
  }
});

// Check all harvests have valid block references
db.block_harvests.find({ _migrated: true }).forEach(harvest => {
  const block = db.blocks.findOne({ blockId: harvest.blockId });
  if (!block) {
    print(`❌ Harvest ${harvest.harvestId} has invalid blockId: ${harvest.blockId}`);
  }
});
```

#### 3. Data Quality

```javascript
// Check for null/empty required fields
db.farms.countDocuments({ _migrated: true, name: null })  // Should be 0
db.blocks.countDocuments({ _migrated: true, farmId: null })  // Should be 0
db.plant_data.countDocuments({ _migrated: true, plantName: null })  // Should be 0

// Check date ranges
db.blocks.find({ _migrated: true, plantedDate: { $gt: new Date() } })  // Should be empty
```

#### 4. Index Verification

```javascript
// List indexes
db.farms.getIndexes()
db.blocks.getIndexes()
db.block_harvests.getIndexes()

// Check unique indexes
db.farms.find({ farmId: "duplicate-uuid" }).count()  // Should be 0 or 1
db.blocks.find({ blockCode: "ALF-001" }).count()  // Should be 0 or 1
```

---

## Rollback Procedure

### If Migration Fails

#### Option 1: Drop Migrated Data

```javascript
// Remove only migrated records
db.farms.deleteMany({ _migrated: true });
db.blocks.deleteMany({ _migrated: true });
db.plant_data.deleteMany({ _migrated: true });
db.block_harvests.deleteMany({ _migrated: true });
db.block_archives.deleteMany({ _migrated: true });
db.customers.deleteMany({ _migrated: true });
db.crop_prices.deleteMany({ _migrated: true });
```

#### Option 2: Restore from Backup

```bash
# Restore entire database from backup
mongorestore --uri="mongodb://localhost:27017/a64core_db" --drop /tmp/mongodb_backup_YYYYMMDD_HHMMSS/a64core_db
```

#### Option 3: Drop and Recreate Database

```bash
# NUCLEAR OPTION: Drop entire database
mongosh "mongodb://localhost:27017/a64core_db" --eval "db.dropDatabase()"

# Restart API to recreate indexes
docker compose restart api
```

---

## Troubleshooting

### Issue 1: "File not found" Error

**Symptom:**
```
⚠️  File not found: farm_details_rows.sql
```

**Solution:**
```bash
# Check file exists
ls -l /home/noobcity/Code/A64CorePlatform/OldData/220126/farm_details_rows.sql

# Check file permissions
chmod 644 /home/noobcity/Code/A64CorePlatform/OldData/220126/*.sql
```

---

### Issue 2: "Duplicate key error"

**Symptom:**
```
pymongo.errors.DuplicateKeyError: E11000 duplicate key error collection: a64core_db.farms index: farmId_1
```

**Solution:**
```javascript
// Option 1: Drop migrated data and re-run
db.farms.deleteMany({ _migrated: true });

// Option 2: Drop collection and re-run
db.farms.drop();
```

---

### Issue 3: Reference Resolution Failures

**Symptom:**
```
⚠️  Skipping block A-21-002 - farm not found
```

**Solution:**
```javascript
// Check if farms were migrated successfully
db.farms.countDocuments({ _migrated: true })  // Should be 7

// Check farm UUID mappings
db.farms.find({ _migrated: true }, { farmId: 1, _oldRef: 1 })

// Manually check old reference
db.blocks.findOne({ _oldBlockId: "A-21-002" })
```

---

### Issue 4: Performance Issues

**Symptom:**
- Migration taking very long
- High memory usage

**Solution:**
```python
# Reduce batch size in script
batch_size = 50  # Instead of 500

# Run migration in stages
# Comment out phases 2-4, run phase 1 only first
```

---

### Issue 5: Data Type Mismatches

**Symptom:**
```
TypeError: float() argument must be a string or a number
```

**Solution:**
```python
# Add null checks
quantity = float(row.get('Quantity', 0) or 0)  # Handles None and empty string

# Add type conversion
drips = int(row.get('drips', 0) or 0)
```

---

## Notes & Best Practices

### Migration Tracking

All migrated documents include:
- `_migrated: true` - Flag for identifying migrated data
- `_oldRef: UUID` - Original UUID from old system
- `_old*` fields - Preserved old data for reference

### Data Cleanup

After successful migration and verification, old reference fields can be removed:

```javascript
// Remove migration tracking fields (optional, after verification)
db.farms.updateMany(
  { _migrated: true },
  { $unset: { _migrated: "", _oldRef: "" } }
);
```

**⚠️ Warning:** Only remove after thorough verification!

### Future Migrations

For incremental migrations or updates:

```python
# Query for non-migrated records only
if not await db.farms.find_one({'_oldRef': old_uuid}):
    # Migrate this record
    pass
```

### Performance Considerations

- Batch inserts: 100-500 records per batch
- Index creation: Done after all data inserted
- UUID mapping: In-memory dictionaries for O(1) lookup
- Reference resolution: Two-phase (mapping first, DB lookup fallback)

---

## Support & References

### Documentation
- [System Architecture](../Docs/1-Main-Documentation/System-Architecture.md)
- [MongoDB Schema Standards](../Docs/1-Main-Documentation/System-Architecture.md#database-architecture)

### Contact
- **Database Architecture Issues:** Database Schema Architect
- **General Platform Issues:** Development Team

---

**Last Updated:** 2026-01-22
**Document Version:** 1.0.0
