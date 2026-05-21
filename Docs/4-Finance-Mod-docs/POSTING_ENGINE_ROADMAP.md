# Posting Engine Roadmap — PR-to-Payment Cycle

> **Status:** Active plan. Phase A in progress.
> **Date:** 2026-05-20.
> **Author:** Viet Anh.
> **Scope:** The work needed to close the cycle from a Purchase Request all the way to a posted Journal Entry that debits and credits real accounts. UAE single-currency v1.

This document is the master reference for the posting-engine build. It defines the standard procure-to-pay (P2P) accounting flow we are implementing, the current gap between what we have and that target, the phased build plan, and the explicit list of deferred features.

Update this doc whenever scope, sequence, or design decisions change.

---

## 1. Purpose

The platform today can issue PRs, POs, and approval flows on the operation side. The finance service holds master data and processes a few master-data sync events. **No transactional accounting is happening.** Goods receipts, vendor invoices, payments, and journal entries do not exist as features.

This plan closes that gap. Output: a working v1 P2P cycle where a PR can be raised, approved, converted to a PO, received as goods, invoiced by the vendor, and paid — with each accounting-relevant event producing a real journal entry against the chart of accounts.

---

## 2. Standard P2P flow (plain language)

For someone not versed in accounting. Concrete example: farm buys 10 bags of fertilizer at AED 100/bag plus 5% VAT.

### Stages and accounting impact

| Stage | What it is | JE produced? |
|---|---|---|
| **PR** | Internal "may I buy this" document | No |
| **PO** | External order sent to vendor | No (accrual accounting) |
| **GR** | Warehouse confirms physical delivery | **Yes — first JE** |
| **AP Invoice** | Vendor's bill, three-way matched | **Yes — second JE** |
| **Payment** | Cash leaves the bank | **Yes — third JE** |
| **Period close** | Lock the books for the month | No (state change) |

### JE shapes

**At Goods Receipt** — we have the goods but not yet a formal vendor bill:

```
DR  Inventory                 1,000.00     (asset goes up)
CR    GR/IR Clearing                  1,000.00   (temporary liability — "we owe somebody")
```

**At AP Invoice** — clear the temporary holding, recognize specific vendor debt + reclaimable VAT:

```
DR  GR/IR Clearing            1,000.00     (clear the GR holding)
DR  Input VAT                    50.00     (asset — claim back from tax authority)
CR    AP - Vendor X                       1,050.00   (specific vendor, specific amount)
```

**At Payment** — money leaves, debt cleared:

```
DR  AP - Vendor X             1,050.00     (we no longer owe them)
CR    Bank                                  1,050.00   (cash went out)
```

Three journal entries total. This is the standard pattern in every audit-grade ERP (SAP, Oracle, NetSuite, Xero, QuickBooks).

### Edge cases worth knowing

| Scenario | Handling | In our v1? |
|---|---|---|
| Partial delivery (8 of 10 bags) | GR posts for 8; PO line stays partially open | Yes — `openQuantity` already in PO line |
| Price variance (PO says 100, invoice says 105) | Post the 5 difference to a "Purchase Price Variance" GL account | Yes — Phase C |
| Quantity variance (invoice ≠ GR) | Three-way match triggers approval / hold | Yes — Phase C |
| Vendor return / credit memo | Reversal JE adjusting AP and Inventory | Defer to v2 |
| Foreign currency | Track FX gain/loss between invoice and payment | Defer — AED only in v1 |
| Withholding tax | UAE doesn't apply for goods | Defer |
| **VAT reverse charge** (cross-border imports) | Buyer accrues VAT as both input AND output | Yes — handled at tax_code level |
| Advance / prepayment | Vendor Advances asset cleared at GR | Defer |
| Recurring invoices | Posted on schedule, no PR/PO | Defer |
| Cash purchase (skip AP) | Direct Inventory + Bank entry | Defer |
| GR/IR reconciliation report | Month-end check that clearing account zeros out | Yes — Phase E |

