/**
 * AP Payments API Service
 *
 * Typed API calls for the vendor payment module (finance side).
 * Payments are immutable in v1 — no edit/delete endpoints.
 * To correct a payment, reverse the linked Journal Entry.
 *
 * Endpoints:
 *   GET  /api/v1/finance/ap-payments
 *   GET  /api/v1/finance/ap-payments/{paymentId}
 *   POST /api/v1/finance/ap-payments
 *
 * Envelope:
 *   List:   response.data  → PaginatedResponse<ApPaymentResponse>
 *   Detail: response.data.data  (success envelope — same as JE service)
 *   Create: response.data.data  (201 success envelope)
 */

import { apiClient } from './api';

// ============================================================================
// Types — mirroring the backend contract exactly
// ============================================================================

export type PaymentMethod = 'bank_transfer' | 'cheque' | 'cash';

/** Inline JE summary attached to a payment. */
export interface ApPaymentJeSummary {
  jeId: string;
  jeNumber: string;
  totalDebit: string;
  totalCredit: string;
  status: string;               // 'posted' | 'void'
  /**
   * Set by the backend when another JE with sourceEventType='je_reversal'
   * references this JE's jeNumber. Frontend treats a non-null value as
   * "this payment has been reversed" — both the original and the reversal
   * stay status='posted' under the standard reversing-entry pattern.
   */
  reversedByJeNumber?: string | null;
}

/** List-level payment record (no applications array). */
export interface ApPaymentResponse {
  paymentId: string;
  organizationId: string;
  companyCode: string;
  paymentNumber: string;        // "PAY-1000-2026-0001"
  paymentDate: string;          // YYYY-MM-DD
  vendorId: string;
  vendorCode: string;
  vendorName: string | null;    // denormalised — may be null
  bankAccountId: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  currencyCode: string;
  totalAmount: string;          // decimal as string
  notes: string | null;
  jeId: string | null;
  je?: ApPaymentJeSummary | null;  // populated by backend on both list + detail
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Payment application (a single invoice paid by this payment). */
export interface ApPaymentApplication {
  applicationId: string;
  apDocId: string;
  apDocNumber: string;
  amountApplied: string;        // decimal as string
}

/** Detail-level payment record — includes applications and optional JE summary. */
export interface ApPaymentDetailResponse extends ApPaymentResponse {
  applications: ApPaymentApplication[];
}

// ─── Paginated list envelope (matches finance-side conventions) ───────────────

export interface ApPaymentsListResponse {
  items: ApPaymentResponse[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ─── Success envelope for create / detail ────────────────────────────────────

interface ApPaymentDetailSuccessEnvelope {
  data: ApPaymentDetailResponse;
  message?: string | null;
}

// ─── Filter params for list endpoint ─────────────────────────────────────────

export interface ListPaymentsParams {
  organizationId: string;
  companyCode?: string;
  vendorId?: string;
  dateFrom?: string;    // YYYY-MM-DD
  dateTo?: string;      // YYYY-MM-DD
  search?: string;      // matches paymentNumber / vendorCode / referenceNumber
  page?: number;
  size?: number;
}

// ─── Create payload ───────────────────────────────────────────────────────────

export interface CreatePaymentApplication {
  apDocId: string;
  apDocNumber: string;
  amountApplied: string;    // decimal as string or number — backend accepts both
}

export interface CreatePaymentPayload {
  organizationId: string;
  companyCode: string;
  paymentDate: string;      // YYYY-MM-DD
  vendorId: string;
  vendorCode: string;
  bankAccountId: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  currencyCode: string;
  notes?: string | null;
  applications: CreatePaymentApplication[];
}

// ============================================================================
// API functions
// ============================================================================

/**
 * List payments with optional filters.
 * GET /api/v1/finance/ap-payments
 */
export async function listPayments(
  params: ListPaymentsParams
): Promise<ApPaymentsListResponse> {
  const {
    organizationId,
    companyCode,
    vendorId,
    dateFrom,
    dateTo,
    search,
    page = 1,
    size = 25,
  } = params;

  const queryParams: Record<string, string | number> = {
    organization_id: organizationId,
    page,
    size,
  };
  if (companyCode) queryParams.company_code = companyCode;
  if (vendorId) queryParams.vendor_id = vendorId;
  if (dateFrom) queryParams.date_from = dateFrom;
  if (dateTo) queryParams.date_to = dateTo;
  if (search) queryParams.search = search;

  const response = await apiClient.get<ApPaymentsListResponse>(
    '/v1/finance/ap-payments',
    { params: queryParams }
  );
  return response.data;
}

/**
 * Fetch a single payment with applications and JE summary.
 * GET /api/v1/finance/ap-payments/{paymentId}?organization_id=…
 */
export async function getPayment(
  paymentId: string,
  organizationId: string
): Promise<ApPaymentDetailResponse> {
  const response = await apiClient.get<ApPaymentDetailSuccessEnvelope>(
    `/v1/finance/ap-payments/${paymentId}`,
    { params: { organization_id: organizationId } }
  );
  return response.data.data;
}

/**
 * Record a new vendor payment.
 * POST /api/v1/finance/ap-payments → 201 { data: ApPaymentDetailResponse }
 */
export async function createPayment(
  payload: CreatePaymentPayload
): Promise<ApPaymentDetailResponse> {
  const response = await apiClient.post<ApPaymentDetailSuccessEnvelope>(
    '/v1/finance/ap-payments',
    payload
  );
  return response.data.data;
}
