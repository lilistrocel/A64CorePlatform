# Wave 2 — Statutory Financial Statements

**Status:** Approved 2026-05-24 (rev 2). Ready for backlog scoping
as T-060.
**Owner:** TBD
**Estimated effort:** 12–18 days (backend + frontend, mostly
sequential — period close → BS → P&L → Cash Flow)
**Backlog task:** T-060 (to be created)
**Authored:** 2026-05-24
**Prerequisites:** T-059 ✅ (Wave 0 — module gate)
**Depends on:** Phase D.5 (period close) — included in scope below
**Maps to internal phase plan:** Phase 4 in
`Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` §5 (Reports +
period close + cutover); Phase D.5 + Phase E.1 in
`Docs/4-Finance-Mod-docs/POSTING_ENGINE_ROADMAP.md` §4.

---

## 0. Why this rewrite

The first draft of this doc was authored without reading
`Docs/4-Finance-Mod-docs/`. Three things were wrong:

1. **The team's roadmap already has these reports planned** as part
   of Phase 4 (the guide) / Phase D.5 + E (the posting-engine
   roadmap). Wave 2 is not a new design — it's the scoping doc for
   work the team has already triaged.
2. **The Chart of Accounts is far more sophisticated than the rev-1
   sketch assumed.** 231-account UAE-agri seed, hierarchical with
   `parentAccountNumber` + `isHeader`, a 9-value `DrawerEnum`
   (ASSETS / LIABILITIES / EQUITY / REVENUE / COST_OF_SALES /
   OPERATING_COST / NON_OPERATING / OTHER_INCOME / TAXATION). The
   `subClassification` column rev-1 proposed is **redundant** —
   the existing hierarchy + DrawerEnum already provides it.
3. **An "operational P&L" already exists** at `/finance/pnl`
   (`pages/pnl/PnLPage.tsx`) with farm/crop breakdowns, revenue
   confidence scores, AR aging KPIs. Its data comes from operational
   sources (sales orders, harvest records), not from journal
   entries. Wave 2 builds a parallel **statutory P&L (Income
   Statement)** — different audience, different data source. Both
   coexist (see §1.2).

The rewrite below honours the existing roadmap, drops the redundant
schema additions, and resolves the P&L naming collision.

## 1. Goal

Give finance users the three statutory financial statements,
computed from the General Ledger:

- **Balance Sheet (BS)** — financial position as of a date.
- **Income Statement (statutory P&L)** — operating performance
  over a period.
- **Cash Flow Statement (CF)** — cash movement over a period
  (indirect method).

Each must be (a) interactive in the user portal, (b) exportable
(PDF + Excel), (c) drillable from any line down to the contributing
JE lines, and (d) presentable side-by-side with a comparative
period.

Plus the minimal piece of period-close machinery they depend on:

- **Period close enforcement** + **closing JE** that rolls
  current-year Net Income into Retained Earnings (so BS doesn't
  show a separate "Current Year Profit/(Loss)" line in eternity).

### 1.1 What's already done

From `FINANCE_MODULE_GUIDE.md` §5 + the posting-engine roadmap:

| Component | Status |
|---|---|
| Trial Balance report + page | ✅ Phase 4 / PM fix #5 |
| JE list + detail UI | ✅ Phase B |
| JE reversal (audit-grade) | ✅ PM fix #4 |
| AP Aging report + page | ✅ Phase D |
| Vendor Sub-Ledger report + page | ✅ Phase E (early) |
| Posting Setup UI | ✅ Phase A.3 |
| Item GL Mapping UI | ✅ Phase A.4 |
| Fiscal Periods data model | ✅ Phase 1 |
| Period close *data model* (PeriodStatusEnum = open/closed/locked) | ✅ existing |
| Operational P&L (farm/crop dashboard) at `/finance/pnl` | ✅ pre-finance-module work |
| AP Invoice posting, 3-way match | ✅ Phase C |
| Payment posting | ✅ Phase D |

### 1.2 P&L coexistence (operational vs statutory)

