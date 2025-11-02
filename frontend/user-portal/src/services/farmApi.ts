/**
 * Farm Management API Service
 *
 * This service provides all API calls for the Farm Management module.
 * All endpoints use the /api/v1/farm base URL.
 */

import { apiClient } from './api';
import type {
  Farm,
  FarmCreate,
  FarmUpdate,
  FarmSummary,
  Block,
  BlockCreate,
  BlockUpdate,
  BlockSummary,
  StateTransition,
  ValidTransitionsResponse,
  PlantData,
  PlantDataCreate,
  PlantDataUpdate,
  PlantDataSearchParams,
  Planting,
  PlantingCreate,
  MarkPlantedRequest,
  PaginatedResponse,
  CSVImportResult,
} from '../types/farm';

// ============================================================================
// FARM MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all farms with pagination
 */
export async function getFarms(page: number = 1, perPage: number = 20) {
  const response = await apiClient.get<any>('/v1/farm/farms', {
    params: { page, perPage },
  });

  // Transform backend response format to match frontend expectations
  // Backend: { data: [], meta: {...}, links: null }
  // Frontend: { items: [], total, page, perPage, totalPages }
  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single farm by ID
 */
export async function getFarm(farmId: string) {
  const response = await apiClient.get<Farm>(`/v1/farm/farms/${farmId}`);
  return response.data;
}

/**
 * Create a new farm
 */
export async function createFarm(data: FarmCreate) {
  const response = await apiClient.post<Farm>('/v1/farm/farms', data);
  return response.data;
}

/**
 * Update an existing farm
 */
export async function updateFarm(farmId: string, data: FarmUpdate) {
  const response = await apiClient.patch<Farm>(`/v1/farm/farms/${farmId}`, data);
  return response.data;
}

/**
 * Delete a farm
 */
export async function deleteFarm(farmId: string) {
  const response = await apiClient.delete<{ message: string }>(`/v1/farm/farms/${farmId}`);
  return response.data;
}

/**
 * Get farm summary statistics
 */
export async function getFarmSummary(farmId: string) {
  const response = await apiClient.get<any>(`/v1/farm/farms/${farmId}/summary`);

  // Transform backend response format to match frontend expectations
  // Backend: { data: { farm, statistics: { totalBlocks, emptyBlocks, ... }, recentActivity }, message }
  // Frontend: { farmId, totalBlocks, blocksByState: { empty, planned, ... }, activePlantings, upcomingHarvests }
  const data = response.data.data;
  const stats = data.statistics;

  return {
    farmId,
    totalBlocks: stats.totalBlocks || 0,
    totalBlockArea: 0, // Not provided by backend, default to 0
    blocksByState: {
      empty: stats.emptyBlocks || 0,
      planned: stats.plannedBlocks || 0,
      planted: stats.plantedBlocks || 0,
      harvesting: stats.harvestingBlocks || 0,
      alert: stats.alertBlocks || 0,
    },
    activePlantings: 0, // Not provided by backend, default to 0
    upcomingHarvests: stats.harvestingBlocks || 0,
  };
}

// ============================================================================
// BLOCK MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all blocks for a farm
 */
export async function getBlocks(farmId: string) {
  const response = await apiClient.get<Block[]>(`/v1/farm/farms/${farmId}/blocks`);
  return response.data;
}

/**
 * Get a single block by ID
 */
export async function getBlock(farmId: string, blockId: string) {
  const response = await apiClient.get<Block>(`/v1/farm/farms/${farmId}/blocks/${blockId}`);
  return response.data;
}

/**
 * Create a new block in a farm
 */
export async function createBlock(farmId: string, data: Omit<BlockCreate, 'farmId'>) {
  const response = await apiClient.post<Block>(`/v1/farm/farms/${farmId}/blocks`, data);
  return response.data;
}

/**
 * Update an existing block
 */
export async function updateBlock(farmId: string, blockId: string, data: BlockUpdate) {
  const response = await apiClient.patch<Block>(`/v1/farm/farms/${farmId}/blocks/${blockId}`, data);
  return response.data;
}

/**
 * Delete a block
 */
export async function deleteBlock(farmId: string, blockId: string) {
  const response = await apiClient.delete<{ message: string }>(`/v1/farm/farms/${farmId}/blocks/${blockId}`);
  return response.data;
}

/**
 * Get block summary statistics
 */
export async function getBlockSummary(farmId: string, blockId: string) {
  const response = await apiClient.get<BlockSummary>(`/v1/farm/farms/${farmId}/blocks/${blockId}/summary`);
  return response.data;
}

/**
 * Transition block state
 */
export async function transitionBlockState(farmId: string, blockId: string, data: StateTransition) {
  const response = await apiClient.post<Block>(`/v1/farm/farms/${farmId}/blocks/${blockId}/state`, data);
  return response.data;
}

/**
 * Get valid state transitions for a block
 */
export async function getValidTransitions(farmId: string, blockId: string) {
  const response = await apiClient.get<ValidTransitionsResponse>(
    `/v1/farm/farms/${farmId}/blocks/${blockId}/transitions`
  );
  return response.data;
}

// ============================================================================
// PLANT DATA MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all plant data with search and pagination
 */
export async function getPlantData(params?: PlantDataSearchParams) {
  const response = await apiClient.get<any>('/v1/farm/plant-data', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      plantType: params?.plantType,
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
export async function getPlantDataById(plantDataId: string) {
  const response = await apiClient.get<PlantData>(`/v1/farm/plant-data/${plantDataId}`);
  return response.data;
}

/**
 * Create new plant data
 */
export async function createPlantData(data: PlantDataCreate) {
  const response = await apiClient.post<PlantData>('/v1/farm/plant-data', data);
  return response.data;
}

/**
 * Update existing plant data
 */
export async function updatePlantData(plantDataId: string, data: PlantDataUpdate) {
  const response = await apiClient.patch<PlantData>(`/v1/farm/plant-data/${plantDataId}`, data);
  return response.data;
}

/**
 * Delete plant data
 */
export async function deletePlantData(plantDataId: string) {
  const response = await apiClient.delete<{ message: string }>(`/v1/farm/plant-data/${plantDataId}`);
  return response.data;
}

/**
 * Import plant data from CSV file
 */
export async function importPlantDataCSV(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<CSVImportResult>('/v1/farm/plant-data/import/csv', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

/**
 * Download CSV template for plant data import
 */
export async function downloadPlantDataTemplate() {
  const response = await apiClient.get('/v1/farm/plant-data/template/csv', {
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'plant_data_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// PLANTING MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get plantings with optional filters
 */
export async function getPlantings(farmId?: string, page: number = 1, perPage: number = 20) {
  const response = await apiClient.get<any>('/v1/farm/plantings', {
    params: {
      farmId,
      page,
      perPage,
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
 * Get a single planting by ID
 */
export async function getPlanting(plantingId: string) {
  const response = await apiClient.get<Planting>(`/v1/farm/plantings/${plantingId}`);
  return response.data;
}

/**
 * Create a new planting plan
 */
export async function createPlanting(data: PlantingCreate) {
  const response = await apiClient.post<Planting>('/v1/farm/plantings', data);
  return response.data;
}

/**
 * Mark a planting as planted
 */
export async function markPlantingAsPlanted(plantingId: string, data: MarkPlantedRequest) {
  const response = await apiClient.post<Planting>(`/v1/farm/plantings/${plantingId}/mark-planted`, data);
  return response.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate total plants in a planting plan
 */
export function calculateTotalPlants(plants: Array<{ quantity: number }>): number {
  return plants.reduce((total, plant) => total + plant.quantity, 0);
}

/**
 * Check if planting plan exceeds block capacity
 */
export function checkCapacityExceeded(totalPlants: number, maxPlants: number): boolean {
  return totalPlants > maxPlants;
}

/**
 * Calculate estimated harvest date based on planted date and growth cycle
 */
export function calculateHarvestDate(plantedDate: string, growthCycleDays: number): Date {
  const planted = new Date(plantedDate);
  const harvest = new Date(planted);
  harvest.setDate(harvest.getDate() + growthCycleDays);
  return harvest;
}

/**
 * Format date for API (YYYY-MM-DD)
 */
export function formatDateForAPI(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display
 */
export function formatDateForDisplay(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return formatDateForDisplay(dateString);
}

// Export all functions as a single object for convenience
export const farmApi = {
  // Farms
  getFarms,
  getFarm,
  createFarm,
  updateFarm,
  deleteFarm,
  getFarmSummary,

  // Blocks
  getBlocks,
  getBlock,
  createBlock,
  updateBlock,
  deleteBlock,
  getBlockSummary,
  transitionBlockState,
  getValidTransitions,

  // Plant Data
  getPlantData,
  getPlantDataById,
  createPlantData,
  updatePlantData,
  deletePlantData,
  importPlantDataCSV,
  downloadPlantDataTemplate,

  // Plantings
  getPlantings,
  getPlanting,
  createPlanting,
  markPlantingAsPlanted,

  // Utilities
  calculateTotalPlants,
  checkCapacityExceeded,
  calculateHarvestDate,
  formatDateForAPI,
  formatDateForDisplay,
  getRelativeTime,
};

export default farmApi;
