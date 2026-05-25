/**
 * Finance Reports — TanStack Query hooks
 *
 * useApAging         — useMutation (POST with orchestrated body)
 * useVendorSubLedger — useQuery (GET, fires when params are provided)
 * useBalanceSheet    — useQuery (GET, T-060.8; fires when org + company ready)
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import * as reportsService from '../../services/financeReportsService';
import type {
  GetApAgingRequest,
  ApAgingReport,
  GetVendorSubLedgerParams,
  VendorSubLedgerReport,
  GetBalanceSheetParams,
  BalanceSheetReport,
  GetIncomeStatementParams,
  IncomeStatementReport,
} from '../../services/financeReportsService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const financeReportsQueryKeys = {
  vendorSubLedger: (params: GetVendorSubLedgerParams) =>
    ['finance', 'reports', 'vendor-sub-ledger', params] as const,
  balanceSheet: (params: GetBalanceSheetParams) =>
    ['finance', 'reports', 'balance-sheet', params] as const,
  incomeStatement: (params: GetIncomeStatementParams) =>
    ['finance', 'reports', 'income-statement', params] as const,
};

// ─── AP Aging — mutation ───────────────────────────────────────────────────────

/**
 * Submit the orchestrated AP Aging payload and receive the bucketed report.
 *
 * Usage:
 *   const { mutateAsync, isPending } = useApAging();
 *   const report = await mutateAsync(payload);
 */
export function useApAging() {
  return useMutation<ApAgingReport, Error, GetApAgingRequest>({
    mutationFn: (payload) => reportsService.getApAging(payload),
  });
}

// ─── Balance Sheet — query (T-060.8) ──────────────────────────────────────────

/**
 * Fetch the Balance Sheet snapshot for the given params.
 * Fires automatically whenever organizationId and companyCode are non-empty.
 *
 * Used in pairs by BalanceSheetPage: one query for the primary date and an
 * optional second query for the comparative date (the BS backend takes a
 * single as_of_date — compare requires two separate requests).
 */
export function useBalanceSheet(
  params: GetBalanceSheetParams,
  enabled = true
) {
  return useQuery<BalanceSheetReport, Error>({
    queryKey: financeReportsQueryKeys.balanceSheet(params),
    queryFn: () => reportsService.getBalanceSheet(params),
    enabled: enabled && !!params.organizationId && !!params.companyCode,
    // Balance-sheet data can tolerate a 30-second stale window; users can
    // change the date to force a new query key (and thus a fresh fetch).
    staleTime: 30_000,
  });
}

// ─── Income Statement — query (T-060.9) ───────────────────────────────────────

/**
 * Fetch the Income Statement for the given period range.
 *
 * The backend supports primary + optional comparison in a SINGLE call.
 * Pass `comparePeriodStart` + `comparePeriodEnd` to enable the comparison
 * column — the response's `comparison` field will be non-null.
 *
 * Fires automatically when organizationId, companyCode, periodStart, and
 * periodEnd are all non-empty.
 */
export function useIncomeStatement(
  params: GetIncomeStatementParams,
  enabled = true
) {
  return useQuery<IncomeStatementReport, Error>({
    queryKey: financeReportsQueryKeys.incomeStatement(params),
    queryFn: () => reportsService.getIncomeStatement(params),
    enabled:
      enabled &&
      !!params.organizationId &&
      !!params.companyCode &&
      !!params.periodStart &&
      !!params.periodEnd,
    // IS data can tolerate a 30-second stale window; date changes force a
    // new query key and thus a fresh fetch.
    staleTime: 30_000,
  });
}

// ─── Vendor Sub-Ledger — query ─────────────────────────────────────────────────

/**
 * Fetch the Vendor Sub-Ledger report.
 * Only fires when organizationId and companyCode are non-empty.
 * Pass vendorId to filter to a single vendor.
 */
export function useVendorSubLedger(
  organizationId: string,
  companyCode: string,
  asOfDate?: string,
  vendorId?: string
) {
  const params: GetVendorSubLedgerParams = {
    organizationId,
    companyCode,
    asOfDate,
    vendorId,
  };

  return useQuery<VendorSubLedgerReport, Error>({
    queryKey: financeReportsQueryKeys.vendorSubLedger(params),
    queryFn: () => reportsService.getVendorSubLedger(params),
    // Only run when the required filters are in place
    enabled: !!organizationId && !!companyCode,
    // Sub-ledger data can be moderately stale — 60s before background refetch
    staleTime: 60_000,
  });
}
