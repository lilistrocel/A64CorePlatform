/**
 * Plant Mother Query Hooks (Plant Library Phase 3)
 *
 * TanStack Query hooks for the mother/variety Plant Library hierarchy.
 * Mirrors useFarms.ts's pattern: queries cached via queryKeys, mutations
 * invalidate the affected list/detail/varieties caches on success.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plantMotherApi } from '../../services/plantMotherApi';
import { queryKeys } from '../../config/react-query.config';
import type {
  PlantMotherCreate,
  PlantMotherUpdate,
  VarietyCreateForMother,
  PlantProductCreate,
  PlantProductUpdate,
} from '../../types/farm';

/**
 * List mother plants (products) with pagination + search.
 */
export function usePlantMothers(page: number = 1, perPage: number = 12, search?: string) {
  return useQuery({
    queryKey: queryKeys.plantMothers.list(page, perPage, search),
    queryFn: () => plantMotherApi.listPlantMothers({ page, perPage, search }),
  });
}

/**
 * Get a single mother plant with its active varieties embedded (lightweight summary).
 */
export function usePlantMother(motherId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plantMothers.detail(motherId!),
    queryFn: () => plantMotherApi.getPlantMother(motherId!),
    enabled: !!motherId,
  });
}

/**
 * List a mother's active varieties as full plant_data_enhanced records
 * (ready to hand straight to PlantDataDetail / PlantDataFormModal without
 * a follow-up fetch per row).
 */
export function useVarietiesForMother(motherId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plantMothers.varieties(motherId!),
    queryFn: () => plantMotherApi.listVarietiesForMother(motherId!),
    enabled: !!motherId,
  });
}

/**
 * Create a new mother plant. Invalidates the mother list cache.
 */
export function useCreatePlantMother() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PlantMotherCreate) => plantMotherApi.createPlantMother(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
    },
  });
}

/**
 * Update a mother plant. Invalidates its detail + the list (name/type changes
 * must show up immediately in the grid).
 */
export function useUpdatePlantMother() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ motherId, data }: { motherId: string; data: PlantMotherUpdate }) =>
      plantMotherApi.updatePlantMother(motherId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.detail(variables.motherId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
    },
  });
}

/**
 * Delete (soft) a mother plant. Backend 409s while active varieties remain —
 * callers should catch that and surface the message, not treat it as a
 * generic failure. Invalidates the list cache on success.
 */
export function useDeletePlantMother() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (motherId: string) => plantMotherApi.deletePlantMother(motherId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
    },
  });
}

/**
 * Create a new variety under a mother. Invalidates that mother's varieties
 * list AND the mother list (varietyCount changed).
 */
export function useCreateVarietyForMother() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ motherId, data }: { motherId: string; data: VarietyCreateForMother }) =>
      plantMotherApi.createVarietyForMother(motherId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.varieties(variables.motherId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.detail(variables.motherId) });
    },
  });
}

// ============================================================================
// PRODUCTS (Plant Library Product Extension Stage 2 — yield picklist per mother)
// ============================================================================

/**
 * List a mother's products (yield picklist). Pass `activeOnly` to hide
 * deactivated products (used by future harvest picklists); the products
 * editor itself always wants the full history, so it omits the param.
 */
export function useProductsForMother(motherId: string | undefined, activeOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.plantMothers.products(motherId!, activeOnly),
    queryFn: () => plantMotherApi.listProductsForMother(motherId!, activeOnly),
    enabled: !!motherId,
  });
}

/**
 * Add a new product to a mother. Invalidates that mother's products list
 * (both activeOnly variants, via prefix match) and its detail (products is
 * embedded on PlantMother too).
 */
export function useAddProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ motherId, data }: { motherId: string; data: PlantProductCreate }) =>
      plantMotherApi.addProductToMother(motherId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.plantMothers.detail(variables.motherId), 'products'],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.detail(variables.motherId) });
    },
  });
}

/**
 * Update a product's name/category/isActive (rename, recategorise, or
 * reactivate via isActive: true). `unit` is not editable — see PlantProductUpdate.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      motherId,
      productId,
      data,
    }: {
      motherId: string;
      productId: string;
      data: PlantProductUpdate;
    }) => plantMotherApi.updateMotherProduct(motherId, productId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.plantMothers.detail(variables.motherId), 'products'],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.detail(variables.motherId) });
    },
  });
}

/**
 * Deactivate a product (isActive: false). NOT deletion — the product stays
 * in the array, just hidden from live harvest picklists. Idempotent.
 */
export function useDeactivateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ motherId, productId }: { motherId: string; productId: string }) =>
      plantMotherApi.deactivateMotherProduct(motherId, productId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.plantMothers.detail(variables.motherId), 'products'],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.detail(variables.motherId) });
    },
  });
}
