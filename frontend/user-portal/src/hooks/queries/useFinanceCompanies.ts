/**
 * Finance Companies — TanStack Query hook
 *
 * Fetches the list of legal company entities for the given organisation.
 * Companies change rarely — uses a 5-minute staleTime to avoid unnecessary
 * refetches on every navigation.
 *
 * Query key namespace: ['finance', 'companies', orgId]
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCompanies, createCompany } from '../../services/financeCompaniesService';
import type { CreateCompanyPayload, CreateCompanyResult } from '../../services/financeCompaniesService';

/**
 * Fetch all companies for the given organisation.
 * The query is disabled when orgId is null/undefined/empty.
 *
 * @param orgId - The organisation UUID. Pass null or undefined to disable.
 */
export function useFinanceCompanies(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finance', 'companies', orgId] as const,
    queryFn: () => listCompanies(orgId!),
    enabled: !!orgId,
    // Companies are long-lived master data — 5 minutes before considered stale.
    staleTime: 5 * 60_000,
  });
}

/**
 * Mutation to create a new finance company code (seeds CoA + tax codes).
 * Invalidates the companies list for the affected org on success.
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation<CreateCompanyResult, Error, CreateCompanyPayload>({
    mutationFn: (payload: CreateCompanyPayload) => createCompany(payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['finance', 'companies', variables.organizationId],
      });
    },
  });
}
