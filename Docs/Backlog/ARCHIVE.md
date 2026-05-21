# A64 Core Platform — Completed Work

> **Total completed:** 56 tasks

## 2026-05

### T-056 | Tenant Setup Wizard — multi-step bootstrap for org-less super_admin
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** Multi-step wizard for fresh-deployment super_admin bootstrap.
  New files: `services/tenantBootstrapService.ts`, `hooks/queries/useOrganizations.ts`,
  `pages/admin/TenantSetupWizardPage.tsx`. Extended: `services/financeCompaniesService.ts`
  (createCompany with seed message), `hooks/queries/useFinanceCompanies.ts` (useCreateCompany),
  `stores/auth.store.ts` (refreshUser action), `components/common/ProtectedRoute.tsx`
  (auto-redirect org-less super_admin), `components/layout/MainLayout.tsx` (Tenant Setup sidebar),
  `App.tsx` (/admin/tenant-setup route). TypeScript clean (exit 0). All backend endpoints
  verified via direct API calls. Backend note: API container required restart to pick up the
  new /admin/users/{id}/organization PATCH endpoint (code existed but process wasn't reloaded).

---

### T-055 | Tax code dropdown on ItemMappingPage + item-default tax code on PR/PO/AP forms
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** (1) Replaced free-text tax code input on ItemMappingPage with a
  `<select>` dropdown backed by `useTaxCodes` + `FALLBACK_TAX_CODES`. "— None —" empty
  option included. (2) Created `useItemMappingsMap.ts` helper hook returning
  `Map<itemId, PurchaseItemFinanceExt>`. Wired into PR, PO, and AP forms: picking an item
  now auto-defaults `taxCode` from `itemMappings.get(itemId)?.taxCodeDefault`. PR uses
  `?? null`; PO uses `?? 'S'` (last-resort UAE VAT fallback); AP init uses
  `itemMappings.get(l.itemId)?.taxCodeDefault ?? 'S'`. Manual tax code edits are never
  overwritten. TypeScript: 0 errors.


### T-053 | Reusable AttachmentList component — PR, PO, GR, AP, Payment detail pages
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** frontend-dev-expert
- **Description:** Built a fully typed reusable `<AttachmentList>` component with drag-and-drop
  upload zone, file list with click-to-download links, delete confirmation modal (no overlay
  close), and progress bar. Integrated on all five document detail pages. Service layer and
  TanStack Query hooks wired end-to-end. Gracefully handles 404 until backend ships.
- **Files added:**
  - `frontend/user-portal/src/services/attachmentsService.ts` — 110 lines
    (uploadAttachment, listAttachments, getDownloadUrl, deleteAttachment)
  - `frontend/user-portal/src/hooks/queries/useAttachments.ts` — 92 lines
    (useAttachments query, useUploadAttachment mutation, useDeleteAttachment mutation)
  - `frontend/user-portal/src/components/attachments/AttachmentList.tsx` — 453 lines
    (full component with upload zone, list, delete modal)
- **Files modified:**
  - `frontend/user-portal/src/hooks/queries/index.ts` — +8 lines (export attachments hooks)
  - `frontend/user-portal/src/pages/purchasing/PurchaseRequestDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/PurchaseOrderDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/GoodsReceiptDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/purchasing/APInvoiceDetailPage.tsx` — +8 lines
  - `frontend/user-portal/src/pages/finance/PaymentDetailPage.tsx` — +7 lines

### T-051 | Finance backend — AP Aging report, Vendor sub-ledger, Period audit fields
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-21 · **Assigned:** backend-dev-expert
- **Description:** Three finance backend refinements:
  (1) AP Aging POST endpoint `POST /reports/ap-aging` — frontend-orchestrated, buckets
  outstanding invoices by overdue age across five bands, groups by vendor, sorted descending.
  (2) Vendor sub-ledger GET endpoint `GET /reports/vendor-sub-ledger` — queries
  journal_entry_lines on the AP Control account grouped by referenceLineId (vendorId),
  returns credits/debits/balance/entryCount/lastActivityAt per vendor.
  (3) Migration 013 — adds closeReason, reopenedAt, reopenedByUserId, reopenReason to
  fiscal_periods. Updated close/reopen endpoints to accept body params; reopen requires
  reason (5-500 chars); FiscalPeriodResponse surfaces all six audit fields.
- **Files added/modified:**
  - `services/finance/src/finance/models/orm/models.py` — +4 audit columns on FiscalPeriod
  - `services/finance/src/finance/models/schemas/period.py` — +4 fields on FiscalPeriodResponse
  - `services/finance/src/finance/api/v1/periods.py` — ClosePeriodRequest + ReopenPeriodRequest bodies, full audit trail logic
  - `services/finance/src/finance/api/v1/reports.py` — AP Aging + Vendor Sub-ledger endpoints
  - `services/finance/alembic/versions/013_period_audit_fields.py` — NEW migration
  - `services/finance/tests/test_ap_aging.py` — NEW 8 tests (all pass)
  - `services/finance/tests/test_vendor_sub_ledger.py` — NEW 9 tests (all pass)
  - `services/finance/tests/test_period_audit.py` — NEW 9 tests (all pass)
  - `services/finance/tests/test_periods.py` — updated reopen test to supply required reason

### T-051 | UAE VAT compliance — tax-point rule + reverse-charge mechanism
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-21 · **Assigned:** backend-dev-expert
- **Description:** PM feedback items 2 and 3.
  Item 2: UAE VAT Article 25 tax-point rule — `dateOfSupply` (= GR docDate)
  added to `ApInvoicePostedPayload` contract; `build_ap_invoice_event_payload`
  fetches the source GR header's `docDate` via `_emit_ap_invoice_posted_event`
  before building the payload; finance handler computes
  `tax_point_date = min(dateOfSupply, invoiceDate)` and embeds it in the Input
  VAT line description for FTA audit/VAT return traceability. JE date stays at
  `apDate`; no new column added (memo-on-description approach per spec).
  Item 3: Reverse-charge VAT mechanism — migration 012 adds `isReverseCharge`
  BOOLEAN to `tax_codes` with backfill for SR; ORM, Pydantic schemas, and seed
  loader updated; handler now looks up each line's tax code, posts both DR Input
  VAT and CR Output VAT for SR lines (self-accounting), and credits AP for
  lineNet only (not lineGross) on RC lines.
- **Files modified:**
  - `contracts/finance_events.py` (+14 lines)
  - `services/finance/alembic/versions/012_tax_codes_reverse_charge.py` (new, 55 lines)
  - `services/finance/src/finance/models/orm/models.py` (+7 lines)
  - `services/finance/src/finance/models/schemas/tax_code.py` (+8 lines)
  - `services/finance/src/finance/services/seed_loader.py` (+5 lines)
  - `services/finance/src/finance/api/v1/events.py` (+185 lines net; handler rewritten)
  - `services/finance/tests/test_posting_ap_invoice_posted.py` (+260 lines, 16 tests)
  - `src/modules/purchasing/services/document_service.py` (+38 lines)

### T-050 | Phase D.5 frontend — Fiscal Periods management UI
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Built full Fiscal Periods management page at /finance/periods with
  service layer, TanStack Query hooks, close/reopen confirmation modals, and bulk-create wizard.
- **Files added:**
  - `frontend/user-portal/src/services/fiscalPeriodsService.ts` (+115 lines) — typed API calls (listPeriods, createPeriod, closePeriod, reopenPeriod)
  - `frontend/user-portal/src/hooks/queries/useFiscalPeriods.ts` (+80 lines) — TanStack Query hooks (useFiscalPeriods, useCreatePeriod, useClosePeriod, useReopenPeriod)
  - `frontend/user-portal/src/pages/finance/PeriodsPage.tsx` (+600 lines) — full page component with table, close modal, reopen modal, bulk-create wizard
- **Files modified:**
  - `frontend/user-portal/src/hooks/queries/index.ts` — exports for the four fiscal period hooks
  - `frontend/user-portal/src/App.tsx` — lazy import + `/finance/periods` route
  - `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar entry 📅 Fiscal Periods after Vendor Payments

### T-048 | Phase D — Vendor Payment module (finance backend)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Phase D of the P2P cycle — the third and final journal entry (DR AP Control / CR Bank).
  Finance-internal action: finance user picks open AP invoices and records payment.
  JE created atomically in the same request (no outbox event).
- **Files added:**
  - `services/finance/alembic/versions/011_ap_payments.py` (+115 lines) — migration for ap_payments + ap_payment_applications
  - `services/finance/src/finance/models/schemas/ap_payments.py` (+160 lines) — Pydantic request/response schemas
  - `services/finance/src/finance/api/v1/ap_payments.py` (+380 lines) — payment router: POST /ap-payments, GET /ap-payments, GET /ap-payments/{id}, POST /ap-invoices/totals-paid
  - `services/finance/tests/test_ap_payment.py` (+480 lines) — 21 tests all passing
- **Files modified:**
  - `services/finance/src/finance/models/orm/models.py` — added PaymentMethodEnum, ApPayment, ApPaymentApplication ORM models
  - `services/finance/src/finance/api/v1/events.py` — added _next_payment_number helper
  - `services/finance/src/finance/main.py` — wired ap_payments router
- **Endpoints:**
  - `POST /api/v1/finance/ap-payments` — record a payment (finance_admin/admin/super_admin)
  - `GET /api/v1/finance/ap-payments` — list payments (all finance read roles)
  - `GET /api/v1/finance/ap-payments/{id}` — get payment detail with JE summary
  - `POST /api/v1/finance/ap-invoices/totals-paid` — get total paid per apDocId (v1 frontend-join)
- **Cross-service join:** v1 frontend-join approach — frontend supplies AP invoice details; finance returns totalPaid per apDocId; frontend computes outstanding. No service-to-service HTTP.
- **Aging report:** Deferred to D.5 — cross-service complexity out of scope for v1. Frontend-join endpoint provides the data needed for the frontend to build its own view.
- **Rebuild needed:** Finance container rebuild required (new ORM models, new router, new migration).



### T-046 | PM feedback: JE Reversal UI, Trial Balance page, Valuation Method relocation
- **Category:** Frontend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Three PM feedback critical items:
  (4) JE Reversal UI — "Reverse Entry" button on posted JEs (finance_admin/admin/super_admin),
  confirm modal with required reason text (5–500 chars), calls POST /api/v1/finance/journal-entries/{id}/reverse,
  Voided badge on original rows, Reversal badge on reversal rows, "Reversal of JE-..." link.
  (5) Trial Balance page at /finance/trial-balance — toolbar with company/date/period/voided toggle,
  "Generate" button, grouped-by-drawer table, out-of-balance footer warning.
  (11) Valuation Method moved from per-item to company level per IAS 2 — new "Inventory Valuation"
  section on PostingSetupPage, column removed from ItemMappingPage.
- **Files added:**
  - `src/services/trialBalanceService.ts` (+83 lines) — typed API for trial balance report
  - `src/hooks/queries/useTrialBalance.ts` (+77 lines) — useTrialBalance + useFinancePeriods hooks
  - `src/pages/finance/TrialBalancePage.tsx` (+763 lines) — full trial balance report page
- **Files modified:**
  - `src/services/journalEntriesService.ts` (+35 lines) — reverseJournalEntry function + types
  - `src/hooks/queries/useJournalEntries.ts` (+35 lines) — useReverseJournalEntry mutation
  - `src/hooks/queries/index.ts` (+6 lines) — exports for new hooks
  - `src/pages/finance/JournalEntriesPage.tsx` (+381 lines) — reversal UI, modal, voided rows
  - `src/services/postingSetupService.ts` (+16 lines) — ValuationMethod type + defaultValuationMethod field
  - `src/pages/finance/PostingSetupPage.tsx` (+65 lines) — Inventory Valuation section
  - `src/services/itemMappingService.ts` (-1 line) — removed valuationMethod from UpdateItemMappingBody
  - `src/pages/finance/ItemMappingPage.tsx` (-30 lines) — removed Valuation Method column/logic
  - `src/App.tsx` (+4 lines) — TrialBalancePage lazy import + route
  - `src/components/layout/MainLayout.tsx` (+1 line) — Trial Balance sidebar entry

---

### T-047 | PM feedback items 4 & 5 — JE Reversal endpoint + Trial Balance report
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Two new finance backend endpoints from PM critical feedback list.
  Item 4: JE Reversal — POST /api/v1/finance/journal-entries/{je_id}/reverse,
  creates offsetting JE with swapped DR/CR lines, voids the original, wraps in one transaction.
  Item 5: Trial Balance report — GET /api/v1/finance/reports/trial-balance,
  aggregates JE line balances per GL account as of a given date.
- **Files added:**
  - `services/finance/src/finance/api/v1/reports.py` (+219 lines) — new router with
    trial balance endpoint; subquery-based aggregation for correct LEFT JOIN behaviour;
    `TrialBalanceResponse`, `TrialBalanceAccount`, `TrialBalanceTotals` schemas inline.
  - `services/finance/tests/test_je_reversal.py` (+312 lines) — 7 tests covering happy
    path, already-void 400, 404, 403, closed-period-posts-in-current, description reason,
    exact DR/CR swap.
  - `services/finance/tests/test_trial_balance.py` (+300 lines) — 5 tests covering empty
    db, Phase B GR JE totals balance (35000 DR == 35000 CR), as_of_date filter,
    include_voided, 403 for non-finance roles.
- **Files modified:**
  - `services/finance/src/finance/api/v1/journal_entries.py` — added
    `POST /journal-entries/{je_id}/reverse` endpoint (+115 lines); imports `_next_je_number`
    from events module; role-gates to finance_admin/admin/super_admin.
  - `services/finance/src/finance/models/schemas/journal_entries.py` — added
    `ReversalRequest` (reason: str, 5–500 chars) and `ReversalResponse` schemas.
  - `services/finance/src/finance/main.py` — registered `reports.router` at `_PREFIX`.
- **Test results:** 17 new tests all pass (7 reversal + 5 trial balance + 5 existing JE read).
  Pre-existing 25 failures in test_events_ingest/test_posting_* are unrelated to this change.
- **Endpoint paths:**
  - `POST /api/v1/finance/journal-entries/{je_id}/reverse?organization_id={org}`
  - `GET /api/v1/finance/reports/trial-balance?organization_id={org}&company_code={cc}`
- **Note:** Finance container rebuild required for these changes to take effect.

### T-045 | Accounting/CoA fixes — Items 1, 10, 11, 12 from PM feedback
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Four accounting correctness fixes from PM audit.
- **Files modified:**
  - `services/finance/src/finance/db/seeds/default_coa.py` — added 3 accounts:
    `514000-004 Purchase Price Variance`, `617000-011 Rounding Differences`,
    `223000-004 Goods Received Not Invoiced`; updated docstring count to 231.
  - `services/finance/src/finance/models/orm/models.py` — added
    `CompanyPostingSetup.defaultValuationMethod` (NOT NULL, default MovingAverage);
    added deprecation docstring on `PurchaseItemFinanceExt.valuationMethod`.
  - `services/finance/src/finance/models/schemas/posting_setup.py` — added
    `defaultValuationMethod` to both `CompanyPostingSetupUpdate` (Optional) and
    `CompanyPostingSetupResponse` (required field).
  - `services/finance/src/finance/api/v1/company.py` — updated PUT handler to
    skip None on non-nullable fields (`defaultValuationMethod`) to prevent
    partial-update clobbering.
- **Files added:**
  - `services/finance/alembic/versions/010_posting_setup_default_valuation_method.py`
    — Alembic migration 010; adds `defaultValuationMethod` ENUM column.
  - `services/finance/scripts/migrate_grir_reclassification.py` — idempotent
    async script: migrates `grIrClearingAccountId` from 221000-002 → 223000-004
    and deactivates 221000-002 across all orgs.
  - `services/finance/scripts/__init__.py` — package marker.
  - `services/finance/tests/test_coa_fixes_pm_items.py` — 12 new tests (all pass).
- **Dev DB inserts applied:**
  - `617000-011 Rounding Differences` — inserted.
  - `223000-004 Goods Received Not Invoiced` — inserted.
  - `221000-002 Goods Received Not Invoiced` — set isActive=0 (row preserved).
  - `company_posting_setup.grIrClearingAccountId` migrated to 223000-004.
  - Migration 010 applied manually; alembic_version updated to 010.
- **Verification:**
  - All 3 new accounts active in dev DB; 221000-002 inactive.
  - `grIrClearingAccountId` points at 223000-004 (accountName confirmed).
  - JE-1000-2026-0001 lines unaffected — still reference 221000-002 correctly.
  - `defaultValuationMethod=MovingAverage` in company_posting_setup.
  - 12/12 new tests pass; existing passing tests unchanged (pre-existing failures
    unrelated to this task).
- **Note:** Finance container needs rebuild to load migration 010 and new seed
  accounts for fresh deployments.

### T-043 | Phase C.1 — AP Invoice module (operation side)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Built full AP Invoice module on the operation side. New doc type
  `AP` with state machine Draft → Pending Approval → Approved | Rejected + Withdraw.
  Emits `ap_invoice_posted` outbox event on Approve (matches `ApInvoicePostedPayload`
  contract exactly). One-AP-per-GR enforcement, quantity locked to GR receipt, v1
  hardcoded tax rates (S/SR=5%, Z/E/N=0%), price variance computation per line.
  21/21 unit tests pass; 39/39 across all purchasing tests. No containers to restart
  (volume-mounted src).
- **Files added/changed:**
  - `src/modules/purchasing/models/document.py` — added APStatus, AP_TAX_RATES,
    APLineInput, APFromGRCreate, APCreate, APUpdate, APResponse, APDetailResponse;
    extended DocumentLineResponse with grLineId, poUnitPrice, priceVarianceAmount;
    DocType Literal extended with "AP"
  - `src/modules/purchasing/services/document_service.py` — added
    build_ap_invoice_event_payload, _header_to_ap_response, _AP_TRANSITIONS,
    _AP_TRANSITIONS in _validate_transition, all AP service methods
    (create_ap_from_gr, create_ap, list_aps, get_ap, update_ap, submit_ap,
    approve_ap, reject_ap, withdraw_ap, soft_delete_ap,
    _emit_ap_invoice_posted_event, _build_ap_lines_from_gr, _sum_ap_lines)
  - `src/modules/purchasing/services/approval_engine.py` — extended DocTypeT with
    AP_INVOICE, added AP_INVOICE fallback rule (accountant role, 10000 AED threshold)
  - `src/modules/purchasing/api/v1/ap_invoices.py` — NEW: full router with 9 endpoints
  - `src/modules/purchasing/api/v1/__init__.py` — wired ap_router
  - `tests/unit/test_purchasing/test_ap_invoice_service.py` — NEW: 21 unit tests

### T-044 | Phase C.5 — `_handle_ap_invoice_posted` finance handler
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Implemented `_handle_ap_invoice_posted` in
  `services/finance/src/finance/api/v1/events.py`. Produces the second JE of the P2P
  cycle: DR GR/IR Clearing (expectedNet) + DR Input VAT (if non-zero) + DR/CR Purchase
  Price Variance (if non-zero) + CR AP Control (totalGrossAmount). Wired into the
  dispatch block `elif event.eventType == "ap_invoice_posted"`. Full variance sign
  handling with balance proof. `referenceLineId` on CR line set to `vendorId` for
  sub-ledger prep. 11/11 tests pass in
  `services/finance/tests/test_posting_ap_invoice_posted.py`.

### T-042 | Replace plain-text tax-code inputs with dropdown sourced from finance service
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Created `taxCodesService.ts` + `useTaxCodes` hook (same pattern as
  `financeCompaniesService`/`useFinanceCompanies`). Wired into `PurchaseRequestFormPage` and
  `PurchaseOrderFormPage` — replaced plain `<input>` with `<select>` populated from
  `GET /api/v1/finance/tax-codes`. Fixed the hardcoded invalid default `'VAT5'` → `'S'`
  in both the `emptyLine()` factory and the from-PR line copy. Fallback to 5 seeded codes
  on network error. TypeScript clean (`npx tsc --noEmit` zero errors).

### T-041 | AccountCombobox UX fixes + ItemMappingPage table width
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** frontend-dev-expert
- **Description:** Three UX fixes: (1) Replaced two-mode chip/input toggle with a single
  always-typeable input that shows the selected label when unfocused, select-all on focus,
  and a ✕ clear button inside the input. (2) Rendered the dropdown via ReactDOM.createPortal
  into document.body with fixed positioning + getBoundingClientRect so it escapes table-cell
  overflow:hidden. (3) Raised EditCell min-width from 200px to 280px and Table min-width from
  1000px to 1200px in ItemMappingPage. TypeScript clean (0 errors).

### T-040 | Approval engine + document header chain-readiness precautions
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Additive changes to make approval engine and document headers
  chain-ready for Phase F (multi-step workflow rewrite) without revisiting Phases C/D.
- **Files modified:**
  - `src/modules/purchasing/services/approval_engine.py` (+44 lines net)
    - Added `ApprovalStep` dataclass (step_number, required_role, step_label).
    - Expanded `ApprovalDecision` with `next_step: Optional[ApprovalStep]` and
      `workflow_id: Optional[str]` (null today). Added `approver_role` as a
      backward-compat `@property` derived from `next_step.required_role`.
    - `_fallback_rules` and `_query_finance` updated to build `ApprovalStep(1, role)`.
  - `src/modules/purchasing/models/document.py` (+36 lines net)
    - Added `ApprovalHistoryEntry` Pydantic model (7 fields, Literal decision).
    - Added `approvalHistory: List[ApprovalHistoryEntry] = []` to `PRResponse`,
      `POResponse`, `GRResponse` (GR always empty, for shape consistency).
  - `src/modules/purchasing/services/document_service.py` (+94 lines net)
    - Imported `ApprovalHistoryEntry`.
    - `_header_to_pr_response`, `_header_to_po_response` pass `approvalHistory` from doc.
    - `_header_to_gr_response` passes `approvalHistory=[]` (GR has no gate).
    - `submit_pr` / `submit_po`: initialize `approvalHistory: []` via conditional update
      before the main `$set` when field does not exist yet.
    - `approve_pr` / `reject_pr` / `approve_po` / `reject_po`: add `$push` to `approvalHistory`
      alongside `$set`; entry has stepNumber=1, workflowId=None.
    - `build_pr_event_payload` and `build_po_event_payload` include `approvalHistory`.
  - `contracts/finance_events.py` (+14 lines net)
    - `PurchaseRequestStateChangedPayload` + `PurchaseOrderStateChangedPayload` each get
      `approvalHistory: Optional[List[dict]] = None` (optional → backward-compat).
- **Tests added:**
  - `tests/unit/test_purchasing/test_approval_chain_readiness.py` (8 tests, all pass)
    - backward-compat property returns same value as next_step.required_role
    - fallback rules for PR / PO with step populated correctly
    - approve_pr appends history entry with stepNumber=1, decision=Approved
    - reject_pr appends history entry with stepNumber=1, decision=Rejected
- **Test run:** 47/47 passed (8 new + 39 pre-existing unchanged)

### T-037 | Phase B.1 — Goods Receipt (GR) module (operation side)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20 · **Assigned:** backend-dev-expert
- **Description:** Built the GR document type (Draft → Posted state machine) that creates a
  Goods Receipt from an Open/Sent PO. On Post: decrements PO line openQuantity, auto-closes the
  PO when fully received, emits purchase_received outbox event matching PurchaseReceivedPayload
  from contracts/finance_events.py. All steps atomic via _txn(). Immutability enforced.
- **Files added:**
  - `src/modules/purchasing/api/v1/goods_receipts.py` (new router, 6 endpoints)
  - `tests/unit/test_purchasing/__init__.py`
  - `tests/unit/test_purchasing/test_gr_service.py` (10 tests, all passing)
- **Files modified:**
  - `src/modules/purchasing/models/document.py` — added GR schemas + itemType on line response
  - `src/modules/purchasing/services/document_service.py` — added GR state machine, service
    methods, build_gr_event_payload, _header_to_gr_response, updated _resolve_item/_line_to_response
  - `src/modules/purchasing/api/v1/__init__.py` — registered gr_router

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-039 | Sidebar nav restructure — Operations group with recursive renderer | Frontend | 2026-05-20 | TypeScript clean (npx tsc --noEmit); user to verify UI |
| T-038 | Phase B.3 — `_handle_purchase_received` posting handler (finance side) | Backend | 2026-05-20 | 9/9 new tests pass; 55 total passed / 6 pre-existing failures unchanged |
| T-036 | Phase A.4 backend — per-item GL account mapping (finance side) | Backend | 2026-05-20 | migration 009 applied, DESCRIBE verified, 47 passed / 5 pre-existing X-Secret failures |
| T-035 | Phase A.4 frontend — Item GL Account Mapping page (/finance/item-mapping) | Frontend | 2026-05-20 | pending Viet Anh (backend endpoint not live yet) |
| T-032 | Phase A.1 + A.2 — JE tables + Posting Setup (finance backend) | Backend | 2026-05-20 | alembic upgrade head + DESCRIBE verified |
| T-033 | Phase A.3 — Posting Setup UI (/finance/posting-setup) | Frontend | 2026-05-20 | pending Viet Anh |
| T-034 | Searchable AccountCombobox for PostingSetupPage | Frontend | 2026-05-20 | pending Viet Anh |
| T-031 | Finance — Incoming Preview page (/finance/incoming) | Frontend | 2026-05-20 | pending Viet Anh |
| T-030 | Wire /api/v1/finance/companies into Approval Rules page — dynamic company dropdown | Frontend | 2026-05-20 | pending Viet Anh |
| T-029 | Finance backend flags: seed backfill + companies org filter + CoA docstring | Backend | 2026-05-20 | pending Viet Anh |
| T-028 | Frontend polish: 4 flags from CoA + Approval Rules session | Frontend | 2026-05-20 | pending Viet Anh |
| T-027 | Approval Rules management page (finance UI) | Frontend | 2026-05-20 | pending Viet Anh |
| T-026 | Surface four new GL Account fields on Chart of Accounts page UI | Frontend | 2026-05-20 | pending Viet Anh |
| T-025 | CoA backend polish — description field + surface account_level/role/ifrs_tag | Backend | 2026-05-20 | pending Viet Anh |
| T-024 | Chart of Accounts (CoA) page — Finance UI | Frontend | 2026-05-20 | pending Viet Anh |
| T-023 | Activate finance stack and verify outbox end-to-end | DevOps | 2026-05-20 | verified |
| T-022 | Vendor form modal — field-level validation and friendly error display | Frontend | 2026-05-20 | pending Viet Anh |
| T-021 | Transactional outbox in purchasing document service — Phase 2 (Viet Anh) | Backend | 2026-05-20 | pending Viet Anh |
| T-020 | Finance outbox reconciliation sweeper — Phase 1B follow-up (Viet Anh) | Backend + DevOps | 2026-05-20 | pending Viet Anh |
| T-019 | Purchasing — Phase 1B PR + PO + approvals (Viet Anh) | Backend + Frontend | 2026-05-20 | pending Viet Anh |
| T-018 | Purchasing — Phase 1A master data (Viet Anh) | Backend + Frontend + Database | 2026-05-19 | pending Viet Anh |
| T-017 | Finance Service — Week 3 outbox bridge (Viet Anh) | Backend + DevOps | 2026-05-19 | ✅ |
| T-016 | Finance Service — Week 1 scaffold (Viet Anh) | Backend | 2026-05-19 | ✅ |
| T-002 | Fertilizer Cost Calculator — Backend (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh) | Backend | 2026-05-07 | ✅ |
| T-008 | Farm Detail + Block Monitor merge; Inventory/Stock split; Sales Order lifecycle (v1.14.0 session) | Frontend + Backend | 2026-05-07 | ✅ |
| T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-015 | P&L Dashboard integration + PnlFiltersBar hideFarmingYear + UserManagement PATCH fix (Viet Anh) | Frontend | 2026-05-07 | ✅ |
| T-012 | Plant Library — Fertigation Schedule editor (Viet Anh) | Frontend | 2026-05-08 | ✅ |
| T-014 | Fert Calculator — Yield Mode (UI) (Viet Anh) | Frontend | 2026-05-11 | ✅ |
| T-013 | Fert Calculator — Yield Mode (Excel) (Viet Anh) | Backend | 2026-05-11 | ✅ |

### T-024 | Chart of Accounts (CoA) page — Finance UI
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-20
- **Description:** Built the GL Chart of Accounts management page.
- **Result:**
  - `frontend/user-portal/src/utils/apiErrors.ts` — extracted `parseApiErrors` helper (65 lines)
  - `frontend/user-portal/src/services/financeAccountsService.ts` — axios-based CRUD (214 lines)
  - `frontend/user-portal/src/hooks/queries/useFinanceAccounts.ts` — TanStack Query hooks (151 lines)
  - `frontend/user-portal/src/pages/finance/ChartOfAccountsPage.tsx` — full page (1406 lines)
  - Routes `/finance/chart-of-accounts`, `/finance/coa` (redirect), `/finance` (redirect) added to `App.tsx`
  - Finance sidebar group added to `MainLayout.tsx` (accountant/finance_admin/auditor/admin/super_admin)
  - Finance hooks exported from `hooks/queries/index.ts`
  - TypeScript clean: 0 errors from `npx tsc --noEmit`

---

### T-021 | Transactional outbox in purchasing document service — Phase 2 (Viet Anh)
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-05-20
- **Author:** Viet Anh
- **Description:** Closed the consistency hole in the purchasing document service where
  two independent Mongo writes (header update, outbox insert) had no atomicity and the
  outbox failure was silently swallowed. Wrapped all state mutations in Motor session
  transactions so the header write and the outbox insert commit or abort together.
- **Result:**
  - **Modified:** `src/modules/finance_bridge/outbox_writer.py` — added optional
    `session: Optional[AsyncIOMotorClientSession]` parameter to `OutboxWriter.publish`;
    passes it to `insert_one(..., session=session)`. Backwards-compatible (default None).
  - **Modified:** `src/modules/purchasing/services/document_service.py` — added
    `_txn()` async context manager (`asynccontextmanager`) that yields a Motor session
    inside an active Mongo multi-document transaction. Updated `_next_doc_number` to
    accept a session (counter increments participate in the transaction). Updated
    `_build_and_insert_lines` to accept a session. Updated `_emit_pr_event` and
    `_emit_po_event` to accept session and forward to OutboxWriter; removed the
    `try/except` swallows so exceptions propagate and abort the transaction. Wrapped
    all 14 state-mutating methods in `_txn()`. Approval-engine network calls remain
    outside the transaction (see module docstring for rationale).
  - **Added:** `tests/unit/test_finance_bridge/test_transactional_outbox.py` — 7 new
    tests covering session passthrough, backwards compatibility, transaction abort on
    outbox failure, call ordering inside transaction, and exception propagation.
  - **Updated:** `Docs/4-Finance-Mod-docs/INTEGRATION_MODEL.md` — §6.4 added,
    §7 failure table updated, §9 action item marked done.
- **Test result:** 29/29 finance bridge tests pass. Pre-existing failures in
  `test_ai_assistant` and `test_excel_handler` are due to `passlib`/`anthropic`
  not installed in the local Python env (Docker-only deps) — unrelated to this task.

### T-020 | Finance outbox reconciliation sweeper — Phase 1B follow-up (Viet Anh)
- **Category:** Backend + DevOps · **Priority:** P1
- **Completed:** 2026-05-20
- **Author:** Viet Anh
- **Description:** Defense-in-depth safety net for the finance outbox consistency hole.
  Two separate non-transactional Mongo writes in `document_service.py` can leave
  finance_outbox with missing rows when the outbox write fails silently. This sweeper
  runs every 5 minutes in the cron container, detects gaps, and back-fills them with
  deterministic event IDs (uuid5) to guarantee idempotency.
- **Result:**
  - **Modified:** `src/modules/purchasing/services/document_service.py` — extracted
    `build_pr_event_payload()` and `build_po_event_payload()` as module-level functions;
    `_emit_pr_event` and `_emit_po_event` now delegate to them (no behavior change).
  - **New file:** `cron/scripts/__init__.py` — package init
  - **New file:** `cron/scripts/outbox_reconciler.py` — sweeper: scans document_headers,
    checks finance_outbox presence, re-emits via OutboxWriter with deterministic eventId
  - **New file:** `cron/run-outbox-reconciler.sh` — crontab shell wrapper
  - **Modified:** `cron/Dockerfile` — added Python 3, pip, motor, pydantic
  - **Modified:** `cron/crontab` — added `*/5 * * * *` entry for sweeper
  - **Modified:** `docker-compose.yml` — cron service gets MONGODB_URL, MONGODB_DB_NAME,
    FINANCE_OUTBOX_ENABLED, PYTHONPATH + volume mounts for src/, contracts/, cron/scripts/
  - **New file:** `tests/unit/test_finance_bridge/test_outbox_reconciler.py` — 13 tests
    (4 unit for make_sweeper_event_id, 3 unit for outbox_event_exists, 6 integration
    scenarios A–E + deterministic-ID capture); all 13 passing
  - **Test results:** 22/22 finance-bridge tests pass; pre-existing failures in
    test_fertilizer_calculator and test_sensehub_crop_sync are unrelated (passlib not
    installed locally)
- **CodeMaps:** Regeneration needed — new cron/scripts/ package added; no new API
  endpoints or MongoDB collections.

### T-017 | Finance Service — Week 3 outbox bridge (Viet Anh)
- **Category:** Backend + DevOps · **Priority:** P1
- **Completed:** 2026-05-19
- **Author:** Viet Anh
- **Description:** End-to-end outbox bridge infrastructure between main app (MongoDB) and finance service (MySQL). Manually triggerable demo event flows from insertion to processed state.
- **Result:**
  - **New package:** `contracts/` — shared Pydantic event schemas (10 event types, `EVENT_TYPE_REGISTRY`)
  - **New module:** `src/modules/finance_bridge/` — `OutboxWriter`, `OutboxRepository`, `feature_flag` (FINANCE_OUTBOX_ENABLED gate)
  - **New service:** `services/finance_consumer/` — consumer worker container (Motor + httpx, poll loop, exponential backoff, SIGTERM graceful shutdown)
  - **Finance endpoint:** `POST /api/v1/finance/events/ingest` — service-to-service auth (X-Service-Secret), idempotency via `outbox_events_processed`, Week 3 stub (no GL posting)
  - **Migration:** `003_outbox_events_processed.py` — `outbox_events_processed` table (eventId PK, 2 indexes)
  - **ORM:** `OutboxEventsProcessed` model added to `services/finance/src/finance/models/orm/models.py`
  - **Docker:** `docker-compose.finance.yml` updated — `finance_consumer` service + FINANCE_INGESTION_SECRET on both containers
  - **Tests:** 7 ingest endpoint tests + 8 poller unit tests + 9 OutboxWriter unit tests = **24 tests, all passing**
  - **Demo script:** `services/finance_consumer/scripts/demo_publish.py` + mongosh one-liner in README
  - **Docs:** System-Architecture.md updated with Outbox Bridge subsection + ASCII sequence diagram

### T-016 | Finance Service — Week 1 scaffold (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-19
- **Author:** Viet Anh
- **Description:** Full Week 1 scaffold for the A64 Finance Service — standalone FastAPI microservice with MySQL/Alembic, JWT verification (no MongoDB), master-data CRUD, seed CoA (~208 accounts), and opt-in Docker profile.
- **Result:**
  - **New service:** `services/finance/` — 60+ files
    - `Dockerfile`, `pyproject.toml`, `alembic.ini`, `README.md`
    - `src/finance/main.py` — FastAPI app, port 8001
    - `src/finance/config.py` — Pydantic settings, env-vars only, `SECRET_KEY` matches main app
    - `src/finance/api/v1/` — 8 routers: health, company, accounts, periods, tax_codes, cost_centers, vendors, customer_ext
    - `src/finance/models/orm/models.py` — 8 SQLAlchemy 2.x ORM tables (company_codes, gl_accounts, fiscal_periods, tax_codes, cost_centers, vendors, customer_finance_ext, audit_log)
    - `src/finance/models/schemas/` — 7 Pydantic schema files
    - `src/finance/services/jwt_verifier.py` — token-only JWT verification, no MongoDB
    - `src/finance/services/seed_loader.py` — idempotent CoA + tax code seeder
    - `src/finance/db/seeds/default_coa.py` — 208 seed accounts across 9 drawers + 5 tax codes
    - `alembic/versions/001_initial_master_data.py` — creates all 8 tables
    - `alembic/versions/002_indexes.py` — covering indexes
    - `tests/` — 23 tests (pytest + aiosqlite in-memory), all passing
  - **New file:** `docker-compose.finance.yml` — overlay with mysql:8.0 + finance services, both on `finance` profile
  - **Updated:** `nginx/nginx.dev.conf` — finance upstream + `/api/v1/finance/` location block
  - **Updated:** `nginx/nginx.prod.conf` — same updates
  - **Updated:** `Docs/1-Main-Documentation/System-Architecture.md` — Finance Service section
  - **Updated:** `Docs/1-Main-Documentation/API-Structure.md` — all finance endpoints
- **Verification:** 23/23 tests pass (SQLite in-memory). Docker build requires `asyncmy` + `pymysql` deps (in Dockerfile).

---

### T-014 | Fert Calculator — Yield Mode (UI) (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-11
- **Author:** Viet Anh
- **Description:** Added Dripper Mode / Yield Mode toggle to FertilizerCostCalculator CropListPanel.
- **Result:**
  - **Modified**: `frontend/user-portal/src/types/tools.ts` — `CropListRow` extended with
    `yieldInfo?: YieldWasteInfo` and `targetYield?: number`; new `CropInputMode` type added.
  - **Modified**: `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx`:
    - `PlantDataOption` extended with `yieldInfo`.
    - Typeahead maps `yieldInfo` from search response at pick time.
    - `hydratePlantNames` also pulls `yieldInfo` from `getPlantDataEnhancedById`.
    - Conversion helpers: `computeYieldPerDripper`, `drippersToYield`, `yieldToDrippers`.
    - `CropListPanel` props extended with `mode`, `onModeChange`, `onUpdateTargetYield`.
    - Mode toggle segmented control in panel header, persisted to `localStorage` under
      `fertCalc.mode.<userId>`.
    - Dripper Mode: unchanged input + new read-only "Est. Yield" column.
    - Yield Mode: Target Yield input + per-row unit label + read-only "Drippers (auto)" column.
    - Mode switching converts all row values in place.
    - `points` always kept in sync; Calculate/Export/Save unchanged.
  - **Modified**: `Docs/1-Main-Documentation/User-Structure.md` — v1.16.0 changelog entry.

### T-013 | Fert Calculator — Yield Mode (Excel) (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-11
- **Author:** Viet Anh
- **Description:** Extended the Fertilizer Cost Calculator Excel import to support a "Net Yield (kg)"
  column alongside "Points". Users can now upload a spreadsheet with either dripper counts or target
  yield values; the backend auto-converts yield → points using each plant's yieldInfo.
- **Result:**
  - **Modified**: `src/modules/farm_manager/services/tools/excel_handler.py`
    - `build_import_template()`: new column C "Net Yield (kg)", column widths A=36 B=12 C=18,
      updated placeholder rows demonstrating both modes, italic instruction note at row 4.
    - `import_crops()`: reads optional Net Yield column (case-insensitive regex header match);
      if Net Yield is positive, computes `points = ceil(netYield / yieldPerDripper)` where
      `yieldPerDripper = yieldPerPlant × seedsPerPlantingPoint × (1 − waste%)`. Points clamped
      to 10,000,000 with warning (not skipped). Non-numeric Net Yield → skip with reason.
      Zero/negative Net Yield → falls through to Points column. Non-kg yieldUnit → informational
      warning. Old 2-column files still work unchanged (backward compatible).
    - New helpers: `_is_net_yield_header()`, `_try_parse_positive_float()`.
  - **New file**: `tests/unit/test_excel_handler.py` — 30 unit tests (all pass):
    Points-only (regression), Net Yield-only, both columns (Net Yield wins), invalid yield rate,
    clamp, round-trip template parse, old-format compatibility, non-numeric, zero fallthrough, non-kg.
  - **Modified**: `Docs/1-Main-Documentation/API-Structure.md` — Calculator endpoint table updated
    (added GET /import-template row), expanded POST /import docs with column behaviour, skip reasons
    table, clamping, and unit warning details.

### T-012 | Plant Library — Fertigation Schedule editor (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-08
- **Author:** Viet Anh
- **Description:** Built full fertigation schedule editor modal for the Plant Library.
- **Result:**
  - **New file**: `FertigationScheduleEditorModal.tsx` — full CRUD editor for `FertigationSchedule`
    with card/rule/ingredient CRUD, move-up/down reorder, chemical typeahead (useChemicals),
    inline new-chemical creation, interval↔custom type-switch warning, live validation,
    auto-derived `totalFertilizationDays`, save via `updatePlantDataEnhanced`.
  - **Modified**: `PlantDataDetail.tsx` — Section 11 always renders for privileged roles;
    "Edit Schedule" / "Create Fertigation Schedule" button with role gate
    (`admin|agronomist|super_admin|moderator`); overlay no longer closes on backdrop click.
  - **Modified**: `PlantDataLibrary.tsx` — wired `onSaved` callback to refetch the selected plant
    and refresh the list after a schedule save.
  - **Modified**: `types/farm.ts` — `PlantDataEnhancedUpdate` now includes
    `fertigationSchedule?: FertigationSchedule`; `CustomApplication` now has `notes?: string`.
  - **Modified**: `Docs/1-Main-Documentation/User-Structure.md` — added Fertigation Schedule
    editor section and v1.15.0 changelog entry.
  - TypeScript: `tsc --noEmit` passes with zero errors.
  - No Docker rebuild required — pure frontend TS/JSX change, hot reload sufficient.
  - CodeMaps flagged for regeneration (1 new component file added).

---

### T-010 | Fertilizer Calculator UI — slim Price Book panel (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Removed duplicate "Add Chemical" and "Discover from Plant Library" actions from
  the Price Book panel in `FertilizerCostCalculator.tsx`, enforcing single-responsibility: those
  actions now live exclusively in `ChemicalsCatalog.tsx`.
- **Result:**
  - **Removed from `PricebookPanel`**: `+ Add Chemical` button, `Discover from Plant Library`
    button (role-gated), `addOpen` state, `handleAddSave` handler, `createChemMutation`
    (`useCreateChemical`), `discoverMutation` (`useDiscoverChemicals`), `canDiscover` role-check,
    `useAuthStore` import.
  - **Removed from file**: `AddChemicalModal` component function and its `AddChemicalModalProps`
    interface (~88 lines of component code).
  - **Removed imports**: `useAuthStore`, `useCreateChemical`, `useDiscoverChemicals`,
    `CreateChemicalRequest`, `AxiosError` (was already unused in this file), `useChemicals`,
    `FertilizerChemical`.
  - **Kept**: search/filter input (hidden when no chemicals exist), the chemicals table with
    editable price column, the inline `Reset` link per override row, the `Source` badge column,
    and the "Manage Catalog →" `RouterLink` in the panel header.
  - **Added empty-state**: when `entries.length === 0`, renders a centred `PricebookEmptyState`
    block with the message "No chemicals catalogued yet — go to the Chemicals Catalog to add some
    or run Discover from Plant Library." and a `RouterLink $asButton` styled as a primary button
    navigating to `/tools/chemicals`.
  - **Added `$asButton` transient prop** to `RouterLink` styled component so the same component
    renders as either a text link or a full primary button without passing a DOM prop.
  - **Net change**: 1803 → 1716 lines (−87 lines).
  - **TypeScript**: `tsc --noEmit` passes with zero errors, zero unused imports.

### T-015 | P&L Dashboard integration + PnlFiltersBar hideFarmingYear + UserManagement PATCH fix (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Integrated the full P&L component family into the main Dashboard page; added `hideFarmingYear` prop to `PnlFiltersBar`; polished `PnlBreakdownCharts` layout; fixed `UserManagementPage` HTTP method.
- **Result:**
  - **Modified**: `frontend/user-portal/src/pages/dashboard/Dashboard.tsx` — imported and rendered `PnlFiltersBar`, `PnlKpiCards`, `PnlRevenueTrendChart`, `PnlBreakdownCharts`, `PnlStatementTable`, `PnlArAging`, `PnlRevenueConfidence` with finance hooks (`useFinancePnlSummary`, `useFinancePnlByMonth`, `useFinancePnlByFarm`, `useFinancePnlByCrop`, `useFinancePnlArAging`, `useFinanceRevenueSources`).
  - **Modified**: `frontend/user-portal/src/components/pnl/PnlFiltersBar.tsx` — new optional `hideFarmingYear` prop suppresses the farming-year filter row when a global year selector is already present higher up the tree.
  - **Modified**: `frontend/user-portal/src/components/pnl/PnlBreakdownCharts.tsx` — `Row` uses `align-items: stretch`; new `FarmPanel` wrapper keeps adjacent panels at equal heights.
  - **Modified**: `frontend/user-portal/src/pages/admin/UserManagementPage.tsx` — corrected HTTP method from `PUT` to `PATCH` on `/v1/users/{id}/role` (was returning 405).

---

### T-011 | Fertilizer Calculator UI — Price Book → modal (Viet Anh)
- **Category:** Frontend · **Priority:** P2
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Restructured `FertilizerCostCalculator.tsx` so the Price Book becomes a modal
  (opened by a header button) and the Crop List is promoted to the primary hero content.
- **Result:**
  - **Renamed** `PricebookPanel` → `PricebookContent` (renders just the inner content, no Panel shell).
  - **Added** `PricebookModal` component — wraps `PricebookContent` in the existing `Modal` shell
    with `maxWidth="960px"` to give the 7-column table enough horizontal room.
  - **Added** `priceBookOpen: boolean` state at the `FertilizerCostCalculator` page level.
  - **Added** "Price Book" `OutlineBtn` in the page header (right side). Modal opens on click,
    closes only via the X button (no backdrop-click close — enforced by existing `Modal` shell).
  - **Updated** `PageHeader` styled component: now `display: flex; justify-content: space-between`
    so title stays left and button sits right.
  - **Removed** inline `<PricebookPanel />` from the page body. Crop List panel is now the first
    and largest content block.
  - **Added** `PricebookModalFooterLink` styled component — renders "Manage Catalog →" link at the
    bottom of the modal body (was previously in the collapsible panel header).
  - **Removed** `CollapseIcon` styled component (only used by old collapsible panel header, now
    unused).
  - **Updated** stale "Price Book above" copy in the InfoBanner to "Price Book button".
  - **Layout before:** 3 stacked panels — Price Book (top, collapsible) → Crop List → Output.
  - **Layout after:** Header row (title + Price Book button) → Crop List hero → Output.
  - **Net change:** ~1717 → ~1720 lines (+3 lines net; removed ~60, added ~63 for modal wrapper
    and footer link).
  - **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-009 | Fertilizer Calculator UI — unarchive + role gate (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author:** Viet Anh
- **Description:** Two follow-up UI additions to the Fertilizer Calculator frontend.
- **Result:**
  - **Change 1 — Restore button on archived chemicals**: In `ChemicalsCatalog.tsx`, archived rows now show a "Restore" `LinkBtn` instead of the "Archive" `DangerLinkBtn`. Clicking calls `useUpdateChemical` with `{ archivedAt: null }`, which triggers `PATCH /api/v1/farm/tools/chemicals/{id}`. On success the hook invalidates both the chemicals and prices queries, showing the restored row in its active state (or removing it from view if "Show archived" is off). The `UpdateChemicalRequest` type was widened to an `interface` with an optional `archivedAt?: string | null` field.
  - **Change 2 — Role gate on Discover button**: The "Discover from Plant Library" `OutlineBtn` is now conditionally rendered behind `canDiscover = currentUser?.role === 'admin' || currentUser?.role === 'agronomist'` in both `ChemicalsCatalog.tsx` (top-of-page button) and `FertilizerCostCalculator.tsx` (Price Book panel button). Button is fully hidden — not disabled — for other roles.
- **Role-check pattern source:** `MainLayout.tsx` line 195 — `user?.role === 'super_admin'` direct string comparison on the Zustand `useAuthStore` `user` field.
- **TypeScript:** `tsc --noEmit` passes with zero errors.

### T-004 | Fertilizer Calculator — archive-aware discovery + role gate (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Two follow-up fixes to the Fertilizer Cost Calculator backend.
- **Result:**
  - **Fix 1 — Role gate confirmed on `POST /chemicals/discover`**: endpoint already used `require_permission("agronomist")` mapping to admin/super_admin/moderator roles. Confirmed + added integration test verifying `user` role gets 403.
  - **Fix 2 — Archive-aware auto-discovery and calculator warnings:**
    - `ChemicalsService.discover_from_plant_library` now fetches ALL chemicals (including archived) and skips auto-creation for names matching archived chemicals. A new `build_chemical_lookup()` static method builds two dicts: active → FertilizerChemical, archived → ArchivedChemicalMatch sentinel.
    - `fertilizer_calculator.calculate_for_crops` Phase 2 uses archive-aware lookup: truly unknown names still auto-create, archived matches emit a per-ingredient warning and return `unitPrice/totalCost = None`.
    - `ChemicalUpdate` model gains optional `archivedAt` field; repository `update()` uses `model_fields_set` to distinguish explicit `null` (unarchive) from omitted field.
  - **Tests:** 9 new tests added (4 unit, 3 integration + 1 role-gate + 1 unarchive). 47 total tests pass (38 prior + 9 new).
  - **Docs:** `API-Structure.md` updated with role gate note, archive-aware semantics, unarchive PATCH description.

### T-002 | Fertilizer Cost Calculator — Backend (Viet Anh)
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full backend for the Fertilizer Cost Calculator tool.
- **Result:**
  - 3 new MongoDB collections: `fertilizer_chemicals`, `fertilizer_price_overrides`, `fertilizer_calculation_lists` with all required indexes.
  - 7 Pydantic model files under `src/modules/farm_manager/models/tools/`.
  - 6 service files under `src/modules/farm_manager/services/tools/`: ChemicalsRepository, ChemicalsService, PriceBook, FertilizerCalculator, ExcelHandler, CalculationListsRepository.
  - 2 API router files under `src/api/v1/tools/`: chemicals.py (5 endpoints), fertilizer_cost.py (10 endpoints).
  - Routers mounted at `/api/v1/farm/tools/chemicals` and `/api/v1/farm/tools/fertilizer-cost`.
  - 25 unit tests (all pass) + 13 integration tests (all pass).
  - API-Structure.md updated with all new endpoints.
  - CodeMaps regeneration needed (structural change — 3 new collections, new API routes, new service modules).

### T-003 | Fertilizer Cost Calculator — Frontend (Viet Anh)
- **Category:** Frontend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Built full frontend for the Fertilizer Cost Calculator tool and Chemicals Catalog.
- **Result:**
  - Extended `NavItemDef` in `MainLayout.tsx` to support `children[]`, `defaultExpanded`, and group rendering with collapsible chevron, child-active parent highlighting, and per-user localStorage persistence (`sidebar.expanded.{userId}`).
  - Added "Tools" sidebar group with two children: Fertilizer Cost Calculator and Chemicals Catalog.
  - New routes in `App.tsx`: `/tools` → redirect, `/tools/fertilizer-calculator`, `/tools/chemicals`.
  - New file `frontend/user-portal/src/types/tools.ts`: full TypeScript interfaces for all API shapes.
  - New file `frontend/user-portal/src/services/toolsApi.ts`: service layer for all `/api/v1/farm/tools/` endpoints.
  - New file `frontend/user-portal/src/hooks/queries/useTools.ts`: TanStack Query hooks for chemicals, prices, calculate, export, import, saved lists.
  - Extended `react-query.config.ts` with `queryKeys.tools` namespace.
  - New page `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx`: Price Book panel (collapsible, inline price edit, reset, add/discover), Crop List panel (typeahead with no-schedule greyed state, points edit, import/export XLSX, saved lists), Output panel (per-crop collapsible ingredient tables, grand total, warnings, discovered chemicals notice).
  - New page `frontend/user-portal/src/pages/tools/ChemicalsCatalog.tsx`: full CRUD table, add/edit modal, archive with 409 dependent-plants modal, show-archived toggle, search.
  - Updated `Docs/1-Main-Documentation/User-Structure.md` with Tools group documentation.
  - CodeMaps need regeneration (new pages, new sidebar pattern).

### T-008 | v1.14.0 development session — Farm, Inventory, Sales Order overhaul
- **Category:** Frontend + Backend · **Priority:** P1
- **Completed:** 2026-05-07
- **Author: Viet Anh**
- **Description:** Large multi-area session covering Farm Manager UI restructure, Inventory/Stock architectural split, per-batch harvest FIFO model, returned inventory, manual expire/revive, sales order lifecycle (reservations, two-step delete, Report Return), Add Item modal with FIFO allocation, and customer typeahead.
- **Result:**
  - Block Monitor route retired; all functionality merged into Farm Detail Blocks tab via `FarmQuickSwitcher`, `BlockMonitorHero`, `BlockViewToggle`, `VirtualBlocksView`, `PhysicalBlockPlantingsModal`, `useBlockViewMode` hook.
  - Farm Card redesigned with Yield Achievement progress bar, all-states pill row, `FarmCodeChip`, responsive metric grid.
  - Farm Manager Dashboard: new "View Farms" tab (embeds `FarmList`), Plant Library sidebar entry, tab sliding animation. Farm Breakdown tab merged into Overview.
  - Backend: `FarmSummary` extended with `physicalBlocks`/`virtualBlocks`/`actualYield`; `farmingYear` optional query param on `/farms/{id}/summary` and `/dashboard/farms/{id}`.
  - Inventory/Stock split: `/inventory` now Inputs + Assets only; `/sales/stock` (new) has Sellable / Returned / Waste tabs. Sales-side inventory service/repository/model retired.
  - Per-batch harvest model: `originalQuantity` immutable field, `farmingYear` computed at write, no more merging rows.
  - Manual expire (`POST .../expire`) and revive (`POST .../revive`) endpoints. Daily cron disabled.
  - Full `inventory_returned` CRUD (6 endpoints + `mark-waste`). `ReturnedInventoryList` frontend component.
  - `BlockHarvestEntryModal` Waste grade: dual-path submit to harvest vs waste endpoint.
  - `CustomerCombobox` typeahead with CRM address auto-fill in `OrderForm`.
  - `AddOrderItemModal`: FIFO multi-source allocation, container mode, duplicate detection, portaled dropdown.
  - Order schema: `allocations`, `containerCount`, `containerSize`, `deletedAt`, `returns` fields (backward-compatible).
  - Order lifecycle wired: reservation on confirm, deduction on ship, restoration on cancel.
  - Two-step order delete: `GET .../delete-preview` + `POST .../delete` with `BatchDecision[]`.
  - `ReportReturnModal` + `POST .../report-return` endpoint.
  - Numerous bug fixes: Farm TS type fields, URL correction, productId forwarding, UUID serialisation, nginx DNS flush, inventory backfill.
  - Released as v1.14.0 (MINOR bump). CodeMaps regenerated (structural changes).

## 2026-04

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-007 | Virtual-block SenseHub sync architecture (push per virtual child, MCP via parent chain) | Backend | 2026-04-24 | ✅ |
| T-006 | `mark_as_planted` doesn't persist crop metadata; SenseHub trigger skips | Backend | 2026-04-23 | ✅ |
| T-002 | SenseHub MCP crop-data sync integration | Backend | 2026-04-20 | ✅ |
| T-003 | Planting flow reads from empty legacy `plant_data` collection | Backend | 2026-04-23 | ✅ |
| T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates | Backend | 2026-04-23 | ✅ |
| T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails | Backend | 2026-04-23 | ✅ |

### T-007 | Virtual-block SenseHub sync architecture
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-24
- **Description:** Architectural correction surfaced during first live SenseHub integration test.
  Physical parent blocks hold `iotController` (the MCP connector) but crops live on virtual child
  blocks created via `addVirtualCrop` — the UI's only planting path. Production data confirmed:
  169/170 virtual blocks have `targetCrop`; only 1/271 physical blocks does (test artifact
  F010-002). SenseHub natively supports multiple `block_id`s per zone, so pushing each virtual
  child as its own `block_id` is the correct architecture and requires no SenseHub schema changes.
- **Result:**
  - `SenseHubCropSync.from_block()` is now `async`. When a block has no `iotController`, the
    method walks up the `parentBlockId` chain via `await BlockRepository.get_by_id()` until it
    finds an ancestor with `iotController.enabled=True` and a valid `mcpApiKey`. Returns `None`
    if no such ancestor exists. Four call sites updated with `await`:
    `sensehub_block_service_triggers.py` (×2), `planting_service.py`, `sync_service.py`.
  - `_reconcile_crop_data` in `sync_service.py` now expands each iot-parent into its virtual
    children via `BlockRepository.get_children_by_parent` before the reconcile loop. Parents
    with children are skipped; reconciliation iterates the children. Parents without children
    are reconciled directly, preserving the T-006 flow.
  - Live SenseHub cleanup: `complete_crop` fired for F010-002 (archived parent-level Capsicum,
    `sensehub_crop_id=8`). F010-002 reset in A64Core: `state=partial`, all crop fields null.
    F010-002/001 (virtual child) pushed to SenseHub with its own `block_id`, `stage=ripening`,
    new `sensehub_crop_id=9`. SenseHub dashboard shows Capsicum-Green on Greenhouse 1 at
    ripening stage, sourced from virtual child.
  - 90/90 tests pass: 81 regression + 9 new integration tests in
    `tests/integration/test_sensehub_crop_sync_virtual.py`.
  - No schema changes. No CodeMap regeneration needed.
  - Released as v1.13.5 (PATCH bump).

### T-006 | `mark_as_planted` doesn't persist crop metadata on block, SenseHub trigger skips
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-23
- **Description:** Discovered during the first live SenseHub integration test. After
  `POST /plantings/{id}/mark-planted`, `planting_service.mark_as_planted` called
  `BlockRepository.update_status(block_id, GROWING, ...)` without passing `target_crop` /
  `target_crop_name` / `actual_plant_count` / `expected_harvest_date`. Block state transitioned
  correctly but crop metadata fields stayed null. The SenseHub trigger then aborted:
  `[SenseHub] block X has no targetCrop set after mark_as_planted — skipping set_crop_data`.
- **Result:**
  - Added `primary_plant = planting.plants[0]` helper and forwarded all four kwargs to
    `BlockRepository.update_status` in `mark_as_planted`. Caller bug only — the repository
    method already accepted these as optional kwargs.
  - For multi-crop plantings `plants[0]` is used as the primary (block.targetCrop is a single
    UUID); remaining plants are tracked in `planting.plants[]`.
  - Verified end-to-end via Playwright against live SenseHub at `100.124.168.35:3001`:
    `[SenseHub] set_crop_data succeeded` fires automatically ~203ms after mark-planted returns
    200, with zero manual DB intervention. Reconciliation confirms in-sync.
  - 81/81 SenseHub regression tests pass. No schema changes. No CodeMap regen needed.
  - Released as v1.13.4 (PATCH bump).
- **Surfaced during:** First live SenseHub integration test (2026-04-23). Would have been
  caught in T-002 step 8 if Playwright had hit a real MCP instead of fake 127.0.0.1:9999.

### T-005 | SenseHub trigger wrappers log "succeeded" even when MCP call fails
- **Category:** Backend · **Priority:** P3
- **Completed:** 2026-04-23
- **Description:** Three fire-and-forget asyncio trigger wrappers in
  `sensehub_block_service_triggers.py` and `planting_service.py` emitted
  `INFO "[SenseHub] <method> succeeded"` unconditionally after the MCP call,
  even when the call had failed. The upstream `SenseHubCropSync` layer already
  logs an ERROR on failure — the trailing success INFO was misleading for ops
  scanning logs.
- **Result:**
  - `_sensehub_update_growth_stage_task`: `if ok:` guard added around success log.
  - `_sensehub_complete_crop_task`: `if ok:` guard added around success log.
  - `_sync_set_crop_data_on_planted`: `if result is not None:` guard corrected
    (was `if result:` which would false-negative on empty dict).
  - No behavior change for callers or downstream state — log output only.
  - 81/81 SenseHub regression tests pass; no assertions relied on old unconditional
    behavior.
  - Released as v1.13.3 (PATCH bump).

### T-003 | Planting flow reads from empty legacy `plant_data` collection
- **Category:** Backend · **Priority:** P2
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `PlantingService.create_planting_plan` called
  `PlantDataService.get_plant_data()` which reads from the legacy `plant_data` collection
  (0 documents in dev). Every UI planting attempt returned HTTP 404 in ~1ms.
  Planting had never worked in dev against any UI-created plant record.
- **Result (Option A implemented):**
  - `PlantingService.create_planting_plan` now reads from `PlantDataEnhancedService.get_plant_data`.
    Snapshot attribute paths adapted to nested enhanced model fields; all 8 snapshot dict keys
    are unchanged — downstream consumers (SenseHub trigger, harvest flow) unaffected.
  - Three additional pre-existing bugs uncovered and fixed during verification:
    1. `PlantingRepository` used `farm_db.db.plantings` (`.db` does not exist on
       `FarmDatabaseManager`) → fixed to `farm_db.get_database().plantings`.
    2. `BlockService.get_block_by_id` → corrected to `BlockService.get_block` (new API).
    3. `BlockService.update_block_state` → replaced with `BlockRepository.update_status` (new API).
  - Integration test mocks updated for renamed methods; 81/81 SenseHub regression tests pass.
  - Verified end-to-end: HTTP 201 on `POST /api/v1/plantings`; MongoDB doc has all 8 snapshot
    keys (Potato, growthCycleDays: 70, expectedYieldPerPlant: 1.575 kg, 15–40°C).
    Block transitioned EMPTY→PLANNED.
  - Released as v1.13.2 (PATCH bump).
- **Surfaced during:** T-002 Phase 4 e2e testing.

### T-004 | Missing `await` on `recalculate_future_dates` corrupts block status dates
- **Category:** Backend · **Priority:** P0
- **Completed:** 2026-04-23
- **Description:** Pre-existing bug. `BlockService.change_status` at
  `src/modules/farm_manager/services/block/block_service_new.py:703` called
  `BlockService.recalculate_future_dates()` (async coroutine) without `await`. The unresolved
  coroutine object was forwarded to `BlockRepository.update_status()` as `expected_status_changes`;
  motor silently stored null instead of the resolved `Dict[str, datetime]`. Every normal block
  status transition (non-planting, non-harvest-complete) corrupted block `expectedStatusChanges`.
- **Result:**
  - Single `await` added at `block_service_new.py:703` (else-branch of `change_status`).
  - Verified via mongosh: GROWING→HARVESTING transition now persists `expectedStatusChanges` as
    proper BSON ISODate objects. No `RuntimeWarning: coroutine ... was never awaited` post-fix.
  - Audit confirmed no other missing awaits in block service files.
  - 81/81 SenseHub regression tests pass. No data backfill needed (dev data was null/clean).
  - Released as v1.13.1 (PATCH bump). Follow-up data-cleanup task T-006 deemed unnecessary.
- **Surfaced during:** T-002 step 8 e2e Playwright testing.

### T-002 | SenseHub MCP crop-data sync integration
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-04-20
- **Description:** Wired A64Core → SenseHub MCP push for crop data, growth-stage transitions,
  and harvest completion across five implementation phases.
- **Result:**
  - Phase 1 reverted: `plant_data.py` extension rolled back; `plant_data_enhanced` already carries
    all required SenseHub fields in nested form. No UI change needed.
  - Phase 2 eliminated: `zone_id` dropped from external contract after negotiation. All crop tools
    are `block_id`-only; SenseHub handles zone routing internally via configured primary crop zone.
  - Phase 3: `SenseHubCropSync` service + `sensehub_stage_mapper.py` + payload builder. All 4 MCP
    tools wrapped; fire-and-log error handling; graceful degradation verified; 61/61 unit tests pass.
  - Phase 4: MCP triggers wired as detached `asyncio.create_task()` into `mark_as_planted`,
    `change_status` (stage boundary + HARVESTING→CLEANING), and a new
    `sensehub_block_service_triggers.py` helper module; 10/10 integration tests pass.
  - Phase 5: Crop reconciliation extended into `SenseHubSyncService` 3h cycle; 5 drift cases
    resolved; `asyncio.Semaphore(5)` concurrency cap; aggregated result via `get_status()`;
    10/10 integration tests pass.
  - Playwright e2e: `update_growth_stage` and `complete_crop` triggers verified in UI;
    `set_crop_data` path blocked by pre-existing T-003 bug (tracked separately).
  - 81 total tests: 61 unit + 20 integration.
  - Released as v1.13.0 (MINOR bump).
- **Follow-up tasks opened:** T-003 (P2), T-004 (P0), T-005 (P3)

<!--
Archive format — group by month:

## 2026-02

| ID | Task | Category | Completed | Verified |
|----|------|----------|-----------|----------|
| T-001 | Example task | Backend | 2026-02-26 | ✅ |

### T-001 | Example task
- **Category:** Backend · **Priority:** P1
- **Completed:** 2026-02-26
- **Description:** What was done
- **Result:** Outcome or key deliverable
-->
