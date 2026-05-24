/**
 * Purchasing API Service
 *
 * Provides all API calls for the Purchasing module:
 * - Vendor master data
 * - Purchase item master data
 * - Payment terms master data
 *
 * All endpoints use the /api/v1/purchasing base URL.
 * Follows the Envelope<T> convention: response.data.data for the payload.
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

export interface BankDetails {
  bankName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  swift?: string | null;
}

export interface Vendor {
  vendorId: string;
  organizationId: string;
  vendorCode: string;
  name: string;
  trn?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTermsCode?: string | null;
  currencyCode: string;
  creditLimit?: number | null;
  bankDetails?: BankDetails | null;
  notes?: string | null;
  isActive: boolean;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface VendorCreate {
  organizationId: string;
  vendorCode?: string | null;
  name: string;
  trn?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTermsCode?: string | null;
  currencyCode?: string;
  creditLimit?: number | null;
  bankDetails?: BankDetails | null;
  notes?: string | null;
}

export interface VendorUpdate {
  name?: string | null;
  trn?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentTermsCode?: string | null;
  creditLimit?: number | null;
  bankDetails?: BankDetails | null;
  notes?: string | null;
  isActive?: boolean | null;
  isBlocked?: boolean | null;
}

export type ItemType = 'raw_material' | 'consumable' | 'service' | 'fixed_asset_acquisition';

export interface PurchaseItem {
  itemId: string;
  organizationId: string;
  itemCode: string;
  name: string;
  itemType: ItemType;
  uom: string;
  description?: string | null;
  defaultWarehouseId?: string | null;
  defaultUnitCost?: number | null;
  barcode?: string | null;
  manufacturer?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PurchaseItemCreate {
  organizationId: string;
  itemCode?: string | null;
  name: string;
  itemType: ItemType;
  uom: string;
  description?: string | null;
  defaultWarehouseId?: string | null;
  defaultUnitCost?: number | null;
  barcode?: string | null;
  manufacturer?: string | null;
}

export interface PurchaseItemUpdate {
  name?: string | null;
  itemType?: ItemType | null;
  uom?: string | null;
  description?: string | null;
  defaultWarehouseId?: string | null;
  defaultUnitCost?: number | null;
  barcode?: string | null;
  manufacturer?: string | null;
  isActive?: boolean | null;
}

export interface PaymentTerms {
  termsId: string;
  organizationId: string;
  termsCode: string;
  description: string;
  netDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTermsCreate {
  organizationId: string;
  termsCode: string;
  description: string;
  netDays: number;
}

export interface PaymentTermsUpdate {
  description?: string | null;
  netDays?: number | null;
  isActive?: boolean | null;
}

// Generic paginated response envelope
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

// Generic success response envelope
export interface SuccessResult<T> {
  data: T;
  message?: string | null;
}

// ============================================================================
// Vendor API calls
// ============================================================================

export async function getVendors(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  search?: string;
  isActive?: boolean;
}): Promise<PaginatedResult<Vendor>> {
  const response = await apiClient.get<PaginatedResult<Vendor>>(
    '/v1/purchasing/vendors',
    { params }
  );
  return response.data;
}

export async function getVendor(vendorId: string, organizationId?: string): Promise<Vendor> {
  const response = await apiClient.get<SuccessResult<Vendor>>(
    `/v1/purchasing/vendors/${vendorId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function createVendor(data: VendorCreate): Promise<Vendor> {
  const response = await apiClient.post<SuccessResult<Vendor>>(
    '/v1/purchasing/vendors',
    data
  );
  return response.data.data;
}

export async function updateVendor(vendorId: string, data: VendorUpdate): Promise<Vendor> {
  const response = await apiClient.patch<SuccessResult<Vendor>>(
    `/v1/purchasing/vendors/${vendorId}`,
    data
  );
  return response.data.data;
}

export async function deleteVendor(vendorId: string): Promise<void> {
  await apiClient.delete(`/v1/purchasing/vendors/${vendorId}`);
}

// ============================================================================
// Purchase Items API calls
// ============================================================================

export async function getPurchaseItems(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  search?: string;
  itemType?: string;
  isActive?: boolean;
}): Promise<PaginatedResult<PurchaseItem>> {
  const response = await apiClient.get<PaginatedResult<PurchaseItem>>(
    '/v1/purchasing/purchase-items',
    { params }
  );
  return response.data;
}

export async function getPurchaseItem(itemId: string, organizationId?: string): Promise<PurchaseItem> {
  const response = await apiClient.get<SuccessResult<PurchaseItem>>(
    `/v1/purchasing/purchase-items/${itemId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function createPurchaseItem(data: PurchaseItemCreate): Promise<PurchaseItem> {
  const response = await apiClient.post<SuccessResult<PurchaseItem>>(
    '/v1/purchasing/purchase-items',
    data
  );
  return response.data.data;
}

export async function updatePurchaseItem(itemId: string, data: PurchaseItemUpdate): Promise<PurchaseItem> {
  const response = await apiClient.patch<SuccessResult<PurchaseItem>>(
    `/v1/purchasing/purchase-items/${itemId}`,
    data
  );
  return response.data.data;
}

export async function deletePurchaseItem(itemId: string): Promise<void> {
  await apiClient.delete(`/v1/purchasing/purchase-items/${itemId}`);
}

// ============================================================================
// Payment Terms API calls
// ============================================================================

export async function getPaymentTerms(params?: {
  organizationId?: string;
  isActive?: boolean;
}): Promise<PaymentTerms[]> {
  const response = await apiClient.get<SuccessResult<PaymentTerms[]>>(
    '/v1/purchasing/payment-terms',
    { params }
  );
  return response.data.data;
}

export async function createPaymentTerms(data: PaymentTermsCreate): Promise<PaymentTerms> {
  const response = await apiClient.post<SuccessResult<PaymentTerms>>(
    '/v1/purchasing/payment-terms',
    data
  );
  return response.data.data;
}

export async function updatePaymentTerms(termsId: string, data: PaymentTermsUpdate): Promise<PaymentTerms> {
  const response = await apiClient.patch<SuccessResult<PaymentTerms>>(
    `/v1/purchasing/payment-terms/${termsId}`,
    data
  );
  return response.data.data;
}

export async function deletePaymentTerms(termsId: string): Promise<void> {
  await apiClient.delete(`/v1/purchasing/payment-terms/${termsId}`);
}

// ============================================================================
// Phase 1B — Purchase Request and Purchase Order types
// ============================================================================

export type PRStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Closed';

export type POStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Open'
  | 'Sent'
  | 'Partially Received'
  | 'Received'
  | 'Closed'
  | 'Cancelled';

export type ApprovalState = 'NotRequired' | 'Pending' | 'Approved' | 'Rejected';
export type UrgencyLevel = 'low' | 'normal' | 'high';
export type DocType = 'PR' | 'PO' | 'AP';

export interface DocumentLine {
  lineId: string;
  docId: string;
  organizationId: string;
  lineNumber: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  uom: string;
  quantity: number;
  openQuantity: number;
  closedQuantity: number;
  unitPrice: number;
  discountPercent?: number;
  lineNet: number;
  taxCode?: string | null;
  taxRate: number;
  lineTax: number;
  lineGross: number;
  costCenterId?: string | null;
  warehouseId?: string | null;
  requestedVendorId?: string | null;
  baseLineId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentLineCreate {
  itemId: string;
  description?: string | null;
  uom: string;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  taxCode?: string | null;
  costCenterId?: string | null;
  warehouseId?: string | null;
  requestedVendorId?: string | null;
  notes?: string | null;
}

// Purchase Request types

export interface PurchaseRequest {
  docId: string;
  organizationId: string;
  companyCode: string;
  docType: 'PR';
  docNumber: string;
  docDate: string;
  status: PRStatus;
  requestedBy: string;
  requestedDate: string;
  department?: string | null;
  urgency: UrgencyLevel;
  subtotalNet: number;
  totalTax: number;
  totalGross: number;
  currencyCode: string;
  notes?: string | null;
  baseDocId?: string | null;
  approvalState: ApprovalState;
  approvalRequestedFrom?: string | null;
  approvalRequestedAt?: string | null;
  approvalDecidedBy?: string | null;
  approvalDecidedAt?: string | null;
  approvalComment?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PurchaseRequestDetail extends PurchaseRequest {
  lines: DocumentLine[];
}

export interface PRCreate {
  department?: string | null;
  urgency?: UrgencyLevel;
  notes?: string | null;
  expectedDeliveryDate?: string | null;
  lines: DocumentLineCreate[];
}

export interface PRUpdate {
  department?: string | null;
  urgency?: UrgencyLevel | null;
  notes?: string | null;
  expectedDeliveryDate?: string | null;
  lines?: DocumentLineCreate[] | null;
}

// Purchase Order types

export interface PurchaseOrder {
  docId: string;
  organizationId: string;
  companyCode: string;
  docType: 'PO';
  docNumber: string;
  docDate: string;
  postingDate?: string | null;
  dueDate?: string | null;
  expectedDeliveryDate?: string | null;
  status: POStatus;
  vendorId?: string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  paymentTermsCode?: string | null;
  issuedBy: string;
  issuedDate?: string | null;
  baseDocId?: string | null;
  subtotalNet: number;
  totalTax: number;
  totalGross: number;
  currencyCode: string;
  notes?: string | null;
  approvalState: ApprovalState;
  approvalRequestedFrom?: string | null;
  approvalRequestedAt?: string | null;
  approvalDecidedBy?: string | null;
  approvalDecidedAt?: string | null;
  approvalComment?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: DocumentLine[];
}

export interface POCreate {
  vendorId: string;
  paymentTermsCode?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  lines: DocumentLineCreate[];
}

export interface POFromPRCreate {
  vendorId: string;
  paymentTermsCode?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
}

export interface POUpdate {
  vendorId?: string | null;
  paymentTermsCode?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  lines?: DocumentLineCreate[] | null;
}

// Approval inbox types

export interface PendingApprovalItem {
  docId: string;
  docType: DocType;
  docNumber: string;
  requesterName?: string | null;
  totalGross: number;
  currencyCode: string;
  approvalRequestedAt?: string | null;
  approvalRequestedFrom?: string | null;
  department?: string | null;
  urgency?: UrgencyLevel | null;
  vendorName?: string | null;
  notes?: string | null;
}

export interface ApprovalHistoryItem {
  docId: string;
  docType: DocType;
  docNumber: string;
  finalState: string;
  approvalDecidedBy?: string | null;
  approvalDecidedAt?: string | null;
  approvalComment?: string | null;
  totalGross: number;
  currencyCode: string;
}

// ============================================================================
// Purchase Request API calls
// ============================================================================

export async function getPurchaseRequests(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: PRStatus;
  search?: string;
  requesterId?: string;
}): Promise<PaginatedResult<PurchaseRequest>> {
  const response = await apiClient.get<PaginatedResult<PurchaseRequest>>(
    '/v1/purchasing/pr',
    { params }
  );
  return response.data;
}

export async function getPurchaseRequest(docId: string, organizationId?: string): Promise<PurchaseRequestDetail> {
  const response = await apiClient.get<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function createPurchaseRequest(data: PRCreate, organizationId?: string): Promise<PurchaseRequestDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseRequestDetail>>(
    '/v1/purchasing/pr',
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function updatePurchaseRequest(docId: string, data: PRUpdate, organizationId?: string): Promise<PurchaseRequestDetail> {
  const response = await apiClient.patch<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function deletePurchaseRequest(docId: string, organizationId?: string): Promise<void> {
  await apiClient.delete(`/v1/purchasing/pr/${docId}`, {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
}

export async function submitPurchaseRequest(docId: string, organizationId?: string): Promise<PurchaseRequestDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}/submit`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function approvePurchaseRequest(
  docId: string,
  data: { comment?: string | null },
  organizationId?: string
): Promise<PurchaseRequestDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}/approve`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function rejectPurchaseRequest(
  docId: string,
  data: { comment: string },
  organizationId?: string
): Promise<PurchaseRequestDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}/reject`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function cancelPurchaseRequest(docId: string, organizationId?: string): Promise<PurchaseRequestDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseRequestDetail>>(
    `/v1/purchasing/pr/${docId}/cancel`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

// ============================================================================
// Purchase Order API calls
// ============================================================================

export async function getPurchaseOrders(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
  status?: POStatus;
  search?: string;
  vendorId?: string;
}): Promise<PaginatedResult<PurchaseOrder>> {
  const response = await apiClient.get<PaginatedResult<PurchaseOrder>>(
    '/v1/purchasing/po',
    { params }
  );
  return response.data;
}

export async function getPurchaseOrder(docId: string, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.get<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}`,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function createPurchaseOrder(data: POCreate, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    '/v1/purchasing/po',
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function createPurchaseOrderFromPR(
  prDocId: string,
  data: POFromPRCreate,
  organizationId?: string
): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/from-pr/${prDocId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function updatePurchaseOrder(docId: string, data: POUpdate, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.patch<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function deletePurchaseOrder(docId: string, organizationId?: string): Promise<void> {
  await apiClient.delete(`/v1/purchasing/po/${docId}`, {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
}

export async function submitPurchaseOrder(docId: string, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}/submit`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function approvePurchaseOrder(
  docId: string,
  data: { comment?: string | null },
  organizationId?: string
): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}/approve`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function rejectPurchaseOrder(
  docId: string,
  data: { comment: string },
  organizationId?: string
): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}/reject`,
    data,
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function sendPurchaseOrder(docId: string, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}/send`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function cancelPurchaseOrder(docId: string, organizationId?: string): Promise<PurchaseOrderDetail> {
  const response = await apiClient.post<SuccessResult<PurchaseOrderDetail>>(
    `/v1/purchasing/po/${docId}/cancel`,
    {},
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function convertPRToPO(prDocId: string, data: POFromPRCreate, organizationId?: string): Promise<PurchaseOrderDetail> {
  return createPurchaseOrderFromPR(prDocId, data, organizationId);
}

// ============================================================================
// Approval inbox API calls
// ============================================================================

export async function getPendingApprovals(organizationId?: string): Promise<PendingApprovalItem[]> {
  const response = await apiClient.get<SuccessResult<PendingApprovalItem[]>>(
    '/v1/purchasing/approvals/pending',
    { params: organizationId ? { organization_id: organizationId } : undefined }
  );
  return response.data.data;
}

export async function getApprovalHistory(params?: {
  organizationId?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<ApprovalHistoryItem>> {
  const response = await apiClient.get<PaginatedResult<ApprovalHistoryItem>>(
    '/v1/purchasing/approvals/history',
    { params }
  );
  return response.data;
}
