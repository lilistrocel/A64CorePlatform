# A64 Core Platform — Completed Work

> **Total completed:** 13 tasks

## 2026-05

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-002 | Fertilizer Cost Calculator — Backend (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh) | Frontend | 2026-05-07 | ⏳ awaiting user verification |
| T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh) | Frontend | 2026-05-07 | ⏳ awaiting user verification |
| T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-008 | Farm Detail + Block Monitor merge; Inventory/Stock split; Sales Order lifecycle (v1.14.0 session) | Frontend + Backend | 2026-05-07 | ✅ |
| T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh) | Frontend | 2026-05-07 | ⏳ awaiting user verification |
| T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh) | Frontend | 2026-05-07 | ⏳ awaiting user verification |

### T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Removed duplicate "Add Chemical" and "Discover from Plant Library" actions from
  the Price Book panel in `FertilizerCostCalculator.tsx`, enforcing single-responsibility: those
  actions now live exclusively in `ChemicalsCatalog.tsx`.
- **Result:**
  - **Removed from `PricebookPanel`**: `+ Add Chemical` button, `Discover from Plant Library`
    button (role-gated), `addOpen` state, `handleAddSave` handler, `createChemMutation`
    (`useCreateChemical`), `discoverMutation` (`useDiscoverChemicals`), `canDiscover` role-check,
    `useAuthStore` import.
  - **Removed from file**: `AddChemicalModal` component function and its `AddChemicalModalProps`
    interface (~88 lines of component code).
  - **Removed imports**: `useAuthStore`, `useCreateChemical`, `useDiscoverChemicals`,
    `CreateChemicalRequest`, `AxiosError` (was already unused in this file), `useChemicals`,
    `FertilizerChemical`.
  - **Kept**: search/filter input (hidden when no chemicals exist), the chemicals table with
    editable price column, the inline `Reset` link per override row, the `Source` badge column,
    and the "Manage Catalog →" `RouterLink` in the panel header.
  - **Added empty-state**: when `entries.length === 0`, renders a centred `PricebookEmptyState`
    block with the message "No chemicals catalogued yet — go to the Chemicals Catalog to add some
    or run Discover from Plant Library." and a `RouterLink $asButton` styled as a primary button
    navigating to `/tools/chemicals`.
  - **Added `$asButton` transient prop** to `RouterLink` styled component so the same component
    renders as either a text link or a full primary button without passing a DOM prop.
  - **Net change**: 1803 → 1716 lines (−87 lines).
  - **TypeScript**: `tsc --noEmit` passes with zero errors, zero unused imports.

### T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Restructured `FertilizerCostCalculator.tsx` so the Price Book becomes a modal
  (opened by a header button) and the Crop List is promoted to the primary hero content.
- **Result:**
  - **Renamed** `PricebookPanel` → `PricebookContent` (renders just the inner content, no Panel shell).
  - **Added** `PricebookModal` component — wraps `PricebookContent` in the existing `Modal` shell
    with `maxWidth="960px"` to give the 7-column table enough horizontal room.
  - **Added** `priceBookOpen: boolean` state at the `FertilizerCostCalculator` page level.
  - **Added** "Price Book" `OutlineBtn` in the page header (right side). Modal opens on click,
    closes only via the X button (no backdrop-click close — enforced by existing `Modal` shell).
  - **Updated** `PageHeader` styled component: now `display: flex; justify-content: space-between`
    so title stays left and button sits right.
  - **Removed** inline `<PricebookPanel />` from the page body. Crop List panel is now the first
    and largest content block.
  - **Added** `PricebookModalFooterLink` styled component — renders "Manage Catalog →" link at the
    bottom of the modal body (was previously in the collapsible panel header).
  - **Removed** `CollapseIcon` styled component (only used by old collapsible panel header, now
    unused).
  - **Updated** stale "Price Book above" copy in the InfoBanner to "Price Book button".
  - **Layout before:** 3 stacked panels — Price Book (top, collapsible) → Crop List → Output.
  - **Layout after:** Header row (title + Price Book button) → Crop List hero → Output.
  - **Net change:** ~1717 → ~1720 lines (+3 lines net; removed ~60, added ~63 for modal wrapper
    and footer link).
  - **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Two follow-up UI additions to the Fertilizer Calculator frontend.
