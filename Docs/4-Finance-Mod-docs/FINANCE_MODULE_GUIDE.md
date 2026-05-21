# Finance Module — Build & Usage Guide

> **Status:** In active development.
> **Last updated:** 2026-05-20.
> **Scope so far:** Master data foundations (Phase 1A) + Purchase Request/Order documents and approvals (Phase 1B). Posting engine + reports come in later phases.
> **Author trail:** Viet Anh. Adrian builds the AI Assistant module separately.

This document explains what the Finance Module is, how it's architected, how it relates to the main app, what changes for users when it's installed vs not, and the phased roadmap. It's a living document — update as we go.

---

## 1. Purpose

The Finance Module turns the A64 Core Platform from an agricultural-operations app into a full ERP for farming businesses. It adds:

- General Ledger (GL) with SAP-style chart of accounts
- Accounts Payable (AP) — vendor invoices, payments, credit notes
- Accounts Receivable (AR) — customer invoices, payments, credit notes (sell-side, later phase)
- Inventory valuation (moving average for purchased items, standard cost for finished goods)
- Approval workflows
- Statutory and management reports (P&L, Balance Sheet, AP/AR aging, etc.)
- Multi-entity support (one customer can run multiple legal entities)
- UAE VAT compliance (5% standard, zero-rated, exempt, reverse charge)

It is **opt-in per customer**. Customers who buy only the main app get operational features (farm management, sales orders, calculator, fertigation editor, purchase requests/orders) without the financial layer.

---

## 2. Architecture at a glance

```
┌───────────────────────────────────────┐         ┌──────────────────────────────────┐
│ Main App  (FastAPI + MongoDB)         │         │ Finance Service (FastAPI + MySQL)│
│  - Farm operations                    │         │  - General Ledger                │
│  - Sales / Inventory                  │         │  - AR/AP sub-ledgers             │
│  - Calculator / Fertigation           │         │  - Approval rules                │
│  - Purchase Requests / Orders         │         │  - Vendor / Item finance ext     │
│  - Vendors / Items / Payment Terms    │         │  - Reports (P&L, BS, aging)      │
│         │                             │         │         ▲                        │
│         ▼                             │  HTTPS  │         │ POSTs from worker      │
│  finance_outbox (Mongo collection)    │ ──────▶ │         │                        │
│         │                             │         │ outbox_events_processed         │
│         │ polled by                   │         │  (idempotency record)            │
│         ▼                             │         │                                  │
│ ┌────────────────────────────┐        │         └──────────────────────────────────┘
│ │ finance_consumer (worker)  │ ─POSTs─→
│ │  - polls outbox            │
│ │  - retries with backoff    │
│ │  - service-to-service auth │
│ └────────────────────────────┘        │
└───────────────────────────────────────┘
```

### Why a separate service

- **Modular packaging**: customers without finance never deploy the MySQL / finance / consumer containers.
- **Independent scaling and release cadence**: finance has different load patterns (heavy month-end) and different release pressure (tax law changes, fiscal year boundaries).
- **Failure isolation**: finance can be down without breaking ops.
- **Cleaner security boundary**: financial data on its own DB, separate credentials, separate audit.

### Document placement — Option D

Decision locked early in design (see `Docs/Backlog/ARCHIVE.md`):

| Document type | Lives in | Why |
|---|---|---|
| Purchase Request, Purchase Order, Goods Receipt | Main app (MongoDB) | Operational — works without finance |
| Sales Order, Delivery Note | Main app (MongoDB) | Operational — works without finance |
| **Vendors, Items, Payment Terms (master data)** | **Main app (MongoDB)** with thin finance ext | Ops needs them; ext holds GL mappings only |
| AP Invoice, AP Credit Note, Outgoing Payment | Finance (MySQL) | Pure accounting |
| AR Invoice, AR Credit Note, Incoming Payment | Finance (MySQL) | Pure accounting |
| GL Postings, Journal Entries, Period management | Finance (MySQL) | Accounting core |
| Chart of Accounts, Tax Codes, Cost Centers, Approval Rules, Companies | Finance (MySQL) | Configuration |

Cross-store consistency uses the **outbox pattern**: business events in Mongo trigger events that the consumer worker delivers to finance.

### The "finance ext" tables

When operations creates a master data record (vendor, item), the main app stores the full operational record in Mongo. A small companion record is created in finance MySQL with **only the accounting fields** (GL account mappings, IFRS tag, valuation method, reconciliation account). Linked by ID, kept in sync via outbox.