---

## 3. Current state vs target

### What we have

| Component | Status |
|---|---|
| Operation: PR + PO modules with approvals | ✅ |
| Outbox + transactional outbox + sweeper | ✅ |
| Single-node replica set Mongo | ✅ |
| Finance service: master data (CoA, periods, tax codes, vendors, items, payment terms, companies) | ✅ |
| Finance service: approval rules | ✅ |
| Cross-service consumer with idempotency | ✅ (bug fixed today for datetime serialization) |
| Finance UI: CoA, Approval Rules, Incoming Preview, P&L (existing) | ✅ |
| Consumer handlers for `vendor_changed`, `purchase_item_changed`, `payment_terms_changed` | ✅ |

### What we are missing

| Component | Status |
|---|---|
| Consumer handlers for the other 13 event types (all no-op stubs today) | ❌ |
| Goods Receipt module (operation) | ❌ |
| AP Invoice module (operation) | ❌ |
| Payment module (finance) | ❌ |
| `journal_entries` + `journal_entry_lines` MySQL tables | ❌ |
| Posting Setup config (which GL accounts to use for AP control, Bank, GR/IR Clearing, Input VAT, Output VAT, Retained Earnings, Price Variance, etc.) | ❌ |
| Item → GL account mapping (which Inventory account to debit per item-type) | ❌ |
| Three-way match logic (PO + GR + Invoice agreement check) | ❌ |
| JE list/detail UI | ❌ |
| GR/IR reconciliation report | ❌ |
| Period close UI | ❌ (data model exists) |

---

## 4. Phased build plan

Five phases, A through E. Each phase ends with something demonstrable. Inside each phase, items are listed in dependency order.

### Phase A — Foundation (current scope)

Cannot post any JEs until these exist.

| # | Item | Side | Effort |
|---|---|---|---|
| A.1 | `journal_entries` + `journal_entry_lines` tables (migration, ORM, Pydantic schemas, basic read-only API to fetch them) | Finance backend | ✅ shipped 2026-05-20 |
| A.2 | `company_posting_setup` table (one row per company, ~10 columns for default GL account assignments) + GET/PUT endpoints | Finance backend | ✅ shipped 2026-05-20 |
| A.3 | Posting Setup UI page (`/finance/posting-setup`): dropdowns choosing CoA accounts for each default field | Frontend | ✅ shipped 2026-05-20 |
| A.4 | Item → GL account mapping: extend `purchase_item_finance_ext` with `inventoryAccountId` field + UI to set it on each item | Backend + Frontend | ✅ shipped 2026-05-20 |

### Phase B — Goods Receipt and the first JE

Produces the first observable debit/credit. **Shipped 2026-05-20.**

| # | Item | Side | Status |
|---|---|---|---|
| B.1 | Goods Receipt module: new document type `GR` with state machine Draft → Posted (no approval step in v1). Created from an Open PO. Captures received quantity per PO line + warehouse + batch info. | Operation | ✅ |
| B.2 | Emits `purchase_received` outbox event with all data needed for JE | Operation | ✅ |
| B.3 | `_handle_purchase_received` handler: looks up item account mapping + posting setup, builds JE with DR Inventory / CR GR/IR Clearing, writes to `journal_entries` | Finance backend | ✅ |
| B.4 | JE list / detail UI (`/finance/journal-entries`): table + row-expand to see lines | Frontend | ✅ |

### Phase C — AP Invoice and three-way match

