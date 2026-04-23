# A64 Core Platform — Backlog

> **Updated:** 2026-04-23
> **Tasks:** 2 active · 3 ready · 0 blocked · 0 completed

## Rules for Agents

### Status Legend

| Status | Meaning |
|--------|---------|
| `🟢 Ready` | Available for implementation, no blockers |
| `🔵 Active` | Currently being worked on (check assignee) |
| `🔴 Blocked` | Waiting on dependencies to complete first |
| `✅ Done` | Completed and verified (moved to ARCHIVE.md) |

### Before Starting Work

1. **READ this file** before any implementation
2. Find a task with status `🟢 Ready`
3. **NEVER** work on `🔵 Active` tasks — already claimed by another agent
4. **NEVER** work on `🔴 Blocked` tasks — dependencies are unresolved
5. If no relevant task exists, **create one first** before starting work

### Claiming a Task

1. Change status from `🟢 Ready` to `🔵 Active`
2. Set `Assigned:` to your agent type (e.g., backend-dev-expert)
3. Set `Started:` to today's date
4. **One agent per task** — no shared ownership

### Completing a Task

1. Move the task entry from this file to [ARCHIVE.md](ARCHIVE.md)
2. Check: does this task appear in any other task's `Depends on:` field?
3. If ALL dependencies of a blocked task are now `✅ Done`, change it to `🟢 Ready`
4. Update the stats in the header of this file

### Creating New Tasks

- Use next available `T-XXX` ID (check both BACKLOG.md and ARCHIVE.md for highest ID)
- Set dependencies if this task requires other tasks to complete first
- **Categories:** Backend, Frontend, API, Database, Testing, DevOps, Docs
- **Priorities:** P0 (critical) · P1 (high) · P2 (medium) · P3 (low)

### Session Handoff

- If a session ends before task completion, add `> Context:` notes to the task
- Keep status as `🔵 Active` with context notes for the next session
- Next session reads task notes and continues from where it left off

### Task Entry Format

```markdown
### T-XXX | Task title here
- **Category:** [category] · **Priority:** [P0-P3]
- **Assigned:** [agent-type] · **Started:** [date]    ← only when 🔵 Active
- **Depends on:** T-001 ✅, T-002 🔵                  ← or "—" if none
- **Blocks:** T-005, T-006                             ← or "—" if none
- **Description:** What needs to be done
- **Steps:**
  1. Step one
  2. Step two
  3. Verify with Playwright MCP / mongosh
```

---

## 🔵 Active

### T-001 | Supabase 2026-04-07 reimport — User runs stages
- **Category:** Database · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-04-07
- **Depends on:** —
- **Blocks:** —
- **Description:** Scripts built and dry-run verified. Blocked on user running stage-by-stage
  with UI verification between stages. One crop blocker: `Lettuce - Phase 1 (5cm)` not in
  plant_data_enhanced — user must add it (or decide to skip) before stage 3 will succeed.
- **Steps:**
  1. User resolves `Lettuce - Phase 1 (5cm)` crop (add to plant_data_enhanced or skip)
  2. User runs `stage2_farms_blocks.py` → verifies farms in UI
  3. User runs `stage3_cycles_harvests.py` → verifies block states, archives, harvests in UI
  4. User runs `stage4_clients_vehicles_orders.py` → verifies CRM/Sales in UI
  5. User runs `stage5_sales_excel.py` → verifies payment enrichment on order lines
  6. User runs `stage6_purchase_register.py` → verify via mongosh count
  7. User runs `stage7_finalize.py` → verify farm assignments, financial_summary
  8. Regenerate CodeMaps (new collections: sales_order_lines, sales_unmatched, purchase_register, financial_summary)
  9. Move task to ARCHIVE.md

### T-002 | SenseHub MCP crop-data sync integration
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-04-22
- **Depends on:** — (SenseHub side fully implemented: 4 crop tools + `configure_block_mapping` + `list_zone_mappings`)
- **Blocks:** —
- **Description:** Wire A64Core → SenseHub MCP push for crop data, growth-stage transitions, and
  harvest completion. Contract defined in `Docs/2-Working-Progress/SenseHub-MCP-Crop-Sync-Contract.md`.
  SenseHub reply in `SenseHub-MCP-Crop-Sync-Reply.md`. Follow-up asks in `SenseHub-MCP-Crop-Sync-Followup.md`.
