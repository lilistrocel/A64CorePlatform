# A64 Core Platform — Backlog

> **Updated:** 2026-05-25
> **Tasks:** 6 active · 2 ready · 0 blocked · 0 completed (T-003, T-004, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-016, T-017, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-027, T-028, T-029, T-030, T-031, T-032, T-033, T-034, T-035, T-036, T-037, T-038, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-050, T-051, T-053, T-055, T-056, T-057-1a, T-060.6, T-060.6.1, T-060.7, T-060.7.1, T-060.8, T-060.9.1, T-061, T-062, T-063 completed, moved to ARCHIVE.md)

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

### T-054 | Document attachment infrastructure — backend (PR, PO, GR, AP Invoice, Payment)
- **Category:** Backend · **Priority:** P1
- **Assigned:** backend-dev-expert · **Started:** 2026-05-21
- **Depends on:** T-053 ✅ (frontend AttachmentList component)
- **Blocks:** —
- **Description:** Reusable attachment backend for the five P2P doc types. Storage
  abstraction (LocalStorageBackend), Mongo collection `document_attachments`,
  endpoints at `/api/v1/attachments/{doc_type}/{doc_id}` and `/api/v1/attachments/file/{file_id}`.
  Mime whitelist: PDF + JPEG + PNG + WebP. 10 MB cap. Soft delete. Read-only after
  approval except PAYMENT type. Range request support for PDF streaming.
- **Steps:**
  1. Create `src/modules/attachments/` module skeleton with __init__.py files ✅
  2. `storage/base.py` — abstract StorageBackend interface ✅
  3. `storage/local.py` — LocalStorageBackend (pathlib) ✅
  4. `models/attachment.py` — AttachmentMetadata Pydantic schema ✅
  5. `services/attachment_service.py` — full business logic ✅
  6. `api/v1/attachments.py` — 5 endpoints ✅
  7. `utils/range_parser.py` — HTTP Range header parser (extracted for testability) ✅
  8. `src/config/settings.py` — ATTACHMENT_STORAGE_ROOT ✅
  9. `src/api/routes.py` — register router at /api/v1/attachments ✅
  10. `docker-compose.yml` — bind mount ./data/attachments:/app/data/attachments ✅
  11. `tests/unit/test_attachments/` — 27 tests (all pass) ✅

---

### T-052 | Phase E frontend — AP Aging + Vendor Sub-Ledger report pages
- **Category:** Frontend · **Priority:** P1
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-21
- **Depends on:** T-051 ✅ (finance reports backend endpoints — complete)
- **Blocks:** —
- **Description:** Build two finance report pages: APAgingPage (/finance/ap-aging) and
  VendorSubLedgerPage (/finance/vendor-sub-ledger). AP Aging uses frontend orchestration:
  fetch Approved AP invoices, call totals-paid endpoint, compute outstanding, POST to
  finance aging endpoint. Vendor Sub-Ledger is a GET report cross-referenced with the
  operation vendor list for vendorCode + vendorName. Both pages have role gate, loading,
  error, empty states. Sidebar entries added after Vendor Payments, before Fiscal Periods.
  New financeReportsService.ts and useFinanceReports.ts.
- **Steps:**
  1. financeReportsService.ts — getApDocTotalsPaid, getApAging, getVendorSubLedger ✅
  2. useFinanceReports.ts — useApAging mutation, useVendorSubLedger query ✅
  3. Export from hooks/queries/index.ts ✅
  4. APAgingPage.tsx — toolbar + orchestration + bucket cards + by-vendor table ✅
  5. VendorSubLedgerPage.tsx — toolbar + total card + table + View Entries link ✅
  6. App.tsx — lazy imports + routes ✅
  7. MainLayout.tsx — sidebar entries ✅
  > Context: All files created 2026-05-21. Pages show graceful API errors until T-051 ships.

---