| # | Item | Side | Status |
|---|---|---|---|
| C.1 | AP Invoice module: new document type, vendor enters invoice (or finance enters on behalf), matches to PO + GR | Operation | ✅ shipped 2026-05-20 |
| C.2 | Three-way match logic: compare PO line × GR quantity × Invoice quantity & price. Variance → approval. | Operation | ✅ shipped 2026-05-20 (priceVarianceAmount per line, totalPriceVariance on header) |
| C.3 | Approval flow integration (already wired — approval_rules table has `AP_INVOICE` doc type) | Operation | ✅ shipped 2026-05-20 |
| C.4 | Emits `ap_invoice_posted` event when approved | Operation | ✅ shipped 2026-05-20 |
| C.5 | `_handle_ap_invoice_posted` handler: JE = DR GR/IR Clearing + DR Input VAT + DR Price Variance (if any) / CR AP-Vendor | Finance backend | ✅ shipped 2026-05-20 |
| C.6 | UI affordance for AP Invoice creation (probably operation-side rather than finance-side, to be decided) | Frontend | Medium |

### Phase D — Payment

| # | Item | Side | Effort |
|---|---|---|---|
| D.1 | Payment module: finance picks open AP, records payment (amount, bank account, date) | Finance backend + Frontend | ✅ shipped 2026-05-20 (backend) |
| D.2 | No outbox event — payment is finance-internal | N/A | ✅ (by design — no event emitted) |
| D.3 | JE = DR AP / CR Bank, created atomically in POST /ap-payments | Finance backend | ✅ shipped 2026-05-20 |
| D.4 | AP aging view + outstanding payables list UI | Frontend | T-049 ready |

### Phase D.5 — Period close + audit lock

Promoted from Phase E.2 per PM feedback (item 6). Audit lock should be enforceable from the start, not deferred.

| # | Item | Side | Effort |
|---|---|---|---|
| D.5.1 | Period close UI + backend enforcement: `_resolve_fiscal_period_or_raise` refuses postings to closed periods | Finance backend + Frontend | Small |

### Phase E — Polish and operability

| # | Item | Side | Effort |
|---|---|---|---|
| E.1 | GR/IR reconciliation report: stuck transactions, unmatched GRs and invoices | Finance backend + Frontend | Medium |
| E.2 | Audit log surfaces (who posted what when) | Frontend | Small |
| E.3 | Direct Labour EOSB account: add `512000-006 Direct Labour - EOSB` under COGS so production EOSB flows to inventory not OpEx (PM item 9, IAS 2) | Backend (seed) | Tiny |
| E.4 | Biological Assets P&L lines: `812000-001 Gain on Biological Assets - Fair Value` and `514000-005 Loss on Biological Assets - Fair Value` + a remeasurement event handler (PM item 8, IAS 41) | Backend + Frontend | Medium |
| E.5 | Replace remaining native `<select>` controls with searchable comboboxes so they always open from the top (PM item 13) | Frontend | Small |

### PM feedback critical fixes (shipped 2026-05-20)

After Phase C smoke testing, the project manager raised a list of accounting / compliance issues with the mock system. Six critical items were closed in-session. The remaining items are tracked under their respective future phases.

| # | Issue | Status |
|---|---|---|
| 1 | GR/IR account was misclassified as Trade Payable | ✅ Reclassified. New `223000-004 Goods Received Not Invoiced` under `223000 Accruals & Deferred Income`. Old `221000-002` deactivated; historical JEs unaffected. Posting Setup migrated. |
| 4 | No JE reversal mechanism (auditors require offsetting JE, not edit) | ✅ `POST /api/v1/finance/journal-entries/{jeId}/reverse` endpoint + UI button. Original status flips to `void`; new JE created with debits/credits swapped, `sourceDocId` pointing back. Reason required, 5-500 chars. finance_admin / admin / super_admin only. |
| 5 | No Trial Balance report | ✅ New `/finance/trial-balance` page + `/api/v1/finance/reports/trial-balance` endpoint. Aggregates JE lines by account, validates total DR == total CR. |
| 10 | Rounding Differences account missing from seed | ✅ Added `617000-011 Rounding Differences` to seed + dev DB. |
| 11 | Per-item valuation method violates IAS 2 consistency | ✅ Removed from Item Mapping page. New "Inventory Valuation" section on Posting Setup. Field moved from `purchase_item_finance_ext` to `company_posting_setup.defaultValuationMethod`. |
| 12 | Purchase Price Variance account missing from seed | ✅ Added `514000-004 Purchase Price Variance` to seed. |

