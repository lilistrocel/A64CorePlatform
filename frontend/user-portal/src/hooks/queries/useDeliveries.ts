/**
 * Delivery Note Query Hooks — Wave 3 (T-200.5)
 *
 * TanStack Query hooks for the Delivery Note (DN) document lifecycle.
 * Mirrors the structure of useSalesOrders.ts.
 *
 * Status flow: draft → open → cancelled (no partly_closed)
 * Endpoint base: /v1/sales/deliveries
 *
 * Usage:
 *   const { data } = useDeliveries({ organizationId, status: 'open' });
 *   const { data: dn } = useDelivery(docId, orgId);
 *   const fromSOMutation = useCreateDeliveryFromSO();
 *   const transitionMutation = useTransitionDelivery();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  DeliveryListParams,
  DeliveryUpdate,
  DeliveryFromSORequest,
  DeliveryTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const dnQueryKeys = {
  all: () => ['sales', 'deliveries'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'deliveries', 'list', params] as const,
  detail: (id: string) => ['sales', 'deliveries', 'detail', id] as const,
} as const;

// ============================================================================
// List hook
// ============================================================================

/**
 * Fetch a paginated list of Delivery Notes.
 *
 * @param params - Filters: organizationId, status, customerId, soDocEntry,
 *                 dateFrom, dateTo, page, size.
 */
export function useDeliveries(params: DeliveryListParams) {
  return useQuery({
    queryKey: dnQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listDeliveries(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Detail hook
// ============================================================================

/**
 * Fetch a single Delivery Note with all embedded lines.
 *
 * @param docId - Delivery UUID (undefined while URL param is loading).
 * @param orgId - Organisation UUID.
 */
export function useDelivery(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: dnQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getDelivery(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Delivery Note from an existing Sales Order (primary path).
 *
 * The backend validates each line against the SO's open_qty and copies
 * customer + warehouse defaults from the SO header.
 * Invalidates both Delivery list and the source SO list/detail on success
 * (the SO may auto-transition to PARTLY_CLOSED).
 */
export function useCreateDeliveryFromSO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      soDocEntry,
      data,
      orgId,
    }: {
      soDocEntry: string;
      data: DeliveryFromSORequest;
      orgId: string;
    }) => salesApi.createDeliveryFromSO(soDocEntry, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dnQueryKeys.all() });
      // Source SO may have auto-transitioned to PARTLY_CLOSED — invalidate both
      qc.invalidateQueries({ queryKey: ['sales', 'orders-v2'] });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Delivery Note.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: DeliveryUpdate;
      orgId: string;
    }) => salesApi.updateDelivery(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: dnQueryKeys.all() });
      qc.setQueryData(dnQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Delivery Note.
 * Invalidates the Delivery list on success.
 */
export function useDeleteDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteDelivery(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dnQueryKeys.all() });
    },
  });
}

/**
 * Mutation: transition Delivery Note status.
 *
 * Key transitions:
 *   DRAFT → OPEN   — Posts the delivery; decrements inventory; increments SO
 *                    deliveredQty; emits delivery_posted to finance outbox.
 *   DRAFT → CANCELLED — Discards without posting.
 *   OPEN  → CANCELLED — Reverses inventory movements; emits delivery_cancelled.
 *
 * Updates both the list cache and the individual detail cache on success.
 * Invalidates SO list because the source SO status may have changed.
 */
export function useTransitionDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: DeliveryTransition;
      orgId: string;
    }) => salesApi.transitionDelivery(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: dnQueryKeys.all() });
      qc.setQueryData(dnQueryKeys.detail(result.docEntry), result);
      // SO may have auto-closed when all lines are now delivered
      qc.invalidateQueries({ queryKey: ['sales', 'orders-v2'] });
    },
  });
}