### T-049 | Phase D frontend — Vendor Payment UI (payments list, detail, form)
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-048 🔵 (backend AP payments endpoints, landing in parallel)
- **Blocks:** —
- **Description:** Build vendor payment pages: PaymentsPage (list + toolbar + New Payment button),
  PaymentDetailPage (header + applied invoices + JE summary + Reverse affordance), and
  RecordPaymentPage (single-form with invoice checkbox-table). Service layer
  paymentsService.ts + usePayments.ts hooks. Sidebar entry after Trial Balance / before P&L.
  Role gating: view for accountant/finance_admin/auditor/admin/super_admin; create for
  finance_admin/admin/super_admin. AP aging deferred (backend not yet shipping).
- **Steps:**
  1. paymentsService.ts — typed API (listPayments, getPayment, createPayment)
  2. usePayments.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. PaymentsPage.tsx — list + toolbar + method pill + New Payment → RecordPaymentPage
  5. PaymentDetailPage.tsx — header + applied invoices table + JE inline summary + Reverse link
  6. RecordPaymentPage.tsx — single-form: vendor, date, bank acct, method, invoice table, notes
  7. App.tsx — lazy imports + routes (/finance/payments, /finance/payments/new, /finance/payments/:id)
  8. MainLayout.tsx — sidebar entry 💸 after Trial Balance, before P&L Statement

---

### T-049 | Phase D frontend — Vendor Payment UI (payments list, detail, form)
- **Category:** Frontend · **Priority:** P0
- **Status:** 🟢 Ready (backend T-048 complete)
- **Depends on:** T-048 ✅ (backend AP payments endpoints)
- **Blocks:** —
- **Description:** Build vendor payment pages: PaymentsPage (list + toolbar + New Payment button),
  PaymentDetailPage (header + applied invoices + JE summary + Reverse affordance), and
  RecordPaymentPage (single-form with invoice checkbox-table). Service layer
  paymentsService.ts + usePayments.ts hooks. Sidebar entry after Trial Balance / before P&L.
  Role gating: view for accountant/finance_admin/auditor/admin/super_admin; create for
  finance_admin/admin/super_admin. AP aging deferred (backend not yet shipping).
- **Steps:**
  1. paymentsService.ts — typed API (listPayments, getPayment, createPayment, getApDocTotalsPaid)
  2. usePayments.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. PaymentsPage.tsx — list + toolbar + method pill + New Payment → RecordPaymentPage
  5. PaymentDetailPage.tsx — header + applied invoices table + JE inline summary + Reverse link
  6. RecordPaymentPage.tsx — single-form: vendor, date, bank acct, method, invoice table, notes
  7. App.tsx — lazy imports + routes (/finance/payments, /finance/payments/new, /finance/payments/:id)
  8. MainLayout.tsx — sidebar entry after Trial Balance

---

### T-044 | Phase C frontend — AP Invoice pages + variance display
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-043 (Phase C.1 AP Invoice backend, landing in parallel)
- **Blocks:** —
- **Description:** Build AP Invoice list, detail, and form pages. Service layer
  (apInvoicesService.ts), TanStack Query hooks (useAPInvoices.ts), sidebar entry,
  lazy routes in App.tsx. Variance display: per-line amber row highlight + red/green
  amounts, total variance in header with tooltip. "View Journal Entry →" banner on
  Approved docs. Extend ApprovalInboxPage to handle AP_INVOICE docType.
- **Steps:**
  1. apInvoicesService.ts — typed API, full CRUD + state transitions
  2. useAPInvoices.ts — TanStack Query hooks
  3. Export from hooks/queries/index.ts
  4. APInvoicesPage.tsx — list with variance column
  5. APInvoiceDetailPage.tsx — header + lines + totals + banners + actions
  6. APInvoiceFormPage.tsx — GR picker + from-GR form + edit mode
  7. App.tsx — lazy imports + routes
  8. MainLayout.tsx — sidebar entry between Goods Receipts and Approval Inbox
  9. ApprovalInboxPage.tsx — extend DocType to include AP_INVOICE

---