- **Steps:**
  1. ~~**Extend `plant_data` model**~~ ❌ **REVERTED (2026-04-22)** — investigation showed the UI
     and all 57 dev plant-data docs live in the `plant_data_enhanced` collection (nested schema),
     which already has every field the MCP payload needs:
     - `soilRequirements.ecMin/ecMax` → `optimal_ranges.ec`
     - `soilRequirements.phMin/phMax` → `optimal_ranges.ph`
     - `environmentalRequirements.temperatureMin/Max` → `optimal_ranges.temperature`
     - `environmentalRequirements.humidityMin/Max` → `optimal_ranges.humidity`
     - `lightRequirements.dailyLightHoursMin/Max` → `optimal_ranges.light`
     - `wateringRequirements.waterAmountPerPlant` + `waterAmountUnit` → `optimal_ranges.water`
     No model extension or UI change needed. Phase 3 payload builder reads from
     `plant_data_enhanced` directly.
  2. ~~**Add zone mapping**~~ ❌ **ELIMINATED (2026-04-22)** — SenseHub accepted our request to
     drop `zone_id` from the A64Core-facing contract. All crop tools (`set_crop_data`,
     `update_growth_stage`, `complete_crop`, `get_crop_data`) now take `block_id` only.
     SenseHub resolves zone internally via a "primary crop zone" configured once on their admin UI,
     with auto-bind on first `set_crop_data`. No field added to `block.iotController`, no mapping
     push from A64Core. See `SenseHub-MCP-Zone-Binding-Reply.md`.
  3. ✅ **Build `SenseHubCropSync` service** at
     `src/modules/farm_manager/services/sensehub/sensehub_crop_sync.py`. Wraps existing
     `SenseHubMCPClient`. Methods: `set_crop_data(block)`, `update_growth_stage(block, stage)`,
     `complete_crop(block, totals)`, `get_crop_data(block)`.
     - **Read source:** `plant_data_enhanced` via `PlantDataEnhancedService.get_by_id()` resolved
       from `block.targetCrop` (the plantDataId).
     - **Payload builder:** map nested enhanced fields → flat SenseHub `optimal_ranges` shape.
       **Every optimal_ranges key is included only if ALL its constituent sub-fields are non-null.**
       EC sourced from `soilRequirements.ecRangeMs` string (parsed); no separate ecMin/ecMax fields.
       Water sourced from `wateringRequirements.amountPerPlantLiters` (already in L).
       SenseHub confirmed partial `optimal_ranges` is accepted with no error.
     - **Graceful degradation verified:** plant with only `plantName` + `growthCycleDays`
       (no optional data) → valid payload with `optimal_ranges: {}`.
     - Fire-and-log-on-failure. 422 "No primary crop zone configured" → operator WARNING, no retry.
     **Done 2026-04-20.**
  4. ✅ **Growth-stage computation helper** — fresh implementation (context_builder logic is
     AI-prompt context only; not cleanly extractable). Stage mapper at
     `src/modules/farm_manager/services/sensehub/sensehub_stage_mapper.py`.
     Maps germination→seedling, vegetative→vegetative, flowering→flowering, fruiting→fruiting,
     last 15 % of fruitingDays→ripening, HARVESTING state→ripening, CLEANING/EMPTY→harvested.
     **Done 2026-04-20.**
  5. **Wire trigger points:**
     - `PlantingService.mark_as_planted()` → `set_crop_data` (`api/v1/plantings.py:72`)
     - `BlockService.change_status()` → `update_growth_stage` when computed stage crosses boundary
       (`services/block/block_service_new.py:327`)
     - `HarvestService.record_harvest()` or block CLEANING→EMPTY transition → `complete_crop`
       (`api/v1/block_harvests.py:29`)
  6. **Reconciliation loop:** extend `SenseHubSyncService` (`services/sensehub/sync_service.py`)
     to, on startup and each 3h cycle, call `get_crop_data(block_id)` per connected block
     vs A64Core state, repush drift. No `list_zone_mappings` call needed — zone routing is internal
     to SenseHub now.
  7. **Tests (testing-backend-specialist):**
     - Unit: payload builder shape matches contract byte-for-byte
     - Integration: mark-planted → MCP call observed (mock SenseHub)
     - Integration: status change triggers `update_growth_stage` with correct stage mapping
     - Integration: harvest → `complete_crop` with summed yield
  8. **UI verification (Playwright MCP):** plant a crop → verify block shows crop → advance
     stage → verify block updates → record harvest → verify block cycles to EMPTY.
  9. **CodeMap regeneration** after structural changes (new service module, new model fields).
  10. **Change Guardian:** commit per phase (schema extension → service → triggers), update
      CHANGELOG, semver MINOR bump.
