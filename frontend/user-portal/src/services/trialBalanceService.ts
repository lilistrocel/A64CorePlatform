/**
 * Trial Balance API Service
 *
 * Typed API call for the finance trial balance report.
 * Endpoint: GET /api/v1/finance/reports/trial-balance
 *
 * Returns aggregated debit/credit/balance totals per GL account
 * as of a given date (or period), grouped by drawer.
 */

import { apiClient } from './api';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TrialBalanceAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  drawer: string;
  accountType: string;
  accountLevel: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface TrialBalanceTotals {
  totalDebit: string;
  totalCredit: string;
}

export interface TrialBalanceResponse {
  organizationId: string;
  companyCode: string;
  asOfDate: string;
  periodId: string | null;
  generatedAt: string;
  includesVoided: boolean;
  accounts: TrialBalanceAccount[];
  totals: TrialBalanceTotals;
}

export interface GetTrialBalanceParams {
  organizationId: string;
  companyCode: string;
  asOfDate?: string;        // YYYY-MM-DD — defaults to today on the backend
  periodId?: string;
  includeVoided?: boolean;  // default false
}

// ─── Backend success envelope ─────────────────────────────────────────────────

interface SuccessEnvelope<T> {
  data: T;
  message: string | null;
}

// ─── API function ─────────────────────────────────────────────────────────────

/**
 * Fetch the trial balance report.
 * GET /api/v1/finance/reports/trial-balance
 *
 * Returns a SuccessResponse<TrialBalanceResponse> envelope.
 * We unwrap response.data.data.
 */
export async function getTrialBalance(
  params: GetTrialBalanceParams
): Promise<TrialBalanceResponse> {
  const queryParams: Record<string, string | boolean> = {
    organization_id: params.organizationId,
    company_code: params.companyCode,
  };
  if (params.asOfDate) queryParams.as_of_date = params.asOfDate;
  if (params.periodId) queryParams.period_id = params.periodId;
  if (params.includeVoided !== undefined) queryParams.include_voided = params.includeVoided;

  // Backend reports now use SuccessResponse[T] envelope, matching the rest
  // of the finance API. Unwrap once.
  const response = await apiClient.get<SuccessEnvelope<TrialBalanceResponse>>(
    '/v1/finance/reports/trial-balance',
    { params: queryParams }
  );
  return response.data.data;
}