Carried into later phases:

| # | Issue | Scheduled |
|---|---|---|
| 2 | Input VAT tax point doesn't follow UAE Article 25 (earliest of supply / invoice / payment date) | Phase D |
| 3 | No reverse-charge VAT mechanism (mandatory for UAE imports of services) | Phase D |
| 6 | Period close + audit lock deferred too late | **Promoted to Phase D.5** (was E.2) |
| 7 | No multi-company UI | Tracked, no phase yet |
| 8 | No Biological Assets fair-value remeasurement line (IAS 41) | Phase E |
| 9 | Direct Labour EOSB in OpEx instead of COGS (IAS 2) | Phase E |
| 13 | Native dropdown jumps to selected position on reopen | Phase E (general UX cleanup) |

### Controls debt — review before production

The following dev-conveniences relax controls that real accounting policy normally enforces. Review and decide before customer rollout:

| Item | Status | Production decision |
|---|---|---|
| `admin` / `super_admin` can approve any document's role gate | Live | Acceptable — admin is a privileged role by definition. Keep. |
| `admin` / `super_admin` can approve documents they themselves requested/issued (self-approval) | Live as of 2026-05-20 — testing-only convenience | **Must decide.** Either gate behind a feature flag that defaults off in prod, OR remove and document that admins must not be the requesters in real workflows. SoD is non-negotiable for auditor-tested compliance (SOX, IFRS, internal-audit). |
| Posted GR cannot be reversed | Live | Acceptable for v1 — reversal flow comes in Phase B+. Workaround in the meantime: manual journal adjustment. |
| Per-doc-type tax code is not validated server-side against tax_codes table | Live — frontend dropdown is the only enforcement | Add server-side validation in Phase C when AP Invoice handler reads tax codes. |

### Phase F — Multi-step approval workflows

The current approval model is a single-role gate per document. Real audit-grade ERPs (SAP, NetSuite, Oracle) support multi-step **approval chains** — sequential or parallel stages, multiple approvers per stage, conditional routing based on amount or vendor type, escalation rules, substitution / delegation, full per-step audit trail.

This is a deliberate v2 / Phase F rewrite. Deferred because:
- The current single-step gate is functionally sufficient to move documents through the P2P cycle.
- The full P2P close (Phases C, D, E) is higher priority.
- We'll have real customer feedback on which workflow scenarios actually matter before designing.

**Chain-readiness precautions landed 2026-05-20** so Phase F won't force rework on Phases C/D:

| Precaution | What it does |
|---|---|
| `ApprovalDecision.next_step` + `workflow_id` typed wrapper | The engine returns a chain-shaped object today carrying a single step. When chains land, the engine returns N steps without changing the caller signature. `decision.approver_role` retained as backward-compat property. |
| `approvalHistory[]` array on document headers | Every approve/reject `$push`es an entry. Today there's always 1 entry; chains will produce N. `PRResponse` / `PORespone` / `GRResponse` already expose the field. State-changed outbox payloads carry `approvalHistory`. |

What Phase F itself will do:

| # | Item | Effort |
|---|---|---|
| F.1 | New `approval_workflows` + `approval_workflow_steps` tables. A workflow is a named chain scoped by org + company + doc_type + conditions. | Medium |
| F.2 | Approval Workflows UI — step-builder (drag-drop or numbered list) replacing the current Approval Rules page. Old rules auto-migrate as 1-step workflows. | Medium-Large |
| F.3 | Approval engine rewrite — returns the actual current step from the resolved workflow, supports 1-of-N / all-of-N step approvers, conditional steps. Reuses the chain-ready `ApprovalDecision` shape so callers don't change. | Medium |
| F.4 | Document state machine — approve advances to next step or finalises; reject configurable (kick to draft or to a previous step). | Medium |
| F.5 | Approval Inbox UI — show "step X of N" context per document. | Small |
| F.6 | Optional: time-based escalation, substitution / delegation. | Medium |

