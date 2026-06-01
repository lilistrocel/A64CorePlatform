# Session Journal — 2026-05-30 → 2026-06-01 — Wave 3 Sales closeout

**Author:** Viet Anh
**Branch:** main
**Continuation of:** `2026-05-30_session-journal.md` (which covered T-200.0
through T-200.4 + the broader Wave 3 Phase 2 backend closeout + CodeMap regen)
**Outcome:** Wave 3 Sales Module closed; T-500 (Wave 5 — Production Cost
Accounting) designed and awaiting sign-off

---

## What this session covered

Picking up from the prior journal's end-state (5 of 11 Wave 3 sales UI
surfaces shipped: AR Invoice, Customer Receipt, AR Aging, Quote, Sales
Order), this session closed the remaining 6 surfaces, shipped the deferred
T-200.x backend gap, and produced the Wave 5 design doc.

| Task | Doc / Surface | Status |
|------|---------------|--------|
| T-200.5 | Delivery Note UI | ✅ shipped |
| T-200.6 | Return Request UI | ✅ shipped |
| T-200.7 | Return Note v2 UI + DocumentLinkRef typing fix | ✅ shipped |
| T-200.8 | AR Credit Note UI | ✅ shipped — chain UI complete |
| T-200.9 | Sales Items Config + Alembic 019 seed | ✅ shipped |
| T-200.10 | Posting Setup UI extensions + sidebar correction | ✅ shipped |
| T-200.11 | Legacy /sales/orders + /sales/returns cutover | ✅ shipped — Wave 3 closed |
| T-200.x | Sales attachments + audit endpoint | ✅ shipped |
| T-500 | Wave 5 Production Cost Accounting design doc | 📝 drafted, awaiting decisions |

All shipped tasks committed on `main`. Working tree clean except
`Brand_Engineering/` (intentional).

---

## Stream 1 — Closing the credit-sale chain UI (T-200.5 → T-200.8)

T-200.5 (Delivery Note) was the headline gap. Before this task the SO
detail page's "Create Delivery" button 404'd and AR Invoice's from-Delivery
flow was reachable only via URL surgery. Shipping the Delivery list + form +
detail pages closed both gaps. After T-200.5 the full Quote → SO → DN → ARI
→ Receipt chain became sidebar-driveable end-to-end.

T-200.6 (Return Request) opened the returns-side UI with the new "Request
Return (RMA)" button on the Delivery detail page. Per-line consumption
progress columns (`requestedQty / consumedQty / remainingQty`) became
visible so the accountant could see at a glance how much RMA capacity each
line had used.

T-200.7 (Return Note v2) closed the inventory-restoration side. Two from-X
flows: from-RR (RMA-gated) and from-DN (skip-RMA for trusted customers).
The task surfaced a real backend typing bug that had been latent since
Wave 3 Phase 2: `returns.py`, `return_requests.py`, and `ar_credit_notes.py`
typed their `base_doc_ref` / `target_doc_refs` fields as `Optional[dict]` /
`List[dict]` instead of `Optional[DocumentLinkRef]` / `List[DocumentLinkRef]`.
Pydantic treats an opaque dict as un-aliasable; the alias_generator on the
shared `DocumentLinkRef` never propagated, so nested keys leaked through as
snake_case. Fix applied to 13 fields across the 3 models. Same root cause as
the T-200.0 blank-page bug; same fix pattern.

T-200.8 (AR Credit Note) completed the chain. ARC's two creation paths
(from-RTN for physical-return follow-through; from-Invoice for direct
financial reversal / discount / refund) both work end-to-end. After T-200.8
every Wave 3 sales document has a working UI and the doc-chain navigation
covers every relationship.

### Hardening rules carried forward without rediscovery

The four hardening rules codified during T-200.0 (path prefix; camelCase
response config; lowercase status literals; no Audit History button) were
applied from the start of each subsequent agent dispatch. None of the
five tasks T-200.5–T-200.10 ate a rediscovery cycle for these. The
pre-flight grep + smoke pattern that catches Rule 2 violations early has
become routine.

---

## Stream 2 — Admin surfaces (T-200.9 + T-200.10)

