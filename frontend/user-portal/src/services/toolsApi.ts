/**
 * Tools API Service — Fertilizer Cost Calculator & Chemicals Catalog
 *
 * All endpoints under /api/v1/farm/tools/
 * Auth required for every call (apiClient injects the Bearer token automatically).
 *
 * Backend wraps every response in SuccessResponse — payload lives at
 * response.data.data. Each function returns the unwrapped inner payload so
 * callers can use it directly.
 */

import { apiClient } from './api';
import type {
  FertilizerChemical,
  CreateChemicalRequest,
  UpdateChemicalRequest,
  ChemicalPriceEntry,
  UpdatePriceRequest,
  CalculateRequest,
  CalculateResponse,
  ImportResponse,
  SavedList,
  CreateSavedListRequest,
  UpdateSavedListRequest,
} from '../types/tools';

const BASE = '/v1/farm/tools';

// SuccessResponse envelope returned by the backend for every JSON endpoint.
interface Envelope<T> {
  data: T;
  message?: string;
}

// ─── Chemicals ────────────────────────────────────────────────────────────────

export async function getChemicals(archived = false): Promise<FertilizerChemical[]> {
  const response = await apiClient.get<Envelope<FertilizerChemical[]>>(`${BASE}/chemicals`, {
    params: { archived },
  });
  return response.data.data;
}

export async function createChemical(
  data: CreateChemicalRequest
): Promise<FertilizerChemical> {
  const response = await apiClient.post<Envelope<FertilizerChemical>>(
    `${BASE}/chemicals`,
    data
  );
  return response.data.data;
}

export async function updateChemical(
  chemicalId: string,
  data: UpdateChemicalRequest
): Promise<FertilizerChemical> {
  const response = await apiClient.patch<Envelope<FertilizerChemical>>(
    `${BASE}/chemicals/${chemicalId}`,
    data
  );
  return response.data.data;
}

export async function deleteChemical(
  chemicalId: string,
  force = false
): Promise<void> {
  await apiClient.delete(`${BASE}/chemicals/${chemicalId}`, {
    params: { force },
  });
}

export async function discoverChemicals(): Promise<FertilizerChemical[]> {
  const response = await apiClient.post<Envelope<FertilizerChemical[]>>(
    `${BASE}/chemicals/discover`
  );
  return response.data.data;
}

// ─── Prices ──────────────────────────────────────────────────────────────────

export async function getPrices(): Promise<ChemicalPriceEntry[]> {
  const response = await apiClient.get<Envelope<ChemicalPriceEntry[]>>(
    `${BASE}/fertilizer-cost/prices`
  );
  return response.data.data;
}

export async function updatePrice(
  chemicalId: string,
  data: UpdatePriceRequest
): Promise<ChemicalPriceEntry> {
  const response = await apiClient.patch<Envelope<ChemicalPriceEntry>>(
    `${BASE}/fertilizer-cost/prices/${chemicalId}`,
    data
  );
  return response.data.data;
}

export async function deletePriceOverride(chemicalId: string): Promise<void> {
  await apiClient.delete(`${BASE}/fertilizer-cost/prices/${chemicalId}`);
}

// ─── Calculation ─────────────────────────────────────────────────────────────

export async function calculateFertilizerCost(
  data: CalculateRequest
): Promise<CalculateResponse> {
  const response = await apiClient.post<Envelope<CalculateResponse>>(
    `${BASE}/fertilizer-cost/calculate`,
    data
  );
  return response.data.data;
}

/**
 * Export the calculation to an XLSX file.
 * Returns the raw blob — endpoint serves the file directly, not a SuccessResponse.
 */
export async function exportCalculationXlsx(
  data: CalculateRequest
): Promise<Blob> {
  const response = await apiClient.post(`${BASE}/fertilizer-cost/export`, data, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

/**
 * Download the blank .xlsx template for the import flow.
 * Returns the raw blob so the caller can trigger a browser download.
 */
export async function downloadImportTemplate(): Promise<Blob> {
  const response = await apiClient.get(`${BASE}/fertilizer-cost/import-template`, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function importCalculationXlsx(file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<Envelope<ImportResponse>>(
    `${BASE}/fertilizer-cost/import`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return response.data.data;
}

// ─── Saved Lists ─────────────────────────────────────────────────────────────

export async function getSavedLists(): Promise<SavedList[]> {
  const response = await apiClient.get<Envelope<SavedList[]>>(
    `${BASE}/fertilizer-cost/lists`
  );
  return response.data.data;
}

export async function createSavedList(
  data: CreateSavedListRequest
): Promise<SavedList> {
  const response = await apiClient.post<Envelope<SavedList>>(
    `${BASE}/fertilizer-cost/lists`,
    data
  );
  return response.data.data;
}

export async function updateSavedList(
  listId: string,
  data: UpdateSavedListRequest
): Promise<SavedList> {
  const response = await apiClient.patch<Envelope<SavedList>>(
    `${BASE}/fertilizer-cost/lists/${listId}`,
    data
  );
  return response.data.data;
}

export async function deleteSavedList(listId: string): Promise<void> {
  await apiClient.delete(`${BASE}/fertilizer-cost/lists/${listId}`);
}
