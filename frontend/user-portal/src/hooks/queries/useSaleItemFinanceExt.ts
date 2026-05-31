/**
 * Sale Item Finance Extension — TanStack Query hooks (T-200.9)
 *
 * Provides hooks for fetching and mutating sale_item_finance_ext records
 * from the finance microservice at GET/POST/PATCH /api/v1/finance/item-finance-ext.
 *
 * These hooks are consumed by SalesItemsPage to display per-item GL account
 * and tax code configuration, and to allow accountants to edit that config
 * via the inline edit modal.
 *
 * Query key namespace: ['finance', 'sale-item-finance-ext', orgId]
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSaleItemFinanceExt,
  getSaleItemFinanceExtByItem,
  createSaleItemFinanceExt,
  updateSaleItemFinanceExt,
  deleteSaleItemFinanceExt,
} from '../../services/salesApi';
import type {
  SaleItemFinanceExtCreate,
  SaleItemFinanceExtUpdate,
} from '../../services/salesApi';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const saleItemFinanceExtKeys = {
  all: (orgId: string) => ['finance', 'sale-item-finance-ext', orgId] as const,
  byItem: (orgId: string, itemId: string) =>
    ['finance', 'sale-item-finance-ext', orgId, itemId] as const,
} as const;

// ─── List hook ─────────────────────────────────────────────────────────────────

/**
 * Fetch all sale item finance extensions for the given organisation.
 *
 * Results are cached for 2 minutes (master data that changes infrequently).
 * The query is disabled when orgId is falsy.
 *
 * @param orgId - Organisation UUID. Pass null/undefined to disable.
 */
export function useSaleItemFinanceExtList(orgId: string | null | undefined) {
  return useQuery({
    queryKey: saleItemFinanceExtKeys.all(orgId ?? ''),
    queryFn: () =>
      listSaleItemFinanceExt({ organizationId: orgId!, size: 200 }),
    enabled: !!orgId,
    staleTime: 2 * 60_000,
    select: (data) => data.items,
  });
}

// ─── Single-item hook ──────────────────────────────────────────────────────────

/**
 * Fetch the sale finance extension for a specific item.
 * Returns null (not an error) when the item has no ext record.
 *
 * @param orgId  - Organisation UUID.
 * @param itemId - MongoDB item UUID.
 */
export function useSaleItemFinanceExtByItem(
  orgId: string | null | undefined,
  itemId: string | null | undefined,
) {
  return useQuery({
    queryKey: saleItemFinanceExtKeys.byItem(orgId ?? '', itemId ?? ''),
    queryFn: () => getSaleItemFinanceExtByItem(itemId!, orgId!),
    enabled: !!orgId && !!itemId,
    staleTime: 2 * 60_000,
  });
}

// ─── Create mutation ──────────────────────────────────────────────────────────

/**
 * Create a new sale item finance extension.
 * Invalidates the list query on success so the table refreshes.
 */
export function useCreateSaleItemFinanceExt(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaleItemFinanceExtCreate) =>
      createSaleItemFinanceExt(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: saleItemFinanceExtKeys.all(orgId) });
    },
  });
}

// ─── Update mutation ──────────────────────────────────────────────────────────

/**
 * Update an existing sale item finance extension.
 * Invalidates both the list and the per-item queries on success.
 */
export function useUpdateSaleItemFinanceExt(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: {
      itemId: string;
      body: SaleItemFinanceExtUpdate;
    }) => updateSaleItemFinanceExt(itemId, body, orgId),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: saleItemFinanceExtKeys.all(orgId) });
      void qc.invalidateQueries({
        queryKey: saleItemFinanceExtKeys.byItem(orgId, variables.itemId),
      });
    },
  });
}

// ─── Delete mutation ──────────────────────────────────────────────────────────

/**
 * Delete a sale item finance extension.
 * Invalidates the list query on success.
 */
export function useDeleteSaleItemFinanceExt(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteSaleItemFinanceExt(itemId, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: saleItemFinanceExtKeys.all(orgId) });
    },
  });
}