Two P&Ls is intentional, not duplication. They serve different
people with different cadences:

| | Existing `PnLPage` | New `IncomeStatementPage` |
|---|---|---|
| URL | `/finance/pnl` | `/finance/income-statement` |
| Data source | Ops backend — sales orders, harvest records, AR aging | Finance MySQL — `journal_entries` ⨝ `journal_entry_lines` ⨝ `gl_accounts` |
| Granularity | By farm / by crop / by month | By GL account hierarchy (Revenue → COGS → OpEx → …) |
| Audience | Operations manager, farm lead | Accountant, finance admin, auditor |
| Cadence | Daily glance | Monthly close, year-end |
| Audit posture | Management view (fast, fuzzy) | Statutory view (signed, reconciles to BS) |
| Period semantics | Calendar / farming year | Fiscal period (closeable, lockable) |

**Sidebar treatment:** keep both under the Finance group. Rename
the existing entry from "P&L Statement" to **"Operational P&L"** to
disambiguate. New entry **"Income Statement"** sits next to Trial
Balance.

## 2. Non-goals (Wave 2)

- **Replacing the operational `/finance/pnl`** — it stays as-is.
  Wave 2 is additive.
- **Multi-currency reporting / FX revaluation** — AED-only per
  `FINANCE_MODULE_GUIDE.md` §8.3. Out of scope until "v2 of
  finance".
- **Consolidations across companies** — explicitly deferred in
  the guide. CoA is shared across orgs; reporting per-company only.
- **Budgeting + variance vs budget** — separate later wave.
- **Cash flow direct method** — too much master-data setup.
  Indirect only.
- **Manual JE UI (Park & Post)** — listed in the guide's Phase 4
  but separable. Defer to Wave 2.5 or Wave 3 unless approver
  bundles it.
- **Opening balance entry wizard** — listed in Phase 4. Defer
  unless approver bundles. Needed for the first audited customer
  cutover.
- **Cutover playbook for upgrading existing customers** — same.
- **GR/IR reconciliation report** (Phase E.1) — useful but
  separable; parallel sub-wave.
- **IAS 41 Biological Assets fair-value remeasurement** (Phase
  E.4) — separate domain work; not blocked on Wave 2.
- **Manual closing JE adjustments** beyond the auto-posted Net
  Income roll-up — out of scope; use existing JE reversal.

## 3. Architectural decision

**Compute on demand from the General Ledger, no materialisation.**
Same pattern as Trial Balance today
(`services/finance/src/finance/api/v1/reports.py` ~line 100). The
aggregations are SQL `GROUP BY` over
`journal_entry_lines ⨝ journal_entries ⨝ gl_accounts` with date
predicates and the existing LEFT-JOIN-from-accounts pattern (so
zero-activity accounts still appear).

**Use the existing CoA structure verbatim.** No new column on
`gl_accounts` for BS/PL sub-classification — the existing
`DrawerEnum` + `parentAccountNumber` hierarchy + `isHeader` flag
already give us:

- BS top-level grouping (`drawer in {ASSETS, LIABILITIES, EQUITY}`)
- BS sub-grouping (walk `parentAccountNumber` from leaf to root —
  e.g., 121000-006 → 121000 Inventories → 120000 Current Assets →
  110000 Non-Current Assets / 120000 Current Assets header).
- P&L top-level grouping (`drawer in {REVENUE, COST_OF_SALES,
  OPERATING_COST, NON_OPERATING, OTHER_INCOME, TAXATION}`).
- Sub-totals: every `isHeader=True` account is a sub-total row.

**Cash flow needs one new column** (`accounts.cashFlowCategory`)
because the existing drawers don't distinguish operating /
investing / financing. See §6.

**Cash flow uses the indirect method.** Start from net income,
adjust for non-cash + working-capital changes. Direct method
requires categorising every cash transaction at posting time —
overkill.

**Period close auto-posts a closing JE.** When a period that
contains the fiscal year-end is closed, the system posts:

```
DR  312000-002  Current Year Profit / (Loss)    <net income>
CR  312000-001  Retained Earnings - Prior Years <net income>
```

