/**
 * Sales API Service — Wave 3 (T-200.0)
 *
 * Provides HTTP access to the full Wave 3 sales document chain:
 * Quote → SO → Delivery → AR Invoice → Customer Receipt → Return Request → Return → AR Credit Note
 *
 * Base URL: /api/v1/sales
 * Response envelope: response.data.data for payload, response.data.meta for pagination.
 *
 * Only AR Invoice methods are fully implemented in this task.
 * All other document methods return Promise.reject("not implemented") and
 * are typed correctly so downstream hooks compile without error.
 */

import { apiClient } from './api';

// ============================================================================
// Shared types
// ============================================================================

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SuccessEnvelope<T> {
  data: T;
  message?: string;
}

export interface DocumentLinkRef {
  docType: string;
  docId: string;
  docNumber: string;
  lineId?: string | null;
}

// ============================================================================
// AR Invoice types
// ============================================================================

export type ARInvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'open'
  | 'partly_closed'
  | 'closed'
  | 'cancelled';

export interface ARInvoiceTotals {
  net: number;
  tax: number;
  gross: number;
  downPaymentApplied: number;
  paidAmount: number;
  creditedAmount: number;
  openAmount: number;
}

export interface ARInvoiceLine {
  lineId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPercent: number;
  lineNet: number;
  taxCodeId: string | null;
  taxPercent: number;
  lineTax: number;
  lineGross: number;
  revenueAccountId: string;
  warehouseId: string | null;
  costCenterId: string | null;
  invoicedQty: number;
  creditedQty: number;
  cancelledQty: number;
  // doc-chain link back to source Delivery line (null for direct invoices)
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
}

export interface ARInvoice {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  dateOfSupply: string;
  invoiceDate: string;
  taxDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  paymentTermsId: string | null;
  status: ARInvoiceStatus;
  totals: ARInvoiceTotals;
  isReserveInvoice: boolean;
  isCashSale: boolean;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  outboxEventId: string | null;
  outboxEventEmittedAt: string | null;
  journalMemo: string | null;
  notes: string | null;
  lines: ARInvoiceLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ARInvoiceListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  dueDate: string;
  taxDate: string;
  status: ARInvoiceStatus;
  totals: ARInvoiceTotals;
  baseDocRef: DocumentLinkRef | null;
  createdAt: string;
  updatedAt: string;
  // bpRefNo is not on the slim list shape — accessed from the detail
}

export interface ARInvoiceLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  warehouseId?: string | null;
  costCenterId?: string | null;
  baseDocRef?: DocumentLinkRef | null;
}

export interface ARInvoiceCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo?: string | null;
  docDate: string;
  dateOfSupply: string;
  invoiceDate: string;
  paymentTermsId?: string | null;
  currency?: string;
  exchangeRate?: number;
  journalMemo?: string | null;
  notes?: string | null;
  lines: ARInvoiceLineCreate[];
}

export interface ARInvoiceUpdate {
  bpRefNo?: string | null;
  docDate?: string | null;
  dateOfSupply?: string | null;
  invoiceDate?: string | null;
  paymentTermsId?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines?: ARInvoiceLineCreate[] | null;
}

export interface ARInvoiceFromDeliveryLineRequest {
  deliveryLineId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  costCenterId?: string | null;
}

export interface ARInvoiceFromDelivery {
  companyCode: string;
  bpRefNo?: string | null;
  docDate: string;
  invoiceDate: string;
  dateOfSupply?: string | null;
  paymentTermsId?: string | null;
  currency?: string;
  exchangeRate?: number;
  journalMemo?: string | null;
  notes?: string | null;
  lines: ARInvoiceFromDeliveryLineRequest[];
}

export interface ARInvoiceTransition {
  newStatus: ARInvoiceStatus;
  reason?: string | null;
}