- **Result:**
  - **Change 1 — Restore button on archived chemicals**: In `ChemicalsCatalog.tsx`, archived rows now show a "Restore" `LinkBtn` instead of the "Archive" `DangerLinkBtn`. Clicking calls `useUpdateChemical` with `{ archivedAt: null }`, which triggers `PATCH /api/v1/farm/tools/chemicals/{id}`. On success the hook invalidates both the chemicals and prices queries, showing the restored row in its active state (or removing it from view if "Show archived" is off). The `UpdateChemicalRequest` type was widened to an `interface` with an optional `archivedAt?: string | null` field.
  - **Change 2 — Role gate on Discover button**: The "Discover from Plant Library" `OutlineBtn` is now conditionally rendered behind `canDiscover = currentUser?.role === 'admin' || currentUser?.role === 'agronomist'` in both `ChemicalsCatalog.tsx` (top-of-page button) and `FertilizerCostCalculator.tsx` (Price Book panel button). Button is fully hidden — not disabled — for other roles.
- **Role-check pattern source:** `MainLayout.tsx` line 195 — `user?.role === 'super_admin'` direct string comparison on the Zustand `useAuthStore` `user` field.
- **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Two follow-up fixes to the Fertilizer Cost Calculator backend.
- **Result:**
  - **Fix 1 — Role gate confirmed on `POST /chemicals/discover`**: endpoint already used `require_permission("agronomist")` mapping to admin/super_admin/moderator roles. Confirmed + added integration test verifying `user` role gets 403.
  - **Fix 2 — Archive-aware auto-discovery and calculator warnings:**
    - `ChemicalsService.discover_from_plant_library` now fetches ALL chemicals (including archived) and skips auto-creation for names matching archived chemicals. A new `build_chemical_lookup()` static method builds two dicts: active → FertilizerChemical, archived → ArchivedChemicalMatch sentinel.
    - `fertilizer_calculator.calculate_for_crops` Phase 2 uses archive-aware lookup: truly unknown names still auto-create, archived matches emit a per-ingredient warning and return `unitPrice/totalCost = None`.
    - `ChemicalUpdate` model gains optional `archivedAt` field; repository `update()` uses `model_fields_set` to distinguish explicit `null` (unarchive) from omitted field.
  - **Tests:** 9 new tests added (4 unit, 3 integration + 1 role-gate + 1 unarchive). 47 total tests pass (38 prior + 9 new).
  - **Docs:** `API-Structure.md` updated with role gate note, archive-aware semantics, unarchive PATCH description.

### T-002 | Fertilizer Cost Calculator — Backend (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full backend for the Fertilizer Cost Calculator tool.
- **Result:**
  - 3 new MongoDB collections: `fertilizer_chemicals`, `fertilizer_price_overrides`, `fertilizer_calculation_lists` with all required indexes.
  - 7 Pydantic model files under `src/modules/farm_manager/models/tools/`.
  - 6 service files under `src/modules/farm_manager/services/tools/`: ChemicalsRepository, ChemicalsService, PriceBook, FertilizerCalculator, ExcelHandler, CalculationListsRepository.
  - 2 API router files under `src/api/v1/tools/`: chemicals.py (5 endpoints), fertilizer_cost.py (10 endpoints).
  - Routers mounted at `/api/v1/farm/tools/chemicals` and `/api/v1/farm/tools/fertilizer-cost`.
  - 25 unit tests (all pass) + 13 integration tests (all pass).
  - API-Structure.md updated with all new endpoints.
  - CodeMaps regeneration needed (structural change — 3 new collections, new API routes, new service modules).

### T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full frontend for the Fertilizer Cost Calculator tool and Chemicals Catalog.
- **Result:**
  - Extended `NavItemDef` in `MainLayout.tsx` to support `children[]`, `defaultExpanded`, and group rendering with collapsible chevron, child-active parent highlighting, and per-user localStorage persistence (`sidebar.expanded.{userId}`).
  - Added "Tools" sidebar group with two children: Fertilizer Cost Calculator and Chemicals Catalog.
  - New routes in `App.tsx`: `/tools` → redirect, `/tools/fertilizer-calculator`, `/tools/chemicals`.
  - New file `frontend/user-portal/src/types/tools.ts`: full TypeScript interfaces for all API shapes.
  - New file `frontend/user-portal/src/services/toolsApi.ts`: service layer for all `/api/v1/farm/tools/` endpoints.
  - New file `frontend/user-portal/src/hooks/queries/useTools.ts`: TanStack Query hooks for chemicals, prices, calculate, export, import, saved lists.
  - Extended `react-query.config.ts` with `queryKeys.tools` namespace.
  - New page `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx`: Price Book panel (collapsible, inline price edit, reset, add/discover), Crop List panel (typeahead with no-schedule greyed state, points edit, import/export XLSX, saved lists), Output panel (per-crop collapsible ingredient tables, grand total, warnings, discovered chemicals notice).
  - New page `frontend/user-portal/src/pages/tools/ChemicalsCatalog.tsx`: full CRUD table, add/edit modal, archive with 409 dependent-plants modal, show-archived toggle, search.
  - Updated `Docs/1-Main-Documentation/User-Structure.md` with Tools group documentation.
  - CodeMaps need regeneration (new pages, new sidebar pattern).