### T-038 | Phase B frontend — Goods Receipts UI + Journal Entries list
- **Category:** Frontend · **Priority:** P0
- **Assigned:** frontend-dev-expert · **Started:** 2026-05-20
- **Depends on:** T-037 (backend GR module, landing in parallel)
- **Blocks:** —
- **Description:** Build GoodsReceiptsPage, GoodsReceiptDetailPage, GoodsReceiptFormPage
  (purchasing side) and JournalEntriesPage with inline row-expand (finance side). Service
  layer, TanStack Query hooks, sidebar entries, lazy routes in App.tsx.
- **Steps:**
  1. goodsReceiptsService.ts — typed API calls mirroring purchasingApi.ts
  2. journalEntriesService.ts — JE list + detail with correct envelope unwrap
  3. useGoodsReceipts.ts + useJournalEntries.ts hooks
  4. Export from hooks/queries/index.ts
  5. GoodsReceiptsPage.tsx, GoodsReceiptDetailPage.tsx, GoodsReceiptFormPage.tsx
  6. JournalEntriesPage.tsx with inline row-expand
  7. App.tsx — lazy imports + routes
  8. MainLayout.tsx — sidebar entries

---

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

### T-051 | UAE VAT compliance — tax-point rule + reverse-charge mechanism
- **Category:** Backend · **Priority:** P0
- **Assigned:** backend-dev-expert · **Started:** 2026-05-21
- **Depends on:** —
- **Blocks:** —
- **Description:** PM feedback items 2 and 3.
  Item 2: UAE Article 25 tax-point rule — add `dateOfSupply` to
  `ApInvoicePostedPayload`, populate from GR `docDate` in
  `build_ap_invoice_event_payload`, compute `tax_point_date =
  min(dateOfSupply, invoiceDate)` in handler, stamp on VAT line description.
  Item 3: Reverse-charge VAT — migration 012 adds `isReverseCharge` to
  `tax_codes`, ORM + schema updated, handler posts both DR Input VAT and
  CR Output VAT for SR lines, AP credit = lineNet only for SR lines.
- **Steps:**
  1. Claim task (done)
  2. Migration 012_tax_codes_reverse_charge.py
  3. ORM model: add isReverseCharge to TaxCode
  4. Pydantic schemas: add isReverseCharge to TaxCodeCreate/Update/Response
  5. Seed: set isReverseCharge=True on SR in seed_tax_codes
  6. Contract: add dateOfSupply to ApInvoicePostedPayload
  7. document_service.py: populate dateOfSupply in build_ap_invoice_event_payload
  8. Finance handler: tax-point logic + reverse-charge JE logic
  9. Tests

## 🟢 Ready

_T-059 (Wave 0) — see Active for context._
_T-060 (Wave 2) — design approved 2026-05-24, ready to claim._
_T-061, T-062, T-063 — completed 2026-05-24, moved to ARCHIVE.md._


### T-059 | Wave 0 — Finance as opt-in add-on (architectural hygiene) — 🔵 Active
- **Category:** Backend + Frontend + DevOps + Docs · **Priority:** P0
- **Assigned:** Viet Anh (inline implementation) · **Started:** 2026-05-24
- **Depends on:** T-057-1a ✅ · **Blocks:** T-060+
  (every future finance wave)
- **Approver defaults (design doc §13):** super_admin only · accept any
  tax-code string · nginx 503 on finance-down · existing audit_log schema
