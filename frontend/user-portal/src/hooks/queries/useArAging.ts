/**
 * AR Aging Report Query Hook — Wave 3 (T-200.2)
 *
 * TanStack Query hook for the AR Aging report.
 * The report is a read-only aggregation of outstanding AR Invoices;
 * there are no mutations (no create/update/delete).
 *
 * Usage:
 *   const { data, isLoading, refetch } = useArAging({ organizationId, asOfDate });
 */

import { useQuery } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type { ARAgingParams } from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const arAgingQueryKeys = {
  all: () => ['sales', 'ar-aging'] as const,
  report: (params?: Record<string, unknown>) =>
    ['sales', 'ar-aging', 'report', params] as const,
} as const;

// ============================================================================
// AR Aging query hook
// ============================================================================

/**
 * Fetch the AR Aging report.
 *
 * The query is enabled only when organizationId is present.
 * staleTime is 60s — accounting reports are expected to be consistent
 * within a browser session; explicit Refresh button calls refetch().
 *
 * @param params - organizationId (required), asOfDate, customerId, currency.
 */
export function useArAging(params: ARAgingParams) {
  return useQuery({
    queryKey: arAgingQueryKeys.report(params as Record<string, unknown>),
    queryFn: () => salesApi.getArAging(params),
    enabled: Boolean(params.organizationId),
    staleTime: 60_000,
  });
}