Why this split:
- Operations is the natural owner of vendor/item identity.
- Finance is the natural owner of GL mappings.
- When finance is off, the full record still works for ops.
- When finance is on, accounting fields auto-populate from defaults; accountant overrides per record.

Same pattern for customers (`customer_finance_ext`).

---

## 3. With finance vs without finance — user-facing differences

### Side-by-side comparison

| Action | Customer WITHOUT finance | Customer WITH finance |
|---|---|---|
| Sidebar: see "Purchasing" group | ✅ (procurement roles) | ✅ |
| Sidebar: see "Finance" group | ❌ | ✅ |
| Create vendor | Stores full Mongo record | Mongo record + auto-created `vendor_finance_ext` with default AP control account |
| Create purchase item | Stores Mongo record | Mongo + auto-created `purchase_item_finance_ext` with default inventory account |
| Edit vendor's GL accounts | N/A | Yes, via Finance UI (Phase 2+) |
| Create Purchase Request | ✅ Full workflow with approval | ✅ Same workflow |
| Approval rules for PR/PO | **Hardcoded fallback** (PR always; PO over 10,000 AED) | **Configurable per company code** via finance's `approval_rules` table |
| Convert approved PR → PO | ✅ Lines copied with link | ✅ Same |
| Send PO to vendor | Informational mark only | Same |
| Goods Receipt (Phase 2) | ✅ Updates inventory qty in Mongo | ✅ Plus posts `Dr Inventory / Cr GRNI Allocation` to GL |
| Inventory valuation | None (qty only) | Moving average cost per item (Phase 2) |
| AP Invoice from GRPO | ❌ | ✅ Manual or auto-draft (Phase 3) |
| Vendor balance / payments | ❌ | ✅ AP sub-ledger (Phase 3) |
| Goods Issue (consumption) | Tracked operationally | Plus GL posting (`Dr Cost of Production / Cr Inventory`) |
| Bank account management | ❌ | ✅ (Phase 3) |
| Trial Balance / P&L / Balance Sheet | ❌ | ✅ (Phase 4) |
| AP Aging / AR Aging | ❌ | ✅ (Phase 4) |
| Period close | ❌ | ✅ (Phase 4) |
| Multi-entity reports | ❌ | ✅ (Phase 4) |
| Statutory tax reports | ❌ | ✅ (Phase 4+) |
| Manual journal entries | ❌ | ✅ (deferred to v2 of finance) |

### Customer WITHOUT finance — typical workflow

The procurement officer logs in. Sees the **Purchasing** sidebar group with five children:
1. **Vendors** — adds suppliers
2. **Purchase Items** — adds purchasable inventory items (fertilizers, packaging, supplies)
3. **Payment Terms** — admin-only configures NET30/NET60/COD etc.
4. **Purchase Requests** — raises PRs with line items
5. **Purchase Orders** — converts approved PRs into POs, sends to vendors
6. **Approval Inbox** — managers approve PRs/POs

The full **PR → approval → PO → send** workflow works. The approval engine uses **hardcoded fallback rules** (PR always needs manager; PO over 10,000 AED needs manager). The system does NOT track:
- What's owed to vendors (no AP)
- When money was paid (no outgoing payment)
- Cost of inventory (Mongo tracks quantity only)
- Any GL postings, balance sheet, or P&L

For these customers, the Purchasing module is essentially a **structured procurement record-keeping system** — better than spreadsheets and emails for managing what's been ordered and from whom, but financials happen outside the app.

### Customer WITH finance — typical workflow

Same Purchasing UI as above for procurement officers. Plus the **Finance** sidebar group (accountant/finance_admin roles only) shows:

1. **Chart of Accounts** — view/edit GL accounts (208 pre-seeded across 9 drawers)
2. **Company Codes** — manage multi-entity setup
3. **Fiscal Periods** — view/close monthly periods (admin)
4. **Tax Codes** — UAE VAT codes (S/Z/E/N/SR pre-seeded)
5. **Cost Centers** — farm-level or department-level dimensions
6. **Vendor Finance Master** — override accounting attributes per vendor
7. **Approval Rules** — configure per-company thresholds and approver roles
8. **AP Invoices** (Phase 3) — match vendor invoices to GRPOs
9. **Outgoing Payments** (Phase 3) — pay vendors
10. **AR Invoices, Incoming Payments** (Phase 3) — sell-side
11. **Reports** (Phase 4) — Trial Balance, P&L, BS, AP/AR Aging

