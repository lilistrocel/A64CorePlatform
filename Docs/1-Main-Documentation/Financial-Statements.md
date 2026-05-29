# Financial Statements

> Wave 2 — IFRS-aligned statutory financial reporting. Last updated: 2026-05-29.

---

## Overview

This document is the reference for the three statutory financial statements shipped in Wave 2 (T-060):
Balance Sheet, Income Statement, and Cash Flow Statement. It covers the backend computation logic,
sign conventions, API contracts, period-close workflow, manual journal entry rules, and role access.

**Audience:** finance administrators, auditors, finance reviewers, developers extending the module.

| Statement | Route | Primary question answered |
|---|---|---|
| Balance Sheet | `/finance/balance-sheet` | What does the business own and owe at a point in time? |
| Income Statement | `/finance/income-statement` | How much did the business earn or lose over a period? |
| Cash Flow Statement | `/finance/cash-flow` | How did actual cash move during a period? |

All three reports compute on-demand from the General Ledger (`journal_entry_lines` joined to `journal_entries`).
No materialised / pre-computed tables are used. Finance module availability is controlled per-tenant by
`organizations.modules.financeEnabled`; when disabled the entire Finance section is hidden and all
`/api/v1/finance/*` endpoints return 503 via nginx. See
`Docs/1-Main-Documentation/Deployment-Modes.md`.

---

## The three statements

### Balance Sheet (`/finance/balance-sheet`)

**Backend source:** `services/finance/src/finance/api/v1/reports.py`

#### Time shape

Snapshot as of a single date (`as_of_date`). Every posted JE with `jeDate <= as_of_date` is accumulated.

#### Endpoint

