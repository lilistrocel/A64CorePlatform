/**
 * Finance Reports — TanStack Query hooks
 *
 * useApAging   — useMutation (POST with orchestrated body)
 * useVendorSubLedger — useQuery (GET, fires when params are provided)
 *
 * AP Aging uses useMutation because the payload is dynamically built by
 * the page component after orchestrating invoice + payment fetches, and
 * the user explicitly triggers it with a "Generate" button.
 *
 * Vendor Sub-Ledger uses useQuery because it's a pure GET report that
 * re-runs automatically whenever its key params change.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import * as reportsService from '../../services/financeReportsService';
import type {
  GetApAgingRequest,
  ApAgingReport,
  GetVendorSubLedgerParams,
  VendorSubLedgerReport,
} from '../../services/financeReportsService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const financeReportsQueryKeys = {
  vendorSubLedger: (params: GetVendorSubLedgerParams) =>
    ['finance', 'reports', 'vendor-sub-ledger', params] as const,
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