(reversed if net loss). After this JE, BS shows Retained Earnings
as a single line with everything rolled into it; Current Year
Profit/(Loss) goes to zero until the next year's first JE moves it.
Existing accounts `312000-001` (Prior Years) and `312000-002`
(Current Year) are already in the seed CoA — no schema change
needed.

## 4. Computation contracts

### 4.1 Balance Sheet (`GET /reports/balance-sheet`)

**Inputs:** `organization_id`, `company_code`, `as_of_date`
(default: today), optional `compare_to_date`, optional `period_id`
(alias for as_of = period end), `include_voided`, optional
`cost_center_id` (filter).

**Output:** hierarchical report walking the CoA tree:

```
Assets (drawer=ASSETS)
├── 110000 Non-Current Assets                   85,000.00
│   ├── 110000-001 PPE                          85,000.00
│   │   ├── 110000-002 Land                     50,000.00
│   │   ├── 110000-005 Machinery & Equipment    40,000.00
│   │   └── 110000-009 Accumulated Depn        (5,000.00)
│   └── (other 110000 children rolled up)
├── 120000 Current Assets                      151,500.00
│   ├── 121000 Inventories                      88,200.00
│   ├── 124000 Trade Receivables                45,000.00
│   └── 126000 Cash & Cash Equivalents          12,500.00
│       ├── 126000-001 Petty Cash                  500.00
│       ├── 126000-002 Cash at Bank - AED Op   10,000.00
│       └── 126000-003 Cash at Bank - AED Pay   2,000.00
Total Assets                                   236,500.00

Liabilities (drawer=LIABILITIES)
├── 210000 Non-Current Liabilities                  0.00
├── 220000 Current Liabilities                  65,450.00
│   ├── 221000 Trade Payables                   59,150.00
│   ├── 222000 Tax Payable                       3,150.00
│   └── 223000 Accruals & Deferred Income        3,150.00
Total Liabilities                                65,450.00

Equity (drawer=EQUITY)
├── 311000 Share Capital                       100,000.00
├── 312000 Retained Earnings                    71,050.00
│   ├── 312000-001 RE - Prior Years             45,200.00
│   └── 312000-002 Current Year P/(L)           25,850.00
└── 313000 Reserves                                  0.00
Total Equity                                   171,050.00

Total Liabilities + Equity                     236,500.00
```

**Computation rules:**

- Balances are cumulative from start of time up to and including
  `as_of_date`. No period-start filter (BS is a snapshot).
- Hierarchy walk uses existing `parentAccountNumber` chain.
  `isHeader=True` rows are sub-totals (sum of children); leaf rows
  show their direct balance.
- Sign convention preserved from Trial Balance: assets/expenses
  positive on debit, liabilities/equity/revenue positive on credit.
- **Net Income (current period)** appears as `312000-002 Current
  Year Profit / (Loss)` and is computed by summing all REVENUE +
  COST_OF_SALES + OPERATING_COST + NON_OPERATING + OTHER_INCOME +
  TAXATION drawer balances from `current_fiscal_year_start` to
  `as_of_date`. After the closing JE has been posted (see §5), this
  amount is zero until the next fiscal year accumulates new activity.

**Validation:** `Total Assets ≈ Total Liabilities + Total Equity`
(tolerance ≤ 0.01 AED). Mismatch → warning banner with the delta +
link to a "find unbalanced JEs" diagnostic (Phase E.1 work, but
the banner stub is in Wave 2).

### 4.2 Income Statement (`GET /reports/income-statement`)

**Inputs:** `organization_id`, `company_code`, `period_start`,
`period_end`, optional `compare_period_start` /
`compare_period_end`, optional `period_id` (sets start/end from
the fiscal period), `include_voided`, optional `cost_center_id`
(filter).

**Output:** activity over the period, grouped by DrawerEnum:

```
Revenue (drawer=REVENUE)                       388,500.00
  411000 Sales Revenue                         380,000.00
  …

Cost of Sales (drawer=COST_OF_SALES)         (255,000.00)
  512000 Inventory COGS                       (210,000.00)
  …

Gross Profit                                   133,500.00
Gross Margin %                                      34.4%

Operating Costs (drawer=OPERATING_COST)        (92,500.00)
  611000 Salaries                              (58,000.00)
  …

Operating Income (EBIT)                         41,000.00

Other Income (drawer=OTHER_INCOME)               8,500.00
Non-Operating (drawer=NON_OPERATING)            (2,150.00)
Taxation (drawer=TAXATION)                      (8,500.00)

Net Income                                      38,850.00
```

**Computation rules:**

- Activity is the period delta — JEs where `period_start <= jeDate
  <= period_end`.
- Grouping uses DrawerEnum directly; the standard ordering is
  REVENUE → COST_OF_SALES → (Gross Profit) → OPERATING_COST →
  (EBIT) → OTHER_INCOME → NON_OPERATING → TAXATION → Net Income.
- Sub-rows expand to header accounts within each drawer; further
  expansion drills to leaf accounts (same hierarchy walk as BS).
- Comparative columns fire as parallel queries via `asyncio.gather`.
- Cost-centre filter applies at the JE line level using
  T-057-1a's `costCenterId` column on `journal_entry_lines`.

### 4.3 Cash Flow (`GET /reports/cash-flow`)

**Inputs:** same as Income Statement.

**Method: indirect.**

**Output:**

```
Cash Flow from Operating Activities
  Net Income                                    38,850.00
  Adjustments for non-cash items:
    + Depreciation (Accumulated Depn delta)      4,500.00
    + Amortisation                                   0.00
    + EOSB provision delta                         500.00
  Changes in working capital:
    + Increase in AP (221000)                    8,200.00
    − Increase in AR (124000)                   (6,100.00)
    − Increase in Inventory (121000)           (12,500.00)
    + Decrease in Prepayments (123000)             500.00
  Net Cash from Operations                      33,450.00

Cash Flow from Investing Activities
  − Purchase of PPE (110000-* delta)          (15,000.00)
  Net Cash from Investing                     (15,000.00)

Cash Flow from Financing Activities
  + Loan Drawdown (211000-001 delta)           10,000.00
  − Loan Repayment (224000-002 delta)          (3,000.00)
  − Dividends Paid                             (5,000.00)
  Net Cash from Financing                       2,000.00

Net Change in Cash                              20,450.00
Cash at Beginning (126000 sum @ period_start)   92,050.00
Cash at End (126000 sum @ period_end)          112,500.00
```

**Computation rules:**

- **Operating** = net income + non-cash adjustments + working
  capital deltas. Non-cash accounts flagged via
  `accounts.cashFlowCategory='non_cash_adjustment'`; working
  capital accounts flagged `'working_capital'`.
- **Investing** = period activity on `cashFlowCategory='investing'`
  accounts.
- **Financing** = period activity on `cashFlowCategory='financing'`
  accounts (loans, share capital, dividends).
- **Cash at beginning/end** = balance of all
  `cashFlowCategory='cash'` accounts at the date (these are the
  126000-* accounts).
- **Validation:** `Net Change in Cash ≈ End Cash - Beginning Cash`
  (tolerance ≤ 0.01 AED). Mismatch → warning banner.

## 5. Period close + closing JE (Phase D.5)

Wave 2 includes the **minimum period-close machinery** the
statutory statements depend on. The full Phase D.5 ticket lands
inside Wave 2:

**Backend:**
- `_resolve_fiscal_period_or_raise(jeDate)` already exists; extend
  to refuse postings to periods with `status='closed'` (currently
  only refuses `status='locked'` per existing semantics; verify).
- New endpoint `POST /api/v1/finance/periods/{periodId}/close`
  (super_admin / finance_admin). Steps atomically:
  1. Validate: all events in the period are posted (no pending
     outbox events for this period).
  2. Validate: trial balance for the period is balanced
     (`Σ DR == Σ CR` within tolerance).
  3. **If the period contains the fiscal year-end:** auto-post the
     closing JE (DR 312000-002 / CR 312000-001 for net income, or
     reversed for net loss).
  4. Set `period.status='closed'`, `period.closedAt=now`,
     `period.closedByUserId=current_user`.