Estimated total: about a 1-2 week phase once we decide to do it. The chain-readiness work done today reduces rework in Phases C/D from ~3-5 days down to ~1-2 days when Phase F lands.

---

## 4b. Phase B shipped notes (2026-05-20)

What landed:

- **Operation side** (`src/modules/purchasing/`):
  - New doc type `GR` (Goods Receipt), state machine `Draft → Posted`.
  - New router `services/finance/... no, src/modules/purchasing/api/v1/goods_receipts.py`. Endpoints: `POST /gr`, `POST /gr/from-po/{poDocId}`, `GET /gr`, `GET /gr/{docId}`, `PATCH /gr/{docId}` (Draft only), `DELETE /gr/{docId}` (Draft only), `POST /gr/{docId}/post`.
  - Posted GRs are immutable — no edit, no delete (INTEGRATION_MODEL.md §5).
  - Partial-receipt supported: each GR line cannot exceed the PO line's `openQuantity`. When all PO lines fully received, the PO auto-transitions to `Closed` and emits its own `po_state_changed` event.
  - Outbox emission on Post is transactional with the doc write (Phase 2 mitigation pattern carried forward).

- **Contract update** (`contracts/finance_events.py`):
  - `PurchaseReceivedPayload` rewritten with richer fields: `grDocId`, `grDocNumber`, `grDate`, `poDocId`, `poDocNumber`, `vendorId`, `vendorCode`, `companyCode`, `lines: List[GoodsReceivedLine]`, currency, totals, `warehouseId`, `notes`.
  - New `GoodsReceivedLine` includes `itemId`, `itemCode`, `itemName`, `itemType`, `quantity`, `uom`, `unitPrice`, `lineNet`, `lineTax`, `lineGross`, `taxCode`, `baseLineId`. The `itemId` is what the finance handler uses to look up the inventory account.