```
GET /api/v1/finance/reports/balance-sheet
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `organization_id` | string | yes | Org UUID |
| `company_code` | string | yes | Company code |
| `as_of_date` | date (YYYY-MM-DD) | no | Snapshot date; default: today |
| `include_voided` | bool | no | Include voided JEs; default: false |
| `cost_center_id` | string (repeatable) | no | Filter JE lines to one or more cost centres; repeat for multiple: `?cost_center_id=CC1&cost_center_id=CC2` |

#### Response shape

```json
{
  "data": {
    "organizationId": "00000000-0000-0000-0000-000000000001",
    "companyCode": "AE01",
    "asOfDate": "2026-05-29",
    "generatedAt": "2026-05-29T10:00:00",
    "currency": "AED",
    "includesVoided": false,
    "rows": [
      {
        "accountId": "uuid",
        "accountNumber": "110000",
        "accountName": "Property, Plant & Equipment",
        "drawer": "ASSETS",
        "accountType": "asset",
        "parentAccountId": null,
        "isHeader": true,
        "balance": "450000.00"
      },
      {
        "accountId": "uuid",
        "accountNumber": "110000-001",
        "accountName": "Buildings & Structures",
        "drawer": "ASSETS",
        "accountType": "asset",
        "parentAccountId": "uuid-of-110000",
        "isHeader": false,
        "balance": "320000.00"
      }
    ],
    "currentYearProfitLoss": "28500.00",
    "totals": {
      "totalAssets": "650000.00",
      "totalLiabilities": "180000.00",
      "totalEquity": "470000.00",
      "totalLiabilitiesPlusEquity": "650000.00",
      "balanceDelta": "0.00"
    },
    "warnings": []
  }
}
```

All monetary amounts are Decimal strings to preserve precision across JSON serialisation.

#### Computation

1. **Aggregate JE line debits/credits per BS account** for the three BS drawers (`ASSETS`, `LIABILITIES`,
   `EQUITY`) where `jeDate <= as_of_date`. Uses a LEFT OUTER JOIN from `gl_accounts` to a filtered
   subquery so accounts with zero posted activity still appear (balance = 0).

2. **Sign convention** (natural-balance direction):
   - `ASSETS` / `EXPENSES` accounts: `balance = SUM(debit) - SUM(credit)` (positive = normal debit balance).
   - `LIABILITIES` / `EQUITY` / `REVENUE` accounts: `balance = SUM(credit) - SUM(debit)` (positive = normal credit balance).

3. **Hierarchical roll-up:** accounts carry a `parentAccountId` self-referential FK. For each leaf account,
   its balance is added upward through every ancestor header. Header rows therefore display the sum of
   all their descendant leaves. A cycle-guard of 100 hops prevents infinite loops on malformed CoA data.

4. **Current Year P/(L):** computed separately from P&L drawer activity (`REVENUE`, `COST_OF_SALES`,
   `OPERATING_COST`, `NON_OPERATING`, `OTHER_INCOME`, `TAXATION`) bounded by
   `[fiscal_year_start, as_of_date]`. The fiscal year start is derived from `CompanyCode.fiscalYearStartMonth`
   / `fiscalYearStartDay` (defaults: January 1). This live P/(L) figure is included in `totalEquity` and
   returned separately as `currentYearProfitLoss`. The frontend renders it as a synthetic row inside the
   equity section.

5. **Balance validation:** `balanceDelta = totalAssets - (totalLiabilities + totalEquity)`. A non-zero
   `balanceDelta` beyond the 0.01 AED tolerance is surfaced as a warning string inside `warnings[]`. The
   response is returned regardless — the warning does not block the report.

#### Inactive accounts

Accounts with `isActive=false` are included in BS queries if they carry a non-zero historical balance.
`isActive` governs new postings only; IFRS/GAAP requires any account with a balance to appear on the
statements. Inactive accounts accrue no new postings and drop off naturally once their balance reaches zero.

#### Drill-down

Clicking a leaf account row opens the drill-down modal. The modal fetches posted JEs via
`GET /api/v1/finance/journal-entries` filtered by company, date range, and `status=posted`, then filters
lines client-side by `accountId`. (A dedicated balance-sheet drill endpoint does not exist in v1; the
JE list endpoint is used instead.)

#### Export

`GET /api/v1/finance/reports/export/balance-sheet?format=pdf` or `?format=xlsx`.
Both are streaming downloads. PDF is rendered via WeasyPrint (server-side HTML); Excel via openpyxl.
See `services/finance/src/finance/api/v1/export.py`.

---

### Income Statement (`/finance/income-statement`)

**Backend source:** `services/finance/src/finance/api/v1/reports.py`

#### Time shape

Date range: `[period_start, period_end]` (both inclusive). Only P&L drawer accounts are included.

#### Endpoint

```
GET /api/v1/finance/reports/income-statement
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `organization_id` | string | yes | Org UUID |
| `company_code` | string | yes | Company code |
| `period_start` | date | yes | Inclusive range start |
| `period_end` | date | yes | Inclusive range end |
| `compare_period_start` | date | no | Comparison period start (must be paired with `compare_period_end`) |
| `compare_period_end` | date | no | Comparison period end |
| `include_voided` | bool | no | default: false |
| `cost_center_id` | string (repeatable) | no | Multi-value cost centre filter |

Returns 400 if `period_end < period_start` or if comparison params are partially provided.

#### Drawer order

The backend returns sections in this fixed order: `REVENUE` → `COST_OF_SALES` → `OPERATING_COST` →
`OTHER_INCOME` → `NON_OPERATING` → `TAXATION`.

#### Response shape (abridged)

```json
{
  "data": {
    "organizationId": "...",
    "companyCode": "AE01",
    "generatedAt": "2026-05-29T10:00:00",
    "currency": "AED",
    "includesVoided": false,
    "primary": {
      "periodStart": "2026-01-01",
      "periodEnd": "2026-05-29",
      "sections": [
        {
          "drawer": "REVENUE",
          "total": "185000.00",
          "rows": [
            {
              "accountId": "uuid",
              "accountNumber": "411000-001",
              "accountName": "Sales-Fresh-Vegetables",
              "drawer": "REVENUE",
              "accountType": "revenue",
              "parentAccountId": "uuid",
              "isHeader": false,
              "balance": "185000.00"
            }
          ]
        }
      ],
      "subtotals": {
        "revenue": "185000.00",
        "costOfSales": "92000.00",
        "grossProfit": "93000.00",
        "grossMarginPercent": "50.27",
        "operatingCost": "42000.00",
        "operatingIncome": "51000.00",
        "otherIncome": "1200.00",
        "nonOperating": "800.00",
        "taxation": "5000.00",
        "netIncome": "46400.00"
      }
    },
    "comparison": null,
    "warnings": []
  }
}
```

