/**
 * Plant Mother API Service (Plant Library Phase 3 — frontend)
 *
 * All API calls for the mother/variety Plant Library hierarchy. Mothers are
 * the product/SKU level; varieties are the existing plant_data_enhanced
 * cultivation recipes (see plantDataEnhancedApi.ts, unchanged). Base URL:
 * /api/v1/farm/plant-mothers.
 */

import { apiClient } from './api';
import type {
  PlantMother,
  PlantMotherWithVarietyCount,
  PlantMotherWithVarieties,
  PlantMotherCreate,
  PlantMotherUpdate,
  PlantMotherSearchParams,
  VarietyCreateForMother,
  PlantDataEnhanced,
  PaginatedResponse,
} from '../types/farm';

/**
 * List mother plants (products), org-scoped, each annotated with `varietyCount`.
 */
export async function listPlantMothers(
  params?: PlantMotherSearchParams
): Promise<PaginatedResponse<PlantMotherWithVarietyCount>> {
  const response = await apiClient.get<any>('/v1/farm/plant-mothers', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search || undefined,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Create a new mother plant (product). Requires agronomist permission.
 */
export async function createPlantMother(data: PlantMotherCreate): Promise<PlantMother> {
  const response = await apiClient.post<{ data: PlantMother }>('/v1/farm/plant-mothers', data);
  return response.data.data;
}

/**
 * Get a mother plant by ID, with its active varieties embedded (lightweight summary).
 */
export async function getPlantMother(plantMotherId: string): Promise<PlantMotherWithVarieties> {
  const response = await apiClient.get<{ data: PlantMotherWithVarieties }>(
    `/v1/farm/plant-mothers/${plantMotherId}`
  );
  return response.data.data;
}

/**
 * Update a mother plant's plantName/scientificName/plantType/isActive.
 * Renaming cascades to every variety + referencing blocks server-side.
 */
export async function updatePlantMother(
  plantMotherId: string,
  data: PlantMotherUpdate
): Promise<PlantMother> {
  const response = await apiClient.patch<{ data: PlantMother }>(
    `/v1/farm/plant-mothers/${plantMotherId}`,
    data
  );
  return response.data.data;
}

/**
 * Soft-delete a mother plant. Backend refuses with 409 while it still has
 * active varieties — callers should surface that message rather than a
 * generic error.
 */
export async function deletePlantMother(plantMotherId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(
    `/v1/farm/plant-mothers/${plantMotherId}`
  );
  return response.data;
}

/**
 * List active varieties (full plant_data_enhanced records) under a mother. Unpaginated.
 */
export async function listVarietiesForMother(plantMotherId: string): Promise<PlantDataEnhanced[]> {
  const response = await apiClient.get<{ data: PlantDataEnhanced[] }>(
    `/v1/farm/plant-mothers/${plantMotherId}/varieties`
  );
  return response.data.data;
}

/**
 * Create a new variety under a mother. plantName/scientificName/plantType
 * are inherited from the mother server-side — do not send them here.
 */
export async function createVarietyForMother(
  plantMotherId: string,
  data: VarietyCreateForMother
): Promise<PlantDataEnhanced> {
  const response = await apiClient.post<{ data: PlantDataEnhanced }>(
    `/v1/farm/plant-mothers/${plantMotherId}/varieties`,
    data
  );
  return response.data.data;
}

// Export all functions as a single object for convenience (mirrors plantDataEnhancedApi.ts)
export const plantMotherApi = {
  listPlantMothers,
  createPlantMother,
  getPlantMother,
  updatePlantMother,
  deletePlantMother,
  listVarietiesForMother,
  createVarietyForMother,
};

export default plantMotherApi;
