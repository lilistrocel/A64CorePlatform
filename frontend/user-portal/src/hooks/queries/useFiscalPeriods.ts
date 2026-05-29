/**
 * Fiscal Periods — TanStack Query hooks
 *
 * - useFiscalPeriods(params)    — paginated list; staleTime 60s
 * - useCreatePeriod()           — mutation; invalidates list on success
 * - useClosePeriod()            — mutation; invalidates list on success
 * - useReopenPeriod()           — mutation; invalidates list on success
 * - useClosePeriodPreview()     — mutation (imperative); dry-run preview; no cache invalidation
 *
 * Updated T-060.11:
 *   - useClosePeriod mutationFn now accepts ClosePeriodParams (adds organizationId
 *     + optional reason) to match the backend's required query param.
 *   - useReopenPeriod mutationFn now accepts ReopenPeriodParams (adds required reason).
 *   - Both mutations return typed results carrying ClosingJeInfo for year-end periods.
 *
 * Updated T-060.11-preview-fe:
 *   - useClosePeriodPreview: useMutation (not useQuery) so callers fire it imperatively
 *     when the close modal opens. staleTime semantics are not applicable to mutations;
 *     each modal open triggers a fresh dry-run call. No query cache invalidation —
 *     the dry-run is read-only.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as fiscalPeriodsService from '../../services/fiscalPeriodsService';
import type {
  ListPeriodsParams,
  CreatePeriodPayload,
  ClosePeriodParams,
  ReopenPeriodParams,
  PreviewClosePeriodResponse,
} from '../../services/fiscalPeriodsService';

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
    // Backend requires both organization_id AND company_code; firing without
    // company_code returns 422. Gate the query until both are set.
    enabled: !!params.organizationId && !!params.companyCode,
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
 *
 * Accepts ClosePeriodParams (periodId + organizationId + optional reason).
 * organizationId is required by the backend as a query param so it can
 * locate closing accounts for the year-end closing JE.
 *
 * The mutation result carries ClosingJeInfo when a year-end closing JE was
 * auto-posted; null for ordinary mid-year monthly closes.
 */
export function useClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ClosePeriodParams) =>
      fiscalPeriodsService.closePeriod(params),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: fiscalPeriodsQueryKeys.all(variables.organizationId),
      });
    },
  });
}

/**
 * Reopen a closed fiscal period.
 *
 * Accepts ReopenPeriodParams (periodId + organizationId + required reason).
 * reason is enforced to min 5 chars by the backend Pydantic model — the UI
 * also gates the Confirm button until the user has typed at least 5 chars.
 *
 * The mutation result carries closingJeReversal when the reopen reversed a
 * year-end closing JE; null for periods closed without a closing JE.
 */
export function useReopenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ReopenPeriodParams) =>
      fiscalPeriodsService.reopenPeriod(params),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: fiscalPeriodsQueryKeys.all(variables.organizationId),
      });
    },
  });
}

/**
 * Dry-run preview for closing a fiscal period.
 *
 * Returns PreviewClosePeriodResponse with the closing JE preview computed
 * server-side — same computation path as the real close, but no writes.
 *
 * Implemented as useMutation (not useQuery) so the caller fires it
 * imperatively (mutateAsync) when the close modal opens. Each modal open
 * triggers a fresh call; no query cache invalidation because this is read-only.
 *
 * Error semantics: the backend returns the same 400/409 error shapes as a
 * real close. The caller should surface the error message in the modal UI.
 */
export function useClosePeriodPreview() {
  return useMutation<
    PreviewClosePeriodResponse,
    unknown,
    { periodId: string; organizationId: string }
  >({
    mutationFn: ({ periodId, organizationId }) =>
      fiscalPeriodsService.previewClosePeriod(periodId, organizationId),
    // No onSuccess invalidation — dry-run is read-only.
  });
}
