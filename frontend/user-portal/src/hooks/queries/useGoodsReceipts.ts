/**
 * Goods Receipts — TanStack Query hooks
 *
 * Mirrors the usePurchasing.ts pattern:
 * - useGoodsReceipts      — paginated list with filters
 * - useGoodsReceipt       — single detail
 * - useCreateGRFromPO     — mutation: create from PO
 * - useUpdateGoodsReceipt — mutation: patch Draft GR
 * - usePostGoodsReceipt   — mutation: Draft → Posted
 * - useDeleteGoodsReceipt — mutation: delete Draft
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as grService from '../../services/goodsReceiptsService';
import type {
  GRStatus,
  GRFromPOCreate,
  GRUpdate,
} from '../../services/goodsReceiptsService';

// ─── Query key factory ─────────────────────────────────────────────────────────

export const grQueryKeys = {
  all: () => ['purchasing', 'gr'] as const,
  list: (params?: Record<string, unknown>) =>
    ['purchasing', 'gr', 'list', params] as const,
  detail: (docId: string) =>
    ['purchasing', 'gr', 'detail', docId] as const,
};

// ─── Read hooks ───────────────────────────────────────────────────────────────

/**
 * Paginated list of GRs.
 */
export function useGoodsReceipts(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: GRStatus;
  search?: string;
}) {
  return useQuery({
    queryKey: grQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => grService.getGoodsReceipts(params),
    enabled: !!params?.organizationId,
    staleTime: 30_000,
  });
}

/**
 * Single GR detail with lines.
 */
export function useGoodsReceipt(docId: string | undefined, organizationId?: string) {
  return useQuery({
    queryKey: grQueryKeys.detail(docId!),
    queryFn: () => grService.getGoodsReceipt(docId!, organizationId),
    enabled: !!docId,
    staleTime: 30_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Create a GR from an approved/open PO.
 * On success, invalidates the GR list so the new entry appears immediately.
 */
export function useCreateGRFromPO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      poDocId,
      data,
      organizationId,
    }: {
      poDocId: string;
      data: GRFromPOCreate;
      organizationId?: string;
    }) => grService.createGoodsReceiptFromPO(poDocId, data, organizationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: grQueryKeys.all() });
    },
  });
}

/**
 * Update a Draft GR (header fields or lines).
 * On success, invalidates detail + list.
 */
export function useUpdateGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      data,
      organizationId,
    }: {
      docId: string;
      data: GRUpdate;
      organizationId?: string;
    }) => grService.updateGoodsReceipt(docId, data, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: grQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: grQueryKeys.all() });
    },
  });
}

/**
 * Post a Draft GR — transitions to Posted, decrements PO openQuantity,
 * fires purchase_received outbox event → finance creates a JE.
 * On success, invalidates GR detail, GR list, and PO detail so all affected
 * queries reflect the new state immediately.
 */
export function usePostGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      organizationId,
    }: {
      docId: string;
      organizationId?: string;
    }) => grService.postGoodsReceipt(docId, organizationId),
    onSuccess: (_, { docId }) => {
      qc.invalidateQueries({ queryKey: grQueryKeys.detail(docId) });
      qc.invalidateQueries({ queryKey: grQueryKeys.all() });
      // Also invalidate PO queries so openQuantity updates in the UI
      qc.invalidateQueries({ queryKey: ['purchasing', 'po'] });
    },
  });
}

/**
 * Delete a Draft GR.
 * On success, invalidates the GR list.
 */
export function useDeleteGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      organizationId,
    }: {
      docId: string;
      organizationId?: string;
    }) => grService.deleteGoodsReceipt(docId, organizationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: grQueryKeys.all() });
    },
  });
}