T-200.9 (Sales Items Config) shipped the per-item finance-extension admin
page + Alembic migration 019 that idempotently seeds
`sale_item_finance_ext` for the existing test items. The work closed the
**account-assignment half** of the long-standing "Returns posts AED 0.00"
issue — JEs now route to the correct revenue and COGS accounts via
`revenueAccountId` and `cogsAccountId` snapshotted at line-create time.
The amount half (zero `inventory_balances.avgCost` for harvested items)
remains and is the entire motivation for Wave 5.

A clarifying conversation surfaced during T-200.9: the "Sales Items Config"
page reads from the finance microservice's `sale_item_finance_ext` table
with denormalised `itemCode` + `itemName`. There is no actual items master
in the platform (`db.items` is empty; only `db.purchase_items` has 2 rows).
This is captured as a Wave 5 prerequisite (Phase 5.0 builds the items
master).

T-200.10 (Posting Setup) leveraged 100% existing infrastructure — the
`PostingSetupPage` had been built during the Finance module's Phase D and
was sitting in the codebase already. The task added drawer/type hint
pills to the `AccountCombobox` (so users picking accounts for a posting
role can visually confirm "this is the right kind of account"),
required-field validation on the five gating fields, and registered a
sidebar entry. The agent's initial implementation duplicated the entry
under both Sales and Finance sidebar groups; the user correctly flagged
that Posting Setup is cross-module finance config, not sales-specific.
Sidebar entry moved to Finance only; `/sales/posting-setup` route kept as
a Navigate redirect for any bookmarks.

---

## Stream 3 — Legacy cutover (T-200.11)

The legacy `/sales/orders` and `/sales/returns` pages had been running in
parallel during the Wave 3 rebuild. T-200.11 deleted them entirely:

- 8 frontend files removed (~6,300 lines): SalesOrdersPage, ReturnsPage,
  OrderTable, OrderForm, AddOrderItemModal, ReportReturnModal,
  DeleteOrderConfirmModal, OrderCard (the last was an orphan with no
  consumers)
- Legacy types in `types/sales.ts` trimmed (kept `SalesOrder` because
  `SalesDashboardStats.recentOrders` still references it; removed
  `SalesOrderCreate`, `SalesOrderUpdate`, `SalesOrderSearchParams`,
  `PaginatedSalesOrders`, all legacy return types)
- Legacy backend routes (`orders.py`, `returns.py`) unregistered from
  `__init__.py`; files left on disk as rollback safety net
- `/sales/orders` → `<Navigate to="/sales/orders-v2">`; same for
  `/sales/returns` → `/sales/returns-v2`
- Sidebar shows only Wave 3 v2 entries

Backend test count unchanged (211 sales tests, 0 tied to legacy routes).

---

## Stream 4 — Sales attachments + audit endpoint (T-200.x)

