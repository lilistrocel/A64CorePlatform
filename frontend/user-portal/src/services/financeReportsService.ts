/**
 * Finance Reports API Service
 *
 * Typed API calls for the finance reports module:
 *   - AP Aging report  (POST /api/v1/finance/reports/ap-aging)
 *   - Vendor Sub-Ledger (GET /api/v1/finance/reports/vendor-sub-ledger)
 *   - AP Invoice totals-paid (POST /api/v1/finance/ap-invoices/totals-paid)
 *   - Balance Sheet  (GET /api/v1/finance/reports/balance-sheet)  — T-060.8
 *
 * The AP Aging workflow requires frontend orchestration:
 *   1. Fetch all Approved AP invoices from operation API.
 *   2. POST apDocIds to /finance/ap-invoices/totals-paid to get amounts paid.
 *   3. Compute outstanding = totalGross − totalPaid per invoice.
 *   4. Filter to invoices with outstanding > 0.
 *   5. POST the filtered list to /finance/reports/ap-aging.
 *
 * All endpoints use the SuccessResponse<T> envelope: response.data.data.
 */

import { apiClient } from './api';

// ─── Success envelope ─────────────────────────────────────────────────────────

interface SuccessEnvelope<T> {
  data: T;
  message: string | null;
}

// ─── AP Invoice Totals-Paid ───────────────────────────────────────────────────

/** Request body for the totals-paid endpoint (Phase D). */
export interface ApDocTotalsPaidRequest {
  apDocIds: string[];
  organizationId: string;
}

/** Per-invoice paid total returned by the totals-paid endpoint. */
export interface ApDocTotalsPaidItem {
  apDocId: string;
  totalPaid: string; // decimal as string
}

export type ApDocTotalsPaidResponse = ApDocTotalsPaidItem[];

// ─── AP Aging Types ───────────────────────────────────────────────────────────

/**
 * A single invoice entry submitted to the AP Aging report endpoint.
 * Frontend computes these from Approved AP invoices after deducting payments.
 */
export interface ApAgingInvoiceInput {
  apDocId: string;
  totalGross: string;       // decimal as string — outstanding amount (gross − paid)
  dueDate: string | null;   // YYYY-MM-DD or null if no due date set
  vendorId: string;
  vendorCode: string;
  vendorName: string;
}

/** Request body for POST /api/v1/finance/reports/ap-aging */
export interface GetApAgingRequest {
  organizationId: string;
  companyCode: string;
  asOfDate: string;         // YYYY-MM-DD
  invoices: ApAgingInvoiceInput[];
}

/** Aging bucket amounts — each is a decimal as string. */
export interface ApAgingBuckets {
  notDue: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  daysOver90: string;
  total: string;
}

/** Per-vendor aging row. */
export interface ApAgingVendorRow extends ApAgingBuckets {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
}

/** Full AP Aging report response. */
export interface ApAgingReport {
  asOfDate: string;
  totals: ApAgingBuckets;
  byVendor: ApAgingVendorRow[];
}

// ─── Vendor Sub-Ledger Types ──────────────────────────────────────────────────

/** Query params for GET /api/v1/finance/reports/vendor-sub-ledger */
export interface GetVendorSubLedgerParams {
  organizationId: string;
  companyCode: string;
  asOfDate?: string;    // YYYY-MM-DD — omit for all-time
  vendorId?: string;    // omit for all vendors
}

/** Per-vendor sub-ledger row returned by the backend. */
export interface VendorSubLedgerRow {
  vendorId: string;
  totalCredits: string;   // decimal as string
  totalDebits: string;    // decimal as string
  balance: string;        // decimal as string (positive = vendor owes us, negative = we owe vendor)
  lastActivityAt: string; // ISO datetime string
  entryCount: number;
}

/** Full Vendor Sub-Ledger report response. */
export interface VendorSubLedgerReport {
  asOfDate: string;
  totalOutstanding: string; // decimal as string
  byVendor: VendorSubLedgerRow[];
}

// ─── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetch the total amounts paid against a list of AP invoices.
 * POST /api/v1/finance/ap-invoices/totals-paid
 *
 * Used by AP Aging orchestration to compute outstanding balances.
 * Returns a record of apDocId → totalPaid.
 */
