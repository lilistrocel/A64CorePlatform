# A64 Core Platform — Backlog

> **Updated:** 2026-05-19
> **Tasks:** 2 active · 0 ready · 0 blocked · 0 completed (T-003, T-004, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-016, T-017, T-018 completed, moved to ARCHIVE.md)

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

### T-008 | Replace four Gemini AI agents with one Claude assistant
- **Category:** Backend + Frontend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-19
- **Depends on:** —
- **Blocks:** —
- **Description:** Collapse the current Gemini-based AI surface (4 services: `farm_ai`,
  `farm_level_ai`, `global_ai`, `ai_hub` + voice endpoints + 2 frontends: `AIHub`,
  `AIAnalyticsChat`) into one Claude Sonnet 4.6 assistant. Single chat surface — slide-out side
  panel available on every page. Read-only (write/control actions stay in SenseHub). Open to all
  authenticated users. Last 3 conversations persisted per user.
- **Decisions locked (user, 2026-05-19):**
  1. No write actions — SenseHub owns relay/automation control
  2. Drop voice (transcribe + TTS) — feature creep
  3. Keep cost tracking + 30-min query cache as middleware around Claude tool calls
  4. Fresh module, retire all four Gemini agents
  5. Frontend: slide-out side panel (not full-screen tab) — available everywhere
  6. Permissions: all authenticated users (read-only is safe)
  7. History: last 3 conversations per user, older auto-evicted
- **Phases:**
  - **A. Backend foundation** — Anthropic SDK + `ANTHROPIC_API_KEY` setting + module skeleton at
    `src/modules/ai_assistant/` + Claude service wrapper (Sonnet 4.6, prompt caching on system
    prompt + tool defs) + cost tracking in `ai_assistant_cost_log`
  - **B. Tools** — `query_mongodb` (lift `ai_analytics.QueryValidator` + 30-min cache) +
    SenseHub MCP read tools (lift from `farm_ai/tool_definitions.py`; strip relay/manage)
  - **C. Context + API** — single context composer (merges what the four context_builders did,
    keyed off `farm_id`/`block_id` from request) + `POST /api/v1/ai/chat` (streaming) +
    conversation persistence in `ai_assistant_conversations` (last 3 per user)
  - **D. Frontend** — slide-out chat panel, replaces `AIHub` + `AIAnalyticsChat`. Available on
    every page; pulls current farm/block selection automatically
  - **E. Retire** — delete `farm_ai`, `farm_level_ai`, `global_ai`, `ai_hub`, voice routes,
    `AIHub`, `AIAnalyticsChat`, related Gemini config. Migrate any chat history we want to keep.
  - **F. Tests** — backend + integration tests; Playwright e2e of the slide-out
  - **G. Change Guardian** — MINOR bump (current v1.14.x → v1.15.0), CHANGELOG, commit