When operations creates a vendor, an event flows to finance and a `vendor_finance_ext` row appears with default account mappings. The accountant can override these (e.g., assign a specific reconciliation account for related-party vendors).

When PR/PO state changes happen in main app, events flow to finance. Today the handlers just log receipt (Phase 1B). In Phase 3, they will generate GL postings:
- GRPO posted: `Dr Inventory / Cr GRNI Allocation`
- AP Invoice matched: `Dr GRNI + Input VAT / Cr AP Control (vendor sub-ledger)`
- Payment: `Dr AP Control / Cr Bank`

The accountant can run reports anytime to see real-time books.

---

## 4. Roles introduced

Main app adds these new roles (in addition to existing `admin`, `super_admin`, `agronomist`, `moderator`, `user`):

| Role | Purpose | Permissions |
|---|---|---|
| `procurement_officer` | Day-to-day procurement | Create PR/PO/GRPO; cannot approve own |
| `procurement_manager` | Procurement oversight | Approve PR/PO; everything procurement_officer can do |
| `accountant` | Day-to-day finance | Post AP invoices, payments, view reports |
| `finance_admin` | Finance configuration | Period close, CoA changes, approval rules, master data overrides |
| `auditor` | Read-only across finance | View everything, edit nothing |

Permissions enforced at the API layer. Frontend hides nav items based on role.

---

## 5. Current build state (as of 2026-05-20)

### ✅ Completed phases

**v1.15.0 — Tools modules** (before finance work began): Fertilizer Cost Calculator, Chemicals Catalog, Fertigation Schedule Editor on Plant Library.

**Finance Week 1 — Service scaffold** (`T-016`):
- FastAPI app under `services/finance/`, port 8001 (host 8002).
- MySQL 8.0 backing store with Alembic migrations.
- JWT verification reusing main app's `SECRET_KEY` (no MongoDB dependency).
- 8 ORM tables: company_codes, gl_accounts, fiscal_periods, tax_codes, cost_centers, vendors_finance_ext (added later), customer_finance_ext, audit_log.
- 208-account seed CoA across 9 drawers (Assets, Liabilities, Equity, Revenue, Cost of Sales, Operating Cost, Non-Operating, Other Income, Taxation).
- 5 default UAE VAT tax codes (S, Z, E, N, SR).
- Opt-in Docker profile (`--profile finance`).

**Finance Week 3 — Outbox bridge** (`T-017`):
- Shared `contracts/` Python package with Pydantic event schemas for 10+ event types.
- `finance_outbox` collection in MongoDB.
- `finance_consumer` worker (separate container) — polls outbox, posts to finance, idempotency via `outbox_events_processed` table.
- Bridge proven end-to-end with synthetic `sales_order_shipped` event.

**Purchasing Phase 1A — Master data** (`T-018`):
- New main app module `src/modules/purchasing/`.
- Mongo collections: `vendors`, `purchase_items`, `payment_terms`.
- Finance MySQL: `vendor_finance_ext`, `purchase_item_finance_ext`, `approval_rules`.
- New event types: `vendor_changed`, `purchase_item_changed`, `payment_terms_changed`.
- Auth roles added: `procurement_officer`, `procurement_manager`, `accountant`, `finance_admin`, `auditor`.
- Approval rules seeded by default at company creation (4 default rules per company).
- Frontend pages: Vendors, Purchase Items, Payment Terms in a new "Purchasing" sidebar group.

**Purchasing Phase 1B — PR + PO + approvals** (`T-019`):
- Mongo collections: `document_headers`, `document_lines`, `document_counters`.
- Single header+lines pair handles both PR and PO (discriminated by `doc_type`).
- Document numbering: per (company, doc_type, fiscal_year) sequential counters → `PR-2026-0001`, `PO-2026-0001`.
- State machines enforce SAP-style lifecycles (Draft → Pending Approval → Approved/Open → Closed/Cancelled).
- Approval engine queries finance for rules when available; hardcoded fallback when finance is off.
- New event types: `pr_state_changed`, `po_state_changed`.
- Doc-to-doc linking via `base_doc_id` and `base_line_id` (PR → PO).
- Open/closed quantity tracking on lines.
- Frontend pages: PR list/form/detail, PO list/form/detail (with "from PR" pre-fill), Approval Inbox.

### ⏳ Phase 2 — Goods Receipt + Goods Issue + inventory cost

