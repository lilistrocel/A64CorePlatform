# Data Migration Summary

**Quick Reference Guide for PostgreSQL → MongoDB Migration**

---

## Overview

- **Source:** PostgreSQL (11 tables, ~42,000 records, ~7.5 MB)
- **Target:** MongoDB (8 collections)
- **Script:** `/home/noobcity/Code/A64CorePlatform/scripts/migrate_old_data.py`
- **Documentation:** `/home/noobcity/Code/A64CorePlatform/scripts/MIGRATION_GUIDE.md`

---

## Quick Start

```bash
# 1. Backup database
mongodump --uri="mongodb://localhost:27017/a64core_db" --out=/tmp/mongodb_backup_$(date +%Y%m%d_%H%M%S)

# 2. Run migration
cd /home/noobcity/Code/A64CorePlatform
python3 scripts/migrate_old_data.py

# 3. Verify results (see below)
```

---

## Migration Mapping

| PostgreSQL Table | Records | → | MongoDB Collection | New Collection? |
|------------------|---------|---|-------------------|-----------------|
| farm_details | 7 | → | farms | ❌ Existing |
| standard_planning | ~50 | → | plant_data | ❌ Existing |
| client_details | 19 | → | customers | ❌ Existing (CRM) |
| vehicle_details | 11 | → | vehicles | ⚠️ Future (Logistics) |
| farm_block | ~1,000 | → | blocks | ❌ Existing |
| block_standard | ~100 | → | blocks | ❌ Existing (merged) |
| harvest_reports | ~10,000 | → | block_harvests | ❌ Existing |
| block_history | ~2,000 | → | block_archives | ❌ Existing |
| crop_price | ~8,000 | → | crop_prices | ✅ **NEW** |
| orderlist_re | ~5,000 | → | sales_orders | ⚠️ Future (Sales) |
| order_list_content | ~15,000 | → | sales_orders | ⚠️ Future (Sales) |

**Legend:**
- ✅ **NEW** - New collection created by migration
- ❌ **Existing** - Uses existing collection
- ⚠️ **Future** - Data prepared but not inserted (module not ready)

---

## What Gets Migrated

### ✅ Phase 1: Master Data (Immediate)
- ✅ **7 Farms** - Basic farm information
- ✅ **~50 Plant Data** - Crop cultivation requirements
- ✅ **19 Customers** - Client information

### ✅ Phase 2: Transactional Data (Immediate)
- ✅ **~1,000 Blocks** - Active and historical block data
- ✅ **~10,000 Harvests** - Harvest records
- ✅ **~2,000 Block Archives** - Completed cycles

### ✅ Phase 3: Operational Data (Immediate)
- ✅ **~8,000 Crop Prices** - Historical pricing data

### ⚠️ Prepared for Future
- ⚠️ **11 Vehicles** - Ready for Logistics module
- ⚠️ **~5,000 Sales Orders** - Ready for Sales module

---

## New MongoDB Collection

### crop_prices Collection

**Purpose:** Historical pricing data for crops and produce

**Schema:**
```javascript
{
  priceId: UUID,              // Unique price record ID
  date: Date,                 // Price date
  customerId: UUID,           // Customer reference
  customerName: String,       // Customer name
  farmId: UUID,               // Farm reference
  farmName: String,           // Farm name
  crop: String,               // Crop name
  grade: String,              // Quality grade
  quantity: Number,           // Quantity sold
  unit: String,               // Unit (kg)
  pricePerUnit: Number,       // Price per unit
  totalPrice: Number,         // Total price
  currency: String,           // Currency (AED)
  createdBy: UUID,            // User who recorded
  createdAt: Date             // When recorded
}
```

**Indexes:**
```javascript
db.crop_prices.createIndex({ priceId: 1 }, { unique: true })
db.crop_prices.createIndex({ date: -1 })  // Time-series queries
db.crop_prices.createIndex({ customerId: 1 })
db.crop_prices.createIndex({ farmId: 1 })
db.crop_prices.createIndex({ crop: 1 })
db.crop_prices.createIndex({ grade: 1 })
```

**Use Cases:**
- Price history tracking
- Customer-specific pricing analysis
- Grade-based pricing strategies
- Revenue reporting
- Market trend analysis

---

## Key Transformations

### UUID Management
- ✅ **Generate new UUIDs** for all records
- ✅ **Preserve old UUIDs** in `_oldRef` field
- ✅ **UUID mapping** for reference resolution

### Reference Resolution
- ✅ **Farm references** - Old farm UUID → New farm UUID
- ✅ **Plant references** - Old plant UUID → New plant UUID
- ✅ **Block references** - Old block UUID → New block UUID
- ✅ **Customer lookup** - By name (old system used names)

### Date Handling
- ✅ **Parse timestamps** - PostgreSQL format → Python datetime
- ✅ **Timezone conversion** - All dates stored in UTC
- ✅ **Null handling** - Missing dates handled gracefully

### Data Type Mapping
- ✅ **Strings** - Direct copy with validation
- ✅ **Numbers** - Convert to float/int with null handling
- ✅ **JSON** - Preserve as-is in special fields
- ✅ **Enums** - Map old values to new enum values

### State Mapping
```
PostgreSQL       →  MongoDB
-------------       -----------
Planted          →  planted
Cleaned          →  empty
Harvesting       →  harvesting
Growing          →  growing
```