#### Subtotals computation

All subtotals are computed by the backend from drawer totals:

```
grossProfit       = revenue - costOfSales
operatingIncome   = grossProfit - operatingCost      (EBIT)
netIncome         = operatingIncome + otherIncome - nonOperating - taxation
grossMarginPercent = (grossProfit / revenue) * 100   (null when revenue == 0)
```

Each drawer total is the sum of leaf-account natural-side balances for that drawer.
Header account sums are excluded from drawer totals to prevent double-counting.

#### Sign convention

Expense accounts (`COST_OF_SALES`, `OPERATING_COST`, `NON_OPERATING`, `TAXATION`) have a
debit-natural type (`accountType=expense`). Their leaf balances are computed as
`SUM(debit) - SUM(credit)` — a positive value means a net expense. Revenue and other-income
accounts are credit-natural: `SUM(credit) - SUM(debit)`.

The frontend renders expense-drawer balances with the configured negative-display format
(parentheses or minus sign) based on context. The backend always returns the natural-side
positive balance; negative formatting is a display decision.

#### Comparative period

When `compare_period_start` + `compare_period_end` are provided, the backend runs a second identical
computation (`_compute_income_statement_period`) for the comparison date range using `asyncio`-style
sequential calls. Both results are returned in the same response (`primary` + `comparison`). The four
`compareMode` states managed by the `<FinanceReportPage>` shell are: `none` / `previous` (QoQ) /
`yoy` (same period prior year) / `custom` (user-entered dates). The shell resolves the comparison dates
before calling the endpoint; the endpoint itself has no knowledge of compare mode semantics.

---

### Cash Flow Statement (`/finance/cash-flow`)

**Backend source:** `services/finance/src/finance/api/v1/reports.py`

#### Time shape

Date range: `[period_start, period_end]` (both inclusive).

#### Endpoint

```
GET /api/v1/finance/reports/cash-flow
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `organization_id` | string | yes | Org UUID |
| `company_code` | string | yes | Company code |
| `period_start` | date | yes | Inclusive range start |
| `period_end` | date | yes | Inclusive range end |
| `include_voided` | bool | no | default: false |
| `cost_center_id` | string (repeatable) | no | Multi-value cost centre filter |

Note: the cash-flow endpoint does **not** accept `compare_period_start` / `compare_period_end` in a
single request. When comparative display is needed, the frontend fires two parallel queries (one per
period) and renders them as side-by-side columns. This differs from the Income Statement, which
accepts both periods in one call.

#### Indirect method computation

The indirect method starts from net income and works backward to cash:

```
Net Income (from P&L drawer activity for the period)
+ Non-cash adjustments (depreciation, amortisation, provisions)
+ Working capital changes (AR, inventory, AP, accruals deltas)
= Net Cash from Operating Activities

