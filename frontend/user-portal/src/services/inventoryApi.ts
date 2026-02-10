/**
 * Inventory API Service
 *
 * API calls for inventory management:
 * - Harvest Inventory
 * - Input Inventory
 * - Asset Inventory
 */

import { apiClient } from './api';
import type {
  HarvestInventory,
  HarvestInventoryCreate,
  HarvestInventoryUpdate,
  InputInventory,
  InputInventoryCreate,
  InputInventoryUpdate,
  AssetInventory,
  AssetInventoryCreate,
  AssetInventoryUpdate,
  InventoryMovement,
  InventorySummary,
  PaginatedResponse,
  CategoryOption,
  InputCategory,
  AssetCategory,
  AssetStatus,
  QualityGrade,
  InventoryFarmingYearsResponse,
} from '../types/inventory';

const BASE_URL = '/v1/farm/inventory';

// ============================================================================
// SUMMARY & DASHBOARD
// ============================================================================

/**
 * Get inventory summary/dashboard statistics
 * @param farmId - Optional farm ID to filter by
 * @param farmingYear - Optional farming year to filter by
 */
export async function getInventorySummary(
  farmId?: string,
  farmingYear?: number | null
): Promise<InventorySummary> {
  const params: Record<string, any> = {};
  if (farmId) {
    params.farm_id = farmId;
  }
  if (farmingYear !== undefined && farmingYear !== null) {
    params.farmingYear = farmingYear;
  }
  const response = await apiClient.get(`${BASE_URL}/summary`, { params });
  return response.data;
}

// ============================================================================
// HARVEST INVENTORY
// ============================================================================

export async function listHarvestInventory(params: {
  farmId?: string;
  qualityGrade?: QualityGrade;
  search?: string;
  sortBy?: 'harvestDate' | 'createdAt' | 'plantName' | 'quantity' | 'qualityGrade';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
  farmingYear?: number | null;
}): Promise<PaginatedResponse<HarvestInventory>> {
  const queryParams: Record<string, any> = {
    farm_id: params.farmId,
    quality_grade: params.qualityGrade,
    search: params.search,
    sort_by: params.sortBy || 'harvestDate',
    sort_order: params.sortOrder || 'desc',
    page: params.page || 1,
    per_page: params.perPage || 20,
  };

  // Only add farmingYear if it has a value (not null/undefined)
  if (params.farmingYear !== undefined && params.farmingYear !== null) {
    queryParams.farmingYear = params.farmingYear;
  }

  const response = await apiClient.get(`${BASE_URL}/harvest`, {
    params: queryParams,
  });
  return response.data;
}

export async function getHarvestInventory(inventoryId: string): Promise<HarvestInventory> {
  const response = await apiClient.get(`${BASE_URL}/harvest/${inventoryId}`);
  return response.data;
}

export async function createHarvestInventory(data: HarvestInventoryCreate): Promise<HarvestInventory> {
  const response = await apiClient.post(`${BASE_URL}/harvest`, data);
  return response.data;
}

export async function updateHarvestInventory(
  inventoryId: string,
  data: HarvestInventoryUpdate
): Promise<HarvestInventory> {
  const response = await apiClient.patch(`${BASE_URL}/harvest/${inventoryId}`, data);
  return response.data;
}

export async function deleteHarvestInventory(inventoryId: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/harvest/${inventoryId}`);
}

export async function exportHarvestInventoryCSV(params: {
  farmId?: string;
  qualityGrade?: QualityGrade;
  search?: string;
}): Promise<void> {
  const response = await apiClient.get(`${BASE_URL}/harvest/export/csv`, {
    params: {
      farm_id: params.farmId,
      quality_grade: params.qualityGrade,
      search: params.search,
    },
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'harvest_inventory_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// FARMING YEAR ENDPOINTS
// ============================================================================

/**
 * Get available farming years for harvest inventory
 * Returns list of farming years with inventory data, sorted newest first
 * @param farmId - Optional farm ID to filter inventory by
 */
export async function getAvailableFarmingYears(
  farmId?: string
): Promise<InventoryFarmingYearsResponse> {
  const params: Record<string, any> = {};
  if (farmId) {
    params.farmId = farmId;
  }

  const response = await apiClient.get('/v1/sales/inventory/farming-years', { params });
  return response.data.data;
}

// ============================================================================
// INPUT INVENTORY
// ============================================================================

export async function listInputInventory(params: {
  farmId?: string;
  category?: InputCategory;
  lowStockOnly?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResponse<InputInventory>> {
  const response = await apiClient.get(`${BASE_URL}/input`, {
    params: {
      farm_id: params.farmId,
      category: params.category,
      low_stock_only: params.lowStockOnly,
      search: params.search,
      page: params.page || 1,
      per_page: params.perPage || 20,
    },
  });
  return response.data;
}

export async function getInputInventory(inventoryId: string): Promise<InputInventory> {
  const response = await apiClient.get(`${BASE_URL}/input/${inventoryId}`);
  return response.data;
}

export async function createInputInventory(data: InputInventoryCreate): Promise<InputInventory> {
  const response = await apiClient.post(`${BASE_URL}/input`, data);
  return response.data;
}

export async function updateInputInventory(
  inventoryId: string,
  data: InputInventoryUpdate
): Promise<InputInventory> {
  const response = await apiClient.patch(`${BASE_URL}/input/${inventoryId}`, data);
  return response.data;
}

export async function deleteInputInventory(inventoryId: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/input/${inventoryId}`);
}

