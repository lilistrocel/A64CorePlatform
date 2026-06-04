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
  /**
   * T-201.8 — key variant that bakes in the isStock filter so React Query caches
   * stock-filtered and unfiltered lists separately.
   */
  allFiltered: (orgId: string, isStock: boolean | null | undefined) =>
    ['finance', 'sale-item-finance-ext', orgId, { isStock: isStock ?? null }] as const,
  byItem: (orgId: string, itemId: string) =>
    ['finance', 'sale-item-finance-ext', orgId, itemId] as const,
} as const;

// ─── List hook ─────────────────────────────────────────────────────────────────

/**
 * Options bag for useSaleItemFinanceExtList.
 */
export interface SaleItemFinanceExtListOptions {
  /**
   * T-201.8 — when set to `false`, fetches only service/fee items (isStock=false).
   * Omit (or pass undefined) to return all items regardless of stock type.
   */
  isStock?: boolean | null;
}

/**
 * Fetch all sale item finance extensions for the given organisation.
 *
 * Results are cached for 2 minutes (master data that changes infrequently).
 * The query is disabled when orgId is falsy.
 *
 * @param orgId   - Organisation UUID. Pass null/undefined to disable.
 * @param options - Optional filter bag (e.g. { isStock: false } for service items only).
 */
export function useSaleItemFinanceExtList(
  orgId: string | null | undefined,
  options?: SaleItemFinanceExtListOptions,
) {
  const isStock = options?.isStock;
  return useQuery({
    // Use a differentiated query key so stock-filtered and full lists cache separately.
    queryKey:
      isStock != null
        ? saleItemFinanceExtKeys.allFiltered(orgId ?? '', isStock)
        : saleItemFinanceExtKeys.all(orgId ?? ''),
    queryFn: () =>
      listSaleItemFinanceExt({
        organizationId: orgId!,
        size: 200,
        ...(isStock != null ? { isStock } : {}),
      }),
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
      void qc.invalidateQueries({
        queryKey: saleItemFinanceExtKeys.all(orgId),
        refetchType: 'all',
      });
    },
  });
}

// ─── Update mutation ──────────────────────────────────────────────────────────

/**
 * Update an existing sale item finance extension.
 * Invalidates both the list and the per-item queries on success.
 *
 * Note (T-201.8 follow-up, 2026-06-02): `refetchType: 'all'` is required because
 * `react-query.config.ts` sets `refetchOnMount: false` globally. Without it,
 * the SalesItemCombobox (mounted later on the ARI direct-create form) would
 * serve a stale `isStock=false` cache from before the toggle. Same pattern
 * used across the T-201.5–.7 DN visibility mutations.
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
      void qc.invalidateQueries({
        queryKey: saleItemFinanceExtKeys.all(orgId),
        refetchType: 'all',
      });
      void qc.invalidateQueries({
        queryKey: saleItemFinanceExtKeys.byItem(orgId, variables.itemId),
        refetchType: 'all',
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
      void qc.invalidateQueries({
        queryKey: saleItemFinanceExtKeys.all(orgId),
        refetchType: 'all',
      });
    },
  });
}
