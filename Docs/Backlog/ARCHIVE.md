# A64 Core Platform — Completed Work

> **Total completed:** 6 tasks

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
