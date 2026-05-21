/**
 * Fiscal Periods — TanStack Query hooks
 *
 * - useFiscalPeriods(params)   — paginated list; staleTime 60s
 * - useCreatePeriod()          — mutation; invalidates list on success
 * - useClosePeriod()           — mutation; invalidates list on success
 * - useReopenPeriod()          — mutation; invalidates list on success
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as fiscalPeriodsService from '../../services/fiscalPeriodsService';
import type { ListPeriodsParams, CreatePeriodPayload } from '../../services/fiscalPeriodsService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const fiscalPeriodsQueryKeys = {
  all: (orgId: string) => ['finance', 'fiscal-periods', orgId] as const,
  list: (params: ListPeriodsParams) =>
    ['finance', 'fiscal-periods', params.organizationId, 'list', params] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetch fiscal periods for a given organisation with optional filters.
 * Disabled until organizationId is truthy.
 */
export function useFiscalPeriods(params: ListPeriodsParams) {
  return useQuery({
    queryKey: fiscalPeriodsQueryKeys.list(params),
    queryFn: () => fiscalPeriodsService.listPeriods(params),
    enabled: !!params.organizationId,
    // Periods don't change frequently — 60s before considered stale.
    staleTime: 60_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Create a single fiscal period.
 * Invalidates the entire fiscal-periods query namespace for the organisation
 * so newly created rows appear without a manual refresh.
 */
export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePeriodPayload) =>
      fiscalPeriodsService.createPeriod(payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: fiscalPeriodsQueryKeys.all(variables.organizationId),
      });
    },
  });
}

/**
 * Close an open fiscal period.
 * Accepts the full FiscalPeriod so the mutation has access to organizationId
 * for cache invalidation without needing a separate argument.
 */
export function useClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId }: { periodId: string; organizationId: string }) =>
      fiscalPeriodsService.closePeriod(periodId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: fiscalPeriodsQueryKeys.all(variables.organizationId),
      });
    },
  });
}

/**
 * Reopen a closed fiscal period.
 * Same signature and invalidation strategy as useClosePeriod.
 */
export function useReopenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId }: { periodId: string; organizationId: string }) =>
      fiscalPeriodsService.reopenPeriod(periodId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: fiscalPeriodsQueryKeys.all(variables.organizationId),
      });
    },
  });
}
