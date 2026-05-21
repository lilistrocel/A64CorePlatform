/**
 * Finance Reports API Service
 *
 * Typed API calls for the finance reports module:
 *   - AP Aging report  (POST /api/v1/finance/reports/ap-aging)
 *   - Vendor Sub-Ledger (GET /api/v1/finance/reports/vendor-sub-ledger)
 *   - AP Invoice totals-paid (POST /api/v1/finance/ap-invoices/totals-paid)
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
