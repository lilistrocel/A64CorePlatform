/**
 * Purchasing Query Hooks
 *
 * TanStack Query hooks for vendor master, purchase item master,
 * and payment terms master data.
 *
 * Follows the same patterns as useFarms.ts / useSales.ts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as purchasingApi from '../../services/purchasingApi';
import type {
  Vendor,
  VendorCreate,
  VendorUpdate,
  PurchaseItem,
  PurchaseItemCreate,
  PurchaseItemUpdate,
  PaymentTerms,
  PaymentTermsCreate,
  PaymentTermsUpdate,
  PRCreate,
  PRUpdate,
  PRStatus,
  POCreate,
  POUpdate,
  POFromPRCreate,
  POStatus,
} from '../../services/purchasingApi';

// ============================================================================
// Query key constants
// ============================================================================

export const purchasingQueryKeys = {
  vendors: {
    all: () => ['purchasing', 'vendors'] as const,
    list: (params?: Record<string, unknown>) =>
      ['purchasing', 'vendors', 'list', params] as const,
    detail: (id: string) => ['purchasing', 'vendors', 'detail', id] as const,
  },
  items: {
    all: () => ['purchasing', 'items'] as const,
    list: (params?: Record<string, unknown>) =>
      ['purchasing', 'items', 'list', params] as const,
    detail: (id: string) => ['purchasing', 'items', 'detail', id] as const,
  },
  paymentTerms: {
    all: () => ['purchasing', 'payment-terms'] as const,
    list: (params?: Record<string, unknown>) =>
      ['purchasing', 'payment-terms', 'list', params] as const,
  },
  pr: {
    all: () => ['purchasing', 'pr'] as const,
    list: (params?: Record<string, unknown>) =>
      ['purchasing', 'pr', 'list', params] as const,
    detail: (id: string) => ['purchasing', 'pr', 'detail', id] as const,
  },
  po: {
    all: () => ['purchasing', 'po'] as const,
    list: (params?: Record<string, unknown>) =>
      ['purchasing', 'po', 'list', params] as const,
    detail: (id: string) => ['purchasing', 'po', 'detail', id] as const,
  },
  approvals: {
    pending: () => ['purchasing', 'approvals', 'pending'] as const,
    history: (params?: Record<string, unknown>) =>
      ['purchasing', 'approvals', 'history', params] as const,
  },
} as const;

// ============================================================================
// Vendor hooks
// ============================================================================

/**
 * Fetch paginated vendor list.
 *
 * @param params - Optional filters: organizationId, page, perPage, search, isActive.
 */
export function useVendors(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  search?: string;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.vendors.list(params),
    queryFn: () => purchasingApi.getVendors(params),
    staleTime: 30_000,
  });
}

/**
 * Fetch a single vendor by ID.
 *
 * @param vendorId - UUID string of the vendor.
 * @param organizationId - Optional org scope.
 */
export function useVendor(vendorId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: purchasingQueryKeys.vendors.detail(vendorId!),
    queryFn: () => purchasingApi.getVendor(vendorId!, organizationId),
    enabled: !!vendorId,
    staleTime: 30_000,
  });
}

/**
 * Mutation: create a vendor.
 *
 * Invalidates the vendors list on success.
 */
export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VendorCreate) => purchasingApi.createVendor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.vendors.all() });
    },
  });
}

/**
 * Mutation: update a vendor.
 *
 * Invalidates the vendor detail and list on success.
 */
export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, data }: { vendorId: string; data: VendorUpdate }) =>
      purchasingApi.updateVendor(vendorId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.vendors.all() });
      queryClient.invalidateQueries({
        queryKey: purchasingQueryKeys.vendors.detail(variables.vendorId),
      });
    },
  });
}

/**
 * Mutation: soft-delete a vendor.
 *
 * Invalidates the vendors list on success.
 */
export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: string) => purchasingApi.deleteVendor(vendorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.vendors.all() });
    },
  });
}

