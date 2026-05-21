/**
 * Item GL Account Mapping — TanStack Query hooks
 *
 * Follows the same pattern as useFinanceAccounts.ts and usePostingSetup.ts.
 * Query keys are namespaced under ['finance', 'item-mappings'].
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as itemMappingService from '../../services/itemMappingService';
import type {
  PurchaseItemType,
  UpdateItemMappingBody,
} from '../../services/itemMappingService';

// ─── Filter shape ─────────────────────────────────────────────────────────────

export interface ItemMappingFilters {
  itemType?: PurchaseItemType;
  /** undefined = "All" (both active and inactive returned by backend) */
  isActive?: boolean;
  search?: string;
}

// ─── Query key factory ─────────────────────────────────────────────────────────

export const itemMappingQueryKeys = {
  all: (orgId: string) => ['finance', 'item-mappings', orgId] as const,
  list: (orgId: string, filters?: ItemMappingFilters) =>
    ['finance', 'item-mappings', orgId, 'list', filters ?? {}] as const,
  detail: (orgId: string, itemId: string) =>
    ['finance', 'item-mappings', orgId, 'detail', itemId] as const,
};

// ─── Read hooks ────────────────────────────────────────────────────────────────

/**
 * Fetch the list of purchase items with their finance GL account mappings.
 *
 * - staleTime: 30 s — balances freshness with reducing network round-trips for
 *   a table that changes only when finance saves a row. The backend endpoint
 *   will serve fresh data on the next request after the stale window expires.
 * - enabled: requires orgId to be a non-empty string.
 */
export function useItemMappings(orgId: string, filters?: ItemMappingFilters) {
  return useQuery({
    queryKey: itemMappingQueryKeys.list(orgId, filters),
    queryFn: () =>
      itemMappingService.listItemMappings(orgId, {
        itemType: filters?.itemType,
        isActive: filters?.isActive,
        search: filters?.search,
      }),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

/**
 * Fetch a single purchase item finance extension by item ID.
 * Used by row-level detail views if needed.
 */
export function useItemMapping(orgId: string, itemId: string | null) {
  return useQuery({
    queryKey: itemMappingQueryKeys.detail(orgId, itemId!),
    queryFn: () => itemMappingService.getItemMapping(orgId, itemId!),
    enabled: !!orgId && !!itemId,
    staleTime: 30_000,
  });
}

// ─── Mutation hooks ────────────────────────────────────────────────────────────

/**
 * PATCH mutation for updating the GL account assignment on a single item row.
 *
 * On success the list query is invalidated so the table re-fetches and reflects
 * the saved data. The detail query for this specific item is also invalidated
 * for any future detail-level consumers.
 */
export function useUpdateItemMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      itemId,
      body,
    }: {
      orgId: string;
      itemId: string;
      body: UpdateItemMappingBody;
    }) => itemMappingService.updateItemMapping(orgId, itemId, body),

    onSuccess: (_result, variables) => {
      // Invalidate the list so the table refreshes.
      queryClient.invalidateQueries({
        queryKey: itemMappingQueryKeys.all(variables.orgId),
      });
      // Invalidate the specific detail query if any component holds it.
      queryClient.invalidateQueries({
        queryKey: itemMappingQueryKeys.detail(variables.orgId, variables.itemId),
      });
    },
  });
}