- **Context notes:**
  - Do NOT call a separate deactivate step before `set_crop_data` — SenseHub confirmed atomic replace.
  - Stage transitions are NOT forward-only — safe to send corrections and past `transitioned_at` values.
  - For backfill after downtime, use `update_growth_stage` with a past `transitioned_at` — do NOT re-send `set_crop_data`.
  - Partial `optimal_ranges` accepted — omit keys we don't have rather than sending nulls.
  - **Correlation key is `a64core_planting_id`** (persisted and round-tripped by SenseHub).
    `sensehub_crop_id` is NOT stable across replays — treat as opaque, do not rely on it for identity.
  - After `complete_crop`, `get_crop_data` returns `null` until next `set_crop_data`. Code against this.
  - EC storage is mS/cm on both sides (SenseHub converts internally from µS/cm).
  - Reconciliation: cap concurrency at 5 sessions per site, no 429s to handle, no minimum delay.
    If 200-block reconciliation runs too slow sequentially, request a `set_crop_data_bulk` tool from SenseHub.
  - **Zone routing is now fully internal to SenseHub.** A64Core calls are `block_id`-only.
    `configure_block_mapping` and `list_zone_mappings` still exist on their end but A64Core does
    not call them.
  - If `set_crop_data` returns HTTP 422 `"No primary crop zone configured for this site"`, surface
    it as an operator-facing alert — it's a SenseHub admin-UI setup task we can't resolve from
    our side. Do NOT retry automatically on this error.
  - Future fields SenseHub is ready to consume (informational, not in this task):
    `optimal_ranges.ec_drain: {min, max, unit: "mS/cm"}` and
    `optimal_ranges.irrigation: {cycles_per_day, duration_minutes, unit: "cycles"}`.
  > **Phase 1 reverted (2026-04-22):** `plant_data.py` extension rolled back. The UI and 57 dev
  > docs use `plant_data_enhanced` which already has all SenseHub fields in nested form. Phase 3
  > retargeted to read from enhanced directly. No UI changes needed for MCP payload source.
  > Planting flow currently points at the empty legacy `plant_data` collection — tracked as T-003
  > (pre-existing bug, out of scope for T-002).
  >
  > **Phase 2 eliminated (2026-04-22):** SenseHub accepted our request to drop `zone_id` from the
  > external contract. All crop tools are `block_id`-only now; zone routing is internal to them
  > via a configured primary crop zone. No `zoneId` on `block.iotController`, no mapping push.
  >
  > **Phase 3 done (2026-04-20):** SenseHubCropSync service + stage mapper + payload builder + unit
  > tests. All 4 MCP tools wrapped (`set_crop_data`, `update_growth_stage`, `complete_crop`,
  > `get_crop_data`); fire-and-log error handling; HTTP 422 primary-zone error surfaced as operator
  > WARNING. Graceful degradation verified (plant with no optional data → valid payload with
  > `optimal_ranges: {}`). EC sourced from `soilRequirements.ecRangeMs` string (parsed "min-max");
  > water from `wateringRequirements.amountPerPlantLiters` (already in L). 61/61 unit tests pass.
  > Files: `src/modules/farm_manager/services/sensehub/sensehub_crop_sync.py`,
  > `src/modules/farm_manager/services/sensehub/sensehub_stage_mapper.py`,
  > `tests/unit/test_sensehub_crop_sync.py`.
  >
  > **Phase 4 done (2026-04-20):** MCP triggers wired into mark_as_planted, change_status,
  > record_harvest (see note). Fire-and-log with detached asyncio.create_task() — no impact on
  > primary operation latency or success. Plant data resolved fresh from plant_data_enhanced at
  > trigger time (bypasses T-003). complete_crop fires in change_status on HARVESTING→CLEANING
  > (not in record_harvest — which does NOT transition block state; state change is always a
  > separate change_status call). Integration tests cover all 10 scenarios (10/10 pass).
  > Phase 3 unit tests still all pass (61/61). New file:
  > src/modules/farm_manager/services/block/sensehub_block_service_triggers.py
  > (update_growth_stage and complete_crop helpers).
  >
  > **Phase 5 done (2026-04-20):** Reconciliation extended into SenseHubSyncService. Runs each 3h
  > cycle alongside existing sensor/alert sync (option a — second pass at end of run_sync, reusing
  > already-fetched block list). Resolves 5 drift cases: missing-on-SenseHub (repush), mismatched
  > a64core_planting_id (atomic replace), stage-drift (update_growth_stage), orphan-active-on-SenseHub
  > (complete with zero yield + grade A), and primary-zone-error-operator-alert (counted in errors,
  > PRIMARY_ZONE_NOT_CONFIGURED in error_samples). Aggregated result shape:
  > `{reconcile_started_at, reconcile_finished_at, blocks_checked, in_sync,
  >  drift_resolved_by_repush, drift_resolved_by_stage_update, drift_resolved_by_complete,
  >  errors, error_samples[0..5]}` — logged at INFO each cycle and stored in
  > `_last_reconcile_result` (returned via get_status()). Global asyncio.Semaphore(5) caps
  > concurrency (SenseHub confirmed no rate limits, 5 concurrent sessions fine).
  > Per-block error isolation — one bad block does not stop the loop.
  > 10/10 new integration tests pass; 61/61 Phase 3 + 10/10 Phase 4 regression tests still pass.
  > Modified: src/modules/farm_manager/services/sensehub/sync_service.py
  > New: tests/integration/test_sensehub_reconciliation.py
  >
  > **T-002 implementation complete.** Remaining: Step 7 (full test pass), Step 8 (UI Playwright
  > verification), Step 9 (CodeMap regen), Step 10 (Change Guardian commits).
  >
  > **Playwright e2e (step 8, 2026-04-23):** Trigger 1 `update_growth_stage` (GROWING→HARVESTING)
  > PASS; Trigger 2 `complete_crop` (HARVESTING→CLEANING) PASS; Trigger 0 `set_crop_data` via
  > planting BLOCKED by T-003 (can't create plantings in UI because legacy collection is empty);
  > no-controller skip path PASS; UI regression PASS. Two pre-existing bugs surfaced and tracked
  > as T-004 (missing await, P0) and T-005 (misleading success log, P3).
  >
  > **CodeMap rerun (step 9, 2026-04-23):** `bash scripts/codebase_mapper/rerun.sh` re-queued
  > 11 tasks — full regeneration (mapping agents + `map_generator.py all`) still pending. Can
  > be done in a follow-up pass; does not block commit of T-002 code.

---

## 🟢 Ready

### T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates
- **Category:** Backend · **Priority:** P0
- **Depends on:** —
- **Blocks:** —
- **Description:** Pre-existing bug discovered during T-002 step 8 Playwright verification.
  `BlockService.change_status` at `src/modules/farm_manager/services/block/block_service_new.py:703`
  calls `BlockService.recalculate_future_dates()` (an async coroutine) **without `await`**.
  The coroutine object (not the resolved dict) is then passed to `BlockRepository.update_status()`
  as the `expected_status_changes` argument. Every normal block status transition silently
  corrupts the block's expected harvest/status-change dates. Stderr shows
  `RuntimeWarning: coroutine 'BlockService.recalculate_future_dates' was never awaited`.
  High severity — affects date accuracy across the farm management module.
- **Steps:**
  1. Add `await` to the call at `block_service_new.py:703`.
  2. Verify with a status transition via UI → mongosh-check `expectedStatusChanges` on the block.
  3. Regression pass through existing block service tests.
  4. Audit for other missing `await`s in the same file (grep for `def .*async def`
     patterns and cross-check callers).
  5. Change Guardian commit + CHANGELOG (PATCH bump).
- **Context notes:**
  - Not caused by T-002; existed before trigger wiring was added. Surfaced during e2e test.
  - Playwright agent confirmed the warning appears on every non-planting status transition.

### T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails
- **Category:** Backend · **Priority:** P3
- **Depends on:** —
- **Blocks:** —
- **Description:** `_sensehub_update_growth_stage_task` and `_sensehub_complete_crop_task`
  in `src/modules/farm_manager/services/block/sensehub_block_service_triggers.py`
  (lines ~131 and ~215) call `await sync.update_growth_stage(...)` / `await sync.complete_crop(...)`
  which return `True`/`False`. The wrappers log `INFO "[SenseHub] ... succeeded"` regardless of
  the return value. ERROR from the MCP client layer always precedes the "succeeded" INFO when
  the MCP call fails, but the success line is still misleading for ops scanning logs.
- **Steps:**
  1. Check the return value of `update_growth_stage` / `complete_crop` in both wrappers.
  2. Log `INFO "... succeeded"` only if the call returned truthy; log nothing extra otherwise
     (the upstream ERROR already covers the failure).
  3. Similar check for `planting_service.py:_sync_set_crop_data_on_planted` — `set_crop_data`
     returns a dict or None; log success only on non-None return.
  4. Update any integration tests that assert the current behavior.
  5. Change Guardian commit + CHANGELOG (PATCH bump).

### T-003 | Planting flow reads from empty legacy `plant_data` collection
- **Category:** Backend · **Priority:** P2
- **Depends on:** —
- **Blocks:** — (T-002 Phase 3 routes around this by reading enhanced directly)
- **Description:** Pre-existing bug discovered during T-002 investigation. The UI creates/edits
  plant records in `plant_data_enhanced` (57 docs in dev). But `PlantingService.create_planting_plan`
  at `src/modules/farm_manager/services/planting/planting_service.py:85` calls
  `PlantDataService.get_plant_data()` which reads from the legacy `plant_data` collection —
  which has **0 documents** in dev. This means any planting attempt against a UI-created plant
  should fail with 404, OR there's an undocumented fallback path somewhere.
  Need to investigate whether planting is actually broken in dev today, or if something else
  bridges the two collections. Either way, the planting flow should read from
  `plant_data_enhanced` (the live collection) or go through `PlantDataMigrationMapper`.
- **Steps:**
  1. **Reproduce:** via Playwright MCP, create a new plant in the UI (goes to `plant_data_enhanced`),
     then try to plant it on a block. Confirm whether it succeeds or 404s.
  2. **Investigate fallback:** grep for any code path that bridges `plant_data_enhanced` →
     `plant_data` at read time. Check `PlantDataRepository.get_by_id`, any shared service, any
     middleware. Document findings.
  3. **Decide the fix approach:**
     - Option A: Migrate `PlantingService` to read from `PlantDataEnhancedService` and adapt the
       snapshot whitelist to the enhanced nested structure.
     - Option B: Populate `plant_data` from `plant_data_enhanced` on write (dual-write via the
       existing `PlantDataMigrationMapper`).
     - Option C: Deprecate the legacy `plant_data` collection entirely; migrate references.
  4. **Implement chosen approach.**
  5. **Regression test** (testing-backend-specialist): verify all existing planting/harvest flows still work.
  6. **CodeMap regeneration** if service wiring changes.
  7. **Change Guardian:** commit + CHANGELOG.
- **Context notes:**
  - Found during T-002 when extending `plant_data.py` initially — the extension surfaced the
    collection mismatch because no UI path reached the legacy model.
  - `PlantDataMigrationMapper` in `src/modules/farm_manager/utils/plant_data_mapper.py` already
    exists and handles legacy ↔ enhanced conversion — reuse it rather than writing custom mapping.
  - T-002 Phase 3 (SenseHub sync) intentionally bypasses this by reading `plant_data_enhanced`
    directly, so MCP sync is not blocked by this bug.

---

## 🔴 Blocked

_No blocked tasks._
