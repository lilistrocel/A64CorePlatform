# Migration Progress Tracker

**Project:** Legacy SQL to MongoDB Migration
**Started:** 2026-01-26
**Target:** A64 Core Platform

---

## Quick Status

| Phase | Status | Records | Progress |
|-------|--------|---------|----------|
| Phase 1: Independent Data | ✅ COMPLETE | 85 | 100% |
| Phase 2: Block Templates | ✅ COMPLETE | 274 | 100% |
| Phase 3: Active Blocks | ✅ COMPLETE | 275 | 99.6% |
| Phase 4: Historical Data | ✅ COMPLETE | 17,761 | 100% |
| Phase 5: Order Management | NOT STARTED | 11,296 | 0% |
| **TOTAL** | | **29,693** | **~62%** |

---

## Phase 1: Independent Data (No Dependencies) ✅ COMPLETE

### 1.1 farm_details → farms ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 7
- [x] Script: `mongosh` direct insertion
- [x] Verification: All 7 farms exist in `farms` collection

**Farms Migrated:**
- [x] Silal Upgrade Farm (F001) → 04d07eb0-3667-4900-90e4-1a89ffc2401b
- [x] Al Wagen (F002) → 222fa041-081a-41bf-a855-d39d26ae4136
- [x] Asharij-Television Farm (F003) → 69ab8d2f-3d20-4363-8895-86e159a13f35
- [x] Al Ain (F004) → 6d6360d5-19d6-41da-ba72-7a9559503857
- [x] Al Khazana (F005) → c82d1236-ceff-4b71-b883-8db0fbc383c5
- [x] Liwa (F006) → cd98f1da-c377-486b-acb0-2a46ea78019a
- [x] New Hydroponics (F007) → de209b10-ee5c-4b62-b97a-50621eaceb4b

---

### 1.2 client_details → customers ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 19
- [x] Script: `mongosh` direct insertion
- [x] Verification: All 19 customers exist in `customers` collection

**Notes:**
- Created `customers` collection with customerCode (C001-C019)
- Preserved legacy Firebase IDs where available

---

### 1.3 vehicle_details → vehicles ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 11
- [x] Script: `mongosh` direct insertion
- [x] Verification: All 11 vehicles exist in `vehicles` collection

**Notes:**
- Created `vehicles` collection with vehicleCode (V001-V011)
- Extracted plate numbers and vehicle types from names

---

### 1.4 standard_planning → plant_data ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 48 (8 invalid records skipped from original 56)
- [x] Script: `scripts/migrations/phase1/parse_plant_data.py` + `mongosh`
- [x] Verification: All 48 valid crops exist in `plant_data` collection

**Key Crops Migrated:**
- [x] Potato (70 days)
- [x] Tomato varieties (OF, Cherry, Round-Table, Beef)
- [x] Cucumber (90 days)
- [x] Lettuce varieties (Iceberg, Romaine, Oakleaf Red, Boston, Frisee, etc.)
- [x] Zucchini (Green, Yellow)
- [x] Sweet Corn (105 days)
- [x] Capsicum (Green, Red, Yellow)
- [x] Marrow (90 days)
- [x] Cauliflower (110 days)
- [x] And 38 more...

---

## Phase 2: Block Templates ✅ COMPLETE

### 2.1 block_standard → blocks (as physical blocks) ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 274
- [x] Script: `scripts/migrations/phase2/generate_blocks_json.py`
- [x] Verification: All 274 physical blocks exist in `blocks` collection

**Farm Distribution:**
- F001 (Silal Upgrade): 10 blocks
- F002 (Al Wagen): 28 blocks
- F003 (Asharij-TV): 37 blocks
- F004 (Al Ain): 77 blocks
- F005 (Al Khazana): 48 blocks
- F006 (Liwa): 69 blocks
- F007 (New Hydroponics): 5 blocks

**Block Types:**
- openfield: 247
- greenhouse: 21
- hydroponic: 6

**Key Mappings:**
- Legacy prefixes (A, WG, LW, etc.) → new farm codes (F001-F007)
- blockCategory: "physical" (infrastructure containers)
- state: "empty" (will be "partial" when virtual blocks added)
- legacyBlockCode: preserved original codes (e.g., "A-31", "LW-10")

