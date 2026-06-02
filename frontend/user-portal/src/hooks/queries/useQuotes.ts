/**
 * Sales Quote Query Hooks — Wave 3 (T-200.3)
 *
 * TanStack Query hooks for the Sales Quote (SQ) document lifecycle.
 * Mirrors the structure of useArInvoices.ts / useCustomerReceipts.ts.
 *
 * Usage:
 *   const { data, isLoading } = useQuotes({ organizationId, status: 'open' });
 *   const { data: quote } = useQuote(docId, orgId);
 *   const createMutation = useCreateQuote();
 *   const transitionMutation = useTransitionQuote();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as salesApi from '../../services/salesApi';
import type {
  QuoteListParams,
  QuoteCreate,
  QuoteUpdate,
  QuoteTransition,
} from '../../services/salesApi';

// ============================================================================
// Query key constants
// ============================================================================

export const quotesQueryKeys = {
  all: () => ['sales', 'quotes'] as const,
  list: (params?: Record<string, unknown>) =>
    ['sales', 'quotes', 'list', params] as const,
  detail: (id: string) => ['sales', 'quotes', 'detail', id] as const,
} as const;

// ============================================================================
// Sales Quote list hook
// ============================================================================

/**
 * Fetch a paginated list of Sales Quotes.
 *
 * @param params - Filters: organizationId, status, customerId, dateFrom, dateTo, page, size.
 */
export function useQuotes(params: QuoteListParams) {
  return useQuery({
    queryKey: quotesQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => salesApi.listQuotes(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Sales Quote detail hook
// ============================================================================

/**
 * Fetch a single Sales Quote with all embedded lines.
 *
 * @param docId - Sales Quote UUID (undefined while loading URL param).
 * @param orgId - Organisation UUID.
 */
export function useQuote(docId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: quotesQueryKeys.detail(docId ?? ''),
    queryFn: () => salesApi.getQuote(docId!, orgId!),
    enabled: Boolean(docId) && Boolean(orgId),
    staleTime: 30_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Mutation: create a Sales Quote in DRAFT status.
 *
 * Invalidates the Quotes list on success.
 */
export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, orgId }: { data: QuoteCreate; orgId: string }) =>
      salesApi.createQuote(data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotesQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: partially update a DRAFT Sales Quote.
 *
 * If `lines` is provided the existing line set is replaced wholesale.
 * Updates both the list cache and the individual detail cache on success.
 */
export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      orgId,
    }: {
      docId: string;
      data: QuoteUpdate;
      orgId: string;
    }) => salesApi.updateQuote(docId, data, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: quotesQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(quotesQueryKeys.detail(result.docEntry), result);
    },
  });
}

/**
 * Mutation: hard-delete a DRAFT Sales Quote.
 *
 * Invalidates the Quotes list on success.
 */
export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, orgId }: { docId: string; orgId: string }) =>
      salesApi.deleteQuote(docId, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotesQueryKeys.all(), refetchType: 'all' });
    },
  });
}

/**
 * Mutation: transition Sales Quote status.
 *
 * Common transitions:
 *   DRAFT → OPEN       — Publishes the Quote to the customer.
 *   DRAFT → CANCELLED  — Discards without opening.
 *   OPEN  → CANCELLED  — Cancels an open Quote.
 *   OPEN  → CLOSED     — System-managed when SO is created from this Quote.
 *
 * Updates both the list cache and the individual detail cache on success.
 */
export function useTransitionQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      transition,
      orgId,
    }: {
      docId: string;
      transition: QuoteTransition;
      orgId: string;
    }) => salesApi.transitionQuote(docId, transition, orgId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: quotesQueryKeys.all(), refetchType: 'all' });
      qc.setQueryData(quotesQueryKeys.detail(result.docEntry), result);
    },
  });
}
