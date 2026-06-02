/**
 * Sales Order v2 Query Hooks — Wave 3 (T-200.4)
 *
 * TanStack Query hooks for the Sales Order (SO) document lifecycle.
 * Mirrors the structure of useQuotes.ts / useArInvoices.ts.
 *
 * Status flow: draft → open → partly_closed → closed / cancelled
 * Endpoint base: /v1/sales/orders-v2
 *
 * Usage:
 *   const { data } = useSalesOrdersV2({ organizationId, status: 'open' });
 *   const { data: so } = useSalesOrderV2(docId, orgId);
 *   const createMutation = useCreateSalesOrderV2();
 *   const fromQuoteMutation = useCreateSalesOrderFromQuote();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  SalesOrderListParams,
  SalesOrderCreate,
  SalesOrderUpdate,
  SalesOrderTransition,
  SalesOrderFromQuoteRequest,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const soQueryKeys = {
  all: () => ['sales', 'orders-v2'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'orders-v2', 'list', params] as const,
  detail: (id: string) => ['sales', 'orders-v2', 'detail', id] as const,
} as const;

// ============================================================================
// List hook
// ============================================================================

/**
 * Fetch a paginated list of Sales Orders.
 *
 * @param params - Filters: organizationId, status, customerId, dateFrom, dateTo,
 *                 hasOpenLines, page, size.
 */
export function useSalesOrdersV2(params: SalesOrderListParams) {
  return useQuery({
    queryKey: soQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listSalesOrders(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Detail hook
// ============================================================================

/**
 * Fetch a single Sales Order with all embedded lines.
 *
 * @param docId - Sales Order UUID (undefined while loading URL param).
 * @param orgId - Organisation UUID.
 */
export function useSalesOrderV2(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: soQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getSalesOrder(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Sales Order in DRAFT status.
 * Invalidates the SO list on success.
 */
export function useCreateSalesOrderV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, orgId }: { data: SalesOrderCreate; orgId: string }) =>
      salesApi.createSalesOrder(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create a Sales Order from an existing Sales Quote.
 *
 * The backend copies all Quote lines into the SO and sets baseDocRef.
 * The Quote is auto-closed if all its lines are now fully consumed.
 *
 * Invalidates both SO list and Quote list/detail on success.
 */
export function useCreateSalesOrderFromQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quoteDocEntry,
      data,
      orgId,
    }: {
      quoteDocEntry: string;
      data: SalesOrderFromQuoteRequest;
      orgId: string;
    }) => salesApi.createSalesOrderFromQuote(quoteDocEntry, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soQueryKeys.all(), refetchType: 'all' });
      // Invalidate quotes list because the source quote may have auto-closed
      qc.invalidateQueries({ queryKey: ['sales', 'quotes'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Sales Order.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateSalesOrderV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: SalesOrderUpdate;
      orgId: string;
    }) => salesApi.updateSalesOrder(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: soQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(soQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Sales Order.
 * Invalidates the SO list on success.
 */
export function useDeleteSalesOrderV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteSalesOrder(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition Sales Order status.
 *
 * Common transitions:
 *   DRAFT → OPEN          — Credit-limit check runs; 409 if blocked.
 *   DRAFT → CANCELLED     — Discards without opening.
 *   OPEN  → PARTLY_CLOSED — System-managed when Delivery partly fulfils lines.
 *   OPEN  → CANCELLED     — Cancels an open SO; restores Quote consumed_qty.
 *   PARTLY_CLOSED → CLOSED — All lines fully delivered.
 *
 * Updates both the list cache and the individual detail cache on success.
 */
export function useTransitionSalesOrderV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: SalesOrderTransition;
      orgId: string;
    }) => salesApi.transitionSalesOrder(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: soQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(soQueryKeys.detail(result.docEntry), result);
    },
  });
}