- New endpoint `POST /api/v1/finance/periods/{periodId}/reopen`
  (super_admin only) — reverses the closing JE (re-using the
  existing JE reversal mechanism) and sets `status='open'`. Audit
  logged.

**Frontend:**
- Existing `/finance/periods` page gains "Close Period" and
  "Reopen Period" buttons (only enabled per role + status).
- Pre-close validation results shown in a modal before the user
  confirms.

This is small (the data model exists, the JE engine exists, the
reversal engine exists). Estimated 2–3 days backend + 1 day
frontend.

## 6. Schema additions

### 6.1 `gl_accounts` table (MySQL — finance service)

**One new column:**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `cashFlowCategory` | `enum('cash','working_capital','non_cash_adjustment','investing','financing','none')` | `'none'` | Drives cash-flow line placement. `'none'` = excluded from cash flow. |

That's it. The proposed `subClassification` column from rev-1 is
not needed — DrawerEnum + hierarchy + isHeader cover it.

### 6.2 Default seed

Alembic upgrade applies `cashFlowCategory` defaults to the existing
231-account seed using a deterministic mapping by code range
(adjusted to the actual 6-digit dotted codes):

| Code prefix | Drawer | cashFlowCategory |
|---|---|---|
| `110000-*` (PPE, intangibles, ROU) | ASSETS | `investing` |
| `113000-*` (Biological Assets) | ASSETS | `investing` |
| `114000-*` (Investments) | ASSETS | `investing` |
| `121000-*` (Inventories) | ASSETS | `working_capital` |
| `122000-*` (Tax Recoverable) | ASSETS | `working_capital` |
| `123000-*` (Prepayments) | ASSETS | `working_capital` |
| `124000-*` (Trade Receivables) | ASSETS | `working_capital` |
| `125000-*` (Other Receivables) | ASSETS | `working_capital` |
| `126000-*` (Cash & Equivalents) | ASSETS | `cash` |
| `211000-*` (Long-term borrowings) | LIABILITIES | `financing` |
| `213000-*` (EOSB provision) | LIABILITIES | `non_cash_adjustment` |
| `221000-*` (Trade Payables, GR/IR) | LIABILITIES | `working_capital` |
| `222000-*` (Tax Payable) | LIABILITIES | `working_capital` |
| `223000-*` (Accruals & Deferred) | LIABILITIES | `working_capital` |
| `224000-*` (Short-term borrowings) | LIABILITIES | `financing` |
| `225000-*` (Other Current Liab) | LIABILITIES | `working_capital` |
| `311000-*` (Share Capital) | EQUITY | `financing` |
| `312000-*` (Retained Earnings) | EQUITY | `none` (closing JE absorbs) |
| `313000-*` (Reserves) | EQUITY | `financing` |
| Accounts with `"Depreciation"` or `"Amortisation"` in name | ASSETS | `non_cash_adjustment` (override) |
| All P&L drawers (REVENUE / COST_OF_SALES / etc.) | n/a | `none` |

Seed runs **automatically** in the Alembic migration; not gated
behind an admin click. A one-time review banner appears on the
Chart-of-Accounts page reading *"X accounts assigned default
cash-flow categories — review at Finance → Chart of Accounts."*

**Chart-of-Accounts UI extension:** add one column (`cashFlowCategory`)
with inline dropdown edit. super_admin / finance_admin only. On
save, invalidate the cash-flow report's TanStack query.

## 7. API endpoints

