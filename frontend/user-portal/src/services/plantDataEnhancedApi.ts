/**
 * Plant Data Enhanced API Service
 *
 * This service provides all API calls for the Plant Data Enhanced module.
 * All endpoints use the /api/v1/farm/plant-data-enhanced base URL.
 */

import { apiClient } from './api';
import type {
  PlantDataEnhanced,
  PlantDataEnhancedCreate,
  PlantDataEnhancedUpdate,
  PlantDataEnhancedSearchParams,
  PlantDataCloneRequest,
  PaginatedResponse,
  FarmTypeCompatibility,
} from '../types/farm';

// ============================================================================
// CRUD ENDPOINTS
// ============================================================================

/**
 * Get all plant data with search and filters
 */
export async function getPlantDataEnhancedList(
  params?: PlantDataEnhancedSearchParams
): Promise<PaginatedResponse<PlantDataEnhanced>> {
  const response = await apiClient.get<any>('/v1/farm/plant-data-enhanced', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      plantType: params?.plantType,
      farmType: params?.farmType,
      minGrowthCycle: params?.minGrowthCycle,
      maxGrowthCycle: params?.maxGrowthCycle,
      tags: params?.tags?.join(','),
      isActive: params?.isActive,
    },
  });

  // Transform backend response format to match frontend expectations
  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single plant data entry by ID
 */
export async function getPlantDataEnhancedById(id: string): Promise<PlantDataEnhanced> {
  const response = await apiClient.get<{ data: PlantDataEnhanced }>(
    `/v1/farm/plant-data-enhanced/${id}`
  );
  return response.data.data;
}

/**
 * Create new plant data
 */
export async function createPlantDataEnhanced(
  data: PlantDataEnhancedCreate
): Promise<PlantDataEnhanced> {
  const response = await apiClient.post<{ data: PlantDataEnhanced }>(
    '/v1/farm/plant-data-enhanced',
    data
  );
  return response.data.data;
}

/**
 * Update existing plant data (partial update)
 */
export async function updatePlantDataEnhanced(
  id: string,
  data: PlantDataEnhancedUpdate
): Promise<PlantDataEnhanced> {
  const response = await apiClient.patch<{ data: PlantDataEnhanced }>(
    `/v1/farm/plant-data-enhanced/${id}`,
    data
  );
  return response.data.data;
}

/**
 * Delete plant data (soft delete)
 */
export async function deletePlantDataEnhanced(id: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(
    `/v1/farm/plant-data-enhanced/${id}`
  );
  return response.data;
}

// ============================================================================
// ADVANCED ENDPOINTS
// ============================================================================

/**
 * Clone an existing plant data entry with a new name
 */
export async function clonePlantDataEnhanced(
  id: string,
  request: PlantDataCloneRequest
): Promise<PlantDataEnhanced> {
  const response = await apiClient.post<{ data: PlantDataEnhanced }>(
    `/v1/farm/plant-data-enhanced/${id}/clone`,
    request
  );
  return response.data.data;
}

/**
 * Download CSV template for bulk import
 */
export async function downloadPlantDataEnhancedTemplate(): Promise<void> {
  const response = await apiClient.get('/v1/farm/plant-data-enhanced/template/csv', {
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'plant_data_enhanced_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Get plants by farm type
 */
export async function getPlantsByFarmType(
  farmType: FarmTypeCompatibility
): Promise<PlantDataEnhanced[]> {
  const response = await apiClient.get<{ data: PlantDataEnhanced[] }>(
    `/v1/farm/plant-data-enhanced/by-farm-type/${farmType}`
  );
  return response.data.data;
}

/**
 * Get plants by tags (comma-separated)
 */
export async function getPlantsByTags(tags: string[]): Promise<PlantDataEnhanced[]> {
  const tagsParam = tags.join(',');
  const response = await apiClient.get<{ data: PlantDataEnhanced[] }>(
    `/v1/farm/plant-data-enhanced/by-tags/${tagsParam}`
  );
  return response.data.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate total growth cycle days from individual stages
 */
export function calculateTotalCycleDays(
  germinationDays: number = 0,
  vegetativeDays: number = 0,
  floweringDays: number = 0,
  fruitingDays: number = 0,
  harvestDurationDays: number = 0
): number {
  return germinationDays + vegetativeDays + floweringDays + fruitingDays + harvestDurationDays;
}

/**
 * Format farm type for display
 */
export function formatFarmType(farmType: FarmTypeCompatibility): string {
  const labels: Record<FarmTypeCompatibility, string> = {
    open_field: 'Open Field',
    greenhouse: 'Greenhouse',
    hydroponic: 'Hydroponic',
    vertical_farm: 'Vertical Farm',
    aquaponic: 'Aquaponic',
    indoor_farm: 'Indoor Farm',
    polytunnel: 'Polytunnel',
  };
  return labels[farmType] || farmType;
}

/**
 * Get farm type color
 */
export function getFarmTypeColor(farmType: FarmTypeCompatibility): string {
  const colors: Record<FarmTypeCompatibility, string> = {
    open_field: '#10B981',
    greenhouse: '#3B82F6',
    hydroponic: '#06B6D4',
    vertical_farm: '#8B5CF6',
    aquaponic: '#14B8A6',
    indoor_farm: '#F59E0B',
    polytunnel: '#84CC16',
  };
  return colors[farmType] || '#6B7280';
}

/**
 * Validate growth cycle stages sum equals total
 */
export function validateGrowthCycle(
  germinationDays: number = 0,
  vegetativeDays: number = 0,
  floweringDays: number = 0,
  fruitingDays: number = 0,
  harvestDurationDays: number = 0,
  totalCycleDays: number
): boolean {
  const calculatedTotal = calculateTotalCycleDays(
    germinationDays,
    vegetativeDays,
    floweringDays,
    fruitingDays,
    harvestDurationDays
  );
  return calculatedTotal === totalCycleDays;
}

/**
 * Extract unique tags from plant data list
 */
export function extractUniqueTags(plants: PlantDataEnhanced[]): string[] {
  const allTags = plants.flatMap((plant) => plant.tags || []);
  return [...new Set(allTags)].sort();
}

/**
 * Filter plants by search term (searches name, scientific name, tags)
 */
export function filterPlantsBySearch(
  plants: PlantDataEnhanced[],
  searchTerm: string
): PlantDataEnhanced[] {
  if (!searchTerm) return plants;

  const lowerSearch = searchTerm.toLowerCase();
  return plants.filter((plant) => {
    const nameMatch = plant.plantName.toLowerCase().includes(lowerSearch);
    const scientificMatch = plant.scientificName?.toLowerCase().includes(lowerSearch);
    const tagsMatch = plant.tags?.some((tag) => tag.toLowerCase().includes(lowerSearch));

    return nameMatch || scientificMatch || tagsMatch;
  });
}

// Export all functions as a single object for convenience
export const plantDataEnhancedApi = {
  // CRUD
  getPlantDataEnhancedList,
  getPlantDataEnhancedById,
  createPlantDataEnhanced,
  updatePlantDataEnhanced,
  deletePlantDataEnhanced,

  // Advanced
  clonePlantDataEnhanced,
  downloadPlantDataEnhancedTemplate,
  getPlantsByFarmType,
  getPlantsByTags,

  // Utilities
  calculateTotalCycleDays,
  formatFarmType,
  getFarmTypeColor,
  validateGrowthCycle,
  extractUniqueTags,
  filterPlantsBySearch,
};

export default plantDataEnhancedApi;
