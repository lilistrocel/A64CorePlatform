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
// Sales Quote types (T-200.3) — fully typed, backend endpoint /v1/sales/quotes
// ============================================================================

export type QuoteStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export interface QuoteTotals {
  net: number;
  tax: number;
  gross: number;
}

export interface QuoteLine {
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
  warehouseId: string | null;
  costCenterId: string | null;
  orderedQty: number;
  consumedQty: number;
  notes: string | null;
  // doc-chain link back to base and forward to target SOs
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
}

export interface Quote {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  validUntilDate: string;
  status: QuoteStatus;
  currency: string;
  exchangeRate: number;
  paymentTermsId: string | null;
  salesEmployeeId: string | null;
  ownerUserId: string;
  notes: string | null;
  journalMemo: string | null;
  totals: QuoteTotals;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  lines: QuoteLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface QuoteListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  validUntilDate: string;
  status: QuoteStatus;
  currency: string;
  totals: QuoteTotals;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  taxPercent?: number;
  warehouseId?: string | null;
  costCenterId?: string | null;
  notes?: string | null;
}

export interface QuoteCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo?: string | null;
  docDate: string;
  validUntilDate: string;
  currency?: string;
  exchangeRate?: number;
  paymentTermsId?: string | null;
  salesEmployeeId?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines: QuoteLineCreate[];
}

export interface QuoteUpdate {
  customerId?: string | null;
  customerName?: string | null;
  bpRefNo?: string | null;
  docDate?: string | null;
  validUntilDate?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  paymentTermsId?: string | null;
  salesEmployeeId?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines?: QuoteLineCreate[] | null;
}

export interface QuoteTransition {
  newStatus: QuoteStatus;
  reason?: string | null;
}

export interface QuoteListParams {
  organizationId?: string;
  status?: QuoteStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

// ============================================================================
// Sales Order v2 types (T-200.4)
// Backend endpoint: /v1/sales/orders-v2
// Doc prefix: SO-YYYY-NNNN
// Status flow: draft → open → partly_closed → closed / cancelled
// ============================================================================

export type SalesOrderStatus =
  | 'draft'
  | 'open'
  | 'partly_closed'
  | 'closed'
  | 'cancelled';

export interface SalesOrderTotals {
  net: number;
  tax: number;
  gross: number;
}

export interface SalesOrderLine {
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
  warehouseId: string | null;
  costCenterId: string | null;
  notes: string | null;
  // Fulfilment tracking
  orderedQty: number;
  consumedQty: number;
  deliveredQty: number;
  invoicedQty: number;
  cancelledQty: number;
  committedQty: number;
  // Doc-chain links
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
}

export interface CreditCheckSnapshot {
  checkedAt: string;
  customerCreditLimit: number | null;
  outstandingAr: number;
  thisOrderTotal: number;
  result: 'approved' | 'blocked' | 'override';
  overrideByUserId: string | null;
  overrideReason: string | null;
}

export interface SalesOrder {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  deliveryDate: string | null;
  status: SalesOrderStatus;
  currency: string;
  exchangeRate: number;
  paymentTermsId: string | null;
  salesEmployeeId: string | null;
  ownerUserId: string;
  journalMemo: string | null;
  notes: string | null;
  totals: SalesOrderTotals;
  creditCheck: CreditCheckSnapshot | null;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  lines: SalesOrderLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SalesOrderListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  bpRefNo: string | null;
  docDate: string;
  deliveryDate: string | null;
  status: SalesOrderStatus;
  currency: string;
  totals: SalesOrderTotals;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  taxPercent?: number;
  warehouseId?: string | null;
  costCenterId?: string | null;
  notes?: string | null;
}

export interface SalesOrderCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  bpRefNo?: string | null;
  docDate: string;
  deliveryDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  paymentTermsId?: string | null;
  salesEmployeeId?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines: SalesOrderLineCreate[];
}

export interface SalesOrderUpdate {
  customerId?: string | null;
  customerName?: string | null;
  bpRefNo?: string | null;
  docDate?: string | null;
  deliveryDate?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  paymentTermsId?: string | null;
  salesEmployeeId?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines?: SalesOrderLineCreate[] | null;
}

export interface SalesOrderTransition {
  newStatus: SalesOrderStatus;
  reason?: string | null;
  overrideCreditCheck?: boolean;
  overrideReason?: string | null;
}

export interface SalesOrderFromQuoteRequest {
  deliveryDate?: string | null;
  notes?: string | null;
}

export interface SalesOrderListParams {
  organizationId?: string;
  status?: SalesOrderStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  hasOpenLines?: boolean | null;
  page?: number;
  size?: number;
}

// ============================================================================
// Stub types for remaining not-yet-implemented Wave 3 documents
// ============================================================================

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

// ============================================================================
// Sales Quote API — fully implemented (T-200.3)
// Rule 1: path does NOT include /api/ — apiClient already prepends /api/.
// ============================================================================