export async function useInputInventory(
  inventoryId: string,
  quantity: number,
  reason?: string
): Promise<InputInventory> {
  const response = await apiClient.post(`${BASE_URL}/input/${inventoryId}/use`, null, {
    params: { quantity, reason },
  });
  return response.data;
}

export async function exportInputInventoryCSV(params: {
  farmId?: string;
  category?: InputCategory;
  lowStockOnly?: boolean;
  search?: string;
}): Promise<void> {
  const response = await apiClient.get(`${BASE_URL}/input/export/csv`, {
    params: {
      farm_id: params.farmId,
      category: params.category,
      low_stock_only: params.lowStockOnly,
      search: params.search,
    },
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'input_inventory_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// ASSET INVENTORY
// ============================================================================

export async function listAssetInventory(params: {
  farmId?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  maintenanceOverdue?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResponse<AssetInventory>> {
  const response = await apiClient.get(`${BASE_URL}/asset`, {
    params: {
      farm_id: params.farmId,
      category: params.category,
      status: params.status,
      maintenance_overdue: params.maintenanceOverdue,
      search: params.search,
      page: params.page || 1,
      per_page: params.perPage || 20,
    },
  });
  return response.data;
}

export async function getAssetInventory(inventoryId: string): Promise<AssetInventory> {
  const response = await apiClient.get(`${BASE_URL}/asset/${inventoryId}`);
  return response.data;
}

export async function createAssetInventory(data: AssetInventoryCreate): Promise<AssetInventory> {
  const response = await apiClient.post(`${BASE_URL}/asset`, data);
  return response.data;
}

export async function updateAssetInventory(
  inventoryId: string,
  data: AssetInventoryUpdate
): Promise<AssetInventory> {
  const response = await apiClient.patch(`${BASE_URL}/asset/${inventoryId}`, data);
  return response.data;
}

export async function deleteAssetInventory(inventoryId: string): Promise<void> {
  await apiClient.delete(`${BASE_URL}/asset/${inventoryId}`);
}

export async function exportAssetInventoryCSV(params: {
  farmId?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  maintenanceOverdue?: boolean;
  search?: string;
}): Promise<void> {
  const response = await apiClient.get(`${BASE_URL}/asset/export/csv`, {
    params: {
      farm_id: params.farmId,
      category: params.category,
      status: params.status,
      maintenance_overdue: params.maintenanceOverdue,
      search: params.search,
    },
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'asset_inventory_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// INVENTORY MOVEMENTS
// ============================================================================

export async function listInventoryMovements(params: {
  inventoryId?: string;
  inventoryType?: string;
  movementType?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResponse<InventoryMovement>> {
  const response = await apiClient.get(`${BASE_URL}/movements`, {
    params: {
      inventory_id: params.inventoryId,
      inventory_type: params.inventoryType,
      movement_type: params.movementType,
      page: params.page || 1,
      per_page: params.perPage || 50,
    },
  });
  return response.data;
}

// ============================================================================
// CATEGORY LOOKUPS
// ============================================================================

export async function getInputCategories(): Promise<CategoryOption[]> {
  const response = await apiClient.get(`${BASE_URL}/categories/input`);
  return response.data;
}

export async function getAssetCategories(): Promise<CategoryOption[]> {
  const response = await apiClient.get(`${BASE_URL}/categories/asset`);
  return response.data;
}

export async function getAssetStatuses(): Promise<CategoryOption[]> {
  const response = await apiClient.get(`${BASE_URL}/statuses/asset`);
  return response.data;
}

export async function getQualityGrades(): Promise<CategoryOption[]> {
  const response = await apiClient.get(`${BASE_URL}/grades/quality`);
  return response.data;
}

// ============================================================================
// WASTE INVENTORY EXPORTS
// ============================================================================

export async function exportWasteInventoryCSV(params: {
  farmId?: string;
  sourceType?: string;
  disposalMethod?: string;
  pendingOnly?: boolean;
  search?: string;
}): Promise<void> {
  const response = await apiClient.get(`${BASE_URL}/waste/export/csv`, {
    params: {
      farm_id: params.farmId,
      source_type: params.sourceType,
      disposal_method: params.disposalMethod,
      pending_only: params.pendingOnly,
      search: params.search,
    },
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'waste_inventory_export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Export all functions as a single object for convenience
 * Follows the same pattern as salesApi and logisticsApi
 */
export const inventoryApi = {
  // Summary & Dashboard
  getInventorySummary,

  // Harvest Inventory
  listHarvestInventory,
  getHarvestInventory,
  createHarvestInventory,
  updateHarvestInventory,
  deleteHarvestInventory,
  exportHarvestInventoryCSV,

  // Farming Year
  getAvailableFarmingYears,

  // Input Inventory
  listInputInventory,
  getInputInventory,
  createInputInventory,
  updateInputInventory,
  deleteInputInventory,
  useInputInventory,
  exportInputInventoryCSV,

  // Asset Inventory
  listAssetInventory,
  getAssetInventory,
  createAssetInventory,
  updateAssetInventory,
  deleteAssetInventory,
  exportAssetInventoryCSV,

  // Movements
  listInventoryMovements,

  // Category Lookups
  getInputCategories,
  getAssetCategories,
  getAssetStatuses,
  getQualityGrades,

  // Waste Exports
  exportWasteInventoryCSV,
};

export default inventoryApi;
