# DevLog — Plant Library Mother/Variety Redesign

## 1. Session Header
- **Date:** 2026-08-05
- **Session type:** Feature redesign + migration + bug fixes
- **Focus area:** Farm Manager → Plant Library (+ physical block card fix, CodeMaps)
- **Status:** Complete and committed to branch `feat/plant-library` (pushed). Migration already run on live data. Not yet merged to `main`.
- **Objective:** Rework the Plant Library from flat, independent plant entries into a two-level hierarchy — a **mother** (product/folder) that holds many **varieties** (cultivation recipes) — while keeping everything that already worked; then make bulk CSV import work with the new design.

## 2. What We Accomplished

### Core model (variety = cultivation recipe · mother = product)
Key operational decision made with the user before building: a block is planted with a **variety** (all growing data comes from it), but the **product** that harvest/inventory/sales roll up to is the **mother** — so it's one "Cabbage", not one per variety.

- **New collection `plant_mothers`** + `PlantMother` model (plantName, scientificName?, plantType enum: crop/tree/herb/fruit/vegetable/ornamental/medicinal).
- **`plant_data_enhanced` = the variety store** — added `motherPlantId` + `varietyName`; **`plantDataId` unchanged** so all planted blocks keep referencing their variety.
- **`block` + `block_archive`** gained `productMotherId` + `productName` (denormalized product); `targetCrop` still = the variety (growing data + traceability).
- **Migration** (`scripts/migrations/plant_library_mother_variety_migration.py`, idempotent, **executed live**): 57 mothers created (plantType inferred from tags, else 'crop'), each existing entry linked as its **"Standard"** variety; **161 blocks + 967 archives backfilled** with the product ref; 0 unresolved. `plantDataId` and the 13,947 `block_harvests` untouched.

### API (`/api/v1/farm/plant-mothers`)
- Mother CRUD (rename cascades denormalized names to varieties/blocks; delete 409s while active varieties exist).
- Variety-under-mother create/list (basic info inherited from the mother); variety update rejects client changes to inherited basic info.
- Planting resolves variety → mother and stamps `block.productMotherId`/`productName` atomically (in `BlockRepository`).

### Frontend
- Library = **mother cards** (name/scientific/type + variety count); "New Plant" = small mother modal; "Add Variety" reuses `PlantDataFormModal` in variety mode (basic info hidden/inherited, `varietyName` added).
- **Duplicate variety** — clones a variety into a pre-filled create form under the same mother ("Copy of …").
- Planting crop dropdown still searches **varieties** ("Plant · Variety") — unchanged planting behavior.

### CSV template + import (mother/variety aware)
- One row = one variety under a **find-or-created mother** (by plantName); duplicates (mother+varietyName) skipped; per-row error reporting.
- **Required columns (9), marked `*`, first:** plantName, scientificName, varietyName, yieldPerPlant, and the five growth-cycle phases germination/vegetative/flowering/fruiting/harvest. `totalCycleDays` is the computed sum (matches the modal; no longer a column).
- Optional columns get safe defaults (plantType→crop, farmType→open_field, yieldUnit→kg, …) so a minimal 9-column CSV imports as a skeleton.
- **Full modal parity**: added seedsPerPlantingPoint, humidity, daily light hours, waterAmountPerPlantLiters, market value + currency.
- Import **normalizes headers** (strips `*`, whitespace, case) so the marked template AND any plain CSV import identically — marking never breaks import.

### Also fixed
- **PhysicalBlockCard year-scoping** (separate farm fix): the "Active Planting" count was cross-year while the plantings modal is year-scoped, so a block with a planting in another farming year showed "1" on the card but an empty modal. Count/view/title now use the year-scoped source; area + empty/add logic stay cross-year (physical); added an "N planting(s) in other farming years" hint.

### CodeMaps
Regenerated: added the plant-library nodes/edges to the knowledge graph (`scripts/codebase_mapper/batch_plant_library.json`) and rebuilt all maps. **812/995 → 822/1008 nodes/edges**, 26/26 mapping tasks complete. Plant-library structures now appear in api-map, database-map, module-map, service-map, frontend-map.

