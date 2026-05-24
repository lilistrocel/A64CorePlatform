/**
 * Cost Centres — TanStack Query hook
 *
 * Fetches the list of cost centres for the given organisation.
 * Cost centres change rarely — uses a 5-minute staleTime to avoid unnecessary
 * refetches on every navigation.
 *
 * Query key namespace: ['finance', 'cost-centers', orgId]
 */

import { useQuery } from '@tanstack/react-query';
import { listCostCenters, type CostCenter } from '../../services/costCentersService';

/**
 * Fetch all cost centres for the given organisation.
 * The query is disabled when orgId is null/undefined/empty.
 *
 * @param orgId - The organisation UUID. Pass null/undefined to disable.
 */
export function useCostCenters(orgId: string | null | undefined) {
  return useQuery<CostCenter[]>({
    queryKey: ['finance', 'cost-centers', orgId] as const,
    queryFn: () => listCostCenters(orgId!),
    enabled: !!orgId,
    // Cost centres are long-lived master data — 5 minutes before considered stale.
    staleTime: 5 * 60_000,
  });
}
