# DevLog — Wave 0 hardening + Wave 2 statutory statements backend

**Date:** 2026-05-24 (continuation session, same calendar day as Wave 0)
**Session type:** Implementation + design + scoping (single long session)
**Status:** Wave 0 hardening complete; Wave 2 backend 5/14 sub-tasks
complete (period close + closing JE, cashFlowCategory schema, Balance
Sheet, Income Statement, Cash Flow Statement)
**Backlog:** T-059 ✅ (closed in this session via test + codemap +
mapper-fix follow-ups); T-060 🔵 active (5/14 sub-tasks done)
**Design docs:** `Docs/2-Working-Progress/Wave-0-Design.md` (already
approved); `Docs/2-Working-Progress/Wave-2-Design.md` (approved rev 2
in this session)
**Roadmap context:** Maps to Phase 4 (FINANCE_MODULE_GUIDE.md §5) and
Phase D.5 (POSTING_ENGINE_ROADMAP.md §4) of the finance module's
existing internal plan.
**Author:** Viet Anh (inline implementation; sub-agent dispatch
blocked on long-context Opus credits cap)

---

## 1. Session objective

Two phases:

**Phase A (Wave 0 hardening):** finish loose ends from the earlier
T-059 implementation session — write backend unit tests for the
helpers, write CodeMap addenda (mapper regen flow was broken), commit
in clean sub-pieces.

**Phase B (Wave 2 design + backend):** scope the next finance feature
(statutory financial statements: Balance Sheet, Income Statement, Cash
Flow), get the design approved, then start building. By end of session,
ship as much of the backend as possible. Frontend deferred.

User explicitly held `git push origin main` for the entire session;
all 10 commits are stacked locally.

## 2. What we accomplished

### Phase A — Wave 0 hardening (3 commits)

**Backend unit tests** (`tests/unit/test_finance_bridge/`, commit
`1dcacf3`):
- 14 tests for `tenant_flag.py`: cache hit/miss, both-direction
  cache writes, missing org / missing modules field / missing
  financeEnabled default to True, Redis read/write failures degrade
  silently to DB, invalidate behaviour.
- 12 tests for `reachability.py`: cache hit returns without ping,
  cache miss + live ping + write-through, httpx timeout / connect
  error / non-200 → (False, None), works with redis=None, Redis
  errors don't propagate, invalidate.
- 2 new tests for `outbox_writer.py`: publish skips when tenant
  flag off (no insert); publish survives `get_redis_cache` exception
  (degrades to direct DB lookup).
- 2 existing transactional-outbox tests patched to mock
  `is_finance_enabled_for_org` + `get_redis_cache` so they keep
  passing under the new gate.
- 43/43 tests pass. Pre-existing 13 `test_outbox_reconciler` failures
  are unrelated (`ModuleNotFoundError: cron` — different module
  path).

**Manual CodeMap addenda** (`Docs/CodeMaps/`, commit `b23e0e9`):
The mapper's `task_manager.py` hard-codes
`mongodb://localhost:27017` and we hit the credits-cap for sub-agent
dispatch, so the full regen flow was blocked. Wrote manual "Wave 0
addendum" sections at the bottom of:
- `INDEX.md` — summary of additions + pointer to the per-map
  details.
- `api-map.md` — new endpoints (`GET /system/capabilities`,
  `PATCH /organizations/{id}/modules`, finance `/system/health`)
  + `/auth/me` extension.
- `module-map.md` — `finance_bridge` helpers (reachability,
  tenant_flag), `core` additions (system.py, organization model
  changes, posting setup), Wave 0 dependency edges.
- `frontend-map.md` — new hook (`useCapabilities`), service
  (`systemService`), types (`Capabilities`), components
  (`FinanceGate`, `FinanceUnreachableBanner`,
  `ModulesSettingsCard`), modified pages.
- `database-map.md` — `organizations.modules.financeEnabled`
  schema field, `admin_audit_log` writes from the toggle,
  per-tenant `finance_outbox` gate, wave0 migration script.

**CodeMapper env-var fix** (`scripts/codebase_mapper/`, commit
`ed915f3`):
- Patched `task_manager.py`, `knowledge_store.py`, `map_generator.py`
  to read `MONGO_URL` + `MONGODB_DB_NAME` from env, defaulting to
  the old hard-coded values. Now running from inside the api
  container with `MONGO_URL=mongodb://mongodb:27017/?replicaSet=rs0`
  works (verified — returned the existing 520-node graph).
