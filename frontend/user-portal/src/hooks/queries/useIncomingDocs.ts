/**
 * Finance — Incoming Preview hooks
 *
 * Thin wrappers around the existing purchasing query hooks that hardcode
 * `status: 'Pending Approval'` and enable 30-second auto-refresh.
 *
 * Strategy: Option B (wrap existing hooks) — we reuse `usePurchaseRequests`,
 * `usePurchaseOrders`, and their service functions directly rather than
 * duplicating any API client code.
 *
 * These hooks are intentionally finance-specific:
 *   - status is always "Pending Approval" (not configurable by caller)
 *   - refetchInterval is 30 s (finance wants live updates without WebSocket)
 *   - staleTime is shorter than the operational hooks (10 s instead of 15 s)
 *     so the finance preview stays fresh between 30-second polls
 */

import { useQuery } from '@tanstack/react-query';
import {
  getPurchaseRequests,
  getPurchaseRequest,
  getPurchaseOrders,
  getPurchaseOrder,
} from '../../services/purchasingApi';
import type { PaginatedResult, PurchaseRequest, PurchaseOrderDetail, PurchaseRequestDetail, PurchaseOrder } from '../../services/purchasingApi';

// ============================================================================
// Query key constants
// ============================================================================

export const incomingQueryKeys = {
  prList: (orgId: string) =>
    ['finance', 'incoming', 'pr', 'list', orgId] as const,
  poList: (orgId: string) =>
    ['finance', 'incoming', 'po', 'list', orgId] as const,
  prDetail: (docId: string) =>
    ['finance', 'incoming', 'pr', 'detail', docId] as const,
  poDetail: (docId: string) =>
    ['finance', 'incoming', 'po', 'detail', docId] as const,
};

// ============================================================================
// List hooks — always scoped to "Pending Approval", 30-second refresh
// ============================================================================

/**
 * Fetch all PRs currently in "Pending Approval" for the given organisation.
 *
 * @param organizationId - The org UUID. Query is disabled when falsy.
 */
export function useIncomingPRs(
  organizationId: string | null | undefined
): ReturnType<typeof useQuery<PaginatedResult<PurchaseRequest>>> {
  return useQuery({
    queryKey: incomingQueryKeys.prList(organizationId ?? ''),
    queryFn: () =>
      getPurchaseRequests({
        organizationId: organizationId!,
        status: 'Pending Approval',
        perPage: 50,
        page: 1,
      }),
    enabled: !!organizationId,
    staleTime: 10_000,
    // Poll every 30 s so finance sees new incoming docs without manual refresh.
    // TanStack Query pauses polling automatically when the tab is hidden.
    refetchInterval: 30_000,
  });
}

/**
 * Fetch all POs currently in "Pending Approval" for the given organisation.
 *
 * @param organizationId - The org UUID. Query is disabled when falsy.
 */
export function useIncomingPOs(
  organizationId: string | null | undefined
): ReturnType<typeof useQuery<PaginatedResult<PurchaseOrder>>> {
  return useQuery({
    queryKey: incomingQueryKeys.poList(organizationId ?? ''),
    queryFn: () =>
      getPurchaseOrders({
        organizationId: organizationId!,
        status: 'Pending Approval',
        perPage: 50,
        page: 1,
      }),
    enabled: !!organizationId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ============================================================================
// Detail hooks — fetched on-demand when a row is expanded
// ============================================================================

/**
 * Fetch the full PR detail (with lines) when a row is expanded.
 *
 * @param docId - The PR docId. Query is disabled when falsy.
 * @param organizationId - Used for scoped access control on the backend.
 */
export function useIncomingPRDetail(
  docId: string | null | undefined,
  organizationId: string | null | undefined
): ReturnType<typeof useQuery<PurchaseRequestDetail>> {
  return useQuery({
    queryKey: incomingQueryKeys.prDetail(docId ?? ''),
    queryFn: () => getPurchaseRequest(docId!, organizationId ?? undefined),
    enabled: !!docId && !!organizationId,
    // Cache detail for 30 s — same polling window as the list
    staleTime: 30_000,
  });
}

/**
 * Fetch the full PO detail (with lines) when a row is expanded.
 *
 * @param docId - The PO docId. Query is disabled when falsy.
 * @param organizationId - Used for scoped access control on the backend.
 */
export function useIncomingPODetail(
  docId: string | null | undefined,
  organizationId: string | null | undefined
): ReturnType<typeof useQuery<PurchaseOrderDetail>> {
  return useQuery({
    queryKey: incomingQueryKeys.poDetail(docId ?? ''),
    queryFn: () => getPurchaseOrder(docId!, organizationId ?? undefined),
    enabled: !!docId && !!organizationId,
    staleTime: 30_000,
  });
}