---

## Phase 3: Active Blocks ✅ COMPLETE

### 3.1 farm_block → blocks (as virtual blocks) ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 275 (1 skipped - orphan S.NHY 428)
- [x] Script: `scripts/migrations/phase3/generate_virtual_blocks_final.py` + `import_virtual_blocks.js`
- [x] Verification: All 275 virtual blocks exist in `blocks` collection

**State Distribution:**
- growing: 197 blocks
- harvesting: 75 blocks
- planned: 3 blocks

**Farm Distribution:**
- Al Ain (F004): 77 blocks
- New Hydroponics (F007): 63 blocks
- Liwa (F006): 62 blocks
- Al Khazana (F005): 36 blocks
- Al Wagen (F002): 28 blocks
- Silal Upgrade Farm (F001): 9 blocks

**Key Mappings:**
- farm_block entries → virtual blocks (blockCategory: "virtual")
- parentBlockId links virtual blocks to physical blocks
- legacyBlockCode preserved (e.g., "A-21-002" → new code "F004-025-001")
- allocatedArea calculated from drips ratio
- Physical blocks updated with state: "partial" and childBlockIds

**Notes:**
- 1 orphan record skipped: S.NHY 428-001 (no matching physical block)
- 203 physical blocks now have virtual children

---

## Phase 4: Historical/Transactional Data ✅ COMPLETE

### 4.1 block_history → block_archives ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 1,034
- [x] Script: `scripts/migrations/phase4/generate_block_archives.py` + `import_all.js`
- [x] Verification: All 1,034 archives imported with KPI/yield data

**State Distribution:**
- All records in "Cleaned" state (completed cycles)

**Farm Distribution:**
- Al Ain: 302
- New Hydroponics: 266
- Liwa: 257
- Al Khazana: 99
- Al Wagen: 77
- Silal Upgrade Farm: 33

---

### 4.2 harvest_reports → block_harvests ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 11,745
- [x] Script: `scripts/migrations/phase4/generate_harvests.py` + `import_all.js`
- [x] Verification: All 11,745 harvest records imported

**Top Crops by Harvest Count:**
- Marrow: 3,918
- Cucumber: 1,664
- Zucchini - Green: 931
- Okra: 850

**Top Crops by Total Quantity:**
- Cucumber: 1,719,885 kg
- Lettuce - Romaine: 1,197,528 kg
- Lettuce - Iceberg: 576,523 kg

---

### 4.3 crop_price → crop_prices ✅
- [x] **Status:** COMPLETE (2026-01-26)
- [x] Records: 4,982
- [x] Script: `scripts/migrations/phase4/generate_crop_prices.py` + `import_all.js`
- [x] Verification: All 4,982 price records imported

**Total Revenue:** AED 10,100,309.32

**Top Customers:**
- SILAL FOOD AND TECHNOLOGY L.L.C: 2,150 transactions
- N.R.T.C DUBAI INTERNATIONAL: 1,888 transactions
- AL MONTAZAH: 534 transactions

**Top Revenue Crops:**
- Cucumber: AED 2,403,490
- Honeydew Melon: AED 1,265,257
- Lettuce - Romaine: AED 1,003,499

---

## Phase 5: Order Management

### 5.1 orderlist_re → sales_orders
- [ ] **Status:** NOT STARTED
- [ ] Records: 3,579
- [ ] Script: `scripts/migrations/migrate_orders.py`
- [ ] Verification: Check all orders migrated

**Dependencies:**
- Requires Phase 1.2 (customers) to be complete
- Requires Phase 1.3 (vehicles) to be complete

---

### 5.2 order_list_content → order_items (or embedded)
- [ ] **Status:** NOT STARTED
- [ ] Records: 7,717
- [ ] Script: `scripts/migrations/migrate_order_items.py`
- [ ] Verification: Check order line items

**Dependencies:**
- Requires Phase 5.1 (orders) to be complete

---

## Migration Log

