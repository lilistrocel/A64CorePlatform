# A64 Core Platform — Backlog

> **Updated:** 2026-04-23
> **Tasks:** 1 active · 0 ready · 0 blocked · 0 completed

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

_No ready tasks._

---

## 🔴 Blocked

_No blocked tasks._
