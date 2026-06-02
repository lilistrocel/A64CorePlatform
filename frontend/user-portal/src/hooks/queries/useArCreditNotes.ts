/**
 * AR Credit Note Query Hooks — Wave 3 (T-200.8)
 *
 * TanStack Query hooks for the AR Credit Note (ARC) document lifecycle.
 * Mirrors the structure of useReturns.ts.
 *
 * Status flow: draft → open → partly_closed → closed → cancelled
 * Endpoint base: /v1/sales/ar-credit-notes
 *
 * Two creation paths:
 *   from-RTN:     useCreateArCreditNoteFromRTN — financial completion of a physical return.
 *                 Payload must include baseReturnDocRef pointing to the RTN.
 *   from-Invoice: useCreateArCreditNoteFromInvoice — direct financial reversal
 *                 against an ARI; no physical return. baseReturnDocRef = null.
 *
 * Usage:
 *   const { data } = useArCreditNotes({ organizationId, status: 'open' });
 *   const { data: arc } = useArCreditNote(docId, orgId);
 *   const createFromRTN = useCreateArCreditNoteFromRTN();
 *   const createFromInvoice = useCreateArCreditNoteFromInvoice();
 *   const transition = useTransitionArCreditNote();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  ARCreditNoteListParams,
  ARCreditNoteCreate,
  ARCreditNoteUpdate,
  ARCreditNoteTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const arcQueryKeys = {
  all: () => ['sales', 'ar-credit-notes'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'ar-credit-notes', 'list', params] as const,
  detail: (id: string) => ['sales', 'ar-credit-notes', 'detail', id] as const,
} as const;

// ============================================================================
// List hook
// ============================================================================

/**
 * Fetch a paginated list of AR Credit Notes.
 *
 * @param params - Filters: organizationId, status, customerId, dateFrom, dateTo, page, size.
 */
export function useArCreditNotes(params: ARCreditNoteListParams) {
  return useQuery({
    queryKey: arcQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listArCreditNotes(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Detail hook
// ============================================================================

/**
 * Fetch a single AR Credit Note with all embedded lines and allocations.
 *
 * @param docId - AR Credit Note UUID (undefined while URL param is loading).
 * @param orgId - Organisation UUID.
 */
export function useArCreditNote(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: arcQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getArCreditNote(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create an AR Credit Note as the financial completion of a Return (RTN).
 *
 * The payload must include baseReturnDocRef pointing to the RTN.
 * On success the RTN's consumedQty ticks up server-side.
 *
 * Invalidates ARC list and source RTN list/detail on success.
 */
export function useCreateArCreditNoteFromRTN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ARCreditNoteCreate;
      orgId: string;
    }) => salesApi.createArCreditNoteFromRTN(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
      // Source RTN's consumedQty ticked up — invalidate RTN cache
      qc.invalidateQueries({ queryKey: ['sales', 'returns-v2'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create an AR Credit Note as a direct financial reversal against an ARI.
 *
 * No physical return involved. baseReturnDocRef will be null.
 * Used for discounts, billing corrections, customer refunds without goods movement.
 *
 * Invalidates ARC list and source ARI list/detail on success.
 */
export function useCreateArCreditNoteFromInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ARCreditNoteCreate;
      orgId: string;
    }) => salesApi.createArCreditNoteFromInvoice(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
      // Source ARI's creditedAmount/openAmount may update — invalidate ARI cache
      qc.invalidateQueries({ queryKey: ['sales', 'ar-invoices'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create an AR Credit Note manually (blank form — very rare).
 */
export function useCreateArCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      orgId,
    }: {
      data: ARCreditNoteCreate;
      orgId: string;
    }) => salesApi.createArCreditNote(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT AR Credit Note.
 *
 * If lines or allocations are provided the existing sets are replaced wholesale.
 * Updates both list and detail cache on success.
 */
export function useUpdateArCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: ARCreditNoteUpdate;
      orgId: string;
    }) => salesApi.updateArCreditNote(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(arcQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT AR Credit Note.
 */
export function useDeleteArCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteArCreditNote(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition AR Credit Note status.
 *
 * Key transitions:
 *   DRAFT → OPEN       — Posts credit note; updates ARI creditedAmount/openAmount;
 *                        emits credit_note_posted event.
 *   DRAFT → CANCELLED  — Draft abandoned.
 *   OPEN  → CLOSED     — Terminal close.
 *   OPEN  → CANCELLED  — Financial reversal (super_admin only).
 *
 * Updates both list cache and individual detail cache on success.
 * Also invalidates ARI cache since posting affects ARI open_amount.
 */
export function useTransitionArCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: ARCreditNoteTransition;
      orgId: string;
    }) => salesApi.transitionArCreditNote(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: arcQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(arcQueryKeys.detail(result.docEntry), result);
      // Posting affects AR Invoice creditedAmount and openAmount
      qc.invalidateQueries({ queryKey: ['sales', 'ar-invoices'], refetchType: 'all' });
      // If this ARC was from a RTN, RTN state may update too
      qc.invalidateQueries({ queryKey: ['sales', 'returns-v2'], refetchType: 'all' });
    },
  });
}