- **Finance side** (`services/finance/`):
  - `_handle_purchase_received` in `api/v1/events.py`.
  - Resolves: posting setup (required `grIrClearingAccountId`), per-line `purchase_item_finance_ext.inventoryAccountId`, open fiscal period covering `grDate`.
  - Generates `JE-{companyCode}-{YYYY}-{NNNN}` (MAX+1 numbering, UNIQUE constraint catches races; sufficient for current load).
  - Produces a JE with one DR line per GR line (debit each item's inventory account for `lineNet`) and one aggregated CR line on GR/IR Clearing.
  - **VAT is intentionally not recognized at GR.** That happens at AP Invoice time (Phase C). Only `lineNet` matters for the GR posting.
  - Validation failures (missing setup, unmapped item, no open period) → HTTP 400 (permanent failure, no retry). Caller sees a real error.

- **Frontend** (`frontend/user-portal/src/pages/`):
  - GR pages: `GoodsReceiptsPage.tsx`, `GoodsReceiptDetailPage.tsx`, `GoodsReceiptFormPage.tsx`.
  - JE list: `JournalEntriesPage.tsx` with row-expansion that loads JE detail lazily and resolves account IDs to names via `useFinanceAccounts`.
  - Cross-page link on Posted GR detail: "View Journal Entry →" navigates to `/finance/journal-entries?search={grDocNumber}` with the search input pre-populated.
  - Sidebar entries: Purchasing → Goods Receipts (📥), Finance → Journal Entries (📒).

Design choices worth flagging:

1. **One DR line per GR event line**, not aggregated by account. Preserves per-PO-line traceability via `referenceLineId`. Trade-off: slightly more JE lines but auditable.
2. **GR has no approval step.** Warehouse confirmation IS the approval gate in v1. Approval rules table still has `GRPO` as a doc type — if customers ask, this can be wired later by setting an approval rule for GRPO.
3. **GR numbering separate from PO/PR numbering** — uses the same `document_counters` mechanism, prefix `GR-YYYY-NNNN`.
4. **JE numbering uses MAX+1 not a counter table** — small risk of contention under high load, mitigated by `UNIQUE(organizationId, jeNumber)` constraint. Replace with counter table in v2 if it becomes hot.
5. **`taxCode` propagated through the GR payload but unused by the GR handler** — finance only needs it at AP Invoice time. Carrying it through means we don't have to re-fetch it later.

Known-but-deferred follow-ups:

- **GR void / reverse**: Posted GRs can't currently be reversed. A reversal GR (negative receipt) is needed before a vendor return can post. Phase B+ or C.
- **Quantity correction on Posted GR**: not supported. Phase C will handle via three-way match at invoice time, or via a separate reversal flow.
- **Multi-warehouse inventory accounts**: all inventory lands in the single account configured on the item. Per-warehouse split deferred to v2.
- **JE number rollover**: format includes year; counter resets per year. Migration may be needed at fiscal-year boundary for high-volume customers.

End-to-end demo path (the first real debit/credit the system produces):

1. `/finance/item-mapping` — ensure the test item has a non-null `inventoryAccountId`.
2. `/purchasing/po/new` — create a PO with that item, submit, approve, send.
3. `/purchasing/gr/new` — pick the open PO, confirm received quantities, hit Post.
4. Posted GR banner shows "View Journal Entry →" — click it.
5. `/finance/journal-entries` filtered to the GR number — expand the row.
6. See DR inventory account / CR GR/IR Clearing. Cycle closed.

---

## 5. Phase A detailed work breakdown (immediate scope)

These four items can largely run in parallel. A.1 and A.2 are backend; A.3 is frontend on top of A.2; A.4 spans both ends.

### A.1 — JE tables

Create migration `007_journal_entries.py`:

`journal_entries`:
- `jeId` (UUID PK)
- `organizationId`
- `companyCode`
- `jeNumber` (auto-generated, format `JE-YYYY-NNNN`)
- `jeDate` (date the entry is dated for)
- `periodId` (FK to fiscal_periods)
- `sourceEventType` (e.g. `purchase_received`, `ap_invoice_posted`, `vendor_payment`)
- `sourceEventId` (UUID — link back to the outbox event that produced it)
- `sourceDocId` (UUID — link to the operational doc, e.g. PO docId for GR-driven JEs)
- `sourceDocNumber` (denormalized for display)
- `description`
- `totalDebit` (Decimal)
- `totalCredit` (Decimal — must equal totalDebit, enforced by check)
- `status` (`posted` / `void` — no edit, no delete, only void with reversal)
- `postedAt`, `postedBy`
- `createdAt`, `updatedAt`

`journal_entry_lines`:
- `jeLineId` (UUID PK)
- `jeId` (FK)
- `lineNumber`
- `accountId` (FK to gl_accounts)
- `debit` (Decimal, nullable)
- `credit` (Decimal, nullable — exactly one of debit/credit must be > 0 per line)
- `description`
- `costCenterId` (FK, nullable — for cost center tracking)
- `referenceLineId` (e.g. PO line that this allocation comes from)

API for v1: read-only list + detail. No POST/PATCH/DELETE — JEs are produced by the consumer only.

### A.2 — Posting Setup config

New table `company_posting_setup`:
- `setupId` PK
- `organizationId`
- `companyCode` (unique with org)
- `apControlAccountId` (default Trade Payables — e.g. 221000-001)
- `arControlAccountId` (default Trade Receivables)
- `bankAccountId` (default operating bank account)
- `cashAccountId` (default petty cash)
- `grIrClearingAccountId` (the GR/IR holding account)
- `inputVatAccountId`
- `outputVatAccountId`
- `retainedEarningsAccountId`
- `purchasePriceVarianceAccountId`
- `roundingAccountId` (for tiny rounding differences)
- `createdAt`, `updatedAt`, `updatedBy`

GET endpoint: returns the current setup row, or 404 if not configured yet (frontend shows setup wizard).
PUT endpoint: upserts. Validates each accountId references a real GL account in the same org. Restricted to `finance_admin` / `admin` / `super_admin`.

### A.3 — Posting Setup UI

Route `/finance/posting-setup`. Single-page form with grouped fields (Payables, Receivables, Cash, Tax, Equity, Variance). Each field is a searchable select of CoA accounts filtered by appropriate drawer + level=active.

Save button POSTs/PUTs the config. Show "Last updated by X on Y" timestamp. Add to Finance nav group.

### A.4 — Item → GL account mapping

Extend `purchase_item_finance_ext` with `inventoryAccountId` (FK to gl_accounts, nullable).

When the consumer's `_handle_purchase_item_changed` runs, auto-assign `inventoryAccountId` based on item type (`raw_material` → `130000-001 Raw Materials Inventory`, etc.) — same auto-assign pattern that the vendor handler uses for reconciliation account.

Surface in the purchasing UI on the item form: an editable "Inventory Account" dropdown. This is on the **purchasing** Items page (operation side), not finance.

---

## 6. Deferred to v2 (with rationale)

| Feature | Why deferred |
|---|---|
| Foreign currency + FX gain/loss | Single-currency (AED) v1 covers our farm-operations customer. Multi-currency is a 2-3 week module on its own. |
| Vendor returns / credit memos | Real but uncommon in farm operations. Can be handled manually in v1 via manual journal. |
| Cash purchases (skip AP) | Rare flow. Workaround: create vendor "Petty Cash Vendor" and run normal flow. |
| Advance / prepayment | Power-user feature. Workaround: manual journal. |
| Recurring invoices | Utilities. v1 enters them manually each month. |
| Three-stage payments (in-transit account) | Single-step "AP → Bank" covers wire transfers in dev environments. |
| Period close enforcement (auto-reject postings to closed periods) | Add when first auditor asks. |
| Multi-warehouse inventory accounts | All inventory hits one account in v1; per-warehouse accounts in v2. |
| Withholding tax | Not applicable to UAE goods. |
| Standing orders / blanket POs | Each delivery currently needs its own PO. |
| Budget per account per period | Not a v1 requirement. |

---

## 7. Open design questions

1. **JE date vs document date.** When AP Invoice arrives 3 days after GR, does the JE post on the invoice date (audit-cleaner) or on the GR date (matches inventory record)? *Recommendation:* JE date = event date (when finance learns about it). Document date stays on the source document.

2. **GR approval.** Should GR itself need approval, or is the physical receipt enough? *Recommendation:* No approval on GR in v1. The next document (AP Invoice) catches everything. Add GR approval later if customers ask.

3. **Item-account-mapping override.** Should each purchase line be able to override the item's default inventory account? *Recommendation:* No for v1. Item-level mapping is enough. Override is a power-user feature.

4. **What posts when invoice has zero VAT?** No special handling — Input VAT line is simply omitted.

5. **Where does the AP Invoice creation flow live — operation app or finance app?** Other ERPs vary. SAP B1 has it under AP within finance; NetSuite under Procurement; QuickBooks under Vendors. *Recommendation:* operation side, as a continuation of the PO flow. The finance side observes via Incoming Preview and the JE list.

6. **JE numbering.** Per company or per organization? *Recommendation:* per company, format `JE-{companyCode}-YYYY-NNNN`.

---

## 8. Living-doc reminders

- Mark items in Section 4 with ✅ as they ship.
- Update Section 7 as questions are resolved.
- Add new flags here when they emerge mid-build.
- Cross-reference INTEGRATION_MODEL.md for the doc-flow semantics — that doc is the constitution; this one is the construction plan.
