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
