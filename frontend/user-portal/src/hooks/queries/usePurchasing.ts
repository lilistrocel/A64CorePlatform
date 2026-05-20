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
