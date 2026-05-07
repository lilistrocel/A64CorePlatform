/**
 * Tools Query Hooks — Fertilizer Cost Calculator & Chemicals Catalog
 *
 * TanStack Query hooks following the same patterns as useFarms.ts / useSales.ts.
 * All mutations show toasts on success/error via showSuccessToast / showErrorToast
 * (errors are already shown globally by the apiClient interceptor; mutations add
 * the success feedback here so the caller doesn't need to remember).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../config/react-query.config';
import { showSuccessToast } from '../../stores/toast.store';
import * as toolsApi from '../../services/toolsApi';
import type {
  CreateChemicalRequest,
  UpdateChemicalRequest,
  UpdatePriceRequest,
  CalculateRequest,
  CreateSavedListRequest,
  UpdateSavedListRequest,
} from '../../types/tools';

// ─── Chemicals ────────────────────────────────────────────────────────────────

export function useChemicals(archived = false) {
  return useQuery({
    queryKey: queryKeys.tools.chemicals.list(archived),
    queryFn: () => toolsApi.getChemicals(archived),
  });
}

export function useCreateChemical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChemicalRequest) => toolsApi.createChemical(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.chemicals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
      showSuccessToast('Chemical added to catalog.');
    },
  });
}

export function useUpdateChemical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chemicalId, data }: { chemicalId: string; data: UpdateChemicalRequest }) =>
      toolsApi.updateChemical(chemicalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.chemicals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
      showSuccessToast('Chemical updated.');
    },
  });
}

export function useArchiveChemical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chemicalId, force = false }: { chemicalId: string; force?: boolean }) =>
      toolsApi.deleteChemical(chemicalId, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.chemicals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
      showSuccessToast('Chemical archived.');
    },
    // Let caller handle 409 errors explicitly — do not show generic error toast here.
    // The global apiClient interceptor WILL fire for non-409; for 409 the caller
    // catches and shows the "Used by N plants" modal instead.
  });
}

export function useDiscoverChemicals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => toolsApi.discoverChemicals(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.chemicals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
      const n = data.length;
      showSuccessToast(
        n === 0
          ? 'No new chemicals found in Plant Library.'
          : `${n} chemical${n === 1 ? '' : 's'} discovered and added to catalog.`
      );
    },
  });
}

// ─── Prices ──────────────────────────────────────────────────────────────────

export function usePrices() {
  return useQuery({
    queryKey: queryKeys.tools.prices.all(),
    queryFn: () => toolsApi.getPrices(),
  });
}

export function useUpdatePrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chemicalId, data }: { chemicalId: string; data: UpdatePriceRequest }) =>
      toolsApi.updatePrice(chemicalId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
    },
  });
}

export function useDeletePriceOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chemicalId: string) => toolsApi.deletePriceOverride(chemicalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.prices.all() });
      showSuccessToast('Price override removed.');
    },
  });
}

// ─── Calculation ─────────────────────────────────────────────────────────────

export function useCalculate() {
  return useMutation({
    mutationFn: (data: CalculateRequest) => toolsApi.calculateFertilizerCost(data),
    // No toast on success; the Output panel renders the result.
    // Errors are shown by the global interceptor.
  });
}

export function useExportXlsx() {
  return useMutation({
    mutationFn: (data: CalculateRequest) => toolsApi.exportCalculationXlsx(data),
    onSuccess: (blob) => {
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fertilizer-cost-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function useImportXlsx() {
  return useMutation({
    mutationFn: (file: File) => toolsApi.importCalculationXlsx(file),
    // Caller handles merging items and showing skipped-row toasts.
  });
}

export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: () => toolsApi.downloadImportTemplate(),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fertilizer-cost-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

// ─── Saved Lists ─────────────────────────────────────────────────────────────

export function useSavedLists() {
  return useQuery({
    queryKey: queryKeys.tools.savedLists.all(),
    queryFn: () => toolsApi.getSavedLists(),
  });
}

export function useCreateSavedList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSavedListRequest) => toolsApi.createSavedList(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.savedLists.all() });
      showSuccessToast('List saved.');
    },
  });
}

export function useUpdateSavedList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, data }: { listId: string; data: UpdateSavedListRequest }) =>
      toolsApi.updateSavedList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.savedLists.all() });
      showSuccessToast('List updated.');
    },
  });
}

export function useDeleteSavedList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => toolsApi.deleteSavedList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.savedLists.all() });
      showSuccessToast('List deleted.');
    },
  });
}