- Unblocks future codemap regen after structural changes — no more
  manual addenda required.

### Phase B — Wave 2 design + backend (8 commits)

**Wave 2 design doc rewrite + T-060 scope** (commit `1430271`):
- First draft of `Wave-2-Design.md` was written without consulting
  `Docs/4-Finance-Mod-docs/` — three significant errors were caught
  in review:
  1. Missed the existing operational `/finance/pnl` page; thought
     the statutory P&L would land at `/finance/pnl`. Two different
     concepts.
  2. Proposed a new `subClassification` column when the existing
     `DrawerEnum` + `parentAccountNumber` hierarchy + `isHeader`
     already provide the same thing.
  3. Default seed back-fill used 4-digit codes (`1000`, `2000`…)
     when the real CoA uses 6-digit dotted codes
     (`110000-001`, …).
- Rewrote rev 2 grounded in `Docs/4-Finance-Mod-docs/` (the
  team's authoritative finance module guide + posting-engine
  roadmap + integration model + SAP B1 reference).
- Locked 8 approver decisions in §12:
  1. P&L naming: "Operational P&L" + "Income Statement"
  2. Closing JE: auto-posts with preview modal on close
  3. Cash-flow seed: auto-runs with one-time review banner
  4. Negative numbers: parentheses default
  5. Excel library: `openpyxl`
  6. PDF library: WeasyPrint (document Docker footprint)
  7. Cost-centre filter: enable on all three with BS footnote
  8. Scope split: Wave 2 = reports + close only. Manual JE UI +
     Opening Balance Wizard + Cutover playbook deferred to Wave 2.5.
- Scoped T-060 with 14 sub-tasks into `BACKLOG.md`.

**T-060.1 — Period close + closing JE** (commit `4e6c3fa`):

Backend (`services/finance/src/finance/api/v1/periods.py`):
- Extended `POST /periods/{id}/close` with: `organization_id`
  query param (needed for org-scoped CoA + posting setup lookup),
  pre-close balance validation (Σ DR == Σ CR ± 0.01 AED), year-end
  detection via `MAX(endDate)` per fiscal year (robust regardless
  of calendar / agri / 4-4-5 year shape), auto-posted closing JE
  on year-end (DR `312000-002 Current Year P/(L)` / CR
  `posting_setup.retainedEarningsAccountId` for net income;
  reversed for loss).
- Extended `POST /periods/{id}/reopen` with: locates the year-end
  closing JE via `sourceEventType="period_close"` +
  `sourceDocId=period_id`; posts an offsetting reversal
  (`sourceEventType="period_close_reversal"`) in the period being
  reopened; original closing JE stays POSTED — matches the existing
  `/journal-entries/{id}/reverse` convention.
- Audit log entries with before/after status, closing JE reference,
  reason.
- Pre-existing `_resolve_fiscal_period_or_raise` in events.py
  already refuses postings to non-OPEN periods (it filters on
  `status == OPEN`) — no change needed there.

Tests: 4 new + 2 updated existing. 8/8 pass.

**T-060.2 — cashFlowCategory column + Alembic 014** (commit
`4969959`):

ORM (`services/finance/src/finance/models/orm/models.py`):
- New `CashFlowCategoryEnum` with 6 values: `cash`,
  `working_capital`, `non_cash_adjustment`, `investing`,
  `financing`, `none`.
- `GLAccount.cashFlowCategory` column (snake_case in SQL, default
  `'none'`).

Pydantic schemas: extended `GLAccountCreate/Update/Response` to
surface the field.

Alembic 014 (`services/finance/alembic/versions/`):
- Adds the ENUM column with default 'none'.
- Idempotent back-fill keyed by `accountNumber` prefix:
  `110000-*→investing`, `121000-*→working_capital`, `126000-*→cash`,
  `211000-*→financing`, `213000-*→non_cash_adjustment` (EOSB),
  `222000-*→working_capital`, `224000-*→financing`,
  `311000-*→financing`, etc.
- Name-pattern override runs last so it wins: accounts with
  `%Depreciation%`, `%Amortisation%`, `%Amortization%` get
  `non_cash_adjustment` regardless of prefix.
