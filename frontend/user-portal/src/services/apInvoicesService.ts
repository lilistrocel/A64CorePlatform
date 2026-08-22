/**
 * AP Invoices (Vendor Invoices) API Service
 *
 * Typed API calls for the AP Invoice module (Phase C).
 * AP Invoices are created from Posted GRs. On Approve, an ap_invoice_posted event
 * is emitted → finance creates a JE: DR GR/IR Clearing + DR Input VAT + DR Price
 * Variance (if any) / CR AP-Vendor.
 *
 * All endpoints are under /api/v1/purchasing/ap.
 * Envelope conventions mirror goodsReceiptsService.ts:
 *   - List:   response.data  (PaginatedResult<APInvoice>)
 *   - Detail: response.data.data  (SuccessResult<APInvoiceDetail>)
 *   - Delete: 204 No Content
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

// T-811: wave4_purchasing_status_migration.py lowercased AP's stored status;
// "Approved" collapsed into the shared 'open' value (displays as "Approved"
// for AP specifically via statusPhase.ts's statusDisplayLabel()). 'Rejected'
// was never touched by that migration. TitleCase variants are kept as
// aliases only for documents left over from before the migration ran.
export type APStatus =
  | 'draft'
  | 'pending_approval'
  | 'open'
  | 'Rejected'
  // Pre-migration aliases (migration-window safety only)
  | 'Draft'
  | 'Pending Approval'
  | 'Approved';

/** A single AP Invoice line as returned by the backend */
export interface APLine {
  apLineId: string;
  apDocId: string;
  organizationId: string;
  lineNumber: number;
  grLineId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  quantity: number;
  /** Read-only: copied from the PO line at AP creation time */
  poUnitPrice: number;
  /** Editable by the user: the vendor's billed unit price */
  invoiceUnitPrice: number;
  /** Per-line discount inherited from the PO/GR chain — read-only here */
  discountPercent?: number;
  /** Computed server-side: invoiceUnitPrice - poUnitPrice (per unit) */
  priceVarianceAmount: number;
  taxCode: string;
  taxRate: number;
  lineNet: number;
  lineTax: number;
  lineGross: number;
  /** Cost-centre tag inherited from the PO/GR chain — drives JE tagging */
  costCenterId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AP Invoice header as returned in paginated list */
export interface APInvoice {
  docId: string;
  organizationId: string;
  docType: 'AP';
  docNumber: string;
  docDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  status: APStatus;
  /** Source GR */
  grDocId: string;
  grDocNumber?: string | null;
  /** Source PO (via GR) */
  poDocId?: string | null;
  poDocNumber?: string | null;
  vendorId?: string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  paymentTermsCode?: string | null;
  currencyCode: string;
  subtotalNet: number;
  totalTax: number;
  totalGross: number;
  /** Signed difference: total(invoiceUnitPrice - poUnitPrice) × quantity per line */
  totalPriceVariance: number;
  notes?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionComment?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full AP Invoice detail with lines */
export interface APInvoiceDetail extends APInvoice {
  lines: APLine[];
}

/**
 * Body for creating an AP Invoice from a GR.
 * POST /api/v1/purchasing/ap/from-gr/{grDocId}
 */
export interface APFromGRCreate {
  docDate: string;            // YYYY-MM-DD — the AP's own document date
  invoiceNumber: string;      // vendor's invoice reference
  invoiceDate: string;        // YYYY-MM-DD — date on the vendor's invoice
  dueDate?: string | null;    // YYYY-MM-DD — payment due date
  notes?: string | null;
  lines: APLineCreate[];
}

/** A line in the create-from-GR payload */
export interface APLineCreate {
  grLineId: string;           // which GR line this AP line maps to
  invoiceUnitPrice: number;   // vendor's billed unit price (defaults to PO price)
  taxCode?: string | null;    // override the GR line tax code if needed
}

/** PATCH body for updating a Draft AP Invoice */
export interface APUpdate {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  lines?: APLineCreate[] | null;
}

/** Body for approve/reject actions */
export interface APApproveBody {
  comment?: string | null;
}

export interface APRejectBody {
  comment: string;
}

/** Generic paginated response — same shape as goodsReceiptsService.ts */
interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

/** Generic single-item success envelope */
interface SuccessResult<T> {
  data: T;
  message?: string | null;
}

// ============================================================================
// API functions
// ============================================================================

/**
 * List AP Invoices (paginated).
 * GET /api/v1/purchasing/ap?organization_id=…&status=…&search=…&page=…&per_page=…
 */
export async function getAPInvoices(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: APStatus;
  search?: string;
}): Promise<PaginatedResult<APInvoice>> {
  const response = await apiClient.get<PaginatedResult<APInvoice>>(
    '/v1/purchasing/ap',
    {
      params: {
        ...(params?.organizationId ? { organization_id: params.organizationId } : {}),
        ...(params?.page !== undefined ? { page: params.page } : {}),
        ...(params?.perPage !== undefined ? { per_page: params.perPage } : {}),
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.search ? { search: params.search } : {}),
      },
    }
  );
  return response.data;
}

/**
 * Get a single AP Invoice by docId.
 * GET /api/v1/purchasing/ap/{docId}?organization_id=…
 */
export async function getAPInvoice(
  docId: string,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.get<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/${docId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Create an AP Invoice from a Posted GR.
 * POST /api/v1/purchasing/ap/from-gr/{grDocId}?organization_id=…
 */
export async function createAPFromGR(
  grDocId: string,
  data: APFromGRCreate,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.post<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/from-gr/${grDocId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Update a Draft AP Invoice.
 * PATCH /api/v1/purchasing/ap/{docId}?organization_id=…
 */
export async function updateAPInvoice(
  docId: string,
  data: APUpdate,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.patch<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/${docId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Submit a Draft AP Invoice for approval.
 * POST /api/v1/purchasing/ap/{docId}/submit?organization_id=…
 * Status: Draft → Pending Approval
 */
export async function submitAPInvoice(
  docId: string,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.post<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/${docId}/submit`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Approve an AP Invoice.
 * POST /api/v1/purchasing/ap/{docId}/approve?organization_id=…
 * Status: Pending Approval → Approved; emits ap_invoice_posted event.
 */
export async function approveAPInvoice(
  docId: string,
  body?: APApproveBody,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.post<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/${docId}/approve`,
    body ?? {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Reject an AP Invoice.
 * POST /api/v1/purchasing/ap/{docId}/reject?organization_id=…
 * Status: Pending Approval → Rejected
 */
export async function rejectAPInvoice(
  docId: string,
  body: APRejectBody,
  organizationId?: string
): Promise<APInvoiceDetail> {
  const response = await apiClient.post<SuccessResult<APInvoiceDetail>>(
    `/v1/purchasing/ap/${docId}/reject`,
    body,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

/**
 * Delete a Draft AP Invoice.
 * DELETE /api/v1/purchasing/ap/{docId}?organization_id=…
 * Returns 204 No Content.
 */
export async function deleteAPInvoice(
  docId: string,
  organizationId?: string
): Promise<void> {
  await apiClient.delete(`/v1/purchasing/ap/${docId}`, {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
}
