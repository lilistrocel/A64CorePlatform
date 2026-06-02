/**
 * Customer Receipt Query Hooks — Wave 3 (T-200.1)
 *
 * TanStack Query hooks for the Customer Receipt (IPAY) document lifecycle.
 * Mirrors the structure of useArInvoices.ts.
 *
 * Usage:
 *   const { data, isLoading } = useCustomerReceipts({ organizationId, status: 'draft' });
 *   const { data: receipt } = useCustomerReceipt(docId, orgId);
 *   const createMutation = useCreateCustomerReceipt();
 *   const fromInvoiceMutation = useCreateCustomerReceiptFromInvoice();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  CustomerReceiptListParams,
  CustomerReceiptCreate,
  CustomerReceiptUpdate,
  CustomerReceiptFromInvoice,
  CustomerReceiptTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const crQueryKeys = {
  all: () => ['sales', 'customer-receipts'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'customer-receipts', 'list', params] as const,
  detail: (id: string) => ['sales', 'customer-receipts', 'detail', id] as const,
} as const;

// ============================================================================
// Customer Receipt list hook
// ============================================================================

/**
 * Fetch a paginated list of Customer Receipts.
 *
 * @param params - Filters: organizationId, status, customerId, dateFrom, dateTo, page, size.
 */
export function useCustomerReceipts(params: CustomerReceiptListParams) {
  return useQuery({
    queryKey: crQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listCustomerReceipts(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Customer Receipt detail hook
// ============================================================================

/**
 * Fetch a single Customer Receipt with all embedded allocations.
 *
 * @param docId - Customer Receipt UUID (undefined while loading URL param).
 * @param orgId - Organisation UUID.
 */
export function useCustomerReceipt(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: crQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getCustomerReceipt(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Customer Receipt with manual allocations (DRAFT).
 *
 * Invalidates the Customer Receipt list on success.
 */
export function useCreateCustomerReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, orgId }: { data: CustomerReceiptCreate; orgId: string }) =>
      salesApi.createCustomerReceipt(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: create a Customer Receipt from a single AR Invoice (from-invoice shortcut).
 *
 * The backend inherits customer, currency, and open-amount allocation from the ARI.
 * Invalidates both the Customer Receipt list and the AR Invoice list on success.
 */
export function useCreateCustomerReceiptFromInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ariDocEntry,
      data,
      orgId,
    }: {
      ariDocEntry: string;
      data: CustomerReceiptFromInvoice;
      orgId: string;
    }) => salesApi.createCustomerReceiptFromInvoice(ariDocEntry, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crQueryKeys.all(), refetchType: 'all' });
      // Invalidate AR Invoices list because the ARI's open_amount changed.
      qc.invalidateQueries({ queryKey: ['sales', 'ar-invoices'], refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Customer Receipt.
 *
 * If `allocations` is provided the existing allocation set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateCustomerReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: CustomerReceiptUpdate;
      orgId: string;
    }) => salesApi.updateCustomerReceipt(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: crQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(crQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Customer Receipt.
 *
 * Invalidates the Customer Receipt list on success.
 */
export function useDeleteCustomerReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteCustomerReceipt(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition Customer Receipt status.
 *
 * Common transitions:
 *   DRAFT → OPEN       — Posts the payment; atomically updates AR Invoice paid_amounts.
 *   OPEN  → CANCELLED  — Reverses AR Invoice paid_amount increments; super_admin only.
 *
 * Updates both the list cache and the individual detail cache on success.
 * Also invalidates AR Invoices since their paid/open amounts change on OPEN/CANCEL.
 */
export function useTransitionCustomerReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: CustomerReceiptTransition;
      orgId: string;
    }) => salesApi.transitionCustomerReceipt(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: crQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(crQueryKeys.detail(result.docEntry), result);
      // Posting/cancellation changes AR Invoice open_amount — refresh ARI cache.
      qc.invalidateQueries({ queryKey: ['sales', 'ar-invoices'], refetchType: 'all' });
    },
  });
}