export async function getApDocTotalsPaid(
  payload: ApDocTotalsPaidRequest
): Promise<Map<string, number>> {
  const response = await apiClient.post<SuccessEnvelope<ApDocTotalsPaidResponse>>(
    '/v1/finance/ap-invoices/totals-paid',
    payload
  );
  const items = response.data.data;
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.apDocId, parseFloat(item.totalPaid) || 0);
  }
  return map;
}

/**
 * Fetch the AP Aging report.
 * POST /api/v1/finance/reports/ap-aging
 *
 * The frontend orchestrates the full flow before calling this:
 * it passes only invoices with outstanding > 0.
 */
export async function getApAging(payload: GetApAgingRequest): Promise<ApAgingReport> {
  // Backend wraps in SuccessResponse[T] (standardized 2026-05-21).
  const response = await apiClient.post<SuccessEnvelope<ApAgingReport>>(
    '/v1/finance/reports/ap-aging',
    payload
  );
  return response.data.data;
}

// ─── Balance Sheet Types (T-060.8) ───────────────────────────────────────────

/**
 * A single account row in the Balance Sheet response.
 * `balance` is a decimal string — positive = normal-side balance.
 * `isHeader` accounts aggregate their descendants' balances.
 */
export interface BalanceSheetRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  /** One of: "assets" | "liabilities" | "equity" */
  drawer: string;
  /** One of: "asset" | "liability" | "equity" | "revenue" | "expense" */
  accountType: string;
  parentAccountId: string | null;
  isHeader: boolean;
  /** Signed net balance (Decimal as string). */
  balance: string;
}

export interface BalanceSheetTotals {
  totalAssets: string;
  totalLiabilities: string;
  /** Includes currentYearProfitLoss. */
  totalEquity: string;
  totalLiabilitiesPlusEquity: string;
  /** totalAssets − totalLiabilitiesPlusEquity — should be ≈0. */
  balanceDelta: string;
}

export interface BalanceSheetReport {
  organizationId: string;
  companyCode: string;
  asOfDate: string;
  generatedAt: string;
  currency: string;
  includesVoided: boolean;
  rows: BalanceSheetRow[];
  /** Live-computed net P&L for the current fiscal year. */
  currentYearProfitLoss: string;
  totals: BalanceSheetTotals;
  warnings: string[];
}

/** Query params for GET /api/v1/finance/reports/balance-sheet */
export interface GetBalanceSheetParams {
  organizationId: string;
  companyCode: string;
  asOfDate?: string;          // YYYY-MM-DD — omit for today
  includeVoided?: boolean;
  costCenterIds?: string[];   // serialised as repeated cost_center_id params
}

// ─── Balance Sheet API function ───────────────────────────────────────────────

/**
 * Fetch the Balance Sheet snapshot.
 * GET /api/v1/finance/reports/balance-sheet
 *
 * Cost-centre IDs are serialised as repeated query params:
 * ?cost_center_id=A&cost_center_id=B using URLSearchParams so we never
 * mutate the global axios client's paramsSerializer.
 */
export async function getBalanceSheet(
  params: GetBalanceSheetParams
): Promise<BalanceSheetReport> {
  // Build URLSearchParams explicitly to support repeated cost_center_id keys.
  const sp = new URLSearchParams();
  sp.set('organization_id', params.organizationId);
  sp.set('company_code', params.companyCode);
  if (params.asOfDate) sp.set('as_of_date', params.asOfDate);
  if (params.includeVoided) sp.set('include_voided', 'true');
  for (const id of params.costCenterIds ?? []) {
    sp.append('cost_center_id', id);
  }

  const response = await apiClient.get<SuccessEnvelope<BalanceSheetReport>>(
    `/v1/finance/reports/balance-sheet?${sp.toString()}`
  );
  return response.data.data;
}

// ─── Income Statement Types (T-060.9) ────────────────────────────────────────

/**
 * A single account row inside an IS drawer section.
 * `balance` is a decimal string with natural-side sign convention applied:
 *   - revenue / other_income → positive = CR balance
 *   - expense (cost_of_sales, operating_cost, etc.) → positive = DR balance
 */
export interface IncomeStatementAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  drawer: string;
  accountType: string;
  parentAccountId: string | null;
  isHeader: boolean;
  balance: string; // Decimal as string
}