### T-008 | v1.14.0 development session — Farm, Inventory, Sales Order overhaul
- **Category:** Frontend + Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Large multi-area session covering Farm Manager UI restructure, Inventory/Stock architectural split, per-batch harvest FIFO model, returned inventory, manual expire/revive, sales order lifecycle (reservations, two-step delete, Report Return), Add Item modal with FIFO allocation, and customer typeahead.
- **Result:**
  - Block Monitor route retired; all functionality merged into Farm Detail Blocks tab via `FarmQuickSwitcher`, `BlockMonitorHero`, `BlockViewToggle`, `VirtualBlocksView`, `PhysicalBlockPlantingsModal`, `useBlockViewMode` hook.
  - Farm Card redesigned with Yield Achievement progress bar, all-states pill row, `FarmCodeChip`, responsive metric grid.
  - Farm Manager Dashboard: new "View Farms" tab (embeds `FarmList`), Plant Library sidebar entry, tab sliding animation. Farm Breakdown tab merged into Overview.
  - Backend: `FarmSummary` extended with `physicalBlocks`/`virtualBlocks`/`actualYield`; `farmingYear` optional query param on `/farms/{id}/summary` and `/dashboard/farms/{id}`.
  - Inventory/Stock split: `/inventory` now Inputs + Assets only; `/sales/stock` (new) has Sellable / Returned / Waste tabs. Sales-side inventory service/repository/model retired.
  - Per-batch harvest model: `originalQuantity` immutable field, `farmingYear` computed at write, no more merging rows.
  - Manual expire (`POST .../expire`) and revive (`POST .../revive`) endpoints. Daily cron disabled.
  - Full `inventory_returned` CRUD (6 endpoints + `mark-waste`). `ReturnedInventoryList` frontend component.
  - `BlockHarvestEntryModal` Waste grade: dual-path submit to harvest vs waste endpoint.
  - `CustomerCombobox` typeahead with CRM address auto-fill in `OrderForm`.
  - `AddOrderItemModal`: FIFO multi-source allocation, container mode, duplicate detection, portaled dropdown.
  - Order schema: `allocations`, `containerCount`, `containerSize`, `deletedAt`, `returns` fields (backward-compatible).
  - Order lifecycle wired: reservation on confirm, deduction on ship, restoration on cancel.
  - Two-step order delete: `GET .../delete-preview` + `POST .../delete` with `BatchDecision[]`.
  - `ReportReturnModal` + `POST .../report-return` endpoint.
  - Numerous bug fixes: Farm TS type fields, URL correction, productId forwarding, UUID serialisation, nginx DNS flush, inventory backfill.
  - Released as v1.14.0 (MINOR bump). CodeMaps regenerated (structural changes).

## 2026-04

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-007 | Virtual-block SenseHub sync architecture (push per virtual child, MCP via parent chain) | Backend | 2026-04-24 | ✅ |
| T-006 | `mark_as_planted` doesn't persist crop metadata; SenseHub trigger skips | Backend | 2026-04-23 | ✅ |
| T-002 | SenseHub MCP crop-data sync integration | Backend | 2026-04-20 | ✅ |
| T-003 | Planting flow reads from empty legacy `plant_data` collection | Backend | 2026-04-23 | ✅ |
| T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates | Backend | 2026-04-23 | ✅ |
| T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails | Backend | 2026-04-23 | ✅ |

### T-007 | Virtual-block SenseHub sync architecture
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-24
- **Description:** Architectural correction surfaced during first live SenseHub integration test.
  Physical parent blocks hold `iotController` (the MCP connector) but crops live on virtual child
  blocks created via `addVirtualCrop` — the UI's only planting path. Production data confirmed:
  169/170 virtual blocks have `targetCrop`; only 1/271 physical blocks does (test artifact
  F010-002). SenseHub natively supports multiple `block_id`s per zone, so pushing each virtual
  child as its own `block_id` is the correct architecture and requires no SenseHub schema changes.
