/**
 * AR Invoice Query Hooks — Wave 3 (T-200.0)
 *
 * TanStack Query hooks for the AR Invoice (ARI) document lifecycle.
 * Mirrors the structure of useAPInvoices.ts.
 *
 * Only AR Invoice hooks are implemented in this task. Placeholder hooks for
 * other Wave 3 documents (Quote, SO, Delivery, etc.) live alongside these
 * once their tasks ship. Import from this file for all ARI operations.
 *
 * Usage:
 *   const { data, isLoading } = useArInvoices({ organizationId, status: 'OPEN' });
 *   const { data: ari } = useArInvoice(docId, orgId);
 *   const createMutation = useCreateArInvoice();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  ARInvoiceListParams,
  ARInvoiceCreate,
  ARInvoiceUpdate,
  ARInvoiceFromDelivery,
  ARInvoiceFromSORequest,
  ARInvoiceTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const ariQueryKeys = {
  all: () => ['sales', 'ar-invoices'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'ar-invoices', 'list', params] as const,
  detail: (id: string) => ['sales', 'ar-invoices', 'detail', id] as const,
} as const;

// ============================================================================
// AR Invoice list hook
// ============================================================================

/**
 * Fetch a paginated list of AR Invoices.
 *
 * @param params - Filters: organizationId, status, customerId, dateFrom, dateTo, page, size.
 */
export function useArInvoices(params: ARInvoiceListParams) {
  return useQuery({
    queryKey: ariQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listArInvoices(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// AR Invoice detail hook
// ============================================================================

/**
 * Fetch a single AR Invoice with all embedded lines.
 *
 * @param docId - AR Invoice UUID (undefined while loading URL param).
 * @param orgId - Organisation UUID.
 */
export function useArInvoice(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: ariQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getArInvoice(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a direct AR Invoice (DRAFT).
 *
 * Invalidates the AR Invoice list on success.
 */
export function useCreateArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, orgId }: { data: ARInvoiceCreate; orgId: string }) =>
      salesApi.createArInvoice(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create an AR Invoice from a posted Delivery Note.
 *
 * The backend inherits customer, dates, and lines from the Delivery document.
 * Invalidates the AR Invoice list on success.
 */
export function useCreateArInvoiceFromDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deliveryDocId,
      data,
      orgId,
    }: {
      deliveryDocId: string;
      data: ARInvoiceFromDelivery;
      orgId: string;
    }) => salesApi.createArInvoiceFromDelivery(deliveryDocId, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * T-201.10: Mutation: create an AR Invoice from service lines on a Sales Order.
 *
 * The SO must be OPEN or PARTLY_CLOSED. Stock lines on the same SO are invoiced
 * separately via the Delivery Note → from-Delivery flow.
 *
 * Invalidates AR Invoices, Sales Orders, and Deliveries (in case a related
 * stock line on a mixed SO was partially invoiced via DN earlier).
 */
export function useCreateARInvoiceFromSO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      soDocEntry,
      data,
      orgId,
    }: {
      soDocEntry: string;
      data: ARInvoiceFromSORequest;
      orgId: string;
    }) => salesApi.createArInvoiceFromSO(soDocEntry, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['sales', 'orders-v2'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['sales', 'deliveries'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT AR Invoice.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: ARInvoiceUpdate;
      orgId: string;
    }) => salesApi.updateArInvoice(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(ariQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT AR Invoice.
 *
 * If the invoice was created from a Delivery, the Delivery line invoicedQty
 * counters are decremented back by the backend.
 * Invalidates the AR Invoice list on success.
 */
export function useDeleteArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteArInvoice(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition AR Invoice status.
 *
 * Common transitions:
 *   DRAFT → OPEN         — Posts the invoice; emits sales_invoice_posted to finance outbox.
 *   OPEN  → CANCELLED    — Reverses the JE; emits sales_invoice_cancelled (super_admin only).
 *
 * Updates both the list cache and the individual detail cache on success.
 */
export function useTransitionArInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: ARInvoiceTransition;
      orgId: string;
    }) => salesApi.transitionArInvoice(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ariQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(ariQueryKeys.detail(result.docEntry), result);
    },
  });
}
