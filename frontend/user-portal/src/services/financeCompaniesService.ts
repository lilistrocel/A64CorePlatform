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

// ─── Create types ─────────────────────────────────────────────────────────────

/**
 * Request payload for creating a finance company code.
 * Maps to CompanyCodeCreate on the backend.
 *
 * Verified fields (services/finance/src/finance/models/schemas/company.py):
 *   companyCode         string (max 10 chars)
 *   organizationId      string
 *   legalName           string (max 200 chars) — displayed as company name
 *   trn                 optional string — UAE Tax Registration Number
 *   fiscalYearStartMonth  int 1..12, default 1
 *   fiscalYearStartDay    int 1..31, default 1
 *   defaultCurrency     string (3 chars), default "AED"
 *
 * Note: no `country` or `defaultValuationMethod` fields exist in the actual schema.
 */
export interface CreateCompanyPayload {
  companyCode: string;
  organizationId: string;
  legalName: string;
  trn?: string;
  fiscalYearStartMonth?: number;
  fiscalYearStartDay?: number;
  defaultCurrency?: string;
}

/** Finance success envelope (SuccessResponse<CompanyCodeResponse>) */
interface CompanySingleResponse {
  data: Company;
  message?: string | null;
}

/** Return type for createCompany — includes seed confirmation message. */
export interface CreateCompanyResult {
  company: Company;
  /** Seed confirmation from the backend, e.g. "Seeded 230 GL accounts, 5 tax codes." */
  message: string;
}

// ─── API functions ─────────────────────────────────────────────────────────────

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

/**
 * Create a new company code (seeds ChartOfAccounts + tax codes).
 * POST /api/v1/finance/companies
 *
 * Returns the created Company and the seed confirmation message.
 * Throws 409 if companyCode already exists.
 *
 * The backend auto-seeds GL accounts and UAE VAT tax codes on success.
 * The seed confirmation (e.g. "Seeded 230 GL accounts, 5 tax codes.") is
 * returned alongside the company record in CreateCompanyResult.
 */
export async function createCompany(payload: CreateCompanyPayload): Promise<CreateCompanyResult> {
  const response = await apiClient.post<CompanySingleResponse>(
    '/v1/finance/companies',
    payload
  );
  return {
    company: response.data.data,
    message: response.data.message ?? 'Company code created and Chart of Accounts seeded.',
  };
}
