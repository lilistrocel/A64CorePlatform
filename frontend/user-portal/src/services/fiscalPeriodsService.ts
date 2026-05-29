/**
 * Fiscal Periods API Service
 *
 * Typed API calls for the Finance Fiscal Periods module.
 *
 * Endpoints:
 *   GET    /api/v1/finance/periods                              — list with optional filters
 *   POST   /api/v1/finance/periods                             — create a single period
 *   PATCH  /api/v1/finance/periods/{period_id}/close            — close a period
 *   PATCH  /api/v1/finance/periods/{period_id}/close?dry_run=true — dry-run preview
 *   PATCH  /api/v1/finance/periods/{period_id}/reopen           — reopen a closed period
 *
 * Envelope conventions (finance side):
 *   - List: response.data → { items, total, page, size, pages }
 *   - Single: response.data.data → resource (success envelope)
 *
 * Updated T-060.11:
 *   - Added 'locked' to PeriodStatus union (backend PeriodStatusEnum has 3 values)
 *   - FiscalPeriod type now includes audit trail fields (closedAt, closeReason, etc.)
 *   - closePeriod now accepts organizationId (required query param) + optional reason
 *   - reopenPeriod now accepts organizationId (required query param) + required reason
 *   - Response types carry ClosingJeInfo for year-end close/reopen reversal
 *
 * Updated T-060.11-preview-fe:
 *   - Added ClosingJePreviewLine, ClosingJeTargetAccount, ClosingJePreview,
 *     PreviewClosePeriodResponse types matching backend Pydantic models exactly
 *   - Added previewClosePeriod(periodId, organizationId) function
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

/** All valid status values from the backend PeriodStatusEnum. */
export type PeriodStatus = 'open' | 'closed' | 'locked';

export interface FiscalPeriod {
  periodId: string;
  organizationId?: string;   // Not always returned in list — derive from context
  companyCode: string;
  fiscalYear: number;        // e.g. 2026
  periodNumber: number;      // 1..12 (or 13 for 4-4-5 calendars)
  startDate: string;         // ISO date YYYY-MM-DD
  endDate: string;           // ISO date YYYY-MM-DD
  status: PeriodStatus;
  // Audit trail fields (T-060.11) — populated by backend on close/reopen
  closedAt: string | null;
  closedByUserId: string | null;
  closeReason: string | null;
  reopenedAt: string | null;
  reopenedByUserId: string | null;
  reopenReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Finance-side list response.
 *
 * NOTE: The backend returns the standard success envelope `{ data, message }`
 * for this endpoint — NOT a paginated `{ items, total, page, size, pages }`
 * envelope. The earlier shape in this file was speculative and never matched
 * what the API serves; consequence was the PeriodsPage rendering "no periods"
 * even when the API returned data.
 */
export interface FiscalPeriodsListResponse {
  data: FiscalPeriod[];
  message?: string | null;
}

/** Finance-side single-resource success envelope */
interface FiscalPeriodSuccessEnvelope {
  data: FiscalPeriod;
  message?: string | null;
}

/**
 * Metadata about the closing JE auto-posted when a fiscal year-end period is
 * closed. Null for ordinary mid-year monthly closes.
 */
export interface ClosingJeInfo {
  jeId: string;
  jeNumber: string;
  jeDate: string;         // ISO date
  netIncome: number;      // AED amount; positive = profit, negative = loss
  currencyCode: string;   // "AED"
}

/** Response shape for PATCH /periods/{id}/close (success envelope data) */
interface ClosePeriodEnvelope {
  data: {
    period: FiscalPeriod;
    closingJe: ClosingJeInfo | null;
  };
  message?: string | null;
}

/** Response shape for PATCH /periods/{id}/reopen (success envelope data) */
interface ReopenPeriodEnvelope {
  data: {
    period: FiscalPeriod;
    closingJeReversal: ClosingJeInfo | null;
  };
  message?: string | null;
}

/** Result returned to callers after a successful close */
export interface ClosePeriodResult {
  period: FiscalPeriod;
  closingJe: ClosingJeInfo | null;
}

/** Result returned to callers after a successful reopen */
export interface ReopenPeriodResult {
  period: FiscalPeriod;
  closingJeReversal: ClosingJeInfo | null;
}

// ============================================================================
// Preview / dry-run types (T-060.11-preview-fe)
// Mirrors backend Pydantic models: ClosingJePreviewLine, ClosingJePreview,
// ClosingJeTargetAccount, PreviewClosePeriodResponse (dry_run=true response)
// ============================================================================

/**
 * A single line in the closing JE preview.
 * debit and credit are decimal strings ("1234.56") or null — never both non-null.
 */
export interface ClosingJePreviewLine {
  lineNumber: number;
  accountId: string;
  accountNumber: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
  description: string;
}

/** The account that receives net income / net loss on year-end close. */
export interface ClosingJeTargetAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
}

