/**
 * Finance Companies API Service
 *
 * Typed API calls for the Finance Companies master data.
 * Endpoint: GET /api/v1/finance/companies?organization_id={orgId}
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base URL needed.
 *
 * Note: No hardcoded fallback list here (unlike taxCodesService) because companies are
 * fully tenant-specific. An empty list triggers the "No companies configured" state in
 * CompanyCombobox, which tells the user to set up finance first.
 */

import { apiClient } from './api';

// ─── Shapes ───────────────────────────────────────────────────────────────────

/**
 * A finance company entity as returned by GET /api/v1/finance/companies.
 * Companies are long-lived master data — consumers should use a generous staleTime.
 */
export interface Company {
  companyCode: string;              // e.g. "A001"
  organizationId: string;
  legalName: string;                // e.g. "A64 Farm Operations LLC"
  trn: string | null;               // VAT registration number
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultCurrency: string;          // e.g. "AED"
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Backend list response wrapper for the companies endpoint. */
export interface CompanyListResponse {
  data: Company[];
  message?: string | null;
}

// ─── API function ─────────────────────────────────────────────────────────────

/**
 * Fetch all companies for the given organisation.
 * The backend returns `{ data: [...] }` — NOT paginated.
 */
export async function listCompanies(orgId: string): Promise<Company[]> {
  const response = await apiClient.get<CompanyListResponse>(
    '/v1/finance/companies',
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}