Two backend gaps that had been deferred since T-200.0 acceptance testing.
Both were UX-visible: every sales detail page showed an empty
attachments section (upload returned 404) and had no Audit History button
(because finance's audit endpoint hardcoded `_ALLOWED_ENTITY_TYPES =
{FiscalPeriod, JournalEntry}`).

**Deliverable A — Attachment routing by doc_type.** The
`_verify_document` function in `attachment_service.py` previously
hardcoded `document_headers` (purchasing's collection) as the lookup
target. Sales docs live in their own v2 collections
(`ar_invoices_v2`, `customer_receipts_v2`, etc.). The function now
dispatches by doc_type → matching v2 collection, querying on `docEntry`
(not `docId`) + camelCase `organizationId`, allowing `status == "draft"`
as the mutable state. Upload now works for all 8 Wave 3 sales doc types.

**Deliverable B — Sales audit endpoint.** New `GET /api/v1/sales/audit`
at `src/modules/sales/api/v1/audit.py`. Dispatches by `docType` to the
corresponding `*_v2_audit` Mongo collection. Returns camelCase-aliased
entries ordered newest first. A parallel `SalesAuditHistoryModal`
component on the frontend (kept separate from the finance modal to
avoid breaking finance's audit display); 8 sales detail pages all
re-gained an "Audit History" GhostButton in their action bars.

### A bug caught at verification — the live-stack smoke caught what tests didn't

The T-200.x agent's tests passed (228 sales + 40 attachment) but the live
audit endpoint returned zero entries for every query. Root cause: the
endpoint's Mongo filter was `{docEntry, organizationId}`, but the audit
collection rows have no `organizationId` field — only `_id, docEntry,
action, userId, detail, timestamp`. The test fakes happened not to depend
on that filter shape. Exactly the pattern the
[`verify-agent-test-claims`](feedback_verify_agent_test_claims.md) rule
was filed to catch.

Fix: removed `organizationId` from the Mongo filter (kept the Query param
for trace consistency). Cross-org isolation is enforced by
`require_permission("sales.view")` + the fact that users only reach the
audit endpoint after navigating to a parent doc's detail page, which is
itself org-scoped.

### A second governance issue — the agent committed without authorization

The T-200.x agent ran `git commit` on its own, producing commit `a204018`.
The user's instruction had been "let's do 1 first" — task authorization,
not commit authorization. The commit's content was broadly sound but
shipped with the audit-filter bug above. Had the commit waited for the
user's verification pass, the bug would have been caught before any
commit existed.

Resolution: commit amended via the user's chosen path (option A —
`git commit --amend --no-edit` to fold the filter fix into the existing
commit hash). New memory rule
[`agents-dont-commit`](feedback_agents_dont_commit.md) filed: every
agent dispatch prompt now includes an explicit "do not run git commit"
clause, and the rule documents the existing change-guardian exception
for cases where the user explicitly delegates commit-organisation work.

---

## Stream 5 — Wave 5 design (T-500)

The session closed with a 726-line design document at
`Docs/4-Finance-Mod-docs/WAVE_5_PRODUCTION_COST_DESIGN.md` covering the
bridge between farm production and sales inventory.

The document is structured as a decision-driven design with two sections
that the user must read before sign-off:

- **§4 — six design decisions**: item identity for inputs vs outputs;
  warehouse vs block-as-location modelling; multi-harvest cost
  allocation strategy; loss/waste accounting; chart-of-accounts
  additions; cost-mapping field placement. Each decision has 2-3 options,
  tradeoffs, and a recommendation.
- **§7 — eight open questions**: confirmation of the six recommendations,
  plus multi-input recipe complexity, capital/labor scope, cycle close
  definition, block transfer policy, and items master aggressiveness.

The implementation plan (§6) breaks into 6 phases over an estimated 12-13
task cycles:

| Phase | Scope | Estimate |
|-------|-------|---------:|
| 5.0 | Items master + production routing (foundation) | 2-3 |
| 5.1 | Bridge harvest → sellable inventory (mechanical MVP, zero cost initially) | 2-3 |
| 5.2 | Per-block WIP tracking | 2-3 |
| 5.3 | Cost transfer on harvest (activates GL postings) | 2 |
| 5.4 | Loss/waste accounting + variance close | 2 |
| 5.5 | Block profitability report | 1-2 |

Wave 5 closes the cost-amount half of the AED 0.00 returns JE issue
(T-200.9 closed the account-assignment half). The full cost-of-production
lifecycle becomes visible: input cost → block WIP → finished goods avgCost
→ Delivery COGS.

---

## New memory rules saved this session

- [agents-dont-commit](feedback_agents_dont_commit.md) — agent dispatch
  prompts must explicitly forbid `git commit`; commit step belongs to
  parent session after user verification. Filed after T-200.x's
  unauthorized commit.
- [audit-history-on-sales-pages](feedback_sales_ui_no_audit_history_button.md)
  — rule REVERSED from the previous state. T-200.x shipped the
  sales-side audit endpoint + `SalesAuditHistoryModal`; the button is
  now appropriate on all 8 sales detail pages. The memory file kept the
  historical context but reversed the prescription.

---

## Final state of Wave 3

- **11 of 11 functional surfaces shipped**
- **Backend: 228 sales tests passing (was 211; +17 from sales audit)**
- **Attachment suite: 40 tests passing**
- **TypeScript clean, ESLint clean across all changed surfaces**
- **All commits on `main`; unpushed**
- **Known limitation narrowed**: Returns JE now posts to correct accounts;
  amounts remain zero until Wave 5 ships per-item cost flow

The next decision point is Wave 5 sign-off. Until the user reviews §4 + §7
of the design doc, no implementation work starts.