- > Context (2026-05-24): All 7 sub-tasks implemented in one inline
  > session.
  > - T-059.1 ✅ /api/v1/system/capabilities + per-tenant flag +
  >   OutboxWriter gate + migration script
  > - T-059.2 ✅ /api/v1/system/health on finance + Redis-cached
  >   reachability check
  > - T-059.3 ✅ useCapabilities hook + FinanceGate (route gating) +
  >   sidebar gating + free-text fallback in PR/PO/GR/AP forms +
  >   FinanceUnreachableBanner
  > - T-059.4 ✅ PATCH /organizations/{id}/modules + ModulesSettingsCard
  >   (super_admin, audit-logged, confirmation modal that doesn't
  >   close on overlay click)
  > - T-059.5 ✅ nginx dev+prod confs return 503 JSON on finance
  >   unreachable (docker-compose.finance.yml already existed)
  > - T-059.6 ✅ ops-only-smoke workflow + scripts/ci/check_finance_imports.sh
  >   (lint passes locally)
  > - T-059.7 ✅ Docs/1-Main-Documentation/Deployment-Modes.md +
  >   CLAUDE.md modules section + DevLog
  > Pending: user verification (boot stack + Playwright smoke),
  > backend unit tests (deferred — testing-backend-specialist),
  > CodeMaps regeneration (4 new src/ modules + new endpoint).
  > See `Docs/3-DevLog/2026-05-24_wave0-finance-opt-in.md`.
- **Goal:** Establish operations-vs-finance boundary as a first-class
  deployment mode. Per-tenant `financeEnabled` flag + runtime capability
  check + structurally separable docker-compose. Without this, every
  subsequent finance wave will accrete coupling that has to be unwound.
- **Design doc:** `Docs/2-Working-Progress/Wave-0-Design.md` (approved
  2026-05-24)
- **Sub-tasks:**
  - T-059.1 Backend: `/api/v1/system/capabilities` endpoint, per-tenant
    `modules.financeEnabled` field on organizations, one-shot migration
    script (default true for existing orgs), outbox writer gate that skips
    event emission when tenant has `financeEnabled=false` (Redis-cached
    org lookup, 60s TTL)
  - T-059.2 Backend: `/system/health` on finance service + Redis-cached
    reachability ping from ops side (1s timeout, 60s cache key
    `system:finance:reachable`)
  - T-059.3 Frontend: `useCapabilities()` hook + route gating + sidebar
    gating + graceful degradation in PR/PO/GR/AP forms (tax codes,
    cost centres become free-text when finance off; amber banner when
    enabled-but-unreachable)
  - T-059.4 Frontend: Tenant Settings → Modules toggle UI; super_admin
    only; audit-logged
  - T-059.5 DevOps: split `docker-compose.finance.yml` (finance +
    finance_consumer + mysql); update nginx confs with conditional
    upstreams returning 503 when finance unavailable
  - T-059.6 CI: new `ops-only-smoke` Playwright job (mongo + redis +
    backend + nginx + user-portal only; full PR→PO→GR→AP smoke); import-
    boundary lint blocking `from services.finance import …` in `src/`
  - T-059.7 Docs: new `Docs/1-Main-Documentation/Deployment-Modes.md` +
    update CLAUDE.md modules section + DevLog entry
- **Acceptance criteria:** see design doc §11
- **Estimated effort:** 4-7 days (backend + frontend in parallel)

---

### T-060 | Wave 2 — Statutory Financial Statements (BS, IS, CF) + Period Close
- **Category:** Backend + Frontend + Docs · **Priority:** P0
- **Assigned:** unclaimed · **Depends on:** T-059 ✅ (Wave 0 — module gate) ·
  **Blocks:** Wave 2.5 (Manual JE UI + Opening Balance Wizard +
  Cutover playbook); Phase E.1 (GR/IR reconciliation report)
- **Goal:** Ship the three statutory financial statements (Balance
  Sheet, Income Statement, Cash Flow) plus the minimum period-close
  machinery they depend on (auto-posted closing JE on fiscal year-end
  close). Maps to Phase 4 of `FINANCE_MODULE_GUIDE.md` and Phase D.5
  of `POSTING_ENGINE_ROADMAP.md`. Reports compute on-demand from the
  GL (same pattern as Trial Balance). No materialisation.
- **Design doc:** `Docs/2-Working-Progress/Wave-2-Design.md`
  (approved 2026-05-24, rev 2)
