# A64 Core Platform — Backlog

> **Updated:** 2026-04-20
> **Tasks:** 1 active · 3 ready · 0 blocked · 0 completed

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
