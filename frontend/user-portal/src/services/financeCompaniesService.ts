/**
 * Finance Companies API Service
 *
 * Typed API calls for the Finance Companies (legal entity) master data.
 * Endpoint: GET /api/v1/finance/companies?organization_id={orgId}
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base URL needed.
 */

import { apiClient } from './api';

// ─── Shape ────────────────────────────────────────────────────────────────────

/**
 * A legal company entity as returned by GET /api/v1/finance/companies.
 * Companies rarely change — consumers should use a generous staleTime.
 */
export interface Company {
  companyCode: string;
  organizationId: string;
  legalName: string;
  trn: string | null;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultCurrency: string;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Backend list response wrapper for the companies endpoint. */
interface CompanyListResponse {
  data: Company[];
}

// ─── API function ─────────────────────────────────────────────────────────────

/**
 * Fetch all companies for the given organisation.
 * The backend returns `{ data: [...] }` — NOT paginated like /accounts.
 */
export async function listCompanies(orgId: string): Promise<Company[]> {
  const response = await apiClient.get<CompanyListResponse>(
    '/v1/finance/companies',
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}
