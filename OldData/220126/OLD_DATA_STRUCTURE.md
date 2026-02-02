# Old Data Structure Documentation

**Source:** SQL dump from legacy application (OldData/220126/)
**Date Analyzed:** 2026-01-26
**Total Records:** ~29,690

---

## Table of Contents
- [Overview](#overview)
- [Data Dependency Graph](#data-dependency-graph)
- [Tables in Detail](#tables-in-detail)
- [Migration Priority Order](#migration-priority-order)
- [Field Mapping to New Schema](#field-mapping-to-new-schema)

---

## Overview

This documents the structure of the legacy SQL database from the old application. The data needs to be migrated to the new MongoDB-based A64 Core Platform.

### Record Counts by Table

| Table | Records | Has Dependencies | Priority |
|-------|---------|------------------|----------|
| `farm_details` | 7 | None | 1 - FIRST |
| `client_details` | 19 | None | 1 - FIRST |
| `vehicle_details` | 11 | None | 1 - FIRST |
| `standard_planning` (Plant Data) | 56 | None | 1 - FIRST |
| `block_standard` | 274 | farm_details | 2 |
| `farm_block` (Active Blocks) | 277 | farm_details, block_standard, standard_planning | 3 |
| `block_history` | 1,034 | farm_block, block_standard | 4 |
| `harvest_reports` | 11,745 | farm_block | 4 |
| `crop_price` | 4,982 | None (just customer name) | 4 |
| `orderlist_re` (Orders) | 3,579 | client_details, farm_details, vehicle_details | 5 |
| `order_list_content` | 7,717 | orderlist_re | 6 - LAST |

---

## Data Dependency Graph

```
                    ┌─────────────────┐
                    │  farm_details   │ (7 farms)
                    │  (No deps)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────┐ ┌─────────────┐ ┌───────────────────┐
    │ block_standard  │ │ farm_block  │ │   orderlist_re    │
    │ (274 templates) │ │(277 active) │ │  (3,579 orders)   │
    └────────┬────────┘ └──────┬──────┘ └─────────┬─────────┘
             │                 │                   │
             │    ┌────────────┴────────────┐      │
             │    │                         │      │
             ▼    ▼                         ▼      ▼
    ┌─────────────────────┐        ┌────────────────────────┐
    │   block_history     │        │   order_list_content   │
    │   (1,034 cycles)    │        │    (7,717 items)       │
    └─────────────────────┘        └────────────────────────┘

    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
    │ client_details  │     │ vehicle_details │     │standard_planning│
    │   (19 clients)  │     │  (11 vehicles)  │     │  (56 crops)     │
    │   (No deps)     │     │   (No deps)     │     │   (No deps)     │
    └─────────────────┘     └─────────────────┘     └─────────────────┘

    ┌─────────────────┐     ┌─────────────────┐
    │  crop_price     │     │ harvest_reports │
    │(4,982 sales)    │     │(11,745 harvests)│
    │(loose deps)     │     │ (deps: farm_block)│
    └─────────────────┘     └─────────────────┘
```

---

## Tables in Detail

### 1. `farm_details` (7 records) - NO DEPENDENCIES

**Purpose:** Farm master data

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `Name` | VARCHAR | "Silal Upgrade Farm" | Farm display name |
| `ref` | UUID | "04d07eb0-3667-4900-90e4-1a89ffc2401b" | Primary key (UUID) |

**Sample Data:**
```sql
('Silal Upgrade Farm', '04d07eb0-3667-4900-90e4-1a89ffc2401b')
('Al Wagen', '222fa041-081a-41bf-a855-d39d26ae4136')
('Asharij-Television Farm', '69ab8d2f-3d20-4363-8895-86e159a13f35')
('Al Ain', '6d6360d5-19d6-41da-ba72-7a9559503857')
('Al Khazana', 'c82d1236-ceff-4b71-b883-8db0fbc383c5')
('Liwa', 'cd98f1da-c377-486b-acb0-2a46ea78019a')
('New Hydroponics', 'de209b10-ee5c-4b62-b97a-50621eaceb4b')
```

---

### 2. `client_details` (19 records) - NO DEPENDENCIES

**Purpose:** Customer/client master data

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `__id__` | VARCHAR | "fVVCKc7pzdysfClGoeLm" | Firebase ID (can be empty) |
| `clientname` | VARCHAR | "SILAL FOOD AND TECHNOLOGY LLC" | Customer name |
| `ref` | UUID | "62c24673-310e-4a34-a776-8884f3dd4b05" | Primary key |

**Sample Clients:**
- SILAL FOOD AND TECHNOLOGY LLC
- NRTC Company
- AL MONTAZAH
- GREEN NATION VEGETABLES & FRUITS
- BARAKAT LLC
- FRESHONTABLE
- And more...

---

### 3. `vehicle_details` (11 records) - NO DEPENDENCIES

**Purpose:** Delivery vehicle master data

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `__id__` | VARCHAR | "YF4eZSDZEvA5d7vQmPSL" | Firebase ID |
| `vehiclename` | VARCHAR | "TOYOTA HIACE - 51091" | Vehicle name/plate |
| `ref` | UUID | "08695c20-a80f-47af-81c3-d6503da59f9e" | Primary key |

**Sample Vehicles:**
- TOYOTA HIACE - 51091
- TOYOTA HIACE - 51089
- CANTER - 22917
- CANTER - 22921
- HINO - 31832
- VOLVO - 93059
- And more...

---

### 4. `standard_planning` (56 records) - NO DEPENDENCIES

**Purpose:** Plant/crop cultivation templates (maps to `plant_data` collection)

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `__id__` | VARCHAR | "iuhvewo23521cieoow3324" | Firebase ID |
| `Cleaningday` | INT | 0 | Days for cleaning |
| `DaysOfFertilize` | INT | 60 | Fertilization period days |
| `HarvestDurationday` | INT | 20 | Harvest duration days |
| `Item` | VARCHAR | "Potato" | **Crop name** |
| `NetYieldPerDripkg` | DECIMAL | 3.15 | Yield per drip in kg |
| `PlanningFertilizer` | JSON | {...} | Fertilizer schedule JSON |
| `PollinationLosspercent` | DECIMAL | 0 | Pollination loss % |
| `ProcessedFertilizerData` | JSON | {...} | Processed fertilizer data |
| `ProductsPerDripkg` | DECIMAL | 3.15 | Products per drip |
| `SeedingType` | VARCHAR | "Seed" | Seeding method |
| `SowingDurationday` | INT | 20 | Sowing duration |
| `TotalDurationday` | INT | 90 | Total growth cycle |
| `harvestInterval` | INT | 7 | Days between harvests |
| `img` | VARCHAR | null | Image URL |
| `seedsPerDrip` | DECIMAL | null | Seeds per drip point |
| `ref` | UUID | "..." | Primary key |

**Sample Crops:**
- Potato (90 days total)
- Tomato (75 days)
- Cucumber (60 days)
- Lettuce varieties
- Zucchini
- Sweet Corn
- And more...

---

### 5. `block_standard` (274 records) - DEPENDS ON: farm_details

**Purpose:** Block template definitions (physical block specifications)

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `Area` | VARCHAR | "2000" | Area in sqm (stored as string) |
| `BlockID` | VARCHAR | "LW-10" | Block code |
| `TotalDrips` | VARCHAR | "4000" | Number of drip points |
| `ref` | UUID | "007402eb-..." | Primary key |
| `farm_details_ref` | UUID | "cd98f1da-..." | FK to farm_details |
| `farm_types_ref` | UUID | "dd5e64cc-..." | FK to farm types |
| `farm` | VARCHAR | "Liwa" | Farm name (denormalized) |
| `type` | VARCHAR | "Open Field" | Block type |

**Block Types:**
- Open Field
- Green House
- Hydroponic

---

### 6. `farm_block` (277 records) - DEPENDS ON: farm_details, block_standard, standard_planning

**Purpose:** Active block instances with current planting status

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `InventoryData` | JSON | {"Day":[...],...} | Fertilizer inventory |
| `drips` | VARCHAR | "7280" | Number of drips |
| `plannedseason` | VARCHAR | "2" | Season number |
| `state` | VARCHAR | "Planted" | Current status |
| `time_finish` | TIMESTAMP | "2026-02-28" | Expected finish |
| `time_start` | TIMESTAMP | "2026-01-14" | Planting start |
| `ref` | UUID | "0000edc9-..." | Primary key |
| `farm_details_ref` | UUID | "6d6360d5-..." | FK to farm |
| `block_standard_ref` | UUID | "537ff3c4-..." | FK to block_standard |
| `standard_planning_ref` | UUID | "a309b391-..." | FK to standard_planning |
| `block_id` | VARCHAR | "A-21-002" | Block code |
| `farm_name` | VARCHAR | "Al Ain" | Farm name |
| `Item` | VARCHAR | "Lettuce - Iceberg" | Crop name |
| `isModified` | VARCHAR | "false" | Modification flag |
| `input_data` | JSON | null | Input data |
| `viewing_year` | VARCHAR | "2025" | Year filter |

**States Found:**
- Planted
- Growing
- Harvesting
- Empty
- Cleaned

---

### 7. `block_history` (1,034 records) - DEPENDS ON: farm_block, block_standard

**Purpose:** Historical block cycles (completed planting cycles)

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `area` | VARCHAR | "0" | Area |
| `drips` | VARCHAR | "5000" | Drip points |
| `plannedseason` | VARCHAR | "1" | Season |
| `time_finish` | TIMESTAMP | "2025-01-06" | Finish date |
| `time_start` | TIMESTAMP | "2024-11-04" | Start date |
| `ref` | UUID | "00d11b2b-..." | Primary key |
| `block_id` | VARCHAR | "KHZ-26" | Block code |
| `farm_id` | VARCHAR | "Al Khazana" | Farm name |
| `crop_id` | VARCHAR | "Sweet Corn" | Crop name |
| `time_cleaned` | TIMESTAMP | "2025-01-24" | Cleaning date |
| `harvest_duration` | VARCHAR | "20" | Harvest days |
| `farm_block_ref` | UUID | "87eb5588-..." | FK to farm_block |
| `state` | VARCHAR | "Cleaned" | Final state |
| `farm_type` | VARCHAR | "Open Field" | Block type |
| `predicted_yield` | VARCHAR | "5000" | Expected yield |
| `harvest_data` | VARCHAR | "3625.5" | Actual harvest |
| `kpi` | VARCHAR | "0.7251" | Performance ratio |
| `net_yield` | VARCHAR | "1" | Net yield factor |
| `block_standard_ref` | UUID | "ca89f29d-..." | FK to block_standard |
| `yieldperseed` | VARCHAR | null | Yield per seed |
| `viewing_year` | VARCHAR | "2024" | Year filter |

---

### 8. `harvest_reports` (11,745 records) - DEPENDS ON: farm_block

**Purpose:** Individual harvest events

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `__id__` | VARCHAR | "" | Firebase ID |
| `Quantity` | VARCHAR | "212" | Harvest quantity (kg) |
| `harvestSeason` | VARCHAR | "2" | Season |
| `time` | TIMESTAMP | "2025-02-18" | Harvest date |
| `ref` | UUID | "00080d82-..." | Primary key |
| `farm_block_ref` | UUID | "3f95a6ed-..." | FK to farm_block |
| `block_id` | VARCHAR | "LW-07" | Block code |
| `crop` | VARCHAR | "Marrow" | Crop name |
| `farm` | VARCHAR | "Liwa" | Farm name |
| `reporter_user` | VARCHAR | "samah@agrinovame.com" | Reporter email |
| `main_block` | VARCHAR | "LW-07" | Main block code |
| `main_block_ref` | UUID | "0e48a234-..." | Main block FK |
| `viewing_year` | VARCHAR | "2024" | Year filter |
| `grade` | VARCHAR | null | Quality grade (A/B) |

---

### 9. `crop_price` (4,982 records) - LOOSELY DEPENDS ON: client names

**Purpose:** Sales/pricing records

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `date` | TIMESTAMP | "2025-04-11" | Sale date |
| `customer` | VARCHAR | "NRTC DUBAI..." | Customer name |
| `crop` | VARCHAR | "Cucumber" | Crop sold |
| `grade` | VARCHAR | "B" | Quality grade |
| `quantity` | VARCHAR | "216" | Quantity sold |
| `price_unit` | VARCHAR | "0.5" | Price per unit |
| `price_total` | VARCHAR | "108" | Total price |
| `ref` | UUID | "000bab58-..." | Primary key |
| `farm` | VARCHAR | null | Farm name (often null) |

---

### 10. `orderlist_re` (3,579 records) - DEPENDS ON: client_details, farm_details, vehicle_details

**Purpose:** Order headers

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `__id__` | VARCHAR | null | Firebase ID |
| `DateFinished` | TIMESTAMP | null | Completion date |
| `DatePacked` | TIMESTAMP | "2024-12-26" | Packing date |
| `RNumber` | VARCHAR | null | Receipt number |
| `Reciever` | VARCHAR | null | Receiver name |
| `Signature` | VARCHAR | null | Signature |
| `StartDate` | TIMESTAMP | "2024-12-26" | Order date |
| `assigned.__ref__` | VARCHAR | null | Assignment ref |
| `note` | VARCHAR | "" | Notes |
| `order_driver` | VARCHAR | "driver@email.com" | Driver email |
| `status` | VARCHAR | "Pending" | Order status |
| `vehicle_id` | VARCHAR | "CANTER - 22921" | Vehicle name |
| `client_id` | VARCHAR | "SILAL FOOD..." | Client name |
| `farm_id` | VARCHAR | "Al Khazana" | Farm name |
| `packager_email` | VARCHAR | "samah@..." | Packager email |
| `ref` | UUID | "000cd625-..." | Primary key |
| `viewing_year` | VARCHAR | "2024" | Year filter |

---

### 11. `order_list_content` (7,717 records) - DEPENDS ON: orderlist_re

**Purpose:** Order line items

**Columns:**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `Grade` | VARCHAR | "A" | Quality grade |
| `packagesize` | VARCHAR | "10" | Package size |
| `packagetype` | VARCHAR | "Box" | Package type |
| `quantity` | VARCHAR | "65" | Number of packages |
| `created_time` | TIMESTAMP | "2025-05-12" | Created |
| `updated_time` | TIMESTAMP | "2025-05-13" | Updated |
| `order_list_ref` | UUID | "8b5d0669-..." | FK to orderlist_re |
| `crop_id` | VARCHAR | "Zucchini - Yellow" | Crop name |
| `ref` | UUID | "000e2bda-..." | Primary key |
| `farm_id` | VARCHAR | "Al Ain" | Farm name |
| `totalkg` | VARCHAR | "650" | Total weight kg |
| `client_id` | VARCHAR | "NRTC Company" | Client name |
| `total_price` | VARCHAR | null | Total price |
| `avg_price` | VARCHAR | null | Average price |

---

## Migration Priority Order

### Phase 1: Independent Data (No Dependencies)
1. **`farm_details`** → `farms` collection
2. **`client_details`** → `customers` collection
3. **`vehicle_details`** → `vehicles` collection
4. **`standard_planning`** → `plant_data` collection

### Phase 2: First-Level Dependencies
5. **`block_standard`** → `blocks` collection (as templates or initial blocks)

### Phase 3: Second-Level Dependencies
6. **`farm_block`** → `blocks` collection (active block instances)

### Phase 4: Transactional/Historical Data
7. **`block_history`** → `block_archives` collection
8. **`harvest_reports`** → `block_harvests` collection
9. **`crop_price`** → `crop_prices` collection (new collection needed)

### Phase 5: Order Management
10. **`orderlist_re`** → `sales_orders` collection
11. **`order_list_content`** → embedded in `sales_orders` or `order_items` collection

---

## Field Mapping to New Schema

### farm_details → farms

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `ref` | `farmId` | UUID preserved |
| `Name` | `name` | Direct map |
| - | `farmCode` | Generate (F001, F002, etc.) |
| - | `managerId` | Set to admin user |
| - | `managerEmail` | Set to admin email |
| - | `isActive` | Default true |
| - | `createdAt` | Set to migration time |

### standard_planning → plant_data

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `ref` | `plantDataId` | UUID preserved |
| `Item` | `plantName` | Direct map |
| `TotalDurationday` | `growthCycleDays` | Direct map |
| `NetYieldPerDripkg` | `expectedYieldPerPlant` | Convert to per-plant |
| - | `yieldUnit` | Default "kg" |
| - | `plantType` | Default "Crop" |
| `HarvestDurationday` | (stored in notes) | Additional info |
| `SowingDurationday` | (stored in notes) | Additional info |
| `PlanningFertilizer` | (stored in notes as JSON) | Preserve for reference |

### block_standard + farm_block → blocks

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `ref` | `blockId` | UUID preserved |
| `BlockID` / `block_id` | `blockCode` | Direct map |
| `farm_details_ref` | `farmId` | UUID FK |
| `Area` | `area` | Convert to number |
| `TotalDrips` | `maxPlants` | Use drip count |
| `type` | `blockType` | Map: "Open Field"→"openfield", "Green House"→"greenhouse" |
| `state` | `state` | Map to BlockStatus enum |
| `Item` | `targetCropName` | Denormalized crop name |
| `time_start` | `plantedDate` | Direct map |
| `time_finish` | `expectedHarvestDate` | Direct map |

### harvest_reports → block_harvests

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `ref` | `harvestId` | UUID preserved |
| `farm_block_ref` | `blockId` | UUID FK |
| `Quantity` | `quantityKg` | Convert to number |
| `crop` | `cropName` | Direct map |
| `time` | `harvestDate` | Direct map |
| `reporter_user` | `reportedByEmail` | Direct map |
| `grade` | `grade` | Direct map (A/B) |

---

## Notes for Migration Scripts

1. **UUID Preservation:** All `ref` fields are UUIDs and should be preserved to maintain referential integrity
2. **String Numbers:** Many numeric fields are stored as strings - convert carefully
3. **JSON Fields:** Fertilizer data is stored as JSON strings - preserve for reference
4. **Denormalized Names:** Farm/crop names are duplicated - validate against master records
5. **Viewing Year:** Many tables have `viewing_year` field - this is for filtering, not critical for migration
6. **Firebase IDs:** `__id__` fields contain Firebase document IDs - not needed for migration