## 3. Bugs/Issues Discovered
- **[Fixed] Growth-cycle rounding bug** (`plant_data_enhanced_service.py`): the stage split rounded short of `totalCycleDays` for most non-round day counts (85 → summed to 83). Invisible before because the old import bypassed `_validate_detail_fields`; routing CSV imports through validation surfaced it. Fixed by computing `harvestDurationDays` as the exact remainder.
- **[Fixed] `waterAmountUnit` data-integrity trap** (CSV): the column was accepted but silently unused (`WateringRequirements.amountPerPlantLiters` is fixed to liters), so `500` + `ml` would store as 500 **liters**. Dropped the column; renamed the amount to `waterAmountPerPlantLiters` (unit explicit); import tolerates the old header spelling.
- **[Known/deferred] `totalCycleDays` is `gt=0`** on the model — a growth cycle with all-zero phases is rejected (import fails that row with a clear "total > 0" message). Acceptable; a future `ge=0` relaxation would allow 0-day placeholders.

## 4. What We Need To Do Next
1. **Merge `feat/plant-library` → main** (PR: `https://github.com/lilistrocel/A64CorePlatform/pull/new/feat/plant-library`).
2. **Deploy:** `docker restart <prefix>-api-1` (loads the new models/API/CSV; `src` is bind-mounted). Frontend is Vite hot-reload. Migration already applied to the live DB.
3. **Sales module (deferred):** wire "Cabbage" (mother) as the sellable product / product-catalog. Sales already consumes inventory products, which will become mother-based. This was explicitly scoped OUT of this effort.
4. **Inventory/yield read-side rollup by mother** — the block now carries `productMotherId`; the harvest/inventory/yield aggregations can be switched to roll up by mother next.

## 5. Important Context for Next Session
- **Branch:** `feat/plant-library` (off `main`), pushed. Commits: `a89f7cd` backend, `59c237c` frontend, `4a23242` block-card fix, `28cf7a8` CSV rework (CodeMaps + DevLog commit pending).
- **Migration is LIVE** — do not re-run expecting new data; it's idempotent (re-run = no-op).
- **CodeMap mapper note:** it needs `MONGO_URL="mongodb://localhost:27017/?directConnection=true"` from the host (the mongo container is a replica set; a plain localhost connection fails member discovery). `MONGODB_DB_NAME=a64core_db`.
- Purchasing work from the prior session lives on a separate branch `fix/purchasing-status-actions` (its own PR).
- Model recap: variety keeps `plantDataId`; mother is `plantMotherId`; block carries both `targetCrop` (variety) and `productMotherId` (mother).

## 6. Files Modified
- **Backend:** models/plant_mother.py (new), plant_data_enhanced.py, block.py, block_archive.py, models/__init__.py; services/plant_data/{plant_mother_service,plant_mother_repository}.py (new), plant_data_enhanced_service.py, plant_data_enhanced_repository.py, database.py; services/block/block_repository_new.py; api/v1/plant_mothers.py (new), plant_data_enhanced.py, api/v1/__init__.py; scripts/migrations/plant_library_mother_variety_migration.py (new).
- **Frontend:** components/farm/PlantMother{Card,FormModal,DetailModal}.tsx (new), PlantDataFormModal.tsx, PlantDataDetail.tsx, PlantCombobox.tsx, PhysicalBlockCard.tsx; hooks/queries/usePlantMothers.ts (new); services/plantMotherApi.ts (new), plantDataEnhancedApi.ts; pages/farm/PlantDataLibrary.tsx; config/react-query.config.ts; types/farm.ts.
- **Tests:** tests/unit/test_farm_manager/ (new: models, migration, mother API, CSV import).
- **Docs/maps:** Docs/CodeMaps/*.md (regenerated), scripts/codebase_mapper/batch_plant_library.json (new), Docs/Backlog/BACKLOG.md (T-912…T-917), this DevLog.

## 7. Session Metrics
- **Backend tests:** 62 farm-manager unit tests passing (models, migration inference, mother API, CSV import).
- **Frontend:** tsc-clean (only pre-existing baseline warnings).
- **Approach:** phased delegation to specialist agents (model/migration → API → frontend → CSV), each verified independently by the parent (restart + in-container pytest + live dry-run of the migration + template/endpoint checks) before proceeding.
- **Key achievement:** a live, backward-compatible data-model migration (blocks keep working) plus a full UI + bulk-import path for the new hierarchy, with the product-vs-recipe distinction correctly threaded through blocks/harvest for future inventory rollup.