- **Approver decisions (design doc §12):** "Operational P&L" +
  "Income Statement" naming · closing JE auto-posts with preview
  modal on close · cash-flow seed auto-runs with review banner ·
  parentheses default for negatives · openpyxl for Excel ·
  WeasyPrint for PDF (document Docker footprint) · cost-centre
  filter on all three with BS footnote · Wave 2 scope split from
  Wave 2.5 (Manual JE + Opening Balance + Cutover)
- **Sub-tasks:**
  - T-060.1 Backend (Phase D.5) — Extend `_resolve_fiscal_period_or_raise`
    to refuse postings into closed periods. New endpoints
    `POST /api/v1/finance/periods/{periodId}/close` (validates
    + auto-posts closing JE for fiscal-year-end periods + sets
    `period.status='closed'`, atomically) and
    `POST /periods/{periodId}/reopen` (reverses closing JE via
    existing reversal engine, sets status back to `open`). Audit
    logged via existing finance audit_log.
  - T-060.2 Backend — `gl_accounts.cashFlowCategory` column
    (enum: `cash|working_capital|non_cash_adjustment|investing|financing|none`,
    default `none`) + Alembic migration + idempotent seed defaults
    keyed off code-range prefixes (`110000-*→investing`,
    `121000-*→working_capital`, `126000-*→cash`, `211000-*→financing`,
    etc.) + name-pattern overrides for depreciation/amortisation
    accounts. CoA service reads/writes the new field.
  - T-060.3 Backend — `GET /api/v1/finance/reports/balance-sheet`
    endpoint + `/balance-sheet/drill` + hierarchical walk
    (`parentAccountNumber` + `isHeader`) + `as_of_date` snapshot +
    current-year-P/(L) computation from P&L drawers + balance
    validator (warning when `assets - (liabilities + equity)` >
    0.01 AED).
  - T-060.4 Backend — `GET /reports/income-statement` endpoint +
    drill + DrawerEnum grouping (REVENUE → COST_OF_SALES → OPERATING_COST
    → NON_OPERATING → OTHER_INCOME → TAXATION) + Gross Profit /
    EBIT / Net Income subtotals + comparative-period queries via
    `asyncio.gather` + cost-centre filter using T-057-1a
    `costCenterId` on `journal_entry_lines`.
  - T-060.5 Backend — `GET /reports/cash-flow` endpoint + drill +
    indirect-method computation (net income + non-cash adjustments
    + working-capital deltas + investing + financing) using
    `cashFlowCategory` + cash-validator warning.
  - T-060.6 Backend — `GET /reports/export/{statement}?format=pdf|xlsx`
    streaming download. Excel via `openpyxl`, PDF via WeasyPrint
    (HTML → PDF). Update `services/finance/Dockerfile` with
    Pango/Cairo system deps; document ~100 MB image-size hit in
    DevLog.
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: backend-dev-expert
  - T-060.7 Frontend — `<FinanceReportPage>` shell component:
    period/date picker with quick-picks (MTD/QTD/YTD/last closed),
    comparative-period toggle, cost-centre multi-select filter,
    negative-number toggle (parentheses default), scale toggle,
    export buttons (PDF + Excel), drill-down modal pattern. Used
    by all three statement pages.
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.7.1 Frontend — Follow-up: multi-select cost-centres (real `string[]`
    array, repeated-key serialisation via URLSearchParams), Compare-to dropdown
    (None / Previous period / Same period prior year / Custom — with resolved
    compare dates + `compareMode` discriminator in filters), folder cleanup
    (move from `src/features/finance/` → `src/components/finance/`,
    co-locate `types.ts`).
    **Status:** 🔵 Active · Started: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.8 Frontend — `BalanceSheetPage` (`/finance/balance-sheet`,
    behind `<FinanceGate>`).
    **Status:** ✅ Done · Completed: 2026-05-24 · Assigned: frontend-dev-expert
  - T-060.9 Frontend — `IncomeStatementPage`
    (`/finance/income-statement`, behind `<FinanceGate>`). Sidebar
    rename of existing P&L entry from "P&L Statement" to
    "Operational P&L".
    **Status:** ✅ Done · Completed: 2026-05-25 · Assigned: frontend-dev-expert
  - T-060.10 Frontend — `CashFlowStatementPage`
    (`/finance/cash-flow`, behind `<FinanceGate>`).
  - T-060.11 Frontend (Phase D.5 UI) — Close/Reopen buttons on
    existing `/finance/periods` page with pre-close validation
    modal showing the closing-JE preview. Status badges
    (OPEN/CLOSED/LOCKED).
  - T-060.12 Frontend — Chart-of-Accounts inline edit of
    `cashFlowCategory` (dropdown, super_admin / finance_admin
    only). One-time review banner shown until dismissed.
    Mutation invalidates the cash-flow report TanStack query.
  - T-060.13 Tests — backend unit tests for each computation (BS
    balances, IS Gross/EBIT/Net subtotals, CF reconciles to cash
    delta, drill-down sums match line balances, comparative
    queries, cost-centre filter consistency, closing JE round-trip
    via close/reopen, period-close validation rejection paths).
    Playwright UI smoke for each new page.
  - T-060.14 Docs — `Docs/1-Main-Documentation/Financial-Statements.md`
    (formulas, sign conventions, drill semantics, closing-JE
    behaviour, cost-centre presentation note) + update
    `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` Phase 4
    status + CodeMap manual addenda + DevLog + CHANGELOG bump
    (MINOR — new feature).
