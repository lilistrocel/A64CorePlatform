/**
 * Posting Setup — TanStack Query hooks
 *
 * usePostingSetup      — query for the current setup (treats 404 as undefined)
 * useUpsertPostingSetup — mutation that POSTs/PUTs and invalidates the query
 *
 * Query key namespace: ['finance', 'posting-setup', orgId, companyCode]
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPostingSetup,
  upsertPostingSetup,
} from '../../services/postingSetupService';
import type { CompanyPostingSetupUpdate } from '../../services/postingSetupService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const postingSetupQueryKeys = {
  detail: (orgId: string, companyCode: string) =>
    ['finance', 'posting-setup', orgId, companyCode] as const,
};

// ─── Read hook ────────────────────────────────────────────────────────────────

/**
 * Fetch the posting setup for a given company.
 *
 * When the backend returns 404 (no setup configured yet),
 * `data` will be `undefined` — this is not treated as an error.
 * The `isError` flag is only set for genuine network/server errors.
 *
 * Disabled when either orgId or companyCode is empty.
 */
export function usePostingSetup(orgId: string, companyCode: string) {
  return useQuery({
    queryKey: postingSetupQueryKeys.detail(orgId, companyCode),
    queryFn: () => getPostingSetup(orgId, companyCode),
    enabled: !!orgId && !!companyCode,
    // Posting setup rarely changes — 2 minutes before stale.
    staleTime: 2 * 60_000,
    // Retry only once; 404 is swallowed by the service layer so we only
    // reach here for real server errors.
    retry: 1,
  });
}

// ─── Mutation hook ────────────────────────────────────────────────────────────

/**
 * Upsert (create or update) the posting setup for a company.
 *
 * On success, invalidates the matching query so the page re-fetches
 * the authoritative response (including the `isComplete` flag).
 */
export function useUpsertPostingSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      companyCode,
      data,
    }: {
      orgId: string;
      companyCode: string;
      data: CompanyPostingSetupUpdate;
    }) => upsertPostingSetup(orgId, companyCode, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: postingSetupQueryKeys.detail(variables.orgId, variables.companyCode),
      });
    },
  });
}