Planned next. Includes:
- `goods_receipts` and `goods_issues` collections in Mongo (also `document_headers`).
- GRPO references PO via `base_doc_id`. Partial receipts allowed; PO open_quantity decrements.
- `inventory_movements_finance` shadow table in MySQL for moving average cost calculation.
- Outbox events trigger finance to compute and post inventory cost.
- Inventory snapshot at period close.
- Fertigation events emit Goods Issue records.
- Stock count reconciliation job.

### ⏳ Phase 3 — AP Invoice + Payment + Credit Note

- AP Invoice creation from GRPO event (auto-draft) or manual.
- Outgoing Payment with bank account selection.
- AP Credit Note + Vendor Refund.
- GRNI clearing logic (`Dr GRNI + VAT / Cr AP Control`).
- AP sub-ledger maintenance per vendor.
- Vendor balance and AP aging visibility.

### ⏳ Phase 4 — Reports + period close + cutover

- Trial Balance, P&L, Balance Sheet (on-demand aggregation).
- AP/AR Aging (0-30, 31-60, 61-90, 90+).
- General Ledger detail listing.
- Period close ceremony (validation, snapshot, lock).
- Manual journal entry UI (Park & Post pattern).
- Reversal mechanism (no edits, only reverse-and-repost).
- Opening balance entry wizard.
- Cutover playbook for existing customers upgrading.

### Later phases (deferred)

- Multi-currency (v2 of finance).
- Fixed assets + depreciation.
- Bank reconciliation.
- Actual costing (Work in Progress per block).
- Consolidation reports with intercompany elimination.
- IFRS-specific features (lease accounting, biological assets revaluation).

---

## 6. Activation flow

### New customer (greenfield)

Customer signs up. Default deployment is **main app only**, no finance.

If customer wants finance from day one:

1. **Deploy** the finance Docker profile:
   ```
   docker compose -p <project> \
     -f docker-compose.yml \
     -f docker-compose.prod.yml \
     -f docker-compose.finance.yml \
     --profile finance up -d --build
   ```
2. **Run migrations**: `docker exec a64-finance alembic upgrade head`
3. **Set `FINANCE_OUTBOX_ENABLED=true`** in main app environment so outbox emission activates.
4. **Set `FINANCE_INGESTION_SECRET`** — shared secret for consumer→finance auth.
5. **Customer admin logs in** → goes to Finance → Company Codes → creates first company. The system auto-seeds:
   - 208-account default CoA
   - 5 UAE VAT tax codes (S/Z/E/N/SR)
   - 4 approval rules (PR always, PO/AP over 10k, payment always)
6. **Configure fiscal year** (calendar Jan-Dec is default; admin sets `fiscalYearStartMonth` at company creation, locked thereafter).
7. **Customer is ready to use finance immediately** — opening balances are zero; transactions accrue from day one.

### Existing customer (upgrade)

Customer has been using main app for months. They subscribe to finance.

Steps:

1. Pick a **cutover date** (typically first of next fiscal month).
2. Accountant prepares the **opening balance worksheet**:
   - Cash per bank account (from statement)
   - AR opening per customer (from customer's records)
   - AP opening per vendor (from vendor invoices on hand)
   - Inventory value (stock count × latest known purchase price)
   - Fixed assets at book value
   - Equity is the plug
3. Deploy finance (same as new customer).
4. Run **resync script** to populate `vendor_finance_ext` and `purchase_item_finance_ext` from existing Mongo records (TBD — to be built in Phase 4).
5. On cutover day:
   - Freeze new transactions for 30 minutes.
   - Run physical inventory count, adjust quantities.
   - Open the first fiscal period.
   - Post the **OpeningBalance event** (special outbox event) — creates opening JEs.
   - Set `FINANCE_OUTBOX_ENABLED=true`.
   - Validate trial balance reconciles, AR aging matches.
6. Resume operations. From cutover forward, every new operational doc emits an event and finance posts normally.

**Pre-cutover history stays in main app as operational records — finance does NOT back-fill historical transactions.** This is industry-standard for ERP cutovers (SAP, NetSuite, Dynamics all work this way).

### Disabling finance

Customer downgrades or pauses finance.

1. Set `FINANCE_OUTBOX_ENABLED=false` in main app env.
2. Stop the finance Docker profile (`docker compose ... --profile finance down`).
3. The `finance_outbox` collection accumulates pending events but nothing is delivered.
4. Operations continues unchanged.
5. To resume: set the flag back, start finance containers; consumer processes the backlog.

The MySQL data persists. Customer can re-activate at any time.

---

## 7. Configuration knobs (env vars)

### Main app
- `FINANCE_OUTBOX_ENABLED` — `true|false`. When false, `OutboxWriter.publish()` is a no-op. Default `false`.
- `MONGODB_URL` — full credentialed connection string.
- `MONGODB_DB_NAME` — defaults to `a64core_db` but in our esgagro deployment is `esgagro_db`.

### Finance service
- `SECRET_KEY` — must exactly match main app's value so JWTs are accepted.
- `FINANCE_INGESTION_SECRET` — shared secret for the `/events/ingest` endpoint.
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` — for the finance MySQL connection.

### Finance consumer
- `MONGODB_URL`, `MONGODB_DB_NAME` — to read the outbox.
- `FINANCE_URL` — internal URL for the finance service (default `http://finance:8001`).
- `FINANCE_INGESTION_SECRET` — must match finance's value.
- `CONSUMER_POLL_INTERVAL_SECONDS` — default 5.
- `CONSUMER_BATCH_SIZE` — default 50.
- `CONSUMER_MAX_ATTEMPTS` — default 5 (exponential backoff after each failure).
- `CONSUMER_STALE_CLAIM_SECONDS` — default 300 (5 minutes).

---

## 8. Operational notes

### Document numbering

Format: `<TYPE>-<YYYY>-<NNNN>` per (companyCode, docType, fiscalYear). Examples: `PR-2026-0001`, `PO-2026-0042`. Atomic increment via `findOneAndUpdate` on `document_counters` collection.

### Period boundaries

If finance is enabled, all postings carry `periodId`. If an outbox event arrives for a closed period, finance bumps the posting to the next open period with an audit-log note. Never silently fails.

### Currency

AED-only in v1. Reject any document with non-AED currency. Multi-currency planned for v2 of finance.

### Tax handling

UAE 5% VAT. Tax codes seeded:
- `S` — Standard rated (5%)
- `Z` — Zero rated (0%)
- `E` — Exempt (0%, not recoverable)
- `N` — Out of scope
- `SR` — Standard rated reverse charge (for imports)

VAT amounts are system-calculated from line net + tax code. Manual override requires special permission (not built in Phase 1).

### Multi-entity

Each company code is a separate legal entity. Chart of accounts is shared across all entities of an organization. Approval rules are per company code. Fiscal year is per company code. Consolidation reporting (with intercompany elimination) is deferred to a later phase.

---

## 9. Open known issues / risks

1. **Cross-DB consistency window** — outbox events have a delivery SLA of <30s p99. UI may show "GL posting pending" status during this window. Reconciliation cron (planned) detects drift > 0.5% and alerts.

2. **No replica set on MongoDB** — outbox-and-business-doc writes are best-effort, not atomic. A crash between the two writes could leave the outbox missing an event. Acceptable for v1; production deployment should add a replica set.

3. **Approval rules not editable via UI yet** — only via API. UI editor planned for Phase 4.

4. **Phase 1B tax handling is simplified** — uses a hardcoded 5% when `taxCode` is present, 0% otherwise. Phase 2 will add proper tax code lookup from a master data table also available to the operations side.

5. **httpx dependency** — Phase 1B approval engine calls finance via httpx. If httpx isn't installed in the main app container, falls back to hardcoded rules with a logged warning. Should be added to main app's requirements.

6. **Migration of existing vendors on finance enablement** — currently no resync script. To be built in Phase 4 alongside the cutover playbook.

7. **Goods Issue not yet implemented** — fertigation events currently consume inventory implicitly. Phase 2 will formalize as Goods Issue documents.

---

## 10. References

- `Docs/4-Finance-Mod-docs/SAP_B1_Dev_Reference_v2.xlsx` — the SAP Business One reference design (12 sheets) used as our blueprint for document flow, journal entry maps, validation rules, etc.
- `Docs/Backlog/ARCHIVE.md` — full task history (T-016 onwards).
- `Docs/1-Main-Documentation/System-Architecture.md` — top-level system overview, includes the Finance Service section.
- `Docs/1-Main-Documentation/API-Structure.md` — all endpoints, organized by module.
- `contracts/finance_events.py` — Pydantic schemas for all outbox event types.
- `services/finance/src/finance/db/seeds/default_coa.py` — the 208-account seed.
- `services/finance/alembic/versions/` — migration history.

---

## 11. Changelog of this document

- **2026-05-20**: Initial draft. Covers state as of Phase 1B (PR+PO+approvals committed). Phase 2-4 outlined.