// ============================================================================
// Purchase Item hooks
// ============================================================================

/**
 * Fetch paginated purchase item list.
 *
 * @param params - Optional filters: organizationId, page, perPage, search, itemType, isActive.
 */
export function usePurchaseItems(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  search?: string;
  itemType?: string;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.items.list(params),
    queryFn: () => purchasingApi.getPurchaseItems(params),
    staleTime: 30_000,
  });
}

/**
 * Fetch a single purchase item by ID.
 *
 * @param itemId - UUID string of the purchase item.
 * @param organizationId - Optional org scope.
 */
export function usePurchaseItem(itemId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: purchasingQueryKeys.items.detail(itemId!),
    queryFn: () => purchasingApi.getPurchaseItem(itemId!, organizationId),
    enabled: !!itemId,
    staleTime: 30_000,
  });
}

/**
 * Mutation: create a purchase item.
 */
export function useCreatePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PurchaseItemCreate) => purchasingApi.createPurchaseItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.items.all() });
    },
  });
}

/**
 * Mutation: update a purchase item.
 */
export function useUpdatePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: PurchaseItemUpdate }) =>
      purchasingApi.updatePurchaseItem(itemId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.items.all() });
      queryClient.invalidateQueries({
        queryKey: purchasingQueryKeys.items.detail(variables.itemId),
      });
    },
  });
}

/**
 * Mutation: soft-delete a purchase item.
 */
export function useDeletePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => purchasingApi.deletePurchaseItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.items.all() });
    },
  });
}

// ============================================================================
// Payment Terms hooks
// ============================================================================

/**
 * Fetch all payment terms for the current organisation.
 *
 * @param params - Optional filters: organizationId, isActive.
 */
export function usePaymentTerms(params?: {
  organizationId?: string;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.paymentTerms.list(params),
    queryFn: () => purchasingApi.getPaymentTerms(params),
    staleTime: 60_000,
  });
}

/**
 * Mutation: create payment terms.
 */
export function useCreatePaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PaymentTermsCreate) => purchasingApi.createPaymentTerms(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.paymentTerms.all() });
    },
  });
}

/**
 * Mutation: update payment terms.
 */
export function useUpdatePaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ termsId, data }: { termsId: string; data: PaymentTermsUpdate }) =>
      purchasingApi.updatePaymentTerms(termsId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.paymentTerms.all() });
    },
  });
}

/**
 * Mutation: soft-delete payment terms.
 */
export function useDeletePaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (termsId: string) => purchasingApi.deletePaymentTerms(termsId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.paymentTerms.all() });
    },
  });
}

// ============================================================================
// Phase 1B — Purchase Request hooks
// ============================================================================

/** Fetch paginated PR list. */
export function usePurchaseRequests(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: PRStatus;
  search?: string;
  requesterId?: string;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.pr.list(params),
    queryFn: () => purchasingApi.getPurchaseRequests(params),
    staleTime: 15_000,
  });
}

/** Fetch a single PR detail with lines. */
export function usePurchaseRequest(docId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: purchasingQueryKeys.pr.detail(docId!),
    queryFn: () => purchasingApi.getPurchaseRequest(docId!, organizationId),
    enabled: !!docId,
    staleTime: 15_000,
  });
}

/** Mutation: create a PR. */
export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, organizationId }: { data: PRCreate; organizationId?: string }) =>
      purchasingApi.createPurchaseRequest(data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
    },
  });
}

/** Mutation: update a Draft PR. */
export function useUpdatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, data, organizationId }: { docId: string; data: PRUpdate; organizationId?: string }) =>
      purchasingApi.updatePurchaseRequest(docId, data, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.detail(variables.docId) });
    },
  });
}

