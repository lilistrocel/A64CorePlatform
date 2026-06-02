/**
 * Return Note v2 Query Hooks — Wave 3 (T-200.7)
 *
 * TanStack Query hooks for the Return Note (RTN) document lifecycle.
 * Mirrors the structure of useReturnRequests.ts.
 *
 * Status flow: draft → open → cancelled
 * Endpoint base: /v1/sales/returns-v2
 *
 * Two creation paths:
 *   from-RR:       useCreateReturnFromRR — uses POST /returns-v2/from-request/:rrDocEntry
 *   from-Delivery: useCreateReturnFromDelivery — uses POST /returns-v2 (client-side approach;
 *                  no dedicated backend endpoint exists for from-delivery)
 *
 * Usage:
 *   const { data } = useReturns({ organizationId, status: 'open' });
 *   const { data: rtn } = useReturn(docId, orgId);
 *   const createFromRR = useCreateReturnFromRR();
 *   const createFromDN = useCreateReturnFromDelivery();
 *   const transitionMutation = useTransitionReturn();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  ReturnNoteListParams,
  ReturnNoteFromRRRequest,
  ReturnNoteFromDNCreate,
  ReturnNoteCreate,
  ReturnNoteUpdate,
  ReturnNoteTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const rtnQueryKeys = {
  all: () => ['sales', 'returns-v2'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'returns-v2', 'list', params] as const,
  detail: (id: string) => ['sales', 'returns-v2', 'detail', id] as const,
} as const;

// ============================================================================
// List hook
// ============================================================================

/**
 * Fetch a paginated list of Return Notes.
 *
 * @param params - Filters: organizationId, status, customerId,
 *                 dateFrom, dateTo, page, size.
 */
export function useReturns(params: ReturnNoteListParams) {
  return useQuery({
    queryKey: rtnQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listReturns(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Detail hook
// ============================================================================

/**
 * Fetch a single Return Note with all embedded lines.
 *
 * @param docId - Return Note UUID (undefined while URL param is loading).
 * @param orgId - Organisation UUID.
 */
export function useReturn(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: rtnQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getReturn(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Return Note from a Return Request (primary RMA-gated path).
 *
 * The backend endpoint POST /returns-v2/from-request/:rrDocEntry validates that:
 *   - The RR is in OPEN status.
 *   - Each line's returnedQty ≤ (requestedQty - consumedQty) on the RR.
 * On success the RR's consumedQty is incremented server-side.
 *
 * Invalidates RTN list and source RR list/detail on success.
 */
export function useCreateReturnFromRR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      rrDocEntry,
      data,
      orgId,
    }: {
      rrDocEntry: string;
      data: ReturnNoteFromRRRequest;
      orgId: string;
    }) => salesApi.createReturnFromRR(rrDocEntry, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
      // Source RR's consumedQty ticked up — invalidate RR cache
      qc.invalidateQueries({ queryKey: ['sales', 'return-requests'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create a Return Note from a Delivery (skip-RMA / trusted-customer path).
 *
 * The backend does NOT expose a dedicated /from-delivery endpoint for RTN.
 * The caller (ReturnFormPage) constructs the payload from the Delivery data
 * client-side and submits to POST /returns-v2 with the DN as baseDocRef.
 *
 * Invalidates RTN list and source DN list/detail on success.
 */
export function useCreateReturnFromDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ReturnNoteFromDNCreate;
      orgId: string;
    }) => salesApi.createReturnFromDelivery(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
      // Source DN's returnedQty may update — invalidate delivery cache
      qc.invalidateQueries({ queryKey: ['sales', 'deliveries'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create a Return Note manually (blank form — very rare).
 * Invalidates the RTN list on success.
 */
export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ReturnNoteCreate;
      orgId: string;
    }) => salesApi.createReturn(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Return Note.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: ReturnNoteUpdate;
      orgId: string;
    }) => salesApi.updateReturn(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(rtnQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Return Note.
 * Invalidates the RTN list on success.
 */
export function useDeleteReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteReturn(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition Return Note status.
 *
 * Key transitions:
 *   DRAFT → OPEN       — Posts return; restores inventory; increments RR consumedQty;
 *                        increments DN returnedQty; emits return_posted to finance outbox.
 *   DRAFT → CANCELLED  — Draft abandoned (no inventory effect).
 *   OPEN  → CANCELLED  — Reversal: un-restores inventory; emits return_cancelled
 *                        (super_admin only on Open RTNs).
 *
 * Updates both the list cache and the individual detail cache on success.
 */
export function useTransitionReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: ReturnNoteTransition;
      orgId: string;
    }) => salesApi.transitionReturn(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: rtnQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(rtnQueryKeys.detail(result.docEntry), result);
      // A posting also affects RR consumedQty
      qc.invalidateQueries({ queryKey: ['sales', 'return-requests'], refetchType: 'all' });
      // And DN returnedQty
      qc.invalidateQueries({ queryKey: ['sales', 'deliveries'], refetchType: 'all' });
    },
  });
}