### Grade Mapping
```
PostgreSQL  →  MongoDB
----------      -------
A           →  A
B           →  B
C           →  C
NULL        →  B (default)
```

---

## Verification Checklist

### After Migration Completes

```bash
# 1. Check record counts
mongosh "mongodb://localhost:27017/a64core_db" --quiet --eval "
  print('Farms:', db.farms.countDocuments({_migrated: true}));
  print('Blocks:', db.blocks.countDocuments({_migrated: true}));
  print('Plant Data:', db.plant_data.countDocuments({_migrated: true}));
  print('Harvests:', db.block_harvests.countDocuments({_migrated: true}));
  print('Archives:', db.block_archives.countDocuments({_migrated: true}));
  print('Customers:', db.customers.countDocuments({_migrated: true}));
  print('Crop Prices:', db.crop_prices.countDocuments({_migrated: true}));
"
```

**Expected:**
```
Farms: 7
Blocks: ~1000
Plant Data: ~50
Harvests: ~10000
Archives: ~2000
Customers: 19
Crop Prices: ~8000
```

### 2. Check Reference Integrity

```javascript
// All blocks should have valid farm references
db.blocks.countDocuments({
  _migrated: true,
  farmId: { $exists: true, $ne: null }
})  // Should equal total blocks

// All harvests should have valid block references
db.block_harvests.countDocuments({
  _migrated: true,
  blockId: { $exists: true, $ne: null }
})  // Should equal total harvests
```

### 3. Check Data Quality

```javascript
// No null values in required fields
db.farms.countDocuments({ _migrated: true, name: null })  // = 0
db.blocks.countDocuments({ _migrated: true, farmId: null })  // = 0
db.plant_data.countDocuments({ _migrated: true, plantName: null })  // = 0

// All dates in reasonable range
db.blocks.countDocuments({
  _migrated: true,
  plantedDate: { $gt: new Date('2020-01-01'), $lt: new Date('2030-01-01') }
})
```

### 4. Sample Data Inspection

```javascript
// Inspect a migrated farm
db.farms.findOne({ _migrated: true })

// Inspect a migrated block
db.blocks.findOne({ _migrated: true })

// Inspect crop prices
db.crop_prices.find({ _migrated: true }).limit(5).pretty()
```

---

## Rollback Procedures

### Option 1: Remove Migrated Data Only
```javascript
db.farms.deleteMany({ _migrated: true });
db.blocks.deleteMany({ _migrated: true });
db.plant_data.deleteMany({ _migrated: true });
db.block_harvests.deleteMany({ _migrated: true });
db.block_archives.deleteMany({ _migrated: true });
db.customers.deleteMany({ _migrated: true });
db.crop_prices.deleteMany({ _migrated: true });
```

### Option 2: Restore from Backup
```bash
mongorestore --uri="mongodb://localhost:27017/a64core_db" --drop /tmp/mongodb_backup_YYYYMMDD_HHMMSS/a64core_db
```

### Option 3: Drop Entire Database
```bash
# NUCLEAR OPTION - Only if necessary
mongosh "mongodb://localhost:27017/a64core_db" --eval "db.dropDatabase()"
docker compose restart api  # Recreate indexes
```

---

## Performance Expectations

### Migration Time
- **Small dataset** (<1,000 records): ~30 seconds
- **Medium dataset** (1,000-10,000 records): 1-3 minutes
- **Large dataset** (10,000+ records): 3-10 minutes
- **Full migration** (~42,000 records): **5-15 minutes**

### Batch Processing
- Blocks: 100 per batch
- Harvests: 500 per batch
- Archives: 200 per batch
- Crop Prices: 500 per batch

### Memory Usage
- Peak: ~200-500 MB
- Steady: ~100 MB

---

## Common Issues & Quick Fixes

### Issue: "File not found"
```bash
# Fix: Check file paths
ls -l /home/noobcity/Code/A64CorePlatform/OldData/220126/
```

### Issue: "Duplicate key error"
```javascript
// Fix: Drop migrated data and re-run
db.farms.deleteMany({ _migrated: true });
```

### Issue: "Reference not found"
```bash
# Fix: Run phase 1 first (master data)
# Then run phase 2 (transactional data)
```

### Issue: "MongoDB not running"
```bash
# Fix: Start MongoDB
docker compose up -d mongodb
docker compose ps mongodb  # Verify running
```

---

## Next Steps After Migration

### 1. Verify Data Quality
- Run verification queries (see checklist above)
- Spot-check random records
- Compare counts with source

### 2. Update Application
- Deploy updated System-Architecture.md
- Update API endpoints to use crop_prices
- Add crop_prices queries to analytics

### 3. Enable New Features
- Pricing analytics dashboard
- Customer-specific pricing reports
- Grade-based pricing strategies
- Revenue forecasting

### 4. Future Migrations
- Vehicles (when Logistics module ready)
- Sales Orders (when Sales module ready)

---

## Support & Documentation

### Full Documentation
📖 **[Complete Migration Guide](MIGRATION_GUIDE.md)** - 70+ page detailed guide

### Key Resources
- System Architecture: `Docs/1-Main-Documentation/System-Architecture.md`
- Migration Script: `scripts/migrate_old_data.py`
- Old Data: `OldData/220126/*.sql`

### Contact
- Database Architecture: Database Schema Architect
- Platform Issues: Development Team

---

**Last Updated:** 2026-01-22
**Document Version:** 1.0.0