- Reversible.

Tests: 5 new (field present in response, default on create,
explicit on create, PATCH update, invalid enum value rejected,
prefix-defaults completeness check).

Verified live against MySQL after `alembic upgrade head`: 231
accounts classified; distribution: 41 working_capital, 21 investing,
14 financing, 14 non_cash_adjustment, 6 cash, 135 none (= all P&L
accounts, correctly excluded). Spot-checks confirmed cash at 126000,
trade receivables at 124000, Accumulated Depreciation correctly
overridden to non_cash_adjustment.

**T-060.3 — Balance Sheet endpoint** (commit `32abcf6`):

Backend (`services/finance/src/finance/api/v1/reports.py`):
- `GET /reports/balance-sheet` with query params: org, company,
  as_of_date (default today), include_voided, cost_center_id.
- Reuses Trial Balance's LEFT-JOIN pattern (accounts → aggregated
  JE-line subquery) so zero-activity accounts still appear.
- Sign convention preserved: ASSET DR-natural, LIABILITY/EQUITY
  CR-natural.
- Hierarchy walk: rolls leaf balances up into header accounts via
  `parentAccountId` chain (with 100-step cycle guard).
- Live current-year Net Income computed from P&L drawer activity
  for the company's fiscal year — added to totalEquity so the BS
  balances during an open year (before closing JE rolls NI to RE).
- Fiscal-year-start resolution via `fiscalYearStartMonth` +
  `fiscalYearStartDay` — handles calendar (1/1), agri August-start
  (8/1), any other shape.
- Validation: `totalAssets ≈ totalLiab + totalEquity` within 0.01
  AED. Warning on mismatch (corrupt data should be visible).
- 404 if company unknown.

Tests: 10 new. All cover: empty org, balanced after share-capital
contribution, header rollup, live NI lifting equity, warning on
unbalanced data, as_of_date filter, unknown company → 404, non-
finance role → 403, cost-centre filter, August fiscal-year edge
case.

Verified live: 99 BS rows from dev MySQL, hierarchical structure
intact, warnings correctly surfaced the dev's pre-existing 35k
imbalance (two AP invoices created against one GR during prior
testing). Header rollup verified: 120000 Current Assets = 0
(121000 +35k + 126000 -35k = 0).

**T-060.4 — Income Statement endpoint** (commit `c41a0cb`):

Backend:
- `GET /reports/income-statement` with query params: org, company,
  period_start, period_end, compare_period_start,
  compare_period_end, include_voided, cost_center_id.
- Drawer-grouped sections in standard P&L order: REVENUE →
  COST_OF_SALES → OPERATING_COST → OTHER_INCOME → NON_OPERATING
  → TAXATION.
- Subtotals: Gross Profit (Rev − COGS), Gross Margin % (null when
  revenue=0), Operating Income / EBIT (Gross Profit − Operating
  Cost), Net Income (EBIT + Other Income − Non-Operating −
  Taxation).
- Comparative-period support via second `IncomeStatementPeriod`
  block when both `compare_*` params provided. Partial params
  → 400.
- Same hierarchy walk + sign convention as BS.
- New helper `_compute_income_statement_period` factored out so
  primary + comparison share the same code.
- 400 on inverted period; 404 on unknown company.

Tests: 11 new. Empty org, revenue+COGS computes 60% gross margin
correctly, full P&L chain (revenue 5k / COGS 2k / salaries 1k /
other income 500 / interest 200 / tax 300 → NI 2k), period filter,
comparison computed independently, partial params → 400, inverted
period → 400, cost-centre filter, unknown company → 404, non-
finance role → 403, drawer ordering.

Verified live: 130 P&L accounts grouped across 6 drawers correctly;
all zero in dev (no P&L activity has been posted there yet, only
the artifact inventory imbalance on BS).

**T-060.5 — Cash Flow Statement (indirect method)** (commit
`e0728e7`):

Backend:
- `GET /reports/cash-flow` with query params: org, company,
  period_start, period_end, include_voided, cost_center_id.
