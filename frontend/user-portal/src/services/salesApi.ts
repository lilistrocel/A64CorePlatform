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
// Customer Receipt types (T-200.1)
// ============================================================================

export type CustomerReceiptStatus =
  | 'draft'
  | 'open'
  | 'closed'
  | 'cancelled';

export interface CustomerReceiptAllocation {
  allocationLineNumber: number;
  arInvoiceDocEntry: string;
  arInvoiceDocNumber: string;
  amountApplied: number;
  currencyApplied: string;
  notes: string | null;
}

export interface CustomerReceipt {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  paymentMethod: string;
  paymentRef: string | null;
  bankAccountId: string;
  currency: string;
  exchangeRate: number;
  amountReceived: number;
  allocations: CustomerReceiptAllocation[];
  status: CustomerReceiptStatus;
  unallocatedAmount: number;
  baseDocRefs: DocumentLinkRef[];
  targetDocRefs: DocumentLinkRef[];
  outboxEventId: string | null;
  outboxEventEmittedAt: string | null;
  journalMemo: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CustomerReceiptListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  paymentMethod: string;
  status: CustomerReceiptStatus;
  amountReceived: number;
  unallocatedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReceiptAllocationCreate {
  arInvoiceDocEntry: string;
  arInvoiceDocNumber: string;
  amountApplied: number;
  currencyApplied?: string;
  notes?: string | null;
}

export interface CustomerReceiptCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo?: string | null;
  docDate: string;
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash' | 'card';
  paymentRef?: string | null;
  bankAccountId: string;
  currency?: string;
  exchangeRate?: number;
  amountReceived: number;
  allocations: CustomerReceiptAllocationCreate[];
  journalMemo?: string | null;
  notes?: string | null;
}

export interface CustomerReceiptUpdate {
  bpRefNo?: string | null;
  docDate?: string | null;
  paymentMethod?: 'bank_transfer' | 'cheque' | 'cash' | 'card' | null;
  paymentRef?: string | null;
  bankAccountId?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  amountReceived?: number | null;
  allocations?: CustomerReceiptAllocationCreate[] | null;
  journalMemo?: string | null;
  notes?: string | null;
}

/** Used for the from-invoice shortcut endpoint. */
export interface CustomerReceiptFromInvoice {
  companyCode: string;
  docDate: string;
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash' | 'card';
  paymentRef?: string | null;
  bankAccountId: string;
  currency?: string;
  exchangeRate?: number;
  amount?: number | null;
  bpRefNo?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
}

export interface CustomerReceiptTransition {
  newStatus: CustomerReceiptStatus;
  reason?: string | null;
}