+ Net Cash from Investing Activities  (PP&E purchases/disposals)
+ Net Cash from Financing Activities  (borrowings, equity, dividends)
= Net Change in Cash
```

**Opening and closing balances:** `_balances_at_date` is called twice — once for
`period_start - 1 day` (opening) and once for `period_end` (closing). The delta for each account
is `closing_balance - opening_balance`.

**Contribution sign by account type:**
- `ASSET` accounts: `contribution = -(closing - opening)`. An asset increase is a cash outflow.
- `LIABILITY` and `EQUITY` accounts: `contribution = closing - opening`. A liability increase is a cash inflow.

#### `CashFlowCategoryEnum` bucket mapping

| Value | Bucket | Example accounts |
|---|---|---|
| `cash` | Reconciliation footer (opening/closing cash) | `126000-001 Bank Account`, `126000-002 Petty Cash` |
| `working_capital` | Operating — Changes in working capital | AR (`121000-*`), Inventory (`122000-*`), AP (`221000-*`), Accruals (`223000-*`) |
| `non_cash_adjustment` | Operating — Adjustments for non-cash items | Accumulated depreciation (`111000-*`), amortisation accounts |
| `investing` | Investing activities | PP&E purchases (`110000-*`), equity investments |
| `financing` | Financing activities | Long-term loans (`211000-*`), share capital (`311000-*`), dividends |
| `none` | Excluded entirely from CF statement | Default for new accounts, all P&L drawer accounts |

P&L accounts carry `cashFlowCategory=none` by design: their net result is already captured in
the Net Income starting line; including them again would double-count.

Lines with `contribution == 0` are omitted from section lists (keeps the report tidy). Lines with
`cashFlowCategory=none` are silently excluded.

Default categories are seeded by Alembic migration 014, keyed on `accountNumber` prefix ranges.
Operators can reclassify accounts via the Chart of Accounts page (finance_admin and super_admin only);
changing a category invalidates the TanStack Query cache for the cash-flow report.

#### Response shape (abridged)

```json
{
  "data": {
    "organizationId": "...",
    "companyCode": "AE01",
    "periodStart": "2026-01-01",
    "periodEnd": "2026-05-29",
    "generatedAt": "2026-05-29T10:00:00",
    "currency": "AED",
    "includesVoided": false,
    "operating": {
      "netIncome": "46400.00",
      "nonCashAdjustments": [
        { "accountId": "uuid", "accountNumber": "111000-001",
          "accountName": "Accumulated Depreciation", "drawer": "ASSETS",
          "contribution": "8200.00" }
      ],
      "nonCashAdjustmentsTotal": "8200.00",
      "workingCapitalChanges": [
        { "accountId": "uuid", "accountNumber": "223000-004",
          "accountName": "Goods Received Not Invoiced", "drawer": "LIABILITIES",
          "contribution": "-3100.00" }
      ],
      "workingCapitalChangesTotal": "-3100.00",
      "total": "51500.00"
    },
    "investing": { "items": [], "total": "0.00" },
    "financing": { "items": [], "total": "0.00" },
    "netChangeInCash": "51500.00",
    "cashAtBeginning": "22000.00",
    "cashAtEnd": "73500.00",
    "cashDelta": "51500.00",
    "reconciliationDelta": "0.00",
    "warnings": []
  }
}
```

#### Reconciliation and warning

`reconciliationDelta = netChangeInCash - (cashAtEnd - cashAtBeginning)`.

When `|reconciliationDelta| > 0.01 AED`, the backend appends a warning string to `warnings[]`.
The frontend renders a prominent warning banner. The most common cause is BS accounts still
classified as `none` that should have been assigned a proper bucket. The report is returned
regardless of the warning.

---

## Common UX features (the `<FinanceReportPage>` shell)

**Source:** `frontend/user-portal/src/components/finance/FinanceReportPage/FinanceReportPage.tsx`

All three statement pages use `<FinanceReportPage>` as a render-prop shell that owns the toolbar
and drill-down modal. The shell exposes `{ filters, display, openDrillDown }` to each consumer.

| Feature | Description |
|---|---|
| Scale toggle | Display amounts as: raw AED (×1) / thousands (AED '000) / millions (AED 'm) |
| Negative display toggle | Render negative amounts as parentheses `(1,234)` or minus sign `-1,234`; parentheses is the default |
| Cost centre multi-select | Selects one or more cost centres; IDs forwarded to backend as repeated `?cost_center_id=X` params |
| Compare-to dropdown | None / Previous period (QoQ) / Same period prior year (YoY) / Custom dates |
| Quick-picks | MTD / QTD / YTD / Last closed — resolve to date ranges automatically |
| Export buttons | PDF and Excel; both trigger `GET /api/v1/finance/reports/export/{statement}?format=...` and download the binary blob |
| Drill-down modal | Opens on leaf account row click; never closes on backdrop click — only the X button closes it |
| Role gating | Entire Finance section is gated by `<FinanceGate>` which reads `useCapabilities()`; when `modules.financeEnabled=false` all finance routes redirect to `/dashboard` |

---

## Period close workflow

**Backend source:** `services/finance/src/finance/api/v1/periods.py`

#### Statuses

| Status | Meaning |
|---|---|
| `open` | Postings accepted; default state |
| `closed` | No new postings; year-end closing JE posted if applicable |
| `locked` | Permanently sealed; cannot be reopened via the API |

#### Close endpoint

```
PATCH /api/v1/finance/periods/{period_id}/close?organization_id={org_id}
```

Optional query flag: `dry_run=true` — runs all validations and computes the proposed closing JE
but writes nothing. Returns a `closingJePreview` instead of `closingJe`. The `reason` field in
the request body is not required on the dry-run path.

The frontend renders the `ClosingJePreview` table in a modal before the user clicks Confirm.
Because the preview and the real write share the same compute function (`_compute_closing_je_preview`),
the proposed JE lines are guaranteed to match what is actually posted.

**Close pipeline (real close, `dry_run=false`):**
1. Refuse if period is not `open` (409 Conflict).
2. Validate that all posted JEs in the period balance (`Σ DR == Σ CR ± 0.01 AED`).
3. Compute the proposed closing JE (pure, no writes).
4. If this period is the fiscal year-end **and** `|net_income| > 0.01 AED`, persist the closing JE.
5. Flip `period.status` to `closed`; populate audit fields; clear any prior reopen-trail fields.
6. Write an `audit_log` row (`action=CLOSE`, `entityType=FiscalPeriod`).

All steps run in a single MySQL transaction.

#### Year-end detection

A period is the fiscal year-end when `period.endDate == MAX(endDate)` across all periods in the
same `(companyCode, fiscalYear)`. The check is calendar-agnostic: it works for standard calendar
years, August-start agricultural years, and 4-4-5 calendars without hard-coding any month.

#### Closing JE

For a profitable year: `DR 312000-002 Current Year P/(L)` / `CR 312000-001 Retained Earnings`.
For a loss year: directions are reversed.

After close, the Balance Sheet renders `312000-002` balance as 0 (the net income has been swept
into `312000-001`). Mid-year (monthly) closes do not post a closing JE — only the status flips.

#### Reopen endpoint

```
PATCH /api/v1/finance/periods/{period_id}/reopen?organization_id={org_id}
```

Body: `{ "reason": "..." }` (required, 5–500 chars).

The reopen pipeline:
1. Refuse if period is `open` (409) or `locked` (423).
2. Flip status to `open`; populate reopen audit fields; clear close-trail fields.
3. If a closing JE was posted for this period, post an offsetting reversal JE. The original
   stays `posted`; the pair nets to zero. The reversal carries `sourceEventType=period_close_reversal`.
4. Write an `audit_log` row (`action=REOPEN`).

#### Closing into a closed period

`_resolve_fiscal_period_or_raise` (called by all posting handlers, including manual JEs) returns
HTTP 400 if the `jeDate` falls in a closed period. Posting is rejected at the application layer.

---

## Manual journal entries

**Backend source:** `services/finance/src/finance/api/v1/journal_entries.py`

#### Endpoint

```
POST /api/v1/finance/journal-entries
```

**Roles:** `finance_admin`, `super_admin` only. `admin` and `finance_reviewer` cannot post manual JEs.

#### Request body

```json
{
  "organizationId": "00000000-0000-0000-0000-000000000001",
  "companyCode": "AE01",
  "jeDate": "2026-05-15",
  "description": "Depreciation adjustment — May 2026",
  "reason": "Monthly depreciation for Building A",
  "lines": [
    {
      "accountId": "uuid-of-expense-account",
      "debit": "5000.00",
      "credit": null,
      "description": "Depreciation expense",
      "costCenterId": "CC001",
      "referenceLineId": null
    },
    {
      "accountId": "uuid-of-accumulated-depreciation",
      "debit": null,
      "credit": "5000.00",
      "description": "Accumulated depreciation"
    }
  ]
}
```

#### Validation rules

| Rule | Error |
|---|---|
| Minimum 2 lines | 422 |
| Each line has exactly one of `debit` / `credit` (not both, not neither) | 422 |
| `SUM(debit) == SUM(credit)` | 422 |
| `reason` non-empty, non-whitespace | 422 |
| `jeDate` falls in an open fiscal period | 400 |
| Account exists in org's CoA | 422 |
| Account `isHeader=true` | 422 (posting to header accounts is rejected) |
| Account `isActive=false` | Allowed; produces a `meta.warnings` entry |
| `costCenterId` (if provided) must be active for the org | 422 |

#### Audit

An `audit_log` row is written for every successfully posted manual JE
(`action=manual_je_posted`, `entityType=JournalEntry`). The `afterJson` field stores a SHA-256
payload hash of the request body for tamper-evidence, plus the JE number and actor.

#### Common use cases

- Corrections and reclassifications
- Depreciation and amortisation entries
- Accruals (month-end)
- Opening balance setup
- FX revaluation adjustments
- GR/IR clearing (when `223000-004 Goods Received Not Invoiced` needs manual cleanup)

---

## Posting setup safety

**Backend source:** `services/finance/src/finance/api/v1/company.py`

The Company Posting Setup (`PUT /api/v1/finance/companies/{company_code}/posting-setup`) carries
10 clearing-account FK fields. Two guards protect every field change:

#### 1. Semantic type guard (422 Unprocessable Entity)

Each field requires the selected account to have a specific drawer and `accountType` combination.
Type errors return 422; this check runs before the balance guard.

| Field | Required drawer | Required `accountType` |
|---|---|---|
| `apControlAccountId` | LIABILITIES | liability |
| `arControlAccountId` | ASSETS | asset |
| `bankAccountId` | ASSETS | asset |
| `cashAccountId` | ASSETS | asset |
| `grIrClearingAccountId` | LIABILITIES | liability |
| `inputVatAccountId` | ASSETS | asset |
| `outputVatAccountId` | LIABILITIES | liability |
| `retainedEarningsAccountId` | EQUITY | equity |
| `purchasePriceVarianceAccountId` | COST_OF_SALES or OPERATING_COST | expense |
| `roundingAccountId` | OPERATING_COST | expense |

Header accounts (`isHeader=true`) are unconditionally rejected for all fields.

#### 2. Balance guard (409 Conflict)

If the old clearing account already carries a non-zero posted balance for the company, the
reassignment is rejected. The operator must post a correcting JE to clear the old account before
the reassignment can proceed.

The GR/IR account (`223000-004 Goods Received Not Invoiced`) was reclassified from Trade Payables
(`221000-002`) to Accrued Liabilities per IAS 37 / IAS 2 — goods received but not yet invoiced
are accrued liabilities, not trade payables. See `services/finance/src/finance/db/seeds/default_coa.py:108`.

---

## Inactive-account behaviour

Reports (Balance Sheet, Income Statement, Cash Flow, Trial Balance) include inactive accounts that hold
non-zero historical balances. The `isActive` flag on `gl_accounts` controls whether new postings are
accepted, not whether historical balances appear on statements. Per IFRS/GAAP, any account with a
balance must appear regardless of active status.

The manual JE form allows posting to inactive accounts (for cleanup/zero-out entries) with a warning
returned in `meta.warnings`. No confirmation gate is implemented on the backend; the frontend
displays the warning inline.

---

## Role matrix

| Role | BS/IS/CF view | Export | Drill-down | Manual JE post | Close/Reopen | Audit log |
|---|---|---|---|---|---|---|
| `super_admin` | yes | yes | yes | yes | yes | yes |
| `finance_admin` | yes | yes | yes | yes | yes | yes |
| `admin` | yes | yes | yes | no | yes | yes |
| `accountant` | yes | yes | yes | no | no | yes |
| `auditor` | yes | yes | yes | no | no | yes |
| `finance_reviewer` | no | no | no | no | no | yes |

`finance_reviewer` can read audit log entries only. Finance routes are hidden when the tenant's
`modules.financeEnabled` flag is false, regardless of role.

---

## Cross-references

- `Docs/4-Finance-Mod-docs/FINANCE_MODULE_GUIDE.md` — operational P&L and full finance module
  operational guide; Phase 4 covers statutory financial statements.
- `Docs/1-Main-Documentation/Deployment-Modes.md` — finance is opt-in per tenant via
  `modules.financeEnabled`; the finance docker-compose profile.
- `Docs/1-Main-Documentation/Versioning.md` — Wave 2 corresponds to v1.19.x.
- `Docs/1-Main-Documentation/API-Structure.md` — full endpoint registry including finance endpoints.
- `Docs/4-Finance-Mod-docs/POSTING_ENGINE_ROADMAP.md` — Wave 2 maps to Phase D.5 of the roadmap.

---

## Document history

| Date | Author | Change |
|---|---|---|
| 2026-05-29 | Viet Anh | Initial version — Wave 2 closing |