/** A drawer block: all accounts + the drawer's total (sum of leaf balances). */
export interface IncomeStatementSection {
  drawer: string;
  total: string; // Decimal as string
  rows: IncomeStatementAccount[];
}

/**
 * Standard IS subtotals — derived by the backend from drawer totals.
 *
 * grossProfit = revenue - costOfSales
 * operatingIncome (EBIT) = grossProfit - operatingCost
 * netIncome = operatingIncome + otherIncome - nonOperating - taxation
 *
 * `grossMarginPercent` is null when revenue is zero.
 */
export interface IncomeStatementSubtotals {
  revenue: string;
  costOfSales: string;
  grossProfit: string;
  grossMarginPercent: string | null;
  operatingCost: string;
  operatingIncome: string; // EBIT
  otherIncome: string;
  nonOperating: string;
  taxation: string;
  netIncome: string;
}

/**
 * A single period's data — used for both primary and optional comparison.
 */
export interface IncomeStatementPeriod {
  periodStart: string;
  periodEnd: string;
  sections: IncomeStatementSection[];
  subtotals: IncomeStatementSubtotals;
}

/**
 * Full Income Statement response.
 *
 * `primary` is always present.
 * `comparison` is populated only when `compare_period_start` +
 * `compare_period_end` were provided to the backend.
 */
export interface IncomeStatementReport {
  organizationId: string;
  companyCode: string;
  generatedAt: string;
  currency: string;
  includesVoided: boolean;
  primary: IncomeStatementPeriod;
  comparison: IncomeStatementPeriod | null;
  warnings: string[];
}

/** Query params for GET /api/v1/finance/reports/income-statement */
export interface GetIncomeStatementParams {
  organizationId: string;
  companyCode: string;
  periodStart: string;         // YYYY-MM-DD — required for range statements
  periodEnd: string;           // YYYY-MM-DD — required for range statements
  comparePeriodStart?: string; // YYYY-MM-DD — optional comparative period
  comparePeriodEnd?: string;   // YYYY-MM-DD — optional comparative period
  includeVoided?: boolean;
  costCenterIds?: string[];    // serialised as repeated cost_center_id params
}

// ─── Income Statement API function ───────────────────────────────────────────

/**
 * Fetch the Income Statement for a date range.
 * GET /api/v1/finance/reports/income-statement
 *
 * A single backend call supports both primary AND comparative periods.
 * When `comparePeriodStart` + `comparePeriodEnd` are provided, the backend
 * returns `response.comparison` populated; otherwise it is null.
 *
 * Cost-centre IDs serialised as repeated params via URLSearchParams.
 */
export async function getIncomeStatement(
  params: GetIncomeStatementParams
): Promise<IncomeStatementReport> {
  const sp = new URLSearchParams();
  sp.set('organization_id', params.organizationId);
  sp.set('company_code', params.companyCode);
  sp.set('period_start', params.periodStart);
  sp.set('period_end', params.periodEnd);
  if (params.comparePeriodStart) sp.set('compare_period_start', params.comparePeriodStart);
  if (params.comparePeriodEnd) sp.set('compare_period_end', params.comparePeriodEnd);
  if (params.includeVoided) sp.set('include_voided', 'true');
  for (const id of params.costCenterIds ?? []) {
    sp.append('cost_center_id', id);
  }

  const response = await apiClient.get<SuccessEnvelope<IncomeStatementReport>>(
    `/v1/finance/reports/income-statement?${sp.toString()}`
  );
  return response.data.data;
}

// ─── Cash Flow Statement Types (T-060.10) ────────────────────────────────────

/**
 * A single contributing account row inside a CF section.
 * `contribution` is a signed decimal string:
 *   positive = cash inflow, negative = cash outflow.
 */
export interface CashFlowLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  drawer: string;
  contribution: string; // Decimal as string, signed
}

/**
 * Operating activities section — indirect method.
 *
 * Layout:
 *   Net Income
 *   + Non-cash adjustments (depreciation, amortisation, provisions)
 *   + Working-capital changes (AR, AP, inventory deltas)
 *   ─────────────────────
 *   Net Cash from Operating Activities (total)
 */
export interface CashFlowOperatingSection {
  netIncome: string;                         // Decimal as string
  nonCashAdjustments: CashFlowLine[];
  nonCashAdjustmentsTotal: string;           // Decimal as string
  workingCapitalChanges: CashFlowLine[];
  workingCapitalChangesTotal: string;        // Decimal as string
  total: string;                             // netIncome + nonCash + workingCapital
}