/** Mutation: submit a PR for approval. */
export function useSubmitPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.submitPurchaseRequest(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: approve a PR. */
export function useApprovePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      comment,
      organizationId,
    }: {
      docId: string;
      comment?: string | null;
      organizationId?: string;
    }) => purchasingApi.approvePurchaseRequest(docId, { comment }, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: reject a PR (comment required). */
export function useRejectPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      comment,
      organizationId,
    }: {
      docId: string;
      comment: string;
      organizationId?: string;
    }) => purchasingApi.rejectPurchaseRequest(docId, { comment }, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: cancel a PR. */
export function useCancelPurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.cancelPurchaseRequest(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.detail(variables.docId) });
    },
  });
}

// ============================================================================
// Phase 1B — Purchase Order hooks
// ============================================================================

/** Fetch paginated PO list. */
export function usePurchaseOrders(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: POStatus;
  search?: string;
  vendorId?: string;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.po.list(params),
    queryFn: () => purchasingApi.getPurchaseOrders(params),
    staleTime: 15_000,
  });
}

/** Fetch a single PO detail with lines. */
export function usePurchaseOrder(docId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: purchasingQueryKeys.po.detail(docId!),
    queryFn: () => purchasingApi.getPurchaseOrder(docId!, organizationId),
    enabled: !!docId,
    staleTime: 15_000,
  });
}

/** Mutation: create a PO (manual). */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, organizationId }: { data: POCreate; organizationId?: string }) =>
      purchasingApi.createPurchaseOrder(data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
    },
  });
}

/** Mutation: create PO from approved PR. */
export function useConvertPRToPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      prDocId,
      data,
      organizationId,
    }: {
      prDocId: string;
      data: POFromPRCreate;
      organizationId?: string;
    }) => purchasingApi.createPurchaseOrderFromPR(prDocId, data, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.pr.all() });
    },
  });
}

/** Mutation: update a Draft PO. */
export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, data, organizationId }: { docId: string; data: POUpdate; organizationId?: string }) =>
      purchasingApi.updatePurchaseOrder(docId, data, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
    },
  });
}

/** Mutation: submit a PO. */
export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.submitPurchaseOrder(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: approve a PO. */
export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      comment,
      organizationId,
    }: {
      docId: string;
      comment?: string | null;
      organizationId?: string;
    }) => purchasingApi.approvePurchaseOrder(docId, { comment }, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: reject a PO (comment required). */
export function useRejectPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      comment,
      organizationId,
    }: {
      docId: string;
      comment: string;
      organizationId?: string;
    }) => purchasingApi.rejectPurchaseOrder(docId, { comment }, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.approvals.pending() });
    },
  });
}

/** Mutation: send a PO to vendor. */
export function useSendPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.sendPurchaseOrder(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
    },
  });
}

/** Mutation: cancel a PO. */
export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.cancelPurchaseOrder(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
    },
  });
}

/** Mutation: delete a Draft PO (T-811 — the client fn already existed in
 * purchasingApi.ts; this hook was the missing piece for the detail page's
 * Delete button). Invalidates the PO list + detail queries on success. */
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, organizationId }: { docId: string; organizationId?: string }) =>
      purchasingApi.deletePurchaseOrder(docId, organizationId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.all() });
      queryClient.invalidateQueries({ queryKey: purchasingQueryKeys.po.detail(variables.docId) });
    },
  });
}

// ============================================================================
// Phase 1B — Approval Inbox hooks
// ============================================================================

/** Fetch pending approvals for the current user's role. */
export function usePendingApprovals(organizationId?: string) {
  return useQuery({
    queryKey: purchasingQueryKeys.approvals.pending(),
    queryFn: () => purchasingApi.getPendingApprovals(organizationId),
    staleTime: 10_000,
    refetchInterval: 30_000, // Reason: inbox should auto-refresh every 30s
  });
}

/** Fetch approval history for the current user. */
export function useApprovalHistory(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
}) {
  return useQuery({
    queryKey: purchasingQueryKeys.approvals.history(params),
    queryFn: () => purchasingApi.getApprovalHistory(params),
    staleTime: 30_000,
  });
}
