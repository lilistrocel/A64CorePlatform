/**
 * Trial Balance — TanStack Query hook
 *
 * - useTrialBalance  — fetch report on demand (enabled only when caller passes enabled=true)
 * - useFinancePeriods — fetch fiscal periods list for period picker
 */

import { useQuery } from '@tanstack/react-query';
import { getTrialBalance } from '../../services/trialBalanceService';
import { apiClient } from '../../services/api';
import type { GetTrialBalanceParams } from '../../services/trialBalanceService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const trialBalanceQueryKeys = {
  report: (params: GetTrialBalanceParams) =>
    ['finance', 'trial-balance', params.organizationId, params.companyCode, params] as const,
};

// ─── Report hook ───────────────────────────────────────────────────────────────

/**
 * Fetch the trial balance report.
 * `enabled` is controlled by the page: the query fires only when the user
 * clicks "Generate", not on mount. This avoids loading an expensive report
 * before the user selects a date/period.
 */
export function useTrialBalance(params: GetTrialBalanceParams, enabled: boolean) {
  return useQuery({
    queryKey: trialBalanceQueryKeys.report(params),
    queryFn: () => getTrialBalance(params),
    enabled: enabled && !!params.organizationId && !!params.companyCode,
    staleTime: 0,   // Trial balance is always freshly generated
    retry: false,
  });
}

// ─── Finance periods type ─────────────────────────────────────────────────────

export interface FinancePeriod {
  periodId: string;
  companyCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isClosed: boolean;
}

interface PeriodsEnvelope {
  data: FinancePeriod[];
  message: string | null;
}

// ─── Periods hook ──────────────────────────────────────────────────────────────

/**
 * Fetch available fiscal periods for a company.
 * Used by the Trial Balance toolbar to populate the optional period picker.
 * Returns empty array gracefully if the endpoint is not yet live.
 */
export function useFinancePeriods(orgId: string, companyCode: string) {
  return useQuery({
    queryKey: ['finance', 'periods', orgId, companyCode] as const,
    queryFn: async (): Promise<FinancePeriod[]> => {
      const response = await apiClient.get<PeriodsEnvelope>(
        '/v1/finance/periods',
        { params: { organization_id: orgId, company_code: companyCode } }
      );
      return response.data.data ?? [];
    },
    enabled: !!orgId && !!companyCode,
    staleTime: 5 * 60_000,
    // Graceful degradation: if the endpoint is not yet live, return empty
    retry: false,
  });
}