### 2026-01-26
- [x] Created OLD_DATA_STRUCTURE.md documenting legacy schema
- [x] Created MIGRATION_PROGRESS.md (this file)
- [x] Cleaned up old migration scripts (moved to OldData/archived_scripts/)
- [x] **Phase 1.1:** Migrated 7 farms → `farms` collection
- [x] **Phase 1.2:** Migrated 19 customers → `customers` collection (new)
- [x] **Phase 1.3:** Migrated 11 vehicles → `vehicles` collection (new)
- [x] **Phase 1.4:** Migrated 48 plant data → `plant_data` collection
- [x] **Phase 1 COMPLETE:** 85 records total, all verified
- [x] Added `legacyBlockCode` field to Block model
- [x] **Phase 2.1:** Migrated 274 block_standard → physical blocks
- [x] **Phase 2 COMPLETE:** 274 physical blocks with legacy code mapping
- [x] **Phase 3.1:** Migrated 275 farm_block → virtual blocks
- [x] **Phase 3 COMPLETE:** 275 virtual blocks linked to 203 physical parents
- [x] State mapping: Planted→growing, Harvested→harvesting, Planned→planned
- [x] Total blocks in database: 549 (274 physical + 275 virtual)
- [x] Fixed block code mapping: A-21 → F004-021 (preserving original numbers)
- [x] **Phase 4.1:** Migrated 1,034 block_history → block_archives
- [x] **Phase 4.2:** Migrated 11,745 harvest_reports → block_harvests
- [x] **Phase 4.3:** Migrated 4,982 crop_price → crop_prices
- [x] **Phase 4 COMPLETE:** 17,761 historical records total
- [x] **Data Fixes:** Converted all UUID fields to strings for API compatibility
- [x] **API Verification:** All farm and block endpoints return correct data
- [x] **UI Verification:** Farm detail pages load correctly after UUID fix

---

## Verification Checklist

### Pre-Migration
- [x] Database cleared (except users)
- [x] Old data structure documented
- [ ] New collection schemas verified
- [ ] Migration scripts tested locally

### Post-Migration (per phase)
- [ ] Record counts match
- [ ] UUIDs preserved correctly
- [ ] Foreign keys resolve
- [ ] Data types converted properly
- [ ] No orphaned records

### Final Verification
- [ ] All phases complete
- [ ] UI shows migrated data
- [ ] API endpoints return correct data
- [ ] Historical data accessible
- [ ] Performance acceptable

---

## Issues/Blockers

| Issue | Description | Status | Resolution |
|-------|-------------|--------|------------|
| Orphan S.NHY 428 | farm_block entry S.NHY 428-001 has no matching physical block in block_standard | SKIPPED | Likely a test/invalid record in legacy data |

---

## Scripts Reference

**Location:** `scripts/migrations/`

| Script | Purpose | Status |
|--------|---------|--------|
| `migrate_farms.py` | Phase 1.1 - Farms | NOT CREATED |
| `migrate_customers.py` | Phase 1.2 - Customers | NOT CREATED |
| `migrate_vehicles.py` | Phase 1.3 - Vehicles | NOT CREATED |
| `migrate_plant_data.py` | Phase 1.4 - Plant Data | NOT CREATED |
| `migrate_block_standards.py` | Phase 2.1 - Block Templates | NOT CREATED |
| `phase3/generate_virtual_blocks_final.py` | Phase 3.1 - Parse farm_block SQL | COMPLETE |
| `phase3/import_virtual_blocks.js` | Phase 3.1 - Import virtual blocks | COMPLETE |
| `phase4/generate_block_archives.py` | Phase 4.1 - Parse block_history | COMPLETE |
| `phase4/generate_harvests.py` | Phase 4.2 - Parse harvest_reports | COMPLETE |
| `phase4/generate_crop_prices.py` | Phase 4.3 - Parse crop_price | COMPLETE |
| `phase4/import_all.js` | Phase 4 - Import all to MongoDB | COMPLETE |
| `migrate_orders.py` | Phase 5.1 - Orders | NOT CREATED |
| `migrate_order_items.py` | Phase 5.2 - Order Items | NOT CREATED |