const QUOTE_BASE = '/v1/sales/quotes';

/**
 * List Sales Quotes with optional filters and pagination.
 */
export async function listQuotes(
  params: QuoteListParams,
): Promise<{ data: QuoteListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<QuoteListItem>>(
    QUOTE_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Sales Quote with all embedded lines.
 */
export async function getQuote(
  docId: string,
  orgId: string,
): Promise<Quote> {
  const response = await apiClient.get<SuccessEnvelope<Quote>>(
    `${QUOTE_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Sales Quote in DRAFT status.
 * Backend accepts snake_case input bodies (populate_by_name=True).
 */
export async function createQuote(
  data: QuoteCreate,
  orgId: string,
): Promise<Quote> {
  const body = {
    organization_id: orgId,
    company_code: data.companyCode,
    customer_id: data.customerId,
    customer_name: data.customerName,
    bp_ref_no: data.bpRefNo ?? null,
    doc_date: data.docDate,
    valid_until_date: data.validUntilDate,
    currency: data.currency ?? 'AED',
    exchange_rate: data.exchangeRate ?? 1.0,
    payment_terms_id: data.paymentTermsId ?? null,
    sales_employee_id: data.salesEmployeeId ?? null,
    journal_memo: data.journalMemo ?? null,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      notes: l.notes ?? null,
    })),
  };

  const response = await apiClient.post<SuccessEnvelope<Quote>>(
    QUOTE_BASE,
    body,
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT Sales Quote.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateQuote(
  docId: string,
  data: QuoteUpdate,
  orgId: string,
): Promise<Quote> {
  const body: Record<string, unknown> = {};
  if (data.customerId !== undefined) body['customer_id'] = data.customerId;
  if (data.customerName !== undefined) body['customer_name'] = data.customerName;
  if (data.bpRefNo !== undefined) body['bp_ref_no'] = data.bpRefNo;
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.validUntilDate !== undefined) body['valid_until_date'] = data.validUntilDate;
  if (data.currency !== undefined) body['currency'] = data.currency;
  if (data.exchangeRate !== undefined) body['exchange_rate'] = data.exchangeRate;
  if (data.paymentTermsId !== undefined) body['payment_terms_id'] = data.paymentTermsId;
  if (data.salesEmployeeId !== undefined) body['sales_employee_id'] = data.salesEmployeeId;
  if (data.journalMemo !== undefined) body['journal_memo'] = data.journalMemo;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.lines !== undefined && data.lines !== null) {
    body['lines'] = data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      notes: l.notes ?? null,
    }));
  }

  const response = await apiClient.patch<SuccessEnvelope<Quote>>(
    `${QUOTE_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Sales Quote.
 */
export async function deleteQuote(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${QUOTE_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Sales Quote status (e.g. DRAFT → OPEN, OPEN → CANCELLED).
 */
export async function transitionQuote(
  docId: string,
  transition: QuoteTransition,
  orgId: string,
): Promise<Quote> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<Quote>>(
    `${QUOTE_BASE}/${docId}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

const NOT_IMPLEMENTED = (doc: string) =>
  Promise.reject(new Error(`${doc}: not implemented — wire up in a follow-up task`));

/* eslint-disable @typescript-eslint/no-unused-vars */

// ============================================================================
// Sales Order v2 API — fully implemented (T-200.4)
// Rule 1: path does NOT include /api/ — apiClient already prepends /api/
// ============================================================================

const SO_BASE = '/v1/sales/orders-v2';

/**
 * List Sales Orders with optional filters and pagination.
 */
export async function listSalesOrders(
  params: SalesOrderListParams,
): Promise<{ data: SalesOrderListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number | boolean> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.hasOpenLines != null) queryParams['has_open_lines'] = params.hasOpenLines;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<SalesOrderListItem>>(
    SO_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Sales Order with all embedded lines.
 */
export async function getSalesOrder(
  docId: string,
  orgId: string,
): Promise<SalesOrder> {
  const response = await apiClient.get<SuccessEnvelope<SalesOrder>>(
    `${SO_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Sales Order from scratch in DRAFT status.
 */
export async function createSalesOrder(
  data: SalesOrderCreate,
  orgId: string,
): Promise<SalesOrder> {
  const body = {
    organization_id: orgId,
    company_code: data.companyCode,
    customer_id: data.customerId,
    customer_name: data.customerName,
    bp_ref_no: data.bpRefNo ?? null,
    doc_date: data.docDate,
    delivery_date: data.deliveryDate ?? null,
    currency: data.currency ?? 'AED',
    exchange_rate: data.exchangeRate ?? 1.0,
    payment_terms_id: data.paymentTermsId ?? null,
    sales_employee_id: data.salesEmployeeId ?? null,
    journal_memo: data.journalMemo ?? null,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      notes: l.notes ?? null,
    })),
  };

  const response = await apiClient.post<SuccessEnvelope<SalesOrder>>(SO_BASE, body);
  return response.data.data;
}

/**
 * Create a Sales Order from an existing Sales Quote (from-quote flow).
 * Backend copies all Quote lines and links the SO back to the Quote via baseDocRef.
 */
export async function createSalesOrderFromQuote(
  quoteDocEntry: string,
  data: SalesOrderFromQuoteRequest,
  orgId: string,
): Promise<SalesOrder> {
  const body = {
    delivery_date: data.deliveryDate ?? null,
    notes: data.notes ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<SalesOrder>>(
    `${SO_BASE}/from-quote/${quoteDocEntry}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT Sales Order.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateSalesOrder(
  docId: string,
  data: SalesOrderUpdate,
  orgId: string,
): Promise<SalesOrder> {
  const body: Record<string, unknown> = {};
  if (data.customerId !== undefined) body['customer_id'] = data.customerId;
  if (data.customerName !== undefined) body['customer_name'] = data.customerName;
  if (data.bpRefNo !== undefined) body['bp_ref_no'] = data.bpRefNo;
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.deliveryDate !== undefined) body['delivery_date'] = data.deliveryDate;
  if (data.currency !== undefined) body['currency'] = data.currency;
  if (data.exchangeRate !== undefined) body['exchange_rate'] = data.exchangeRate;
  if (data.paymentTermsId !== undefined) body['payment_terms_id'] = data.paymentTermsId;
  if (data.salesEmployeeId !== undefined) body['sales_employee_id'] = data.salesEmployeeId;
  if (data.journalMemo !== undefined) body['journal_memo'] = data.journalMemo;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.lines !== undefined && data.lines !== null) {
    body['lines'] = data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      notes: l.notes ?? null,
    }));
  }

  const response = await apiClient.patch<SuccessEnvelope<SalesOrder>>(
    `${SO_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Sales Order.
 * If the SO was created from a Quote, the Quote's consumed_qty is restored.
 */
export async function deleteSalesOrder(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${SO_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Sales Order status.
 * On DRAFT → OPEN performs a credit-limit check; 409 if blocked.
 */
export async function transitionSalesOrder(
  docId: string,
  transition: SalesOrderTransition,
  orgId: string,
): Promise<SalesOrder> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
    override_credit_check: transition.overrideCreditCheck ?? false,
    override_reason: transition.overrideReason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<SalesOrder>>(
    `${SO_BASE}/${docId}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

export const listDeliveries = () => NOT_IMPLEMENTED('Delivery');
export const getDelivery = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Delivery');

// Customer Receipt stubs removed — replaced by full implementation below

export const listReturnRequests = () => NOT_IMPLEMENTED('ReturnRequest');
export const getReturnRequest = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ReturnRequest');

export const listReturns = () => NOT_IMPLEMENTED('Return');
export const getReturn = (_id: string, _orgId: string) => NOT_IMPLEMENTED('Return');

export const listArCreditNotes = () => NOT_IMPLEMENTED('ARCreditNote');
export const getArCreditNote = (_id: string, _orgId: string) => NOT_IMPLEMENTED('ARCreditNote');

// ============================================================================
// AR Aging Report types + API (T-200.2)
// ============================================================================

/** One (customer, currency) row in the AR Aging report. */
export interface ARAgingCustomerRow {
  customerId: string;
  customerName: string;
  currency: string;
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  over90: string;
  total: string;
  invoiceCount: number;
}

/** Cross-customer bucket totals. */
export interface ARAgingGrandTotals {
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  over90: string;
  total: string;
  customerCount: number;
  invoiceCount: number;
}

/** Top-level AR Aging report shape. */
export interface ARAgingReport {
  asOfDate: string;
  customers: ARAgingCustomerRow[];
  grandTotals: ARAgingGrandTotals;
}

/** Query parameters accepted by the AR Aging endpoint. */
export interface ARAgingParams {
  organizationId?: string;
  customerId?: string | null;
  asOfDate?: string | null;
  currency?: string | null;
}

// Rule 1: path does NOT include /api/ — apiClient already prepends /api/
const AR_AGING_BASE = '/v1/sales/reports/ar-aging';

/**
 * Fetch the AR Aging report.
 *
 * Returns outstanding AR Invoice open_amounts grouped by (customer, currency)
 * with five ageing buckets: current / 1-30 / 31-60 / 61-90 / over90.
 */
export async function getArAging(params: ARAgingParams): Promise<ARAgingReport> {
  const queryParams: Record<string, string> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.asOfDate) queryParams['as_of_date'] = params.asOfDate;
  if (params.currency) queryParams['currency'] = params.currency;

  const response = await apiClient.get<SuccessEnvelope<ARAgingReport>>(
    AR_AGING_BASE,
    { params: queryParams },
  );
  return response.data.data;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