/**
 * Closing JE preview payload returned by the dry-run endpoint.
 *
 * When isYearEnd is true and lines.length > 0: a full closing JE will be posted.
 * When note is non-null: no JE will be posted (note explains why).
 * totalDebit and totalCredit should always be equal (backend guarantees this).
 */
export interface ClosingJePreview {
  isYearEnd: boolean;
  lines: ClosingJePreviewLine[];
  totalDebit: string;
  totalCredit: string;
  /** Positive = profit, negative = loss (decimal string e.g. "234.50" or "-100.00") */
  netIncome: string;
  /** Present when a closing JE would be posted; null otherwise. */
  targetAccount: ClosingJeTargetAccount | null;
  /** Non-null when no JE will be posted — human-readable explanation. */
  note: string | null;
}

/**
 * Top-level response for PATCH /periods/{id}/close?dry_run=true
 * Mirrors backend PreviewClosePeriodResponse.
 */
export interface PreviewClosePeriodResponse {
  period: FiscalPeriod;
  closingJePreview: ClosingJePreview;
}

export interface ListPeriodsParams {
  organizationId: string;
  companyCode?: string;
  fiscalYear?: number;
  status?: PeriodStatus;
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

export interface ClosePeriodParams {
  periodId: string;
  organizationId: string;  // Required query param on the backend
  reason?: string;         // Optional (max 500 chars)
}

export interface ReopenPeriodParams {
  periodId: string;
  organizationId: string;  // Required query param on the backend
  reason: string;          // Required (min 5 chars per backend Pydantic model)
}

// ============================================================================
// API functions
// ============================================================================

/**
 * Fetch a paginated list of fiscal periods.
 * GET /api/v1/finance/periods
 *
 * Returns { data, message } per the standard finance-side success envelope.
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
 * PATCH /api/v1/finance/periods/{period_id}/close?organization_id=...
 *
 * organizationId is a required query param — the backend needs it to locate
 * the Current Year P/(L) account and Posting Setup for the year-end closing JE.
 *
 * Validates + closes atomically in a single call (no separate dry-run endpoint).
 * Backend returns closingJe when a year-end closing JE was auto-posted; null for
 * ordinary mid-year monthly closes.
 *
 * Raises:
 *   409 if period is not OPEN
 *   400 if period doesn't balance (Σ DR ≠ Σ CR within 0.01 AED tolerance)
 *   400 if year-end closing accounts not configured in Posting Setup
 */
export async function closePeriod(params: ClosePeriodParams): Promise<ClosePeriodResult> {
  const { periodId, organizationId, reason } = params;

  // Only include body when reason is provided and non-empty
  const body =
    reason !== undefined && reason.trim().length > 0
      ? { reason: reason.trim() }
      : {};

  const response = await apiClient.patch<ClosePeriodEnvelope>(
    `/v1/finance/periods/${periodId}/close`,
    body,
    { params: { organization_id: organizationId } }
  );

  return {
    period: response.data.data.period,
    closingJe: response.data.data.closingJe,
  };
}

/**
 * Reopen a closed fiscal period.
 * PATCH /api/v1/finance/periods/{period_id}/reopen?organization_id=...
 *
 * organizationId is a required query param.
 * reason is required (min 5 chars) — backend enforces this via Pydantic.
 *
 * Returns closingJeReversal when the reopen reversed a year-end closing JE;
 * null for periods that were closed without a closing JE (mid-year close).
 *
 * Raises:
 *   409 if period is already OPEN
 *   423 if period is LOCKED
 */
export async function reopenPeriod(params: ReopenPeriodParams): Promise<ReopenPeriodResult> {
  const { periodId, organizationId, reason } = params;

  const response = await apiClient.patch<ReopenPeriodEnvelope>(
    `/v1/finance/periods/${periodId}/reopen`,
    { reason },
    { params: { organization_id: organizationId } }
  );

  return {
    period: response.data.data.period,
    closingJeReversal: response.data.data.closingJeReversal,
  };
}

/**
 * Dry-run preview for closing a fiscal period.
 * PATCH /api/v1/finance/periods/{period_id}/close?organization_id=...&dry_run=true
 *
 * No body required — reason is optional on the dry-run path.
 * Runs all pre-close validations + computes the closing JE without writing anything.
 * Returns the same 400 validation errors as a real close if validation fails.
 *
 * T-060.11-preview-fe: Used imperatively (useMutation) when the close modal opens
 * so the user sees the real computed preview before confirming.
 */
interface PreviewClosePeriodEnvelope {
  data: {
    period: FiscalPeriod;
    closingJePreview: ClosingJePreview;
  };
  message?: string | null;
}

export async function previewClosePeriod(
  periodId: string,
  organizationId: string
): Promise<PreviewClosePeriodResponse> {
  const response = await apiClient.patch<PreviewClosePeriodEnvelope>(
    `/v1/finance/periods/${periodId}/close`,
    {},
    { params: { organization_id: organizationId, dry_run: true } }
  );

  return {
    period: response.data.data.period,
    closingJePreview: response.data.data.closingJePreview,
  };
}
