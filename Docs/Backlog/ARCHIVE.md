# A64 Core Platform — Completed Work

> **Total completed:** 2 tasks

## 2026-04

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-002 | SenseHub MCP crop-data sync integration | Backend | 2026-04-20 | ✅ |
| T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates | Backend | 2026-04-23 | ✅ |

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
