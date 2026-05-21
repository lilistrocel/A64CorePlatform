# DevLog — Finance/Purchasing Phase 1B + Env Issues

**Date:** 2026-05-20
**Session type:** Feature build + smoke test
**Focus area:** Purchasing module Phase 1B (PR + PO + approvals), with significant Docker env troubleshooting
**Status:** Phase 1B code complete, NOT committed; env unstable, smoke test blocked by 502 Bad Gateway
**Author:** Viet Anh (via Claude session)

---

## 1. Session objective

User requested:
1. Smoke test Phase 1B end-to-end via API (PR → submit → approve → PO from PR → submit → approve → send).
2. Drop test artifacts after smoke test.
3. User personally verifies in UI before pushing.
4. Document what was built so far, including the with/without finance comparison, into `Docs/4-Finance-Mod-docs/`.

---

## 2. What was accomplished

### Phase 1B implementation (via backend-dev-expert agent)

**Backend additions** (~22 endpoints, 3 new Mongo collections):
- `document_headers` collection — single header table for PR and PO (and future doc types). Discriminated by `doc_type`. Carries SAP-style `base_doc_id` for doc-to-doc linking.
- `document_lines` collection — single lines table with `line_id`, `base_line_id`, `open_quantity`, `closed_quantity` for partial-receipt tracking.
- `document_counters` collection — atomic counter per `(companyCode, docType, fiscalYear)` triplet. Format `PR-2026-0001`.
- Approval engine in `src/modules/purchasing/services/approval_engine.py`:
  - Queries finance's `/api/v1/finance/master-data/approval-rules/resolve` endpoint when `FINANCE_OUTBOX_ENABLED=true`.
  - Falls back to hardcoded rules when finance is off (PR always; PO over 10k AED; payment always).
- State machines enforce SAP-style transitions per Sheet 08 of `SAP_B1_Dev_Reference_v2.xlsx`.
- Outbox events: `pr_state_changed`, `po_state_changed` on every transition.
- 22 new endpoints under `/api/v1/purchasing/pr/*`, `/po/*`, `/approvals/*`.

**Frontend additions** (7 new pages):
- PurchaseRequestsPage (list with status filter chips)
- PurchaseRequestFormPage (create/edit)
- PurchaseRequestDetailPage (read-only summary + role-based action buttons)
- PurchaseOrdersPage, PurchaseOrderFormPage (with "from PR" pre-fill), PurchaseOrderDetailPage
- ApprovalInboxPage (Pending + History tabs)
- Sidebar group updated with 3 new children.

**Contracts**:
- 2 new event types in `contracts/finance_events.py`: `PurchaseRequestStateChangedPayload`, `PurchaseOrderStateChangedPayload`. Registered in `EVENT_TYPE_REGISTRY`.

### Finance Module Guide created

New doc at `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` covering:
- Architecture overview
- Option D split (operational docs in main, financial docs in finance)
- "Finance ext" tables pattern
- Side-by-side with/without finance comparison (all features, all user actions)
- Roles introduced
- Current build state (Week 1 + Week 3 + Phase 1A + Phase 1B)
- Phasing plan (Phase 2-4 outlined)
- Activation flow (greenfield + upgrade + disable)
- Configuration knobs
- Operational notes (numbering, periods, currency, tax)
- Known open issues / risks

This is meant to be a living document, updated as we go.

---

## 3. Bugs/issues discovered

### Severity HIGH — Local docker environment broken (502 Bad Gateway)

**Status:** Unresolved. Blocks smoke test. Code is fine; environment is not.

**Symptom:** After multiple `docker compose up`/`force-recreate`/`restart` operations, `esgagro-api-1` cannot resolve hostname `mongodb`:
```
ServerSelectionTimeoutError: mongodb:27017: [Errno -3] Temporary failure in name resolution
```
Nginx returns 502 for all API requests.

**Root cause suspected:**
1. During Phase 1A smoke testing, an accidental `a64coreplatform` Compose project was created (one `docker compose` command lacked `-p esgagro`). This briefly had a second `mongodb` container with the same DNS alias on a different Docker network, confusing Docker's embedded DNS.
2. Multiple `docker compose up --force-recreate api` operations during debugging may have left the api container with a stale resolver cache or attached to a network without proper DNS propagation.
3. The mongodb container was force-recreated when `MONGO_ROOT_USERNAME`/`PASSWORD` were added to `.env` — the new mongo IP may not have been picked up by api.