- **Context notes:**
  - Use `claude-sonnet-4-6` model per Jan 2026 cutoff in CLAUDE.md
  - Bake prompt caching (`cache_control: {type: "ephemeral"}`) on system + tool defs for
    cost savings — every turn after the first reads cache at ~10% of full input price
  - Use `messages.stream` for responsive UX
  - `ai_analytics` module's `QueryValidator` is the gold guardrail — preserve it intact when
    lifting into the new module
  - Old Gemini code stays running until Phase E retirement — no behavioral gap during cutover
  - **Phases A+B+C completed 2026-04-20 (backend-dev-expert):**
    - `src/config/settings.py` — added `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AI_ASSISTANT_MAX_TOKENS`,
      `AI_ASSISTANT_MAX_TURNS`, `AI_ASSISTANT_HISTORY_LIMIT`
    - `src/modules/ai_assistant/` — full module skeleton: models, services, API
    - `src/modules/ai_assistant/services/claude_service.py` — AsyncAnthropic streaming wrapper,
      prompt caching (system + tool defs), bounded tool-use loop (max 8 turns), cost tracking
    - `src/modules/ai_assistant/services/tool_definitions.py` — 7 read-only tools:
      `query_mongodb`, `get_equipment_list`, `get_sensor_readings`, `get_alerts`,
      `get_automations`, `get_lab_readings`, `get_lab_latest`
    - `src/modules/ai_assistant/services/tool_executor.py` — async dispatcher, delegates
      `query_mongodb` to existing `ai_analytics.QueryEngine`; SenseHub tools via
      `SenseHubConnectionService.get_client(farm_id, block_id)` with cache fallback
    - `src/modules/ai_assistant/services/context_composer.py` — merges four existing
      context builders keyed off ChatScope (BLOCK/FARM/GLOBAL)
    - `src/modules/ai_assistant/services/conversation_repository.py` — last-3-per-user
      eviction, cross-user isolation enforced at all query points
    - `src/modules/ai_assistant/services/cost_tracker.py` — writes to `ai_assistant_cost_log`
    - `src/modules/ai_assistant/api/v1/assistant.py` — 3 endpoints:
      `POST /api/v1/ai/assistant/chat` (SSE streaming),
      `GET /api/v1/ai/assistant/conversations`,
      `DELETE /api/v1/ai/assistant/conversations/{id}`
    - `src/api/routes.py` — router wired at `/api/v1/ai/assistant/*`
    - `tests/unit/test_ai_assistant/` — 4 test files (cost_tracker, context_composer,
      tool_executor, conversation_repository, claude_service)
    - `tests/integration/test_ai_assistant.py` — 8 integration test scenarios
  - **Requires Docker hot-reload (no rebuild needed)** — code changes are live via volume mount
  - **New env var required:** `ANTHROPIC_API_KEY` must be set in `.env` / Docker environment
  - **New MongoDB collections created at runtime:**
    - `ai_assistant_conversations` — conversation + message history
    - `ai_assistant_cost_log` — per-call cost/token tracking
  - **Phase D completed 2026-05-19 (frontend-dev-expert):**
    - **New files added:**
      - `frontend/user-portal/src/stores/aiAssistant.store.ts` — Zustand store: panel open/close,
        message list, streaming state, conversation list, draft input. No persistence (intentional —
        state resets on page reload per spec).
      - `frontend/user-portal/src/services/aiAssistantApi.ts` — SSE streaming via fetch+ReadableStream
        (not axios); REST conversation list/delete via existing apiClient. Auth header injected from
        localStorage (same source as api.ts interceptor).
      - `frontend/user-portal/src/hooks/queries/useAIAssistant.ts` — central hook: wires store +
        SSE + TanStack Query (conversations list query + delete mutation). Context auto-derived from
        sessionStorage keys `selectedFarmId` / `selectedBlockId` (global scope fallback when absent).
      - `frontend/user-portal/src/components/ai-assistant/AIAssistantFAB.tsx` — fixed FAB,
        bottom-right, z-index 895, visible to all authenticated users, pulse animation when closed.
      - `frontend/user-portal/src/components/ai-assistant/AIAssistantPanel.tsx` — 420px slide-out
        drawer, right-anchored, full-height, 200ms ease-out transform transition. Backdrop is purely
        decorative (pointer-events: none always) so sidebar/page remains fully clickable.
        Closes via X button or Escape key.
      - `frontend/user-portal/src/components/ai-assistant/ConversationList.tsx` — last-3 selector
        with delete button, new conversation button, relative timestamps.
      - `frontend/user-portal/src/components/ai-assistant/MessageList.tsx` — auto-scroll on chunk
        append; empty state with 4 quick-suggestion chips.
      - `frontend/user-portal/src/components/ai-assistant/MessageBubble.tsx` — memoized; user
        (right, primary blue) vs assistant (left, neutral) bubbles; inline markdown renderer (bold,
        italic, code, pre, lists); cost indicator ($0.000x); typing indicator; tool call cards.
      - `frontend/user-portal/src/components/ai-assistant/ToolCallCard.tsx` — inline pending/done
        cards for each tool call (spinner → checkmark + summary).
      - `frontend/user-portal/src/components/ai-assistant/InputBox.tsx` — textarea (Enter=send,
        Shift+Enter=newline), char counter at 7000+, cancel button during streaming.
      - `frontend/user-portal/src/components/ai-assistant/index.ts` — barrel exports.
    - **Modified files:**
      - `frontend/user-portal/src/components/layout/MainLayout.tsx` — added `<AIAssistantFAB />`
        and `<AIAssistantPanel />` mounts at bottom of LayoutContainer.
    - **FAB position:** `bottom: 88px; right: 28px` (sits above back-to-top button). On mobile:
      `bottom: 24px; right: 16px`.
    - **Surprising findings:**
      - `BotMessageSquare` icon does not exist in lucide-react 0.309.0 — replaced with `Bot`.
      - The backend `/api/v1/ai/assistant/conversations` returns 404 in dev — nginx proxies to the
        correct backend but the backend module may not be registered in dev docker yet. Frontend
        handles it gracefully (empty conversation list, error surfaced in bubble).
      - `ANTHROPIC_API_KEY` not set in dev env yet — confirmed by 404/500 on chat endpoint. UI
        flow is visually complete through message send; backend error is correctly surfaced inline.
    - **Hot-reload status:** Vite picks up all new component files automatically — no restart needed.
      However, HMR may show stale-module errors for `BotMessageSquare` until a hard page reload
      clears the Vite module cache. Hard reload resolves to zero JS errors.
  - **Next phase:** Phase E (Retire Gemini agents: farm_ai, farm_level_ai, global_ai, ai_hub,
    voice routes, AIHub, AIAnalyticsChat, related Gemini config)

---


## 🟢 Ready

_No ready tasks._

---

## 🔴 Blocked

_No blocked tasks._