/**
 * Investing or Financing activities section — flat line list.
 */
export interface CashFlowActivitySection {
  items: CashFlowLine[];
  total: string; // Decimal as string
}

/**
 * Full Cash Flow Statement response (indirect method).
 *
 * Backend computes whether netChangeInCash reconciles to (cashAtEnd - cashAtBeginning)
 * within 0.01 AED. Any mismatch is surfaced in `warnings[]` and also in
 * `reconciliationDelta` (non-zero when books don't reconcile).
 *
 * `cashDelta`         = cashAtEnd - cashAtBeginning
 * `reconciliationDelta` = netChangeInCash - cashDelta  (should be ≈ 0)
 *
 * NOTE: The CF backend does NOT accept compare_period_start / compare_period_end.
 * When a comparative period is needed, the frontend fires two parallel queries.
 */
export interface CashFlowReport {
  organizationId: string;
  companyCode: string;
  periodStart: string;           // ISO date
  periodEnd: string;             // ISO date
  generatedAt: string;           // ISO datetime
  currency: string;
  includesVoided: boolean;
  operating: CashFlowOperatingSection;
  investing: CashFlowActivitySection;
  financing: CashFlowActivitySection;
  netChangeInCash: string;       // operating.total + investing.total + financing.total
  cashAtBeginning: string;       // sum of CASH-category accounts at period start - 1 day
  cashAtEnd: string;             // sum of CASH-category accounts at period end
  cashDelta: string;             // cashAtEnd - cashAtBeginning
  reconciliationDelta: string;   // netChangeInCash - cashDelta (≈ 0 when reconciled)
  warnings: string[];
}

/** Query params for GET /api/v1/finance/reports/cash-flow */
export interface GetCashFlowParams {
  organizationId: string;
  companyCode: string;
  periodStart: string;           // YYYY-MM-DD — required
  periodEnd: string;             // YYYY-MM-DD — required
  includeVoided?: boolean;
  costCenterIds?: string[];      // serialised as repeated cost_center_id params
}

// ─── Cash Flow API function ───────────────────────────────────────────────────

/**
 * Fetch the Cash Flow Statement for a date range.
 * GET /api/v1/finance/reports/cash-flow
 *
 * The CF backend endpoint does NOT support a single-call comparative period
 * (no compare_period_start / compare_period_end params). When the caller
 * needs a comparison column, useCashFlow is called twice in parallel with
 * different period params (see useFinanceReports.ts).
 *
 * Cost-centre IDs serialised as repeated params via URLSearchParams.
 */
export async function getCashFlow(
  params: GetCashFlowParams
): Promise<CashFlowReport> {
  const sp = new URLSearchParams();
  sp.set('organization_id', params.organizationId);
  sp.set('company_code', params.companyCode);
  sp.set('period_start', params.periodStart);
  sp.set('period_end', params.periodEnd);
  if (params.includeVoided) sp.set('include_voided', 'true');
  for (const id of params.costCenterIds ?? []) {
    sp.append('cost_center_id', id);
  }

  const response = await apiClient.get<SuccessEnvelope<CashFlowReport>>(
    `/v1/finance/reports/cash-flow?${sp.toString()}`
  );
  return response.data.data;
}

// ─── Vendor Sub-Ledger ────────────────────────────────────────────────────────

/**
 * Fetch the Vendor Sub-Ledger report.
 * GET /api/v1/finance/reports/vendor-sub-ledger
 */
export async function getVendorSubLedger(
  params: GetVendorSubLedgerParams
): Promise<VendorSubLedgerReport> {
  const queryParams: Record<string, string> = {
    organization_id: params.organizationId,
    company_code: params.companyCode,
  };
  if (params.asOfDate) queryParams.as_of_date = params.asOfDate;
  if (params.vendorId) queryParams.vendor_id = params.vendorId;

  // Backend wraps in SuccessResponse[T] (standardized 2026-05-21).
  const response = await apiClient.get<SuccessEnvelope<VendorSubLedgerReport>>(
    '/v1/finance/reports/vendor-sub-ledger',
    { params: queryParams }
  );
  return response.data.data;
}
