/**
 * Fiscal Periods API Service
 *
 * Typed API calls for the Finance Fiscal Periods module.
 *
 * Endpoints:
 *   GET    /api/v1/finance/periods                     — list with optional filters
 *   POST   /api/v1/finance/periods                     — create a single period
 *   PATCH  /api/v1/finance/periods/{period_id}/close   — close a period
 *   PATCH  /api/v1/finance/periods/{period_id}/reopen  — reopen a closed period
 *
 * Envelope conventions (finance side):
 *   - List: response.data → { items, total, page, size, pages }
 *   - Single: response.data.data → FiscalPeriod (success envelope)
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

export interface FiscalPeriod {
  periodId: string;
  organizationId: string;
  companyCode: string;
  fiscalYear: number;       // e.g. 2026
  periodNumber: number;     // 1..12 (or 13 for 4-4-5 calendars)
  startDate: string;        // ISO date YYYY-MM-DD
  endDate: string;          // ISO date YYYY-MM-DD
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

/** Finance-side paginated list response */
export interface FiscalPeriodsListResponse {
  items: FiscalPeriod[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Finance-side single-resource success envelope */
interface FiscalPeriodSuccessEnvelope {
  data: FiscalPeriod;
  message?: string | null;
}

export interface ListPeriodsParams {
  organizationId: string;
  companyCode?: string;
  fiscalYear?: number;
  status?: 'open' | 'closed';
  page?: number;
  size?: number;
}

export interface CreatePeriodPayload {
  organizationId: string;
  companyCode: string;
  fiscalYear: number;
  periodNumber: number;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  status?: 'open' | 'closed';
}

// ============================================================================
// API functions
// ============================================================================

/**
 * Fetch a paginated list of fiscal periods.
 * GET /api/v1/finance/periods
 *
 * Returns { items, total, page, size, pages }.
 * Fetch a large page (size=200) to avoid multi-page handling for the typical
 * fiscal calendar (max 13 periods × a few years = small data set).
 */
export async function listPeriods(
  params: ListPeriodsParams
): Promise<FiscalPeriodsListResponse> {
  const {
    organizationId,
    companyCode,
    fiscalYear,
    status,
    page = 1,
    size = 200,
  } = params;

  const queryParams: Record<string, string | number> = {
    organization_id: organizationId,
    page,
    size,
  };
  if (companyCode) queryParams.company_code = companyCode;
  if (fiscalYear !== undefined) queryParams.fiscal_year = fiscalYear;
  if (status) queryParams.status = status;

  const response = await apiClient.get<FiscalPeriodsListResponse>(
    '/v1/finance/periods',
    { params: queryParams }
  );
  return response.data;
}

/**
 * Create a single fiscal period.
 * POST /api/v1/finance/periods
 *
 * Returns the created FiscalPeriod (unwrapped from the success envelope).
 * The caller fires N parallel POSTs for bulk-create scenarios — no dedicated
 * bulk endpoint exists on the backend.
 */
export async function createPeriod(payload: CreatePeriodPayload): Promise<FiscalPeriod> {
  const response = await apiClient.post<FiscalPeriodSuccessEnvelope>(
    '/v1/finance/periods',
    payload
  );
  return response.data.data;
}

/**
 * Close an open fiscal period.
 * PATCH /api/v1/finance/periods/{period_id}/close
 *
 * After this call the period's status becomes 'closed' and the backend will
 * reject any new journal entries targeting it.
 */
export async function closePeriod(periodId: string): Promise<FiscalPeriod> {
  const response = await apiClient.patch<FiscalPeriodSuccessEnvelope>(
    `/v1/finance/periods/${periodId}/close`
  );
  return response.data.data;
}

/**
 * Reopen a closed fiscal period.
 * PATCH /api/v1/finance/periods/{period_id}/reopen
 *
 * After this call the period's status becomes 'open' again, allowing
 * back-dated journal entries to be posted against it.
 */
export async function reopenPeriod(periodId: string): Promise<FiscalPeriod> {
  const response = await apiClient.patch<FiscalPeriodSuccessEnvelope>(
    `/v1/finance/periods/${periodId}/reopen`
  );
  return response.data.data;
}
