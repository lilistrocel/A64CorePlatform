/**
 * AP Payments — TanStack Query hooks
 *
 * - usePayments(orgId, filters)  — paginated list
 * - usePayment(paymentId)        — detail with applications + JE
 * - useCreatePayment()           — mutation; invalidates list on success
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as paymentsService from '../../services/paymentsService';
import type { ListPaymentsParams, CreatePaymentPayload } from '../../services/paymentsService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const paymentsQueryKeys = {
  all: (orgId: string) => ['finance', 'ap-payments', orgId] as const,
  list: (params: ListPaymentsParams) =>
    ['finance', 'ap-payments', params.organizationId, 'list', params] as const,
  detail: (paymentId: string) =>
    ['finance', 'ap-payments', 'detail', paymentId] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Paginated list of vendor payments with optional filters.
 */
export function usePayments(params: ListPaymentsParams) {
  return useQuery({
    queryKey: paymentsQueryKeys.list(params),
    queryFn: () => paymentsService.listPayments(params),
    enabled: !!params.organizationId,
    staleTime: 30_000,
  });
}

/**
 * Single payment detail with applications and linked JE.
 */
export function usePayment(paymentId: string | null, organizationId: string) {
  return useQuery({
    queryKey: paymentsQueryKeys.detail(paymentId!),
    queryFn: () => paymentsService.getPayment(paymentId!, organizationId),
    enabled: !!paymentId && !!organizationId,
    staleTime: 60_000,   // payments are immutable — longer cache is fine
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Record a new vendor payment.
 * On success, invalidates the payments list for the organisation so the
 * new entry appears without a manual refresh.
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) =>
      paymentsService.createPayment(payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['finance', 'ap-payments', variables.organizationId],
      });
      // Reason: RecordPaymentPage uses ['finance', 'ap-totals-paid', ...] to
      // compute outstanding amounts per invoice. Invalidate it so the next
      // visit shows the updated paid totals (and fully-paid invoices drop
      // out of the picker).
      queryClient.invalidateQueries({
        queryKey: ['finance', 'ap-totals-paid', variables.organizationId],
      });
    },
  });
}