- **Acceptance criteria:** see design doc §10. Highlights:
  - BS balances within 0.01 AED tolerance.
  - CF reconciles to actual cash account delta within 0.01 AED.
  - Closing a year-end period auto-posts the closing JE; BS shows
    `312000-002 Current Year P/(L)` = 0 on next render.
  - Reopen reverses the closing JE atomically; audit logged.
  - Posting into a closed period returns the existing HTTP 422.
  - Cost-centre subtotals across all centres + un-tagged bucket
    equals the unfiltered total (within tolerance).
  - All three reports respect `<FinanceGate>` (redirect to
    `/dashboard` when finance off).
  - Each report's `meta.computeMs` < 500 ms on seed tenant with
    100k JE rows.
- **Estimated effort:** 12–18 days (~7 backend, ~5 frontend, ~2
  tests + docs + period-close UI; mostly sequential)

---

### T-058 | Purchasing line enrichment — Wave 1b: service-line accounting
- **Category:** Backend + Frontend · **Priority:** P1
- **Assigned:** unclaimed · **Depends on:** T-057-1a ✅ · **Blocks:** —
- **Goal:** Wave 1b of T-057. Service-line accounting: when `line.itemType ==
  "service"`, bypass GR and post AP as DR Expense / CR AP (no GRNI, no
  inventory account). Type-filter chip on PR/PO line item picker.
- **Required item-mapping field:** `expenseAccountId: Optional[str]` on
  `purchase_item_finance_ext`. Verify present; add via Alembic migration
  if missing. Service items MUST have an expenseAccountId before they can
  be used on a PR line (server-side validation).
- **Document-flow changes:**
  - PO → GR transition: skip service lines from GR creation prompt.
  - PO status: a PO with only service lines auto-transitions to "Received"
    on approval; mixed PO transitions to "Received" once all non-service
    lines are fully received.
  - AP invoice posting handler in `services/finance/src/finance/api/v1/events.py`:
    branch on `line.itemType` — service goes DR Expense, others use the
    existing GRNI-clearing path.
- **Frontend:** PR/PO line item picker offers a type filter (Item / Service /
  All); a `Type` chip on each line shows "Item" or "Service" derived from
  itemType (no user-editable toggle since it's determined by the catalog item).
- **Acceptance criteria:**
  - A service item creates a PR → PO → AP chain (no GR step), and the AP
    invoice posts DR Expense / CR AP (no GRNI involvement, no inventory
    account touched).
  - Mixed PO (service + raw_material lines) handles GR flow correctly for
    non-service lines only.
  - All existing tests still pass; new tests cover service-line accounting flow.

---

## 🔴 Blocked

_No blocked tasks._