export interface CustomerReceiptListParams {
  organizationId?: string;
  status?: CustomerReceiptStatus | null;
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
// Customer Receipt API — fully implemented (T-200.1)
// ============================================================================

const CUSTOMER_RECEIPT_BASE = '/v1/sales/customer-receipts';

/**
 * List Customer Receipts with optional filters and pagination.
 * Rule 1: base path does NOT include /api/ — apiClient already prepends /api/.
 */
export async function listCustomerReceipts(
  params: CustomerReceiptListParams,
): Promise<{ data: CustomerReceiptListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<CustomerReceiptListItem>>(
    CUSTOMER_RECEIPT_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Customer Receipt with all embedded allocations.
 */
export async function getCustomerReceipt(
  docId: string,
  orgId: string,
): Promise<CustomerReceipt> {
  const response = await apiClient.get<SuccessEnvelope<CustomerReceipt>>(
    `${CUSTOMER_RECEIPT_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Customer Receipt with manual allocations.
 * Returns the newly created CustomerReceipt in DRAFT status.
 * Body uses snake_case keys (backend accepts both; camelCase is output only).
 */
export async function createCustomerReceipt(
  data: CustomerReceiptCreate,
  orgId: string,
): Promise<CustomerReceipt> {
  // Convert camelCase front-end payload to snake_case for backend input.
  const body = {
    organization_id: orgId,
    company_code: data.companyCode,
    customer_id: data.customerId,
    customer_name: data.customerName,
    bp_ref_no: data.bpRefNo ?? null,
    doc_date: data.docDate,
    payment_method: data.paymentMethod,
    payment_ref: data.paymentRef ?? null,
    bank_account_id: data.bankAccountId,
    currency: data.currency ?? 'AED',
    exchange_rate: data.exchangeRate ?? 1.0,
    amount_received: data.amountReceived,
    allocations: data.allocations.map((a) => ({
      ar_invoice_doc_entry: a.arInvoiceDocEntry,
      ar_invoice_doc_number: a.arInvoiceDocNumber,
      amount_applied: a.amountApplied,
      currency_applied: a.currencyApplied ?? 'AED',
      notes: a.notes ?? null,
    })),
    journal_memo: data.journalMemo ?? null,
    notes: data.notes ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<CustomerReceipt>>(
    CUSTOMER_RECEIPT_BASE,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Customer Receipt from a single AR Invoice (from-invoice shortcut).
 * Pre-fills customer + currency from the ARI; caller provides payment details.
 */
export async function createCustomerReceiptFromInvoice(
  ariDocEntry: string,
  data: CustomerReceiptFromInvoice,
  orgId: string,
): Promise<CustomerReceipt> {
  const body = {
    company_code: data.companyCode,
    doc_date: data.docDate,
    payment_method: data.paymentMethod,
    payment_ref: data.paymentRef ?? null,
    bank_account_id: data.bankAccountId,
    currency: data.currency ?? 'AED',
    exchange_rate: data.exchangeRate ?? 1.0,
    amount: data.amount ?? null,
    bp_ref_no: data.bpRefNo ?? null,
    journal_memo: data.journalMemo ?? null,
    notes: data.notes ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<CustomerReceipt>>(
    `${CUSTOMER_RECEIPT_BASE}/from-invoice/${ariDocEntry}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT Customer Receipt.
 * If `allocations` is provided the existing allocation set is replaced wholesale.
 */
export async function updateCustomerReceipt(
  docId: string,
  data: CustomerReceiptUpdate,
  orgId: string,
): Promise<CustomerReceipt> {
  const body: Record<string, unknown> = {};
  if (data.bpRefNo !== undefined) body['bp_ref_no'] = data.bpRefNo;
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.paymentMethod !== undefined) body['payment_method'] = data.paymentMethod;
  if (data.paymentRef !== undefined) body['payment_ref'] = data.paymentRef;
  if (data.bankAccountId !== undefined) body['bank_account_id'] = data.bankAccountId;
  if (data.currency !== undefined) body['currency'] = data.currency;
  if (data.exchangeRate !== undefined) body['exchange_rate'] = data.exchangeRate;
  if (data.amountReceived !== undefined) body['amount_received'] = data.amountReceived;
  if (data.journalMemo !== undefined) body['journal_memo'] = data.journalMemo;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.allocations !== undefined && data.allocations !== null) {
    body['allocations'] = data.allocations.map((a) => ({
      ar_invoice_doc_entry: a.arInvoiceDocEntry,
      ar_invoice_doc_number: a.arInvoiceDocNumber,
      amount_applied: a.amountApplied,
      currency_applied: a.currencyApplied ?? 'AED',
      notes: a.notes ?? null,
    }));
  }

  const response = await apiClient.patch<SuccessEnvelope<CustomerReceipt>>(
    `${CUSTOMER_RECEIPT_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Customer Receipt.
 */
export async function deleteCustomerReceipt(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${CUSTOMER_RECEIPT_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Customer Receipt status (e.g. DRAFT → OPEN, OPEN → CANCELLED).
 */
export async function transitionCustomerReceipt(
  docId: string,
  transition: CustomerReceiptTransition,
  orgId: string,
): Promise<CustomerReceipt> {
  // Backend accepts snake_case input — convert newStatus → new_status.
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<CustomerReceipt>>(
    `${CUSTOMER_RECEIPT_BASE}/${docId}/transition`,
    body,
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

// Customer Receipt stubs removed — replaced by full implementation below

export const listReturnRequests = () => NOT_IMPLEMENTED('ReturnRequest');
export const getReturnRequest = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ReturnRequest');

export const listReturns = () => NOT_IMPLEMENTED('Return');
export const getReturn = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Return');

export const listArCreditNotes = () => NOT_IMPLEMENTED('ARCreditNote');
export const getArCreditNote = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ARCreditNote');
/* eslint-enable @typescript-eslint/no-unused-vars */