**Mitigations to try (user's call):**
1. Soft: `docker network disconnect esgagro_a64core-network esgagro-api-1 && docker network connect esgagro_a64core-network esgagro-api-1` then restart api.
2. Force-recreate api with NO other compose commands running side by side.
3. Stop esgagro project entirely, `docker network prune`, `up -d` again. Volumes survive.
4. Last resort: `sudo systemctl restart docker`.

**Lessons learned for future sessions:**
- Always pass `-p esgagro` on every Compose command. The default project name (directory-derived `a64coreplatform`) caused the rogue project incident.
- Don't aggressively force-recreate during debugging. One careful restart is better than three rapid ones.
- Pin network names explicitly in `docker-compose.finance.yml` rather than letting Compose derive them.
- User explicitly directed: "don't break the env again" — be more conservative with container operations.

### Severity MEDIUM — Smoke test not completed

Phase 1B has business-logic-level Python verification (state machine transitions, line total computation, event registry) but **no end-to-end API smoke test was completed** due to the env issue above.

**Once env is restored, smoke test flow:**
1. Login as admin → POST a PR with 3 lines via curl.
2. PR creates with status=Draft; line totals computed.
3. POST /pr/{id}/submit → approval engine queries finance → PR → Pending Approval.
4. POST /pr/{id}/approve as admin → status=Approved.
5. POST /po/from-pr/{prId} → PO created with lines copied + baseLineId.
6. POST /po/{poId}/submit (total < 10000) → status=Open.
7. POST /po/{poId}/submit (total > 10000) → status=Pending Approval, then /approve → Open.
8. POST /po/{poId}/send → Sent.
9. PR.status auto-set to Closed.
10. Verify outbox events processed by finance consumer.
11. Verify UI navigation: /purchasing/pr → list, click → detail, etc.

### Severity LOW — Tax handling simplified in Phase 1B

Phase 1B uses hardcoded 5% VAT when `taxCode` is present, 0% otherwise. No lookup of `tax_codes` table from main app. Acceptable for Phase 1B; needs proper master data lookup in Phase 2.

### Severity LOW — httpx may not be in main app deps

The approval engine calls finance via httpx in main app. If the package isn't installed in `esgagro-api-1`, the call fails and the engine falls back to hardcoded rules with a logged warning (caught in try/except). Should verify and add to requirements.

---

## 4. What we need to do next

In priority order:

### Immediate (before next commit)

1. **Restore docker env** — user to choose mitigation path (soft → nuclear).
2. **Run the smoke test** outlined in §3 above. Once green:
3. **Drop test artifacts**: `db.vendors.deleteMany({}); db.purchase_items.deleteMany({}); db.document_headers.deleteMany({}); db.document_lines.deleteMany({}); db.document_counters.deleteMany({}); db.finance_outbox.deleteMany({});` plus the finance ext tables.
4. **User verifies in browser**: login → Purchasing → click through pages → create vendor → create item → raise a PR → submit → approve via inbox → create PO from PR → send PO.
5. **Commit Phase 1B** selectively (exclude Adrian's AI Assistant files which remain uncommitted in working tree).
6. **Push to origin**.

### Phase 2 — Goods Receipt + Goods Issue + inventory cost (next delegation)

Once Phase 1B is committed:
- Add GRPO doc with PO linking, partial receipt support
- Add Goods Issue doc (operations consumes inventory)
- Add `inventory_movements_finance` shadow table in MySQL
- Moving average cost engine
- Outbox handlers for inventory cost postings
- Period-end snapshot table
- Reconciliation cron

### Phase 3 — AP Invoice + Payment + Credit Note

- AP Invoice (manual entry or from GRPO event)
- Outgoing Payment with bank account selection
- AP Credit Note + Vendor Refund
- GRNI clearing logic
- AP sub-ledger maintenance

### Phase 4 — Reports + cutover

- Five MVP reports (Trial Balance, P&L, BS, AP Aging, GRNI Clearing)
- Period close ceremony
- Opening balance entry wizard
- Cutover playbook
- Resync script for existing customers upgrading

---

## 5. Important context for next session

### Code state

- **Phase 1A committed and pushed** (`1fd857a` on `main`).
- **Phase 1B implementation complete in working tree** — NOT committed. Files listed in §6 below.
- **Adrian's AI Assistant work** (T-008) is also uncommitted in the working tree. We've been carefully excluding his files from our commits. He'll commit separately.

### Env state

- `esgagro` Compose project running (10 containers including finance + consumer + mysql).
- `a64-finance` and `a64-finance-consumer` healthy.
- `a64-mysql` healthy.
- **`esgagro-api-1` UNHEALTHY** — cannot resolve `mongodb` hostname. This is the blocker.
- `esgagro-nginx-1` healthy but returns 502 (because api is unreachable).
- All rogue `a64coreplatform-*` containers have been killed.

### Key files for next session

**Phase 1B working tree (NOT committed)**:
- `contracts/finance_events.py` (extended — 2 new event types)
- `src/modules/purchasing/models/document.py` (new — Pydantic schemas)
- `src/modules/purchasing/services/approval_engine.py` (new)
- `src/modules/purchasing/services/document_service.py` (new)
- `src/modules/purchasing/api/v1/purchase_requests.py` (new — 9 endpoints)
- `src/modules/purchasing/api/v1/purchase_orders.py` (new — 11 endpoints)
- `src/modules/purchasing/api/v1/approvals.py` (new — 2 endpoints)
- `src/modules/purchasing/api/v1/__init__.py` (modified)
- `frontend/user-portal/src/pages/purchasing/PurchaseRequestsPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/PurchaseRequestFormPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/PurchaseRequestDetailPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/PurchaseOrdersPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/PurchaseOrderFormPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/PurchaseOrderDetailPage.tsx` (new)
- `frontend/user-portal/src/pages/purchasing/ApprovalInboxPage.tsx` (new)
- `frontend/user-portal/src/services/purchasingApi.ts` (extended)
- `frontend/user-portal/src/hooks/queries/usePurchasing.ts` (extended)
- `frontend/user-portal/src/components/layout/MainLayout.tsx` (modified — Purchasing children expanded)
- `frontend/user-portal/src/App.tsx` (modified — 10 new routes)
- `Docs/Backlog/BACKLOG.md` (T-019 added then removed)
- `Docs/Backlog/ARCHIVE.md` (T-019 entry)

**Adrian's work (also in working tree, NOT to be touched)**:
- `src/api/routes.py` (AI assistant route)
- `src/config/settings.py` (Anthropic keys)
- `src/modules/ai_analytics/services/gemini_service.py` (his fix)
- `src/modules/ai_assistant/` (entire new module)
- `frontend/user-portal/src/components/ai-assistant/`
- `frontend/user-portal/src/services/aiAssistantApi.ts`
- `frontend/user-portal/src/stores/aiAssistant.store.ts`
- `frontend/user-portal/src/hooks/queries/useAIAssistant.ts`
- `tests/unit/test_ai_assistant/`

### Testing credentials

- Admin: `admin@a64platform.com` / `SuperAdmin123!`
- Organization ID: `00000000-0000-0000-0000-000000000001`
- Default test company code: `1000` (Test Farm Co)

### Compose command (preferred)

```
SECRET_KEY=esgagro-secret-key-change-me-in-real-production-abc123 \
FINANCE_OUTBOX_ENABLED=true \
FINANCE_PORT=8002 \
docker compose -p esgagro \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.finance.yml \
  --profile finance up -d
```

**Always** include `-p esgagro`. Never omit.

---

## 6. Files modified this session

| File | Type | Status | Notes |
|------|------|--------|-------|
| `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` | New | Created this session | Main usage guide |
| `Docs/3-DevLog/2026-05-20_finance-purchasing-phase-1b-and-env-issues.md` | New | This file | Session journal |
| `contracts/finance_events.py` | Modified | Not committed | 2 new event types |
| `src/modules/purchasing/services/approval_engine.py` | New | Not committed | Approval routing |
| `src/modules/purchasing/services/document_service.py` | New | Not committed | PR/PO CRUD + state machine |
| `src/modules/purchasing/models/document.py` | New | Not committed | Pydantic models |
| `src/modules/purchasing/api/v1/purchase_requests.py` | New | Not committed | 9 endpoints |
| `src/modules/purchasing/api/v1/purchase_orders.py` | New | Not committed | 11 endpoints |
| `src/modules/purchasing/api/v1/approvals.py` | New | Not committed | 2 endpoints |
| `src/modules/purchasing/api/v1/__init__.py` | Modified | Not committed | Router wiring |
| `frontend/user-portal/src/pages/purchasing/` | 7 new files | Not committed | UI pages |
| `frontend/user-portal/src/services/purchasingApi.ts` | Modified | Not committed | New endpoint wrappers |
| `frontend/user-portal/src/hooks/queries/usePurchasing.ts` | Modified | Not committed | New TanStack hooks |
| `frontend/user-portal/src/components/layout/MainLayout.tsx` | Modified | Not committed | Sidebar updates |
| `frontend/user-portal/src/App.tsx` | Modified | Not committed | 10 new routes |
| `Docs/Backlog/BACKLOG.md` | Modified | Not committed | T-019 added/removed |
| `Docs/Backlog/ARCHIVE.md` | Modified | Not committed | T-019 entry |

---

## 7. Session metrics

- **Time breakdown**: ~30% Phase 1B agent delegation, ~50% env debugging (regrettable), ~20% documentation.
- **Lines written**: ~3000 (Phase 1B agent) + ~700 (documentation in this session).
- **Tools used**: Agent (backend-dev-expert), Bash, Edit, Write, Read.
- **Key achievements**:
  - Phase 1B PR + PO + approvals delivered as code.
  - Finance Module Guide written (will be updated as we go).
- **Key regret**:
  - Env destabilization from compose chaos. User explicitly asked "don't break the env again". Honest acknowledgment captured in §3.

---

## 8. Questions for user (for next session)

1. Which env recovery path do you want to try? (Soft network reconnect / force-recreate api / network prune+restart / daemon restart)
2. Should we add a Phase 4 task for the **resync script** earlier, given it's needed for any real customer upgrade?
3. The Finance Module Guide includes an "Operational notes" section — anything specific you want added there about your real customer profile (UAE-specific concerns, IFRS compliance posture, etc.)?