export interface ARInvoiceListParams {
  organizationId?: string;
  status?: ARInvoiceStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

// ============================================================================
// Stub types for not-yet-implemented Wave 3 documents
// ============================================================================

export interface Quote { docEntry: string; docNumber: string; status: string; }
export interface SalesOrderV2 { docEntry: string; docNumber: string; status: string; }
export interface Delivery { docEntry: string; docNumber: string; status: string; }
export interface CustomerReceipt { docEntry: string; docNumber: string; status: string; }
export interface ReturnRequest { docEntry: string; docNumber: string; status: string; }
export interface Return { docEntry: string; docNumber: string; status: string; }
export interface ARCreditNote { docEntry: string; docNumber: string; status: string; }

// ============================================================================
// AR Invoice API — fully implemented
// ============================================================================

const AR_INVOICE_BASE = '/v1/sales/ar-invoices';

/**
 * List AR Invoices with optional filters and pagination.
 */
export async function listArInvoices(
  params: ARInvoiceListParams,
): Promise<{ data: ARInvoiceListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<ARInvoiceListItem>>(
    AR_INVOICE_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single AR Invoice with all lines.
 */
export async function getArInvoice(
  docId: string,
  orgId: string,
): Promise<ARInvoice> {
  const response = await apiClient.get<SuccessEnvelope<ARInvoice>>(
    `${AR_INVOICE_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a direct AR Invoice (no Delivery base).
 * Returns the newly created ARInvoice in DRAFT status.
 */
export async function createArInvoice(
  data: ARInvoiceCreate,
  orgId: string,
): Promise<ARInvoice> {
  const response = await apiClient.post<SuccessEnvelope<ARInvoice>>(
    AR_INVOICE_BASE,
    data,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create an AR Invoice from a posted Delivery Note.
 * The backend inherits customer + dates from the Delivery.
 */
export async function createArInvoiceFromDelivery(
  deliveryDocId: string,
  data: ARInvoiceFromDelivery,
  orgId: string,
): Promise<ARInvoice> {
  const response = await apiClient.post<SuccessEnvelope<ARInvoice>>(
    `${AR_INVOICE_BASE}/from-delivery/${deliveryDocId}`,
    data,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT AR Invoice.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateArInvoice(
  docId: string,
  data: ARInvoiceUpdate,
  orgId: string,
): Promise<ARInvoice> {
  const response = await apiClient.patch<SuccessEnvelope<ARInvoice>>(
    `${AR_INVOICE_BASE}/${docId}`,
    data,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT AR Invoice.
 */
export async function deleteArInvoice(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${AR_INVOICE_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition AR Invoice status (e.g. DRAFT → OPEN, OPEN → CANCELLED).
 */
export async function transitionArInvoice(
  docId: string,
  transition: ARInvoiceTransition,
  orgId: string,
): Promise<ARInvoice> {
  const response = await apiClient.post<SuccessEnvelope<ARInvoice>>(
    `${AR_INVOICE_BASE}/${docId}/transition`,
    transition,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

// ============================================================================
// Stub functions for not-yet-implemented Wave 3 documents
// Typed correctly so hooks compile; throw at runtime until implemented.
// ============================================================================

const NOT_IMPLEMENTED = (doc: string) =>
  Promise.reject(new Error(`${doc}: not implemented in T-200.0 — wire up in a follow-up task`));

/* eslint-disable @typescript-eslint/no-unused-vars */
export const listQuotes = () => NOT_IMPLEMENTED('Quote');
export const getQuote = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Quote');
export const createQuote = (_data: unknown) => NOT_IMPLEMENTED('Quote');

export const listSalesOrders = () => NOT_IMPLEMENTED('SalesOrder');
export const getSalesOrder = (_id: string, _orgId: string) => NOT_IMPLEMENTED('SalesOrder');
export const createSalesOrder = (_data: unknown) => NOT_IMPLEMENTED('SalesOrder');

export const listDeliveries = () => NOT_IMPLEMENTED('Delivery');
export const getDelivery = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Delivery');

export const listCustomerReceipts = () => NOT_IMPLEMENTED('CustomerReceipt');
export const getCustomerReceipt = (_id: string, _orgId: string) => NOT_IMPLEMENTED('CustomerReceipt');

export const listReturnRequests = () => NOT_IMPLEMENTED('ReturnRequest');
export const getReturnRequest = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ReturnRequest');

export const listReturns = () => NOT_IMPLEMENTED('Return');
export const getReturn = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Return');

export const listArCreditNotes = () => NOT_IMPLEMENTED('ARCreditNote');
export const getArCreditNote = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ARCreditNote');
/* eslint-enable @typescript-eslint/no-unused-vars */
