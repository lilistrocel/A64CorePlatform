/**
 * Journal Entries API Service
 *
 * Typed API calls for the JE (Journal Entry) read-only module.
 * JEs are produced by the finance consumer when operational documents are posted.
 * The UI is read-only; no create/edit/delete/void from the frontend in v1.
 *
 * Endpoints: /api/v1/finance/journal-entries
 *
 * Envelope conventions (finance side uses a different shape from purchasing):
 *   - List:   response.data  →  { items, total, page, size, pages }
 *   - Detail: response.data.data  (success envelope — note the double .data.data)
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

export interface JournalEntryLine {
  jeLineId: string;
  jeId: string;
  lineNumber: number;
  accountId: string;
  debit: string | null;
  credit: string | null;
  description: string | null;
  costCenterId: string | null;
  referenceLineId: string | null;
  createdAt: string;
}

export interface JournalEntry {
  jeId: string;
  organizationId: string;
  companyCode: string;
  jeNumber: string;             // "JE-1000-2026-0001"
  jeDate: string;               // YYYY-MM-DD
  periodId: string;
  sourceEventType: string;      // e.g. "purchase_received", "ap_invoice_posted"
  sourceEventId: string;
  sourceDocId: string | null;
  sourceDocNumber: string | null;
  description: string | null;
  totalDebit: string;
  totalCredit: string;
  status: 'posted' | 'void';
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  postedAt: string;
  postedBy: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Backend-populated. Non-null when another JE with sourceEventType='je_reversal'
   * references this jeNumber via sourceDocNumber — the standard reversing-entry
   * pattern. Used to render a "Reversed" badge without inspecting status.
   */
  reversedByJeNumber?: string | null;
  lines?: JournalEntryLine[];   // present only on detail GET
}

/** Finance-side paginated list response (items-based envelope) */
export interface JEListResponse {
  items: JournalEntry[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Finance-side detail success envelope */
interface JEDetailSuccessEnvelope {
  data: JournalEntry;
  message?: string | null;
}

/** Reversal success envelope: backend returns { data: { original, reversal }, message } */
interface JEReverseSuccessEnvelope {
  data: {
    original: JournalEntry;
    reversal: JournalEntry;
  };
  message?: string | null;
}

export interface ReverseJEResult {
  original: JournalEntry;
  reversal: JournalEntry;
}

export interface ListJournalEntriesParams {
  organizationId: string;
  companyCode?: string;
  periodId?: string;
  sourceEventType?: string;
  status?: 'posted' | 'void';
  dateFrom?: string;            // YYYY-MM-DD
  dateTo?: string;              // YYYY-MM-DD
  search?: string;              // matches jeNumber or sourceDocNumber
  page?: number;
  size?: number;
}

// ============================================================================
// API functions
// ============================================================================

/**
 * Fetch a paginated list of journal entries.
 * GET /api/v1/finance/journal-entries
 *
 * Response: { items, total, page, size, pages }
 */
export async function listJournalEntries(
  params: ListJournalEntriesParams
): Promise<JEListResponse> {
  const {
    organizationId,
    companyCode,
    periodId,
    sourceEventType,
    status,
    dateFrom,
    dateTo,
    search,
    page = 1,
    size = 25,
  } = params;

  const queryParams: Record<string, string | number | boolean> = {
    organization_id: organizationId,
    page,
    size,
  };
  if (companyCode) queryParams.company_code = companyCode;
  if (periodId) queryParams.period_id = periodId;
  if (sourceEventType) queryParams.source_event_type = sourceEventType;
  if (status) queryParams.status = status;
  if (dateFrom) queryParams.date_from = dateFrom;
  if (dateTo) queryParams.date_to = dateTo;
  if (search) queryParams.search = search;

  const response = await apiClient.get<JEListResponse>(
    '/v1/finance/journal-entries',
    { params: queryParams }
  );
  return response.data;
}

/**
 * Fetch a single journal entry with its lines.
 * GET /api/v1/finance/journal-entries/{jeId}?organization_id=…
 *
 * Response shape: { data: { data: JournalEntry, message? }, ... }
 * The backend wraps in a success envelope so we unwrap response.data.data.
 */
export async function getJournalEntry(
  jeId: string,
  organizationId: string
): Promise<JournalEntry> {
  const response = await apiClient.get<JEDetailSuccessEnvelope>(
    `/v1/finance/journal-entries/${jeId}`,
    { params: { organization_id: organizationId } }
  );
  return response.data.data;
}

/**
 * Reverse a posted journal entry.
 * POST /api/v1/finance/journal-entries/{jeId}/reverse?organization_id={org}
 *
 * Body: { reason: string }
 * Returns { data: { original, reversal }, message } envelope — the original JE
 * is now voided and a new reversal JE is created.
 */
export async function reverseJournalEntry(
  jeId: string,
  orgId: string,
  reason: string
): Promise<ReverseJEResult> {
  const response = await apiClient.post<JEReverseSuccessEnvelope>(
    `/v1/finance/journal-entries/${jeId}/reverse`,
    { reason },
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}