- **Result:**
  - `SenseHubCropSync.from_block()` is now `async`. When a block has no `iotController`, the
    method walks up the `parentBlockId` chain via `await BlockRepository.get_by_id()` until it
    finds an ancestor with `iotController.enabled=True` and a valid `mcpApiKey`. Returns `None`
    if no such ancestor exists. Four call sites updated with `await`:
    `sensehub_block_service_triggers.py` (×2), `planting_service.py`, `sync_service.py`.
  - `_reconcile_crop_data` in `sync_service.py` now expands each iot-parent into its virtual
    children via `BlockRepository.get_children_by_parent` before the reconcile loop. Parents
    with children are skipped; reconciliation iterates the children. Parents without children
    are reconciled directly, preserving the T-006 flow.
  - Live SenseHub cleanup: `complete_crop` fired for F010-002 (archived parent-level Capsicum,
    `sensehub_crop_id=8`). F010-002 reset in A64Core: `state=partial`, all crop fields null.
    F010-002/001 (virtual child) pushed to SenseHub with its own `block_id`, `stage=ripening`,
    new `sensehub_crop_id=9`. SenseHub dashboard shows Capsicum-Green on Greenhouse 1 at
    ripening stage, sourced from virtual child.
  - 90/90 tests pass: 81 regression + 9 new integration tests in
    `tests/integration/test_sensehub_crop_sync_virtual.py`.
  - No schema changes. No CodeMap regeneration needed.
  - Released as v1.13.5 (PATCH bump).

### T-006 | `mark_as_planted` doesn't persist crop metadata on block, SenseHub trigger skips
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-23
- **Description:** Discovered during the first live SenseHub integration test. After
  `POST /plantings/{id}/mark-planted`, `planting_service.mark_as_planted` called
  `BlockRepository.update_status(block_id, GROWING, ...)` without passing `target_crop` /
  `target_crop_name` / `actual_plant_count` / `expected_harvest_date`. Block state transitioned
  correctly but crop metadata fields stayed null. The SenseHub trigger then aborted:
  `[SenseHub] block X has no targetCrop set after mark_as_planted — skipping set_crop_data`.
- **Result:**
  - Added `primary_plant = planting.plants[0]` helper and forwarded all four kwargs to
    `BlockRepository.update_status` in `mark_as_planted`. Caller bug only — the repository
    method already accepted these as optional kwargs.
  - For multi-crop plantings `plants[0]` is used as the primary (block.targetCrop is a single
    UUID); remaining plants are tracked in `planting.plants[]`.
  - Verified end-to-end via Playwright against live SenseHub at `100.124.168.35:3001`:
    `[SenseHub] set_crop_data succeeded` fires automatically ~203ms after mark-planted returns
    200, with zero manual DB intervention. Reconciliation confirms in-sync.
  - 81/81 SenseHub regression tests pass. No schema changes. No CodeMap regen needed.
  - Released as v1.13.4 (PATCH bump).
- **Surfaced during:** First live SenseHub integration test (2026-04-23). Would have been
  caught in T-002 step 8 if Playwright had hit a real MCP instead of fake 127.0.0.1:9999.

### T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails
- **Category:** Backend · **Priority:** P3
- **Completed:** 2026-04-23
- **Description:** Three fire-and-forget asyncio trigger wrappers in
  `sensehub_block_service_triggers.py` and `planting_service.py` emitted
  `INFO "[SenseHub] <method> succeeded"` unconditionally after the MCP call,
  even when the call had failed. The upstream `SenseHubCropSync` layer already
  logs an ERROR on failure — the trailing success INFO was misleading for ops
  scanning logs.
- **Result:**
  - `_sensehub_update_growth_stage_task`: `if ok:` guard added around success log.
  - `_sensehub_complete_crop_task`: `if ok:` guard added around success log.
  - `_sync_set_crop_data_on_planted`: `if result is not None:` guard corrected
    (was `if result:` which would false-negative on empty dict).
  - No behavior change for callers or downstream state — log output only.
  - 81/81 SenseHub regression tests pass; no assertions relied on old unconditional
    behavior.
  - Released as v1.13.3 (PATCH bump).

### T-003 | Planting flow reads from empty legacy `plant_data` collection
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `PlantingService.create_planting_plan` called
  `PlantDataService.get_plant_data()` which reads from the legacy `plant_data` collection
  (0 documents in dev). Every UI planting attempt returned HTTP 404 in ~1ms.
  Planting had never worked in dev against any UI-created plant record.