All on the finance service, mounted at
`/api/v1/finance/reports/...` and `/api/v1/finance/periods/...`,
gated by existing `_READ_ROLES` (`accountant`, `finance_admin`,
`auditor`, `admin`, `super_admin`) — except close/reopen which
gate stricter.

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/reports/balance-sheet` | read | §4.1 |
| GET | `/reports/income-statement` | read | §4.2 |
| GET | `/reports/cash-flow` | read | §4.3 |
| GET | `/reports/{statement}/drill?accountId=…` | read | Returns JE lines feeding a single row. Paginated. |
| GET | `/reports/export/{statement}?format=pdf\|xlsx` | read | Streaming download. |
| POST | `/periods/{periodId}/close` | super_admin / finance_admin | §5 — validate + close + auto-post closing JE if year-end. |
| POST | `/periods/{periodId}/reopen` | super_admin | §5 — reverse closing JE + reopen. |

Response shape: existing `SuccessResponse[T]` wrapper. Each
statement carries a `meta` block with `generatedAt`, `currency`
(always `"AED"` in v1), `asOfDate` or `periodStart`/`periodEnd`,
`comparisonPeriod` if requested, `computeMs`, and `warnings: List[str]`.

## 8. Frontend

### 8.1 New pages (all behind `<FinanceGate>`)

| Path | Component | Notes |
|---|---|---|
| `/finance/balance-sheet` | `BalanceSheetPage` | New. |
| `/finance/income-statement` | `IncomeStatementPage` | New. Distinct from `/finance/pnl`. |
| `/finance/cash-flow` | `CashFlowStatementPage` | New. |

### 8.2 Sidebar rename

Existing Finance group entry "P&L Statement" → **"Operational P&L"**
(keeps URL `/finance/pnl`). New entries inserted near Trial
Balance:

```
Finance
├── 📋 Chart of Accounts
├── ✅ Approval Rules
├── 🗂️ Posting Setup
├── 🏷️ Item GL Mapping
├── 📒 Journal Entries
├── ⚖️ Trial Balance
├── 📑 Balance Sheet            ← NEW
├── 📈 Income Statement         ← NEW
├── 💧 Cash Flow Statement      ← NEW
├── 💸 Vendor Payments
├── 📊 AP Aging
├── 📑 Vendor Sub-Ledger
├── 📅 Fiscal Periods
├── 📈 Operational P&L          ← RENAMED (was "P&L Statement")
└── 📥 Incoming Preview
```

### 8.3 Shared `<FinanceReportPage>` shell

Common controls used by all three new pages:

- Period / date selector with quick-pick (MTD, QTD, YTD, last
  closed period).
- Comparative-period toggle + selector.
- Cost-centre filter (multi-select, uses T-057-1a tagging).
- Negative-number presentation toggle (parentheses vs minus).
- Scale toggle (actual / thousands / millions).
- Export buttons (PDF, Excel).
- Drill-down modal on any line.

Each statement page provides a render-function for its
specific table; the shell handles everything else.

### 8.4 Drill-down

Click any line → modal opens with paginated JE lines for that
account / line × date range. Each row links to the existing JE
detail page. Pattern already established in Trial Balance.

### 8.5 Periods page extension (Phase D.5)

Existing `/finance/periods` page gains:
- "Close Period" button per row, with pre-close validation modal.
- "Reopen Period" button (super_admin only).
- Status badges: OPEN / CLOSED / LOCKED.

## 9. Performance

Same indexes verified for Trial Balance should cover the new
reports. Re-check during T-060.2:

- `journal_entry_lines (jeId, accountId)` — every report joins
  through this.
- `journal_entries (organizationId, companyCode, jeDate, status)`
  — date predicates.
- `journal_entries (organizationId, companyCode, periodId)`
  — period-based queries.
- `journal_entry_lines (costCenterId)` — for cost-centre filter
  on filtered queries (T-057-1a may have added this).

**Budget:** each report's `meta.computeMs` < 500 ms on the
seed tenant with 100 k JE rows. If a tenant breaches in production,
revisit materialisation (daily snapshots) in a later wave — same
deferral the rev-1 sketch proposed.

## 10. Acceptance criteria

- [ ] All three endpoints return the documented shapes for a
  seeded test org.
- [ ] BS balances: `assets ≈ liabilities + equity` (tolerance ≤
  0.01 AED).
- [ ] CF balances: `change ≈ end - beginning` (same tolerance).
- [ ] Comparative-period column renders for non-aligned periods.
- [ ] Cost-centre filter on Income Statement produces a subset
  whose total Net Income, summed across all cost centres + the
  un-tagged bucket, equals the unfiltered total.
- [ ] Drill-down on any line returns the contributing JE lines
  whose sum matches the line balance.
- [ ] Closing a fiscal-year-end period auto-posts the closing JE;
  on next BS render, `312000-002 Current Year P/(L)` is zero and
  `312000-001 Retained Earnings - Prior Years` increased by the
  rolled net income.
- [ ] Reopening a closed period reverses the closing JE via
  existing JE reversal mechanism; audit logged.
- [ ] Posting a JE into a closed period returns HTTP 422 with the
  existing "period is closed" error shape (no change to outbox
  consumer error handling).
- [ ] Excel export opens cleanly in Excel 365 + LibreOffice Calc
  with correct AED formatting.
- [ ] PDF export is single-column A4, prints without overflow.
- [ ] CoA inline edit of `cashFlowCategory` invalidates the
  cash-flow report's cached data.
- [ ] All three reports respect the Wave 0 `<FinanceGate>` and
  redirect to `/dashboard` when finance is off.
- [ ] Each report's `meta.computeMs` < 500 ms on the seed tenant.

## 11. Out of scope (deferred to later waves)

- **Manual JE UI (Park & Post pattern)** — `FINANCE_MODULE_GUIDE.md`
  Phase 4 line item. Useful but separable. Wave 2.5 candidate.
- **Opening balance entry wizard** — Phase 4 line item. Needed
  before the first audited customer migrates onto A64. Schedule
  alongside cutover work.
- **Cutover playbook for upgrading customers** — Phase 4 line item.
  Documentation + script + verification harness.
- **GR/IR reconciliation report** (Phase E.1) — parallel sub-wave.
- **Audit log surface UI** (Phase E.2) — parallel.
- **IAS 41 Biological Assets remeasurement** (Phase E.4) — separate
  domain work; not blocked on Wave 2.
- **IAS 2 Direct Labour EOSB seed account** (Phase E.3) — tiny seed
  change, can be batched with Wave 2 or done independently.
- **Searchable combobox UX** (Phase E.5) — separate.
- **Input VAT tax point per UAE Article 25** (PM item 2) — Phase D
  carry-over; not Wave 2.
- **Reverse-charge VAT** (PM item 3) — Phase D carry-over.
- **Multi-currency reporting** — guide §8.3, "v2 of finance".
- **Consolidations** — explicitly deferred in guide.
- **Budgeting / actual-vs-budget columns** — later wave.

## 12. Approver decisions (resolved 2026-05-24)

1. **P&L sidebar wording** — ✅ **"Operational P&L"** (existing,
   keeps `/finance/pnl`) + **"Income Statement"** (new,
   `/finance/income-statement`).
2. **Closing JE on period close** — ✅ **Auto-post with preview
   modal.** Close action atomically (a) validates period is
   ready, (b) shows the about-to-be-posted JE in a confirmation
   modal, (c) on confirm, writes both the JE and the
   `period.status='closed'` flip in a single MySQL transaction.
   Reopen reverses both atomically via the existing JE-reversal
   engine. Rationale: atomicity > SAP-shop familiarity for a
   system this young; preserves visibility via the preview.
3. **Cash-flow seed** — ✅ Auto-run on Alembic migration with a
   one-time review banner on Chart-of-Accounts page until
   dismissed.
4. **Negative-number presentation** — ✅ Parentheses default
   (UK/US convention); per-user override toggle in the
   `<FinanceReportPage>` shell.
5. **Excel library** — ✅ `openpyxl`. Already in many transitive
   deps; pure Python; sufficient formatting for tabular reports.
6. **PDF library** — ✅ WeasyPrint. Document the ~100 MB Docker
   footprint hit (Pango/Cairo system libs) in the finance
   service's Dockerfile when T-060.6 lands.
7. **Cost-centre filter on BS** — ✅ Enabled on all three
   statements. BS gets a footnote: *"Balance sheet by cost-centre
   is non-statutory presentation — totals reflect only JE lines
   tagged with the selected centre and will not equal the
   tenant's published BS."*
8. **Scope split** — ✅ **Wave 2 = reports + period close + closing
   JE only.** Manual JE UI + Opening Balance Wizard + Cutover
   playbook split out as **Wave 2.5** (scope when the first
   audited customer is named). Rationale: Manual JE UI is its own
   multi-day frontend project; Opening Balance Wizard is
   customer-shaped and shouldn't be built hypothetically; the
   seam between Wave 2 and 2.5 is clean (no shared schema or
   architecture).

## 13. Backlog tasks (proposed)

Umbrella task **T-060 — Wave 2: Statutory Financial Statements**
with sub-items aligned to existing phase numbering where useful:

- **T-060.1** Backend (Phase D.5) — Extend period-close enforcement
  + `POST /periods/{periodId}/close` + `POST /periods/{periodId}/reopen`
  + auto-post closing JE for fiscal-year-end periods. Audit
  logged.
- **T-060.2** Backend — `gl_accounts.cashFlowCategory` column +
  Alembic migration + idempotent seed defaults (§6.2) + CoA
  service layer reads/writes the new field.
- **T-060.3** Backend — `/reports/balance-sheet` endpoint + drill
  + hierarchy walk + `as_of_date` snapshot logic +
  current-year-P/(L) computation.
- **T-060.4** Backend — `/reports/income-statement` endpoint +
  drill + DrawerEnum grouping + Gross Profit / EBIT subtotals +
  comparative-period parallel queries.
- **T-060.5** Backend — `/reports/cash-flow` endpoint + drill +
  indirect-method computation using `cashFlowCategory`.
- **T-060.6** Backend — `/reports/export/{statement}` (PDF via
  WeasyPrint + Excel via openpyxl). Streaming.
- **T-060.7** Frontend — `<FinanceReportPage>` shell + shared
  period/date picker + cost-centre filter + drill-down modal +
  scale/negative-number controls + export buttons.
- **T-060.8** Frontend — `BalanceSheetPage`.
- **T-060.9** Frontend — `IncomeStatementPage`. Sidebar rename of
  existing P&L entry to "Operational P&L".
- **T-060.10** Frontend — `CashFlowStatementPage`.
- **T-060.11** Frontend (Phase D.5 UI) — Close/Reopen buttons on
  `/finance/periods` + pre-close validation modal.
- **T-060.12** Frontend — CoA inline edit of `cashFlowCategory` +
  one-time review banner.
- **T-060.13** Tests — backend unit tests for each computation
  (BS balances, CF reconciles, comparatives, drill-down sums) +
  closing JE round-trip + Playwright UI smoke for each page +
  close / reopen flow.
- **T-060.14** Docs — `Docs/1-Main-Documentation/Financial-Statements.md`
  (formulas, sign conventions, drill semantics, closing-JE
  behaviour) + update `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md`
  Phase 4 status + DevLog + Versioning bump.

**Estimated split:** ~7 days backend, ~5 days frontend, ~2 days
tests + docs + period-close UI.

---

## 14. After Wave 2

Per `FINANCE_MODULE_GUIDE.md` §5 + `POSTING_ENGINE_ROADMAP.md` §4:

- **Wave 2.5 (or Wave 3)** — Manual JE UI (Park & Post pattern) +
  Opening Balance Wizard + Cutover playbook. Required before the
  first audited customer migration.
- **Phase E remaining** — GR/IR reconciliation, audit log
  surfaces, IAS 41 Biological Assets, IAS 2 Direct Labour EOSB,
  searchable combobox UX.
- **Phase D carry-over** — UAE Article 25 Input VAT tax point,
  reverse-charge VAT.
- **Phase F** — Multi-step approval workflows (chain-ready
  precautions already landed 2026-05-20).
- **Later waves** — multi-currency, fixed assets / depreciation,
  bank reconciliation, actual costing, consolidations.
