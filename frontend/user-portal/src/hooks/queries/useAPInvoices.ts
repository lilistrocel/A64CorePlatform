/**
 * AP Invoices — TanStack Query hooks (Phase C)
 *
 * Mirrors useGoodsReceipts.ts pattern:
 * - useAPInvoices        — paginated list with filters
 * - useAPInvoice         — single detail
 * - usePostedGRsWithoutAP — filtered GR list for the GR picker (Posted GRs that
 *                           don't yet have an associated AP Invoice)
 * - useCreateAPFromGR    — mutation: create from GR
 * - useUpdateAPInvoice   — mutation: patch Draft AP
 * - useSubmitAPInvoice   — mutation: Draft → Pending Approval
 * - useApproveAPInvoice  — mutation: Pending Approval → Approved
 * - useRejectAPInvoice   — mutation: Pending Approval → Rejected
 * - useDeleteAPInvoice   — mutation: delete Draft
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as apService from '../../services/apInvoicesService';
import * as grService from '../../services/goodsReceiptsService';
import type {
  APStatus,
  APFromGRCreate,
  APUpdate,
  APApproveBody,
  APRejectBody,
} from '../../services/apInvoicesService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const apQueryKeys = {
  all: () => ['purchasing', 'ap'] as const,
  list: (params?: Record<string, unknown>) =>
    ['purchasing', 'ap', 'list', params] as const,
  detail: (docId: string) =>
    ['purchasing', 'ap', 'detail', docId] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Paginated list of AP Invoices.
 */
export function useAPInvoices(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: APStatus;
  search?: string;
}) {
  return useQuery({
    queryKey: apQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => apService.getAPInvoices(params),
    enabled: !!params?.organizationId,
    staleTime: 30_000,
  });
}

/**
 * Single AP Invoice detail with lines.
 */
export function useAPInvoice(docId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: apQueryKeys.detail(docId!),
    queryFn: () => apService.getAPInvoice(docId!, organizationId),
    enabled: !!docId,
    staleTime: 30_000,
  });
}

/**
 * List of Posted GRs — used in the GR picker to choose a source GR.
 * The backend returns all GRs; the form should then exclude those that already
 * have an AP. Until the backend adds a dedicated "no-ap" filter query param,
 * we fetch Posted GRs and display them all — the backend will reject a duplicate
 * AP-from-GR with a 400.
 */
export function usePostedGRsForAP(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
}) {
  return useQuery({
    queryKey: ['purchasing', 'gr', 'posted-for-ap', params],
    queryFn: () =>
      grService.getGoodsReceipts({
        organizationId: params?.organizationId,
        status: 'Posted',
        page: params?.page ?? 1,
        perPage: params?.perPage ?? 50,
      }),
    enabled: !!params?.organizationId,
    staleTime: 30_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Create an AP Invoice from a Posted GR.
 * Invalidates the AP list so the new entry appears immediately.
 */
export function useCreateAPFromGR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      grDocId,
      data,
      organizationId,
    }: {
      grDocId: string;
      data: APFromGRCreate;
      organizationId?: string;
    }) => apService.createAPFromGR(grDocId, data, organizationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}

/**
 * Update a Draft AP Invoice (header fields or line prices).
 * Invalidates detail + list.
 */
export function useUpdateAPInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      organizationId,
    }: {
      docId: string;
      data: APUpdate;
      organizationId?: string;
    }) => apService.updateAPInvoice(docId, data, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: apQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}

/**
 * Submit a Draft AP Invoice for approval.
 * Invalidates detail + list.
 */
export function useSubmitAPInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      organizationId,
    }: {
      docId: string;
      organizationId?: string;
    }) => apService.submitAPInvoice(docId, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: apQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}

/**
 * Approve an AP Invoice.
 * On success, invalidates AP detail + list.
 * The ap_invoice_posted event will trigger a JE on the finance side.
 */
export function useApproveAPInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      body,
      organizationId,
    }: {
      docId: string;
      body?: APApproveBody;
      organizationId?: string;
    }) => apService.approveAPInvoice(docId, body, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: apQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}

/**
 * Reject an AP Invoice.
 * Invalidates detail + list.
 */
export function useRejectAPInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      body,
      organizationId,
    }: {
      docId: string;
      body: APRejectBody;
      organizationId?: string;
    }) => apService.rejectAPInvoice(docId, body, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: apQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}

/**
 * Delete a Draft AP Invoice.
 * Invalidates the AP list.
 */
export function useDeleteAPInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      organizationId,
    }: {
      docId: string;
      organizationId?: string;
    }) => apService.deleteAPInvoice(docId, organizationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: apQueryKeys.all() });
    },
  });
}
