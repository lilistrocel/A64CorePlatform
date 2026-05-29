/**
 * Finance GL Accounts — TanStack Query hooks
 *
 * Follows the same pattern as usePurchasing.ts.
 * Query keys are namespaced under ['finance', 'accounts'].
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as financeAccountsService from '../../services/financeAccountsService';
import type {
  DrawerEnum,
  GLAccountCreate,
  GLAccountUpdate,
  CashFlowCategory,
  ListAccountsParams,
} from '../../services/financeAccountsService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const financeAccountsQueryKeys = {
  all: (orgId: string) => ['finance', 'accounts', orgId] as const,
  list: (orgId: string, filters?: Record<string, unknown>) =>
    ['finance', 'accounts', orgId, 'list', filters] as const,
  detail: (accountId: string) =>
    ['finance', 'accounts', 'detail', accountId] as const,
};

// ─── Filter shape ─────────────────────────────────────────────────────────────

export interface AccountFilters {
  drawer?: DrawerEnum;
  isActive?: boolean;
}

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Fetch the full list of GL accounts for the given organisation.
 * Loads up to 500 records in a single request (sufficient for the seeded 227 accounts).
 */
export function useFinanceAccounts(orgId: string, filters?: AccountFilters) {
  const params: ListAccountsParams = {
    organizationId: orgId,
    ...filters,
    size: 500,
  };

  return useQuery({
    queryKey: financeAccountsQueryKeys.list(orgId, filters as Record<string, unknown>),
    queryFn: () => financeAccountsService.listAccounts(params),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

/**
 * Fetch a single GL account by ID.
 */
export function useFinanceAccount(accountId: string | null, orgId: string) {
  return useQuery({
    queryKey: financeAccountsQueryKeys.detail(accountId!),
    queryFn: () => financeAccountsService.getAccount(accountId!, orgId),
    enabled: !!accountId && !!orgId,
    staleTime: 30_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Create a new GL account.
 * Invalidates the full account list on success.
 */
export function useCreateFinanceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GLAccountCreate) =>
      financeAccountsService.createAccount(data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.all(variables.organizationId),
      });
    },
  });
}

/**
 * Update an existing GL account.
 * Invalidates both the list and the detail query on success.
 */
export function useUpdateFinanceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      orgId,
      data,
    }: {
      accountId: string;
      orgId: string;
      data: GLAccountUpdate;
    }) => financeAccountsService.updateAccount(accountId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.detail(variables.accountId),
      });
    },
  });
}

/**
 * Deactivate (soft-delete) a GL account.
 * Invalidates the list on success.
 */
export function useDeactivateFinanceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId }: { accountId: string; orgId: string }) =>
      financeAccountsService.deactivateAccount(accountId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.detail(variables.accountId),
      });
    },
  });
}

/**
 * Reactivate a previously deactivated GL account.
 * Invalidates the list and detail on success.
 */
export function useReactivateFinanceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId }: { accountId: string; orgId: string }) =>
      financeAccountsService.reactivateAccount(accountId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.detail(variables.accountId),
      });
    },
  });
}

/**
 * Inline-edit mutation for the cashFlowCategory field (T-060.12).
 *
 * On success:
 *   1. Invalidates the CoA list so the detail pane refreshes.
 *   2. Invalidates ALL cash-flow report queries so the next visit to the
 *      Cash Flow Statement page fetches fresh data.
 */
export function useUpdateCashFlowCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      cashFlowCategory,
    }: {
      accountId: string;
      orgId: string;
      cashFlowCategory: CashFlowCategory;
    }) =>
      financeAccountsService.updateAccount(accountId, { cashFlowCategory }),
    onSuccess: (_result, variables) => {
      // Refresh the CoA list so the in-pane display picks up the new value.
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: financeAccountsQueryKeys.detail(variables.accountId),
      });
      // Invalidate all cash-flow report queries — the CF statement bucketing
      // depends on cashFlowCategory, so any cached CF report is now stale.
      queryClient.invalidateQueries({
        queryKey: ['finance', 'reports', 'cash-flow'],
      });
    },
  });
}