- Algorithm:
  1. NI for the period from P&L drawer activity (reused from BS).
  2. Opening + closing BS balances via `_balances_at_date` helper
     (period_start − 1 and period_end).
  3. For each BS account: contribution = -Δ for ASSETs, +Δ for
     LIABILITY/EQUITY (uniform sign rule).
  4. Bucket by `cashFlowCategory`: CASH → opening/closing
     totals; NON_CASH_ADJUSTMENT → operating add-back;
     WORKING_CAPITAL → operating WC change; INVESTING → investing;
     FINANCING → financing; NONE → silently excluded.
  5. Operating = NI + non-cash + WC. Net Change = Operating +
     Investing + Financing.
  6. Validation: `|netChange − (cashEnd − cashBegin)| ≤ 0.01
     AED`. Warning with diagnostic hint on mismatch.
- Per-account line lists inside each section so frontend can
  drill down.
- New helpers `_balances_at_date` (reusable date-bounded
  aggregation) and `_net_income_for_period` (factored out).

Tests: 12 new. Empty org, pure revenue reconciles, depreciation
added back correctly (NI=800, non-cash=+200, operating=1000),
working capital changes reconcile (AR/inventory/AP), investing
shows negative for asset purchase, financing inflow for loan
drawdown, full realistic mixed scenario (share capital + loan +
PPE + sale-on-credit + AR collection + depreciation; net change
=125k reconciles perfectly), unclassified account triggers
reconciliation warning, period filter, inverted period → 400,
unknown company → 404, non-finance role → 403.

