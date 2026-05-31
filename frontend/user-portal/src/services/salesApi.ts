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
// Delivery Note types (T-200.5)
// Backend endpoint: /v1/sales/deliveries
// Doc prefix: DN-YYYY-NNNN
// Status flow: draft → open → cancelled (no partly_closed — instantaneous delivery)
// ============================================================================

export type DeliveryStatus = 'draft' | 'open' | 'cancelled';

export interface DeliveryLine {
  lineId: string;
  lineNumber: number;
  // soLineId / soLineNumber present in create payload but not in response model yet
  soLineId?: string | null;
  soLineNumber?: number | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  uom: string;
  warehouseId: string;
  unitCost: number;
  lineCogs: number;
  costCenterId: string | null;
  orderedQty: number;
  invoicedQty: number;
  creditedQty: number;
  cancelledQty: number;
  // Quantity returned — populated by Return Notes; not in response yet (T-100.11)
  returnedQty?: number | null;
  // doc-chain links
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
}

export interface Delivery {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualDeliveryDate: string;
  status: DeliveryStatus;
  deliveredByUserId: string | null;
  notes: string | null;
  totalCogs: number;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  outboxEventId: string | null;
  outboxEventEmittedAt: string | null;
  lines: DeliveryLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DeliveryListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualDeliveryDate: string;
  status: DeliveryStatus;
  totalCogs: number;
  baseDocRef: DocumentLinkRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLineCreate {
  soLineId: string;
  soLineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  quantity: number;
  uom: string;
  warehouseId: string;
  costCenterId?: string | null;
}

/** Full create payload — used only when building manually (rare). */
export interface DeliveryCreate {
  companyCode: string;
  docDate: string;
  actualDeliveryDate: string;
  deliveredByUserId?: string | null;
  notes?: string | null;
  lines: DeliveryLineCreate[];
}

/** Partial update — DRAFT only. */
export interface DeliveryUpdate {
  docDate?: string | null;
  actualDeliveryDate?: string | null;
  deliveredByUserId?: string | null;
  notes?: string | null;
  lines?: DeliveryLineCreate[] | null;
}

/** Request body for POST /from-so/:soDocEntry. */
export interface DeliveryFromSORequest {
  companyCode: string;
  docDate: string;
  actualDeliveryDate: string;
  deliveredByUserId?: string | null;
  notes?: string | null;
  lines: DeliveryLineCreate[];
}

export interface DeliveryTransition {
  newStatus: DeliveryStatus;
  reason?: string | null;
}

export interface DeliveryListParams {
  organizationId?: string;
  status?: DeliveryStatus | null;
  customerId?: string | null;
  soDocEntry?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

// ============================================================================
// Return Request types (T-200.6)
// Backend endpoint: /v1/sales/return-requests
// Doc prefix: RR-YYYY-NNNN
// Status flow: draft → open → closed (auto when fully consumed) / cancelled
// ============================================================================

export type ReturnRequestStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export type ReturnReason =
  | 'damaged'
  | 'wrong_item'
  | 'overshipped'
  | 'customer_change'
  | 'quality'
  | 'other';

export interface ReturnRequestTotals {
  net: number;
  tax: number;
  gross: number;
}

export interface ReturnRequestLine {
  lineId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  requestedQty: number;
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
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  orderedQty: number;
  consumedQty: number;
}

export interface ReturnRequest {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  validUntilDate: string;
  reason: ReturnReason;
  reasonText: string | null;
  status: ReturnRequestStatus;
  totals: ReturnRequestTotals;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  notes: string | null;
  lines: ReturnRequestLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReturnRequestListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  validUntilDate: string;
  reason: ReturnReason;
  status: ReturnRequestStatus;
  totals: ReturnRequestTotals;
  baseDocRef: DocumentLinkRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnRequestLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  requestedQty: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  taxPercent?: number;
  warehouseId?: string | null;
  costCenterId?: string | null;
  /** Required: link to source Delivery line */
  baseDocRef: DocumentLinkRef;
}

export interface ReturnRequestCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  validUntilDate: string;
  reason: ReturnReason;
  reasonText?: string | null;
  /** Required: source Delivery header ref */
  baseDocRef: DocumentLinkRef;
  lines: ReturnRequestLineCreate[];
  notes?: string | null;
}

export interface ReturnRequestUpdate {
  docDate?: string | null;
  validUntilDate?: string | null;
  reason?: ReturnReason | null;
  reasonText?: string | null;
  notes?: string | null;
  lines?: ReturnRequestLineCreate[] | null;
}

export interface ReturnRequestTransition {
  newStatus: ReturnRequestStatus;
  reason?: string | null;
}

export interface ReturnRequestListParams {
  organizationId?: string;
  status?: ReturnRequestStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

// ============================================================================
// Return Note v2 types (T-200.7)
// Backend endpoint: /v1/sales/returns-v2
// Doc prefix: RTN-YYYY-NNNN
// Status flow: draft → open → cancelled
// Collection: returns_v2
// ============================================================================

export type ReturnNoteStatus = 'draft' | 'open' | 'cancelled';

export interface ReturnNoteTotals {
  net: number;
  tax: number;
  gross: number;
  totalCogs: number;
}

export interface ReturnNoteLine {
  lineId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  returnedQty: number;
  uom: string;
  warehouseId: string;
  unitCost: number;
  lineCogs: number;
  unitPrice: number;
  discountPercent: number;
  lineNet: number;
  taxCodeId: string | null;
  taxPercent: number;
  lineTax: number;
  lineGross: number;
  costCenterId: string | null;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  orderedQty: number;
  consumedQty: number;
}

export interface ReturnNote {
  docEntry: string;
  docNumber: string;
  docType: string;
  organizationId: string;
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualReturnDate: string;
  status: ReturnNoteStatus;
  receivedByUserId: string | null;
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
  outboxEventId: string | null;
  outboxEventEmittedAt: string | null;
  totals: ReturnNoteTotals;
  notes: string | null;
  lines: ReturnNoteLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReturnNoteListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualReturnDate: string;
  status: ReturnNoteStatus;
  totals: ReturnNoteTotals;
  baseDocRef: DocumentLinkRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnNoteLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  returnedQty: number;
  uom: string;
  warehouseId: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  taxPercent?: number;
  costCenterId?: string | null;
  /** Required: link to source RR line or Delivery line */
  baseDocRef: DocumentLinkRef;
}

/**
 * Payload for creating a Return Note from a Return Request (RR).
 * The backend endpoint is POST /returns-v2/from-request/:rrDocEntry.
 */
export interface ReturnNoteFromRRRequest {
  companyCode: string;
  docDate: string;
  actualReturnDate: string;
  receivedByUserId?: string | null;
  notes?: string | null;
  lines: ReturnNoteLineCreate[];
}

/**
 * Payload for creating a Return Note directly from a Delivery (no RR).
 * Uses the generic POST /returns-v2 endpoint — client supplies all fields.
 * The backend does not expose a dedicated /from-delivery endpoint.
 */
export interface ReturnNoteFromDNCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualReturnDate: string;
  receivedByUserId?: string | null;
  /** Source Delivery header ref — stored as baseDocRef on the RTN header. */
  baseDocRef: DocumentLinkRef;
  notes?: string | null;
  lines: ReturnNoteLineCreate[];
}

export interface ReturnNoteCreate {
  companyCode: string;
  customerId: string;
  customerName: string;
  docDate: string;
  actualReturnDate: string;
  receivedByUserId?: string | null;
  baseDocRef: DocumentLinkRef;
  notes?: string | null;
  lines: ReturnNoteLineCreate[];
}

export interface ReturnNoteUpdate {
  docDate?: string | null;
  actualReturnDate?: string | null;
  receivedByUserId?: string | null;
  notes?: string | null;
  lines?: ReturnNoteLineCreate[] | null;
}

export interface ReturnNoteTransition {
  newStatus: ReturnNoteStatus;
  reason?: string | null;
}

export interface ReturnNoteListParams {
  organizationId?: string;
  status?: ReturnNoteStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

// ============================================================================
// AR Credit Note types (T-200.8)
// Backend endpoint: /v1/sales/ar-credit-notes
// Doc prefix: ARC-YYYY-NNNN
// Status flow: draft → open → partly_closed → closed → cancelled
// Two creation paths:
//   from-RTN:     financial completion of a physical return (POST /ar-credit-notes — body contains baseReturnDocRef)
//   from-invoice: direct financial reversal without goods movement
// ============================================================================

export type ARCreditNoteStatus =
  | 'draft'
  | 'open'
  | 'partly_closed'
  | 'closed'
  | 'cancelled';

export type CreditReason =
  | 'return'
  | 'price_adjustment'
  | 'discount'
  | 'goodwill'
  | 'cancellation'
  | 'other';

export interface ARCreditNoteTotals {
  net: number;
  tax: number;
  gross: number;
}

export interface CreditNoteAllocation {
  allocationLineNumber: number;
  arInvoiceDocEntry: string;
  arInvoiceDocNumber: string;
  amountApplied: number;
}

export interface ARCreditNoteLine {
  lineId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description: string;
  creditedQty: number;
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
  baseDocRef: DocumentLinkRef | null;
  targetDocRefs: DocumentLinkRef[];
}

export interface ARCreditNote {
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
  currency: string;
  exchangeRate: number;
  paymentTermsId: string | null;
  creditReason: CreditReason;
  creditReasonText: string | null;
  status: ARCreditNoteStatus;
  totals: ARCreditNoteTotals;
  /** Points to source AR Invoice (always present on a posted ARC). */
  baseDocRef: DocumentLinkRef | null;
  /** Points to source RTN if this ARC is the financial completion of a physical return. */
  baseReturnDocRef: DocumentLinkRef | null;
  allocations: CreditNoteAllocation[];
  targetDocRefs: DocumentLinkRef[];
  outboxEventId: string | null;
  outboxEventEmittedAt: string | null;
  journalMemo: string | null;
  notes: string | null;
  lines: ARCreditNoteLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ARCreditNoteListItem {
  docEntry: string;
  docNumber: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  docDate: string;
  taxDate: string;
  status: ARCreditNoteStatus;
  totals: ARCreditNoteTotals;
  baseReturnDocRef: DocumentLinkRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditNoteAllocationCreate {
  arInvoiceDocEntry: string;
  arInvoiceDocNumber: string;
  amountApplied: number;
}

export interface ARCreditNoteLineCreate {
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  creditedQty: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  taxCodeId?: string | null;
  taxPercent?: number;
  revenueAccountId: string;
  warehouseId?: string | null;
  costCenterId?: string | null;
  baseDocRef: DocumentLinkRef;
}

export interface ARCreditNoteCreate {
  companyCode?: string;
  customerId: string;
  customerName: string;
  bpRefNo?: string | null;
  docDate: string;
  dateOfSupply: string;
  invoiceDate: string;
  currency?: string;
  exchangeRate?: number;
  paymentTermsId?: string | null;
  creditReason: CreditReason;
  creditReasonText?: string | null;
  /** Set when creating from RTN — points to the Return Note. */
  baseReturnDocRef?: DocumentLinkRef | null;
  allocations: CreditNoteAllocationCreate[];
  lines: ARCreditNoteLineCreate[];
  journalMemo?: string | null;
  notes?: string | null;
}

export interface ARCreditNoteUpdate {
  bpRefNo?: string | null;
  docDate?: string | null;
  dateOfSupply?: string | null;
  invoiceDate?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  creditReason?: CreditReason | null;
  creditReasonText?: string | null;
  journalMemo?: string | null;
  notes?: string | null;
  lines?: ARCreditNoteLineCreate[] | null;
  allocations?: CreditNoteAllocationCreate[] | null;
}

export interface ARCreditNoteTransition {
  newStatus: ARCreditNoteStatus;
  reason?: string | null;
}

export interface ARCreditNoteListParams {
  organizationId?: string;
  status?: ARCreditNoteStatus | null;
  customerId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  size?: number;
}

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

// ============================================================================
// Delivery Note API — fully implemented (T-200.5)
// Rule 1: path does NOT include /api/ — apiClient already prepends /api/
// ============================================================================

const DELIVERY_BASE = '/v1/sales/deliveries';

/**
 * List Delivery Notes with optional filters and pagination.
 */
export async function listDeliveries(
  params: DeliveryListParams,
): Promise<{ data: DeliveryListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.soDocEntry) queryParams['so_doc_entry'] = params.soDocEntry;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<DeliveryListItem>>(
    DELIVERY_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Delivery Note with all embedded lines.
 */
export async function getDelivery(
  docId: string,
  orgId: string,
): Promise<Delivery> {
  const response = await apiClient.get<SuccessEnvelope<Delivery>>(
    `${DELIVERY_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Delivery Note from an existing Sales Order (primary creation path).
 * Backend inherits customer from the SO; caller provides header + lines.
 * Each line must reference a valid SO line via soLineId with available openQty.
 */
export async function createDeliveryFromSO(
  soDocEntry: string,
  data: DeliveryFromSORequest,
  orgId: string,
): Promise<Delivery> {
  const body = {
    company_code: data.companyCode,
    doc_date: data.docDate,
    actual_delivery_date: data.actualDeliveryDate,
    delivered_by_user_id: data.deliveredByUserId ?? null,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({
      so_line_id: l.soLineId,
      so_line_number: l.soLineNumber,
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      warehouse_id: l.warehouseId,
      cost_center_id: l.costCenterId ?? null,
    })),
  };

  const response = await apiClient.post<SuccessEnvelope<Delivery>>(
    `${DELIVERY_BASE}/from-so/${soDocEntry}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT Delivery Note.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateDelivery(
  docId: string,
  data: DeliveryUpdate,
  orgId: string,
): Promise<Delivery> {
  const body: Record<string, unknown> = {};
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.actualDeliveryDate !== undefined) body['actual_delivery_date'] = data.actualDeliveryDate;
  if (data.deliveredByUserId !== undefined) body['delivered_by_user_id'] = data.deliveredByUserId;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.lines !== undefined && data.lines !== null) {
    body['lines'] = data.lines.map((l) => ({
      so_line_id: l.soLineId,
      so_line_number: l.soLineNumber,
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      warehouse_id: l.warehouseId,
      cost_center_id: l.costCenterId ?? null,
    }));
  }

  const response = await apiClient.patch<SuccessEnvelope<Delivery>>(
    `${DELIVERY_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Delivery Note.
 */
export async function deleteDelivery(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${DELIVERY_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Delivery Note status (e.g. DRAFT → OPEN (Post), DRAFT/OPEN → CANCELLED).
 */
export async function transitionDelivery(
  docId: string,
  transition: DeliveryTransition,
  orgId: string,
): Promise<Delivery> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<Delivery>>(
    `${DELIVERY_BASE}/${docId}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

// ============================================================================
// Return Request API — fully implemented (T-200.6)
// Rule 1: path does NOT include /api/ — apiClient already prepends /api/
// ============================================================================

const RR_BASE = '/v1/sales/return-requests';

/**
 * List Return Requests with optional filters and pagination.
 */
export async function listReturnRequests(
  params: ReturnRequestListParams,
): Promise<{ data: ReturnRequestListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<ReturnRequestListItem>>(
    RR_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Return Request with all embedded lines.
 */
export async function getReturnRequest(
  docId: string,
  orgId: string,
): Promise<ReturnRequest> {
  const response = await apiClient.get<SuccessEnvelope<ReturnRequest>>(
    `${RR_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Return Request directly (manual entry — rare; most RRs come from from-delivery).
 * The baseDocRef must point to the source Delivery header.
 */
export async function createReturnRequest(
  data: ReturnRequestCreate,
  orgId: string,
): Promise<ReturnRequest> {
  const body = {
    company_code: data.companyCode,
    customer_id: data.customerId,
    customer_name: data.customerName,
    doc_date: data.docDate,
    valid_until_date: data.validUntilDate,
    reason: data.reason,
    reason_text: data.reasonText ?? null,
    base_doc_ref: {
      doc_type: data.baseDocRef.docType,
      doc_id: data.baseDocRef.docId,
      doc_number: data.baseDocRef.docNumber,
      line_id: data.baseDocRef.lineId ?? null,
    },
    lines: data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      requested_qty: l.requestedQty,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      base_doc_ref: {
        doc_type: l.baseDocRef.docType,
        doc_id: l.baseDocRef.docId,
        doc_number: l.baseDocRef.docNumber,
        line_id: l.baseDocRef.lineId ?? null,
      },
    })),
    notes: data.notes ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<ReturnRequest>>(
    RR_BASE,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Return Request from a posted Delivery Note.
 * Backend copies open lines from the Delivery; caller may override requestedQty per line.
 * This is the primary creation path — most RRs originate here.
 *
 * NOTE: The backend does NOT have a dedicated /from-delivery endpoint for RR.
 * Instead, we create the RR directly with the Delivery as baseDocRef.
 * The caller (ReturnRequestFormPage) constructs the payload from the Delivery data.
 */
export async function createReturnRequestFromDelivery(
  data: ReturnRequestCreate,
  orgId: string,
): Promise<ReturnRequest> {
  // Delegates to createReturnRequest — the Delivery reference is captured in
  // baseDocRef (header) and each line's baseDocRef (line-level).
  return createReturnRequest(data, orgId);
}

/**
 * Partially update a DRAFT Return Request.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateReturnRequest(
  docId: string,
  data: ReturnRequestUpdate,
  orgId: string,
): Promise<ReturnRequest> {
  const body: Record<string, unknown> = {};
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.validUntilDate !== undefined) body['valid_until_date'] = data.validUntilDate;
  if (data.reason !== undefined) body['reason'] = data.reason;
  if (data.reasonText !== undefined) body['reason_text'] = data.reasonText;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.lines !== undefined && data.lines !== null) {
    body['lines'] = data.lines.map((l) => ({
      item_id: l.itemId,
      item_code: l.itemCode,
      item_name: l.itemName,
      description: l.description ?? null,
      requested_qty: l.requestedQty,
      uom: l.uom,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent ?? 0,
      tax_code_id: l.taxCodeId ?? null,
      tax_percent: l.taxPercent ?? 0,
      warehouse_id: l.warehouseId ?? null,
      cost_center_id: l.costCenterId ?? null,
      base_doc_ref: {
        doc_type: l.baseDocRef.docType,
        doc_id: l.baseDocRef.docId,
        doc_number: l.baseDocRef.docNumber,
        line_id: l.baseDocRef.lineId ?? null,
      },
    }));
  }

  const response = await apiClient.patch<SuccessEnvelope<ReturnRequest>>(
    `${RR_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Return Request.
 */
export async function deleteReturnRequest(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${RR_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Return Request status (e.g. DRAFT → OPEN, OPEN → CANCELLED).
 */
export async function transitionReturnRequest(
  docId: string,
  transition: ReturnRequestTransition,
  orgId: string,
): Promise<ReturnRequest> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<ReturnRequest>>(
    `${RR_BASE}/${docId}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

// ============================================================================
// Return Note v2 API — fully implemented (T-200.7)
// Rule 1: path does NOT include /api/ — apiClient already prepends /api/
// ============================================================================

const RTN_BASE = '/v1/sales/returns-v2';

/** Helper: convert a ReturnNoteLineCreate to snake_case for the backend. */
function _serializeRtnLine(l: ReturnNoteLineCreate): Record<string, unknown> {
  return {
    item_id: l.itemId,
    item_code: l.itemCode,
    item_name: l.itemName,
    description: l.description ?? null,
    returned_qty: l.returnedQty,
    uom: l.uom,
    warehouse_id: l.warehouseId,
    unit_price: l.unitPrice,
    discount_percent: l.discountPercent ?? 0,
    tax_code_id: l.taxCodeId ?? null,
    tax_percent: l.taxPercent ?? 0,
    cost_center_id: l.costCenterId ?? null,
    base_doc_ref: {
      doc_type: l.baseDocRef.docType,
      doc_id: l.baseDocRef.docId,
      doc_number: l.baseDocRef.docNumber,
      line_id: l.baseDocRef.lineId ?? null,
    },
  };
}

/**
 * List Return Notes with optional filters and pagination.
 */
export async function listReturns(
  params: ReturnNoteListParams,
): Promise<{ data: ReturnNoteListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<ReturnNoteListItem>>(
    RTN_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Get a single Return Note with all embedded lines.
 */
export async function getReturn(
  docId: string,
  orgId: string,
): Promise<ReturnNote> {
  const response = await apiClient.get<SuccessEnvelope<ReturnNote>>(
    `${RTN_BASE}/${docId}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Return Note from a Return Request (from-RR path — primary RMA-gated flow).
 * Uses dedicated backend endpoint POST /returns-v2/from-request/:rrDocEntry.
 * Backend looks up customer + validates qty against the RR's consumedQty.
 */
export async function createReturnFromRR(
  rrDocEntry: string,
  data: ReturnNoteFromRRRequest,
  orgId: string,
): Promise<ReturnNote> {
  const body = {
    company_code: data.companyCode,
    doc_date: data.docDate,
    actual_return_date: data.actualReturnDate,
    received_by_user_id: data.receivedByUserId ?? null,
    notes: data.notes ?? null,
    lines: data.lines.map(_serializeRtnLine),
  };

  const response = await apiClient.post<SuccessEnvelope<ReturnNote>>(
    `${RTN_BASE}/from-request/${rrDocEntry}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Return Note directly from a Delivery (from-DN / skip-RMA path).
 * Backend has no dedicated /from-delivery endpoint, so we use the generic
 * POST endpoint and supply all header fields. The Delivery is captured in
 * baseDocRef header and each line's baseDocRef.
 */
export async function createReturnFromDelivery(
  data: ReturnNoteFromDNCreate,
  orgId: string,
): Promise<ReturnNote> {
  const body = {
    company_code: data.companyCode,
    customer_id: data.customerId,
    customer_name: data.customerName,
    doc_date: data.docDate,
    actual_return_date: data.actualReturnDate,
    received_by_user_id: data.receivedByUserId ?? null,
    base_doc_ref: {
      doc_type: data.baseDocRef.docType,
      doc_id: data.baseDocRef.docId,
      doc_number: data.baseDocRef.docNumber,
      line_id: data.baseDocRef.lineId ?? null,
    },
    notes: data.notes ?? null,
    lines: data.lines.map(_serializeRtnLine),
  };

  const response = await apiClient.post<SuccessEnvelope<ReturnNote>>(
    RTN_BASE,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a Return Note manually (blank form — rare).
 * Delegates to createReturnFromDelivery since both hit POST /returns-v2.
 */
export async function createReturn(
  data: ReturnNoteCreate,
  orgId: string,
): Promise<ReturnNote> {
  return createReturnFromDelivery(data, orgId);
}

/**
 * Partially update a DRAFT Return Note.
 * If `lines` is provided the existing line set is replaced wholesale.
 */
export async function updateReturn(
  docId: string,
  data: ReturnNoteUpdate,
  orgId: string,
): Promise<ReturnNote> {
  const body: Record<string, unknown> = {};
  if (data.docDate !== undefined) body['doc_date'] = data.docDate;
  if (data.actualReturnDate !== undefined) body['actual_return_date'] = data.actualReturnDate;
  if (data.receivedByUserId !== undefined) body['received_by_user_id'] = data.receivedByUserId;
  if (data.notes !== undefined) body['notes'] = data.notes;
  if (data.lines !== undefined && data.lines !== null) {
    body['lines'] = data.lines.map(_serializeRtnLine);
  }

  const response = await apiClient.patch<SuccessEnvelope<ReturnNote>>(
    `${RTN_BASE}/${docId}`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT Return Note.
 */
export async function deleteReturn(
  docId: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${RTN_BASE}/${docId}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition Return Note status (e.g. DRAFT → OPEN (Post), OPEN → CANCELLED).
 * DRAFT → OPEN: restores inventory, emits return_posted to finance outbox.
 * OPEN → CANCELLED: reverses inventory, emits return_cancelled.
 */
export async function transitionReturn(
  docId: string,
  transition: ReturnNoteTransition,
  orgId: string,
): Promise<ReturnNote> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<ReturnNote>>(
    `${RTN_BASE}/${docId}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

// ============================================================================
// AR Credit Note API — T-200.8
// Base: /v1/sales/ar-credit-notes (path does NOT include /api/ — apiClient adds /api)
// ============================================================================

const ARC_BASE = '/v1/sales/ar-credit-notes';

/**
 * List AR Credit Notes with optional filters and pagination.
 */
export async function listArCreditNotes(
  params: ARCreditNoteListParams,
): Promise<{ data: ARCreditNoteListItem[]; meta: PaginationMeta }> {
  const queryParams: Record<string, string | number> = {};
  if (params.organizationId) queryParams['organization_id'] = params.organizationId;
  if (params.status) queryParams['status'] = params.status;
  if (params.customerId) queryParams['customer_id'] = params.customerId;
  if (params.dateFrom) queryParams['date_from'] = params.dateFrom;
  if (params.dateTo) queryParams['date_to'] = params.dateTo;
  if (params.page) queryParams['page'] = params.page;
  if (params.size) queryParams['size'] = params.size;

  const response = await apiClient.get<PaginatedEnvelope<ARCreditNoteListItem>>(
    ARC_BASE,
    { params: queryParams },
  );
  return response.data;
}

/**
 * Fetch a single AR Credit Note with all embedded lines and allocations.
 */
export async function getArCreditNote(
  docEntry: string,
  orgId: string,
): Promise<ARCreditNote> {
  const response = await apiClient.get<SuccessEnvelope<ARCreditNote>>(
    `${ARC_BASE}/${docEntry}`,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create a new AR Credit Note in DRAFT status (generic path — rare; prefer
 * createArCreditNoteFromRTN or createArCreditNoteFromInvoice).
 */
export async function createArCreditNote(
  payload: ARCreditNoteCreate,
  orgId: string,
): Promise<ARCreditNote> {
  const response = await apiClient.post<SuccessEnvelope<ARCreditNote>>(
    ARC_BASE,
    payload,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create an AR Credit Note as the financial completion of a posted Return (RTN).
 *
 * The caller populates baseReturnDocRef pointing to the RTN; the service
 * links back to the AR Invoice from the RTN's chain.
 * This maps to the same POST /ar-credit-notes endpoint but with
 * baseReturnDocRef set in the payload.
 */
export async function createArCreditNoteFromRTN(
  payload: ARCreditNoteCreate,
  orgId: string,
): Promise<ARCreditNote> {
  // Same endpoint as create; semantics differentiated server-side via
  // the presence of baseReturnDocRef in the payload.
  const response = await apiClient.post<SuccessEnvelope<ARCreditNote>>(
    ARC_BASE,
    payload,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Create an AR Credit Note as a direct financial reversal against an AR Invoice
 * (no physical return involved — used for discounts, billing corrections, etc.).
 *
 * baseReturnDocRef will be null; baseDocRef points to the source ARI line.
 */
export async function createArCreditNoteFromInvoice(
  payload: ARCreditNoteCreate,
  orgId: string,
): Promise<ARCreditNote> {
  const response = await apiClient.post<SuccessEnvelope<ARCreditNote>>(
    ARC_BASE,
    payload,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Partially update a DRAFT AR Credit Note.
 * If lines or allocations are provided they replace the existing sets wholesale.
 */
export async function updateArCreditNote(
  docEntry: string,
  payload: ARCreditNoteUpdate,
  orgId: string,
): Promise<ARCreditNote> {
  const response = await apiClient.patch<SuccessEnvelope<ARCreditNote>>(
    `${ARC_BASE}/${docEntry}`,
    payload,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

/**
 * Hard-delete a DRAFT AR Credit Note (no side-effects on ARI).
 */
export async function deleteArCreditNote(
  docEntry: string,
  orgId: string,
): Promise<void> {
  await apiClient.delete(`${ARC_BASE}/${docEntry}`, {
    params: { organization_id: orgId },
  });
}

/**
 * Transition an AR Credit Note status.
 *
 * Key transitions:
 *   DRAFT → OPEN       Posts the credit note; updates ARI creditedAmount/openAmount;
 *                      emits credit_note_posted event.
 *   DRAFT → CANCELLED  Draft abandoned.
 *   OPEN  → CLOSED     Terminal close.
 *   OPEN  → CANCELLED  Financial reversal (super_admin only).
 */
export async function transitionArCreditNote(
  docEntry: string,
  transition: ARCreditNoteTransition,
  orgId: string,
): Promise<ARCreditNote> {
  const body = {
    new_status: transition.newStatus,
    reason: transition.reason ?? null,
  };

  const response = await apiClient.post<SuccessEnvelope<ARCreditNote>>(
    `${ARC_BASE}/${docEntry}/transition`,
    body,
    { params: { organization_id: orgId } },
  );
  return response.data.data;
}

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

// ============================================================================
// Sale Item Finance Extension types + API (T-200.9)
// Backend endpoint: /v1/finance/item-finance-ext
// Provides per-item GL account and tax code config used by the AR Invoice and
// Delivery JE handlers.  The finance service returns a mix of snake_case
// (sale_item_finance_ext_id) and camelCase for all other fields.
// ============================================================================

/** Full response shape from GET /v1/finance/item-finance-ext/{item_id}. */
export interface SaleItemFinanceExt {
  sale_item_finance_ext_id: string;   // snake_case — the PK from finance service
  itemId: string;
  organizationId: string;
  itemCode: string | null;
  itemName: string | null;
  revenueAccountId: string | null;
  cogsAccountId: string | null;
  salesTaxCode: string | null;
  isSellable: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating a new sale item finance ext record. */
export interface SaleItemFinanceExtCreate {
  itemId: string;
  organizationId: string;
  itemCode?: string | null;
  itemName?: string | null;
  revenueAccountId?: string | null;
  cogsAccountId?: string | null;
  salesTaxCode?: string | null;
  isSellable?: boolean;
  notes?: string | null;
}

/** Payload for updating an existing record (all fields optional). */
export interface SaleItemFinanceExtUpdate {
  revenueAccountId?: string | null;
  cogsAccountId?: string | null;
  salesTaxCode?: string | null;
  isSellable?: boolean;
  notes?: string | null;
}

/** Query params for the list endpoint. */
export interface SaleItemFinanceExtListParams {
  organizationId: string;
  isSellable?: boolean | null;
  page?: number;
  size?: number;
}

/**
 * Paginated response wrapper from the finance service list endpoint.
 * The finance service `paginated()` helper emits:
 *   { items: [...], total, page, size, pages }
 * (not { data: [...], meta: {...} } like the ops backend).
 */
interface SaleItemFinanceExtListResponse {
  items: SaleItemFinanceExt[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Single-item response wrapper from the finance service. */
interface SaleItemFinanceExtSingleResponse {
  data: SaleItemFinanceExt;
  message?: string;
}

// Path does NOT include /api/ — apiClient already prepends /api/
const ITEM_EXT_BASE = '/v1/finance/item-finance-ext';

/**
 * List all sale item finance extensions for an organisation.
 * Uses the finance microservice list endpoint (paginated, org-scoped).
 */
export async function listSaleItemFinanceExt(
  params: SaleItemFinanceExtListParams,
): Promise<{ items: SaleItemFinanceExt[]; total: number }> {
  const queryParams: Record<string, string | number | boolean> = {
    organization_id: params.organizationId,
    page: params.page ?? 1,
    size: params.size ?? 200,
  };
  if (params.isSellable != null) {
    queryParams['isSellable'] = params.isSellable;
  }
  const response = await apiClient.get<SaleItemFinanceExtListResponse>(
    ITEM_EXT_BASE,
    { params: queryParams },
  );
  return {
    items: response.data.items,
    total: response.data.total,
  };
}

/**
 * Fetch the sale finance extension for a specific item.
 * Returns null (no throw) if the item has no ext record (404).
 */
export async function getSaleItemFinanceExtByItem(
  itemId: string,
  organizationId: string,
): Promise<SaleItemFinanceExt | null> {
  try {
    const response = await apiClient.get<SaleItemFinanceExtSingleResponse>(
      `${ITEM_EXT_BASE}/${itemId}`,
      { params: { organization_id: organizationId } },
    );
    return response.data.data;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 404) return null;
    }
    throw err;
  }
}

/**
 * Create a new sale item finance extension.
 * Throws HTTPException 409 if a record for this item already exists.
 */
export async function createSaleItemFinanceExt(
  body: SaleItemFinanceExtCreate,
): Promise<SaleItemFinanceExt> {
  const response = await apiClient.post<SaleItemFinanceExtSingleResponse>(
    ITEM_EXT_BASE,
    body,
  );
  return response.data.data;
}

/**
 * Update an existing sale item finance extension.
 * Lookup is by itemId (not by the PK sale_item_finance_ext_id).
 */
export async function updateSaleItemFinanceExt(
  itemId: string,
  body: SaleItemFinanceExtUpdate,
  organizationId: string,
): Promise<SaleItemFinanceExt> {
  const response = await apiClient.patch<SaleItemFinanceExtSingleResponse>(
    `${ITEM_EXT_BASE}/${itemId}`,
    body,
    { params: { organization_id: organizationId } },
  );
  return response.data.data;
}

/**
 * Delete a sale item finance extension.
 * Returns void on success (HTTP 204).
 */
export async function deleteSaleItemFinanceExt(
  itemId: string,
  organizationId: string,
): Promise<void> {
  await apiClient.delete(`${ITEM_EXT_BASE}/${itemId}`, {
    params: { organization_id: organizationId },
  });
}
