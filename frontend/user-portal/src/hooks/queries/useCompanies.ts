/**
 * Finance Companies — TanStack Query hook
 *
 * Fetches the list of companies for the given organisation.
 * Companies change very rarely — uses a 5-minute staleTime to avoid unnecessary
 * refetches on every navigation.
 *
 * Query key namespace: ['finance', 'companies', orgId]
 */

import { useQuery } from '@tanstack/react-query';
import { listCompanies } from '../../services/companiesService';

/**
 * Fetch all companies for the given organisation.
 * The query is disabled when orgId is null/undefined/empty.
 *
 * @param orgId - The organisation UUID. Pass null or undefined to disable.
 */
export function useCompanies(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finance', 'companies', orgId] as const,
    queryFn: () => listCompanies(orgId!),
    enabled: !!orgId,
    // Companies are long-lived master data — 5 minutes before considered stale.
    staleTime: 5 * 60_000,
  });
}