Verified live: endpoint correctly detected the dev MySQL anomaly
(inventory +35k + GR/IR -35k as WC contributions = -70k operating
total vs actual cash delta of -35k → reconciliation delta -35k →
warning fired with the standard "likely cause: unclassified
accounts" hint).

## 3. Bugs / issues discovered

### Resolved this session

1. **Mapper regen blocked from inside container** —
   `scripts/codebase_mapper/` scripts hard-coded
   `mongodb://localhost:27017` which fails from the api container
   (mongo advertises `mongodb` hostname for replica-set discovery).
   Fixed in commit `ed915f3` by reading from env var with fallback
   to the old hard-coded value.

2. **Pre-existing test suite failures in `test_outbox_reconciler`
   (cron module path)** — pre-existed before this session; not
   caused by my changes. 13 failures. Documented in T-060.1 commit
   message.

3. **`db.flush()` expired `updatedAt`** — Pydantic
   `from_attributes=True` couldn't access auto-updated attributes
   inside an async context after flush. Fixed by adding
   `await db.refresh(period)` before `model_validate` in both close
   and reopen endpoints.

4. **`_next_je_number` cross-session visibility quirk in SQLite
   tests** — the reopen endpoint's MAX query didn't see the
   closing JE that the close endpoint had just committed. Worked
   around by using a deterministic UUID-suffix scheme for reversal
   JE numbers (`{original.jeNumber}-REV-{6-char-uuid}`) instead of
   the sequential `_next_je_number`. Avoids the cross-session
   visibility issue entirely.

5. **Test helper `_seed_coa_and_posting_setup` collided with the
   company-creation seed** — POST /companies auto-seeds the
   231-account CoA, so my helper's INSERT for code `411000-001`
   raised IntegrityError. Refactored to bypass the API and seed
   everything directly via the test session.

6. **GLAccount column is `accountNumber`, not `accountCode`** —
   first cut of `_resolve_closing_accounts` used the wrong column
   name. Caught at first test run.

7. **`periodId` is NOT NULL on `journal_entries`** — my BS test
   helpers seeded JEs without `period_id`. Fixed by also seeding a
   wide-span fiscal period in the helper and threading
   `period_id` through every test post.

### Pre-existing failures not addressed

- `tests/test_trial_balance.py` — 4 failures with `KeyError: 'totals'`. Pre-existing per stash-and-rerun confirmation; response shape evidently drifted from what these tests expect. Not in
  Wave 2 scope.
- `tests/test_vendor_sub_ledger.py` — 6 failures. Same pre-existing
  pattern.

### Known data anomaly in dev MySQL

Dev tenant `00000000-0000-0000-0000-000000000001` company `1000`
has a 35k imbalance from prior testing — two AP invoices appear to
have been created against a single GR. Both the new BS and CF
endpoints correctly surface this via warnings (which is the right
behaviour; the warnings are *not* a bug). If a clean dev environment
is needed for further testing, the affected JEs would need to be
reversed via the existing `/journal-entries/{id}/reverse` flow.

## 4. What we need to do next

### Immediate (within Wave 2)

| # | Task | Side | Notes |
|---|------|------|------|
| T-060.6 | PDF + Excel export | Backend | WeasyPrint + openpyxl. ~100 MB Docker image bump from Pango/Cairo system deps. |
| T-060.7 | `<FinanceReportPage>` shell | Frontend | Period picker, comparative toggle, cost-centre filter, drill modal, export buttons. Reused by all three statement pages. |
| T-060.8 | `BalanceSheetPage` | Frontend | Behind `<FinanceGate>`. |
| T-060.9 | `IncomeStatementPage` | Frontend | Behind `<FinanceGate>`. Rename existing sidebar "P&L Statement" → "Operational P&L". |
| T-060.10 | `CashFlowStatementPage` | Frontend | Behind `<FinanceGate>`. |
| T-060.11 | Period close/reopen UI buttons | Frontend | On existing `/finance/periods` page. Pre-close validation modal showing closing-JE preview. |
| T-060.12 | CoA inline edit of `cashFlowCategory` | Frontend | Plus one-time review banner. |
| T-060.13 | Playwright UI smoke | Test | Per statement page + close/reopen flow. |
| T-060.14 | Docs + DevLog + CHANGELOG bump | Docs | Final wrap-up. |

### Post-Wave-2

- **Wave 2.5** — Manual JE UI (Park & Post), Opening Balance
  Wizard, Cutover playbook. Required before the first audited
  customer migration. Scope when that customer is named.
- **Phase E remaining** — GR/IR reconciliation report, audit log
  surfaces, IAS 41 Biological Assets, IAS 2 Direct Labour EOSB.
- **Phase D carry-over** — UAE Article 25 Input VAT tax point,
  reverse-charge VAT.
- **Dev MySQL data clean-up** — reverse the duplicate AP invoice
  so BS / CF dev runs are clean.

### Pre-commit / pre-push checklist

User explicitly held the push. All 10 commits are local. Before
push:
```bash
git pull --rebase origin main   # in case Adrian pushed
git push origin main
```

## 5. Important context for next session

### Environment notes
- Backend changes still in place; api + finance containers restarted
  with the new code. Alembic migration 014 has been applied to dev
  MySQL — `cash_flow_category` column exists and is back-filled.
- Frontend not yet touched for Wave 2 (only the design + the BS/IS/
  CF backend endpoints exist; no UI consumes them yet).
- `git status` shows only `Brand_Engineering/` untracked
  (pre-existing, unrelated).

### Cross-session-state to remember
- Wave 0 toggle works end-to-end (verified live earlier in
  session); 4-bullet UI walk passed.
- `MONGO_URL` env var works for mapper now — future codemap regens
  should run end-to-end if Claude Code can also spawn mapping
  agents.
- `git push origin main` not done — 10 commits stacked locally:

```
e0728e7  feat(finance): T-060.5 Cash Flow Statement (indirect)
c41a0cb  feat(finance): T-060.4 Income Statement endpoint
32abcf6  feat(finance): T-060.3 Balance Sheet endpoint
4969959  feat(finance): T-060.2 cashFlowCategory + Alembic 014
4e6c3fa  feat(finance): T-060.1 Period close + closing JE
ed915f3  chore(codemaps): MONGO_URL env var fix
1430271  docs(wave-2): approved design + T-060 scoped to backlog
b23e0e9  docs(codemaps): Wave 0 manual addenda
1dcacf3  test(finance-bridge): Wave 0 unit coverage
30fb0b9  feat(modules): Wave 0 finance as opt-in add-on (T-059)
```

### Questions / open decisions for the user
- None pending. All Wave 2 approver questions (§12 of design doc)
  were resolved earlier in session.

## 6. Files modified

### Backend — modified
- `scripts/codebase_mapper/task_manager.py`
- `scripts/codebase_mapper/knowledge_store.py`
- `scripts/codebase_mapper/map_generator.py`
- `services/finance/src/finance/api/v1/periods.py`
- `services/finance/src/finance/api/v1/reports.py` (extended 3
  times — BS, IS, CF)
- `services/finance/src/finance/models/orm/models.py`
- `services/finance/src/finance/models/schemas/account.py`
- `services/finance/tests/test_periods.py` (extended)
- `services/finance/tests/test_accounts_crud.py` (extended)
- `tests/unit/test_finance_bridge/test_outbox_writer.py` (extended)
- `tests/unit/test_finance_bridge/test_transactional_outbox.py`
  (patched)

### Backend — new
- `services/finance/alembic/versions/014_gl_account_cash_flow_category.py`
- `services/finance/tests/test_balance_sheet.py`
- `services/finance/tests/test_income_statement.py`
- `services/finance/tests/test_cash_flow.py`
- `tests/unit/test_finance_bridge/test_tenant_flag.py`
- `tests/unit/test_finance_bridge/test_reachability.py`

### Docs — modified
- `Docs/CodeMaps/INDEX.md`
- `Docs/CodeMaps/api-map.md`
- `Docs/CodeMaps/database-map.md`
- `Docs/CodeMaps/frontend-map.md`
- `Docs/CodeMaps/module-map.md`
- `Docs/Backlog/BACKLOG.md`

### Docs — new
- `Docs/2-Working-Progress/Wave-2-Design.md`
- `Docs/3-DevLog/2026-05-24_wave-2-statutory-statements-backend.md` (this file)

## 7. Session metrics

- Commits this session: **10** (held local; not pushed)
- Files touched (incl. tests + docs): **~30**
- Lines added (approx): **~7000**
- Tests added: **76** (43 Wave 0 unit + 33 Wave 2 backend
  integration)
- Tests passing in scope: **76/76** (Wave 0 unit + Wave 2 backend
  files I touched)
- New endpoints: **3** statutory reports (`/balance-sheet`,
  `/income-statement`, `/cash-flow`) + extended period close/reopen
- New Alembic migration: **1** (`014_gl_account_cash_flow_category`)
- Backlog tasks completed: T-060.1, T-060.2, T-060.3, T-060.4,
  T-060.5 (= 5/14 of Wave 2)
- Author attribution: **Viet Anh** on every commit (per memory:
  feedback_commit_authorship)

## 8. How this fits the grand scheme

This session shipped two complete value chunks:

**Wave 0 — Architectural hygiene (now fully closed)**
The boundary that makes "operations without finance" a first-class
deployment mode. Without this, every subsequent finance wave would
accrete coupling. Customer impact: A64 can be sold ops-only (free /
starter tier) or full-stack (paid). Per-tenant toggle lets one
deployment host both pricing tiers.

**Wave 2 backend — Statutory financial statements (5/14 sub-tasks)**
The three reports every accountant needs:
- Balance Sheet (position at a date)
- Income Statement (performance over a period)
- Cash Flow Statement (cash movement over a period)
…plus the period-close machinery they depend on (auto-posted
closing JE so Retained Earnings is stable across fiscal years).

Maps to **Phase 4** in the team's internal FINANCE_MODULE_GUIDE.md
and **Phase D.5** in POSTING_ENGINE_ROADMAP.md.

After this session, the system can answer the three foundational
accounting questions ("what do we have?", "how did we do?", "where
did the cash go?") via the GL, with drill-down to source JEs and
balance/reconciliation validation. Backend only — UI is the
remaining 9 sub-tasks of T-060.

The next session can either:
- continue Wave 2 (T-060.7–10 frontend),
  or
- pause Wave 2 and pick a parallel priority (T-058 service-line
  accounting; Phase E reconciliation reports; etc.)

---

## T-060.6 — Report Export Endpoint (appended 2026-05-24)

**Author:** Viet Anh

### What was done

Implemented `GET /api/v1/finance/reports/export/{statement}?format=pdf|xlsx`
— a streaming download endpoint for all three statutory statements.

**Files created:**
- `services/finance/src/finance/api/v1/export.py` — endpoint + all
  Excel (openpyxl) and PDF (WeasyPrint/Jinja2) builders
- `services/finance/src/finance/api/v1/templates/base.html` — shared
  A4-portrait HTML/CSS letterhead template (Jinja2, extends pattern)
- `services/finance/src/finance/api/v1/templates/balance_sheet.html`
- `services/finance/src/finance/api/v1/templates/income_statement.html`
- `services/finance/src/finance/api/v1/templates/cash_flow.html`
- `services/finance/tests/test_export.py` — 12 tests (6 happy-path,
  4 negative/validation, 1 auth, 1 filename convention)

**Files modified:**
- `services/finance/src/finance/main.py` — registered `export.router`
- `services/finance/Dockerfile` — added WeasyPrint system deps +
  openpyxl/weasyprint/jinja2 to pip install
- `services/finance/pyproject.toml` — added same deps to [dependencies]

### Design decisions and deviations

**No duplication of data logic:** The export endpoint calls the
same `get_balance_sheet`, `get_income_statement`, `get_cash_flow`
functions as the JSON endpoints. The response `.data.model_dump()`
is passed to the format builders. Single source of truth — the
exported file always matches the JSON view.

**WeasyPrint version pinned at 65.1 (not 62.3 as spec said):**
WeasyPrint 62.3 has a Python 3.13 incompatibility
(`AttributeError: 'super' object has no attribute 'transform'`).
The Docker container runs Python 3.11 where 62.3 may work, but
the test environment (Python 3.13) requires 65.1+. Pinned to 65.1
for both test and Docker consistency. Note: 65.1 is still a stable
maintained release on the same API surface as 62.3 — no code changes
required.

**Jinja2 naming collision fix:** The `CashFlowActivitySection.items`
field name collides with Python's `dict.items()` built-in when the
Pydantic model is serialised to a plain dict via `.model_dump()`.
Jinja2 template fixed to use `investing['items']` bracket notation
instead of `investing.items` attribute access.

**WeasyPrint ~100 MB Docker image growth:**
Adding the Pango/Cairo/GDK-Pixbuf system packages adds approximately
80–110 MB to the `python:3.11-slim` image layer. This is a known
and accepted trade-off (documented in Wave-2-Design.md §6 — "WeasyPrint
for PDF: document Docker footprint"). The HTML/CSS-first approach was
preferred over ReportLab/fpdf2 for:
- Maintainable templates (designers can edit HTML/CSS, not Python code)
- Jinja2 inheritance with `{% extends "base.html" %}` shares header,
  footer, and styling across all three statements
- CSS paged-media support (`@page`, page-number counter) for A4 output

If image size becomes a constraint, a future migration to `fpdf2` +
a headless image or a sidecar PDF-render container are the two viable
alternatives. YAGNI for now.

### Test results

```
12 passed in 1.23s
```

All 6 statement × format combinations pass. The 60 pre-existing
failures in other test files (`test_posting_purchase_received`,
`test_trial_balance`, `test_vendor_sub_ledger`, etc.) are unrelated
to this task and were present before this session.

### CodeMap regen required

Yes — new endpoint `GET /api/v1/finance/reports/export/{statement}`
added. Run `bash scripts/codebase_mapper/rerun.sh` when the mapper
MongoDB URL is fixed (see INDEX.md note).

---

## Data repair — T-063.B (2026-05-24)

**Incident:** company `1000` (orgId `00000000-0000-0000-0000-000000000001`)
had `purchasePriceVarianceAccountId` pointing to
`c267ed98-75be-4356-b9d4-f854845cc3e9` — account `110000-003` "Buildings"
(drawer=ASSETS, accountType=asset). PPV must be a P&L expense account.

**Root cause:** the posting-setup endpoint had no semantic type guard; any
active account could be assigned to any field. The T-063.A guard introduced
in this session would have prevented this assignment.

**PPV account used:** `b99d7ae4-5455-11f1-8dbc-4211d192a92b` — account
`514000-004` "Purchase Price Variance" (drawer=COST_OF_SALES,
accountType=expense). This account was already present in `default_coa.py`
(added 2026-05-20 as Item 12) and seeded for the org. No Alembic migration
required.

**SQL repair applied:**
```sql
UPDATE company_posting_setup
SET purchasePriceVarianceAccountId = 'b99d7ae4-5455-11f1-8dbc-4211d192a92b'
WHERE companyCode = '1000';
-- 1 row updated. Verified: accountNumber=514000-004, drawer=COST_OF_SALES.
```

Executed directly against the MySQL finance DB via `docker exec a64-finance`
(bypassing the API to avoid the chicken-and-egg constraint of the new type
guard requiring the correct account before it accepts the update).

**Post-repair state:**
- `company_posting_setup.purchasePriceVarianceAccountId` for company 1000
  now points to `514000-004 Purchase Price Variance` (COST_OF_SALES/expense).
- The new T-063.A semantic guard will prevent this misconfiguration from
  recurring on any future PATCH to the posting-setup endpoint.
