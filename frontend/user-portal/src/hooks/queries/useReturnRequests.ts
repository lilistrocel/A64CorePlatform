/**
 * Return Request Query Hooks — Wave 3 (T-200.6)
 *
 * TanStack Query hooks for the Return Request (RR / RMA) document lifecycle.
 * Mirrors the structure of useDeliveries.ts.
 *
 * Status flow: draft → open → closed (auto when fully consumed) / cancelled
 * Endpoint base: /v1/sales/return-requests
 *
 * Usage:
 *   const { data } = useReturnRequests({ organizationId, status: 'open' });
 *   const { data: rr } = useReturnRequest(docId, orgId);
 *   const createMutation = useCreateReturnRequest();
 *   const fromDeliveryMutation = useCreateReturnRequestFromDelivery();
 *   const transitionMutation = useTransitionReturnRequest();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  ReturnRequestListParams,
  ReturnRequestCreate,
  ReturnRequestUpdate,
  ReturnRequestTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const rrQueryKeys = {
  all: () => ['sales', 'return-requests'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'return-requests', 'list', params] as const,
  detail: (id: string) => ['sales', 'return-requests', 'detail', id] as const,
} as const;

// ============================================================================
// List hook
// ============================================================================

/**
 * Fetch a paginated list of Return Requests.
 *
 * @param params - Filters: organizationId, status, customerId,
 *                 dateFrom, dateTo, page, size.
 */
export function useReturnRequests(params: ReturnRequestListParams) {
  return useQuery({
    queryKey: rrQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listReturnRequests(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Detail hook
// ============================================================================

/**
 * Fetch a single Return Request with all embedded lines.
 *
 * @param docId - Return Request UUID (undefined while URL param is loading).
 * @param orgId - Organisation UUID.
 */
export function useReturnRequest(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: rrQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getReturnRequest(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Return Request directly (manual entry).
 * Invalidates the RR list on success.
 */
export function useCreateReturnRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ReturnRequestCreate;
      orgId: string;
    }) => salesApi.createReturnRequest(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rrQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create a Return Request from a posted Delivery Note (primary path).
 *
 * The caller constructs the payload with the Delivery as baseDocRef.
 * Each line carries the Delivery line's quantity as the default requestedQty.
 * Invalidates both RR list and the source Delivery list/detail on success.
 */
export function useCreateReturnRequestFromDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ReturnRequestCreate;
      orgId: string;
    }) => salesApi.createReturnRequestFromDelivery(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rrQueryKeys.all(), refetchType: 'all' });
      // Source Delivery's returnedQty tracking may update — invalidate it
      qc.invalidateQueries({ queryKey: ['sales', 'deliveries'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Return Request.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateReturnRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: ReturnRequestUpdate;
      orgId: string;
    }) => salesApi.updateReturnRequest(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: rrQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(rrQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Return Request.
 * Invalidates the RR list on success.
 */
export function useDeleteReturnRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteReturnRequest(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rrQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition Return Request status.
 *
 * Key transitions:
 *   DRAFT → OPEN       — RMA authorised; Return Notes can now be created.
 *   DRAFT → CANCELLED  — Draft abandoned.
 *   OPEN  → CLOSED     — Fully consumed by Return Notes (or manually closed).
 *   OPEN  → CANCELLED  — RMA revoked before any Return Notes were created.
 *
 * Updates both the list cache and the individual detail cache on success.
 */
export function useTransitionReturnRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: ReturnRequestTransition;
      orgId: string;
    }) => salesApi.transitionReturnRequest(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: rrQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(rrQueryKeys.detail(result.docEntry), result);
    },
  });
}