- **Result (Option A implemented):**
  - `PlantingService.create_planting_plan` now reads from `PlantDataEnhancedService.get_plant_data`.
    Snapshot attribute paths adapted to nested enhanced model fields; all 8 snapshot dict keys
    are unchanged — downstream consumers (SenseHub trigger, harvest flow) unaffected.
  - Three additional pre-existing bugs uncovered and fixed during verification:
    1. `PlantingRepository` used `farm_db.db.plantings` (`.db` does not exist on
       `FarmDatabaseManager`) → fixed to `farm_db.get_database().plantings`.
    2. `BlockService.get_block_by_id` → corrected to `BlockService.get_block` (new API).
    3. `BlockService.update_block_state` → replaced with `BlockRepository.update_status` (new API).
  - Integration test mocks updated for renamed methods; 81/81 SenseHub regression tests pass.
  - Verified end-to-end: HTTP 201 on `POST /api/v1/plantings`; MongoDB doc has all 8 snapshot
    keys (Potato, growthCycleDays: 70, expectedYieldPerPlant: 1.575 kg, 15–40°C).
    Block transitioned EMPTY→PLANNED.
  - Released as v1.13.2 (PATCH bump).
- **Surfaced during:** T-002 Phase 4 e2e testing.

### T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `BlockService.change_status` at
  `src/modules/farm_manager/services/block/block_service_new.py:703` called
  `BlockService.recalculate_future_dates()` (async coroutine) without `await`. The unresolved
  coroutine object was forwarded to `BlockRepository.update_status()` as `expected_status_changes`;
  motor silently stored null instead of the resolved `Dict[str, datetime]`. Every normal block
  status transition (non-planting, non-harvest-complete) corrupted block `expectedStatusChanges`.
- **Result:**
  - Single `await` added at `block_service_new.py:703` (else-branch of `change_status`).
  - Verified via mongosh: GROWING→HARVESTING transition now persists `expectedStatusChanges` as
    proper BSON ISODate objects. No `RuntimeWarning: coroutine ... was never awaited` post-fix.
  - Audit confirmed no other missing awaits in block service files.
  - 81/81 SenseHub regression tests pass. No data backfill needed (dev data was null/clean).
  - Released as v1.13.1 (PATCH bump). Follow-up data-cleanup task T-006 deemed unnecessary.
- **Surfaced during:** T-002 step 8 e2e Playwright testing.

### T-002 | SenseHub MCP crop-data sync integration
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-20
- **Description:** Wired A64Core → SenseHub MCP push for crop data, growth-stage transitions,
  and harvest completion across five implementation phases.
- **Result:**
  - Phase 1 reverted: `plant_data.py` extension rolled back; `plant_data_enhanced` already carries
    all required SenseHub fields in nested form. No UI change needed.
  - Phase 2 eliminated: `zone_id` dropped from external contract after negotiation. All crop tools
    are `block_id`-only; SenseHub handles zone routing internally via configured primary crop zone.
  - Phase 3: `SenseHubCropSync` service + `sensehub_stage_mapper.py` + payload builder. All 4 MCP
    tools wrapped; fire-and-log error handling; graceful degradation verified; 61/61 unit tests pass.
  - Phase 4: MCP triggers wired as detached `asyncio.create_task()` into `mark_as_planted`,
    `change_status` (stage boundary + HARVESTING→CLEANING), and a new
    `sensehub_block_service_triggers.py` helper module; 10/10 integration tests pass.
  - Phase 5: Crop reconciliation extended into `SenseHubSyncService` 3h cycle; 5 drift cases
    resolved; `asyncio.Semaphore(5)` concurrency cap; aggregated result via `get_status()`;
    10/10 integration tests pass.
  - Playwright e2e: `update_growth_stage` and `complete_crop` triggers verified in UI;
    `set_crop_data` path blocked by pre-existing T-003 bug (tracked separately).
  - 81 total tests: 61 unit + 20 integration.
  - Released as v1.13.0 (MINOR bump).
- **Follow-up tasks opened:** T-003 (P2), T-004 (P0), T-005 (P3)

<!--
Archive format — group by month:

## 2026-02

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-001 | Example task | Backend | 2026-02-26 | ✅ |

### T-001 | Example task
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-02-26
- **Description:** What was done
- **Result:** Outcome or key deliverable
-->
