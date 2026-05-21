/**
 * Finance Posting Setup API Service
 *
 * Typed API calls for the company_posting_setup configuration.
 * Endpoints:
 *   GET  /api/v1/finance/companies/{companyCode}/posting-setup?organization_id={org}
 *   PUT  /api/v1/finance/companies/{companyCode}/posting-setup?organization_id={org}
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Returns undefined (not an error) when the backend returns 404 — the page
 * treats "no setup yet" as an unconfigured state.
 */

import { apiClient } from './api';

// ─── Response types ───────────────────────────────────────────────────────────

/**
 * Valuation method enum — per IAS 2, applied company-wide.
 * Matches backend ValuationMethodEnum.
 */
export type ValuationMethod = 'MovingAverage' | 'Standard' | 'FIFO';

/**
 * Shape of the response body from GET/PUT posting-setup.
 * Field names mirror the backend CompanyPostingSetupResponse schema.
 */
export interface CompanyPostingSetupResponse {
  setupId: string;
  organizationId: string;
  companyCode: string;
  apControlAccountId: string | null;
  arControlAccountId: string | null;
  bankAccountId: string | null;
  cashAccountId: string | null;
  grIrClearingAccountId: string | null;
  inputVatAccountId: string | null;
  outputVatAccountId: string | null;
  retainedEarningsAccountId: string | null;
  purchasePriceVarianceAccountId: string | null;
  roundingAccountId: string | null;
  /**
   * Company-wide default valuation method per IAS 2.
   * Moved from per-item to company level (PM feedback item 11).
   * Defaults to 'MovingAverage' when not explicitly set.
   */
  defaultValuationMethod: ValuationMethod;
  /** true when all required fields (apControlAccountId, bankAccountId,
   *  grIrClearingAccountId, inputVatAccountId, retainedEarningsAccountId) are set. */
  isComplete: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for PUT posting-setup (upsert).
 * All fields are optional — send only the fields you want to set.
 * Sending null explicitly clears a field.
 */
export interface CompanyPostingSetupUpdate {
  apControlAccountId?: string | null;
  arControlAccountId?: string | null;
  bankAccountId?: string | null;
  cashAccountId?: string | null;
  grIrClearingAccountId?: string | null;
  inputVatAccountId?: string | null;
  outputVatAccountId?: string | null;
  retainedEarningsAccountId?: string | null;
  purchasePriceVarianceAccountId?: string | null;
  roundingAccountId?: string | null;
  /** Company-wide default valuation method per IAS 2. */
  defaultValuationMethod?: ValuationMethod;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Fetch the posting setup for a company.
 *
 * Returns undefined (not an error) when the backend responds 404 — this means
 * the company has not been configured yet, which is the expected initial state.
 *
 * @param orgId       Organisation UUID.
 * @param companyCode Company code (e.g. "1000").
 */
/**
 * Backend envelope shape for SuccessResponse[T]: { data: T, message: null|string }
 * The actual setup payload lives at response.data.data.
 */
interface SuccessEnvelope<T> {
  data: T;
  message: string | null;
}

export async function getPostingSetup(
  orgId: string,
  companyCode: string
): Promise<CompanyPostingSetupResponse | undefined> {
  // Reason: validateStatus tells axios that 404 is NOT an error for this call.
  // This prevents the global response interceptor (api.ts) from firing its
  // showErrorToast on 404 — "not configured yet" is the expected initial state
  // for this endpoint and must not show a user-visible error.
  const response = await apiClient.get<SuccessEnvelope<CompanyPostingSetupResponse>>(
    `/v1/finance/companies/${encodeURIComponent(companyCode)}/posting-setup`,
    {
      params: { organization_id: orgId },
      validateStatus: (status) => status === 200 || status === 404,
    }
  );
  if (response.status === 404) return undefined;
  // Backend wraps in { data: ..., message: ... }; unwrap to the inner payload.
  return response.data.data;
}

/**
 * Upsert the posting setup for a company.
 *
 * PUT endpoint — creates the setup row if it doesn't exist, or updates it.
 * Returns the persisted setup including the `isComplete` flag.
 *
 * @param orgId       Organisation UUID.
 * @param companyCode Company code (e.g. "1000").
 * @param body        Fields to set. Omitted fields are not changed on update.
 */
export async function upsertPostingSetup(
  orgId: string,
  companyCode: string,
  body: CompanyPostingSetupUpdate
): Promise<CompanyPostingSetupResponse> {
  const response = await apiClient.put<SuccessEnvelope<CompanyPostingSetupResponse>>(
    `/v1/finance/companies/${encodeURIComponent(companyCode)}/posting-setup`,
    body,
    { params: { organization_id: orgId } }
  );
  // Backend wraps in { data: ..., message: ... }; unwrap to the inner payload.
  return response.data.data;
}
