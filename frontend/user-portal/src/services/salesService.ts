/**
 * Sales API Service
 *
 * This service provides all API calls for the Sales module (Orders, Inventory, and Purchase Orders).
 * All endpoints use the /api/v1/sales base URL.
 */

import { apiClient } from './api';
import type {
  SalesOrder,
  SalesOrderCreate,
  SalesOrderUpdate,
  SalesOrderSearchParams,
  PaginatedSalesOrders,
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrderUpdate,
  PurchaseOrderSearchParams,
  PaginatedPurchaseOrders,
  SalesDashboardStats,
  ReturnOrder,
  ReturnOrderCreate,
  ReturnStatus,
  PaginatedReturns,
  FarmingYearItem,
} from '../types/sales';

// ============================================================================
// SALES ORDER ENDPOINTS
// ============================================================================

/**
 * Get all sales orders with search and pagination
 * @param params - Search parameters including optional farmingYear filter
 */
export async function getSalesOrders(params?: SalesOrderSearchParams): Promise<PaginatedSalesOrders> {
  const queryParams: Record<string, any> = {
    page: params?.page || 1,
    perPage: params?.perPage || 20,
  };

  // Add optional filters only if they have values
  if (params?.search) queryParams.search = params.search;
  if (params?.status) queryParams.status = params.status;
  if (params?.paymentStatus) queryParams.paymentStatus = params.paymentStatus;
  if (params?.customerId) queryParams.customerId = params.customerId;
  if (params?.farmingYear !== undefined && params?.farmingYear !== null) {
    queryParams.farmingYear = params.farmingYear;
  }

  const response = await apiClient.get<any>('/v1/sales/orders', {
    params: queryParams,
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single sales order by ID
 */
export async function getSalesOrder(orderId: string): Promise<SalesOrder> {
  const response = await apiClient.get<{ data: SalesOrder }>(`/v1/sales/orders/${orderId}`);
  return response.data.data;
}

/**
 * Create new sales order
 */
export async function createSalesOrder(data: SalesOrderCreate): Promise<SalesOrder> {
  const response = await apiClient.post<{ data: SalesOrder }>('/v1/sales/orders', data);
  return response.data.data;
}

/**
 * Update existing sales order
 */
export async function updateSalesOrder(orderId: string, data: SalesOrderUpdate): Promise<SalesOrder> {
  const response = await apiClient.patch<{ data: SalesOrder }>(`/v1/sales/orders/${orderId}`, data);
  return response.data.data;
}

/**
 * Update sales order status
 */
export async function updateOrderStatus(orderId: string, status: string): Promise<SalesOrder> {
  const response = await apiClient.patch<{ data: SalesOrder }>(`/v1/sales/orders/${orderId}/status`, { status });
  return response.data.data;
}

/**
 * Delete sales order
 */
export async function deleteSalesOrder(orderId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/sales/orders/${orderId}`);
  return response.data;
}

// ============================================================================
// PURCHASE ORDER ENDPOINTS
// ============================================================================

/**
 * Get all purchase orders with search and pagination
 */
export async function getPurchaseOrders(params?: PurchaseOrderSearchParams): Promise<PaginatedPurchaseOrders> {
  const response = await apiClient.get<any>('/v1/sales/purchase-orders', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get a single purchase order by ID
 */
export async function getPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  const response = await apiClient.get<{ data: PurchaseOrder }>(`/v1/sales/purchase-orders/${poId}`);
  return response.data.data;
}

/**
 * Create new purchase order
 */
export async function createPurchaseOrder(data: PurchaseOrderCreate): Promise<PurchaseOrder> {
  const response = await apiClient.post<{ data: PurchaseOrder }>('/v1/sales/purchase-orders', data);
  return response.data.data;
}

/**
 * Update existing purchase order
 */
export async function updatePurchaseOrder(poId: string, data: PurchaseOrderUpdate): Promise<PurchaseOrder> {
  const response = await apiClient.patch<{ data: PurchaseOrder }>(`/v1/sales/purchase-orders/${poId}`, data);
  return response.data.data;
}

/**
 * Update purchase order status
 */
export async function updatePurchaseOrderStatus(poId: string, status: string): Promise<PurchaseOrder> {
  const response = await apiClient.patch<{ data: PurchaseOrder }>(`/v1/sales/purchase-orders/${poId}/status`, { status });
  return response.data.data;
}

/**
 * Delete purchase order
 */
export async function deletePurchaseOrder(poId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/sales/purchase-orders/${poId}`);
  return response.data;
}

// ============================================================================
// DASHBOARD ENDPOINT
// ============================================================================

/**
 * Get sales dashboard statistics
 * @param farmingYear - Optional farming year to filter statistics by
 */
export async function getDashboardStats(farmingYear?: number | null): Promise<SalesDashboardStats> {
  const params: Record<string, any> = {};
  if (farmingYear !== undefined && farmingYear !== null) {
    params.farmingYear = farmingYear;
  }

  const response = await apiClient.get<{ data: SalesDashboardStats }>('/v1/sales/dashboard', {
    params,
  });
  return response.data.data;
}

// ============================================================================
// FARMING YEAR ENDPOINTS
// ============================================================================

/**
 * Get available farming years for sales order filtering.
 * NOTE: Previously sourced from /v1/sales/inventory/farming-years (retired).
 * Now sourced from the global farming-year config endpoint, which returns
 * `{ years, count }` directly (no `data` envelope).
 */
export async function getAvailableFarmingYears(): Promise<{ years: FarmingYearItem[] }> {
  const response = await apiClient.get<{ years: FarmingYearItem[]; count: number }>(
    '/v1/farm/config/farming-years-list'
  );
  return { years: response.data.years };
}

// ============================================================================
// RETURN ORDER ENDPOINTS
// ============================================================================

/**
 * Create a return order
 */
export async function createReturnOrder(data: ReturnOrderCreate): Promise<ReturnOrder> {
  const response = await apiClient.post<{ data: ReturnOrder }>('/v1/sales/returns', data);
  return response.data.data;
}

/**
 * Get all returns with search and pagination
 */
export async function getReturns(params?: {
  page?: number;
  perPage?: number;
  status?: ReturnStatus;
  orderId?: string;
}): Promise<PaginatedReturns> {
  const response = await apiClient.get<any>('/v1/sales/returns', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      status: params?.status,
      orderId: params?.orderId,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Get return by ID
 */
export async function getReturnOrder(returnId: string): Promise<ReturnOrder> {
  const response = await apiClient.get<{ data: ReturnOrder }>(`/v1/sales/returns/${returnId}`);
  return response.data.data;
}

/**
 * Get returns for a specific order
 */
export async function getReturnsForOrder(orderId: string): Promise<ReturnOrder[]> {
  const response = await apiClient.get<{ data: ReturnOrder[] }>(`/v1/sales/returns/order/${orderId}`);
  return response.data.data;
}

/**
 * Process a return order
 */
export async function processReturnOrder(
  returnId: string,
  itemOverrides?: Array<{
    orderItemId: string;
    returnToInventory?: boolean;
    newGrade?: string;
  }>
): Promise<any> {
  const response = await apiClient.post<{ data: any }>(`/v1/sales/returns/${returnId}/process`, {
    returnId,
    itemOverrides,
  });
  return response.data.data;
}

/**
 * Delete return order
 */
export async function deleteReturnOrder(returnId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/sales/returns/${returnId}`);
  return response.data;
}

// ============================================================================
// PHASE 4: TWO-STEP DELETE + REPORT RETURN ENDPOINTS
// ============================================================================

/**
 * A single allocation row returned in the delete preview.
 */
export interface DeleteOrderAllocationPreview {
  lineItemIndex: number;
  inventorySource: 'harvest' | 'returned';
  inventoryId: string;
  farmName?: string | null;
  plantName: string;
  quantity: number;
  state: 'active' | 'expired' | 'missing';
  expiredWasteId?: string | null;
  expiredOn?: string | null;
}

/**
 * Full delete preview returned by GET /v1/sales/orders/{id}/delete-preview.
 */
export interface DeleteOrderPreview {
  orderId: string;
  orderCode: string;
  canDelete: boolean;
  allocations: DeleteOrderAllocationPreview[];
}

/**
 * Fetch the two-step delete preview for an order.
 * Tolerates both enveloped ({ data: ... }) and raw response shapes.
 */
export async function getOrderDeletePreview(orderId: string): Promise<DeleteOrderPreview> {
  const r = await apiClient.get<{ data: DeleteOrderPreview } | DeleteOrderPreview>(
    `/v1/sales/orders/${orderId}/delete-preview`,
  );
  // Tolerate envelope or raw
  const payload = (r.data as { data?: DeleteOrderPreview }).data ?? r.data as DeleteOrderPreview;
  return payload;
}

/**
 * Decision entry in the confirm-delete body.
 */
export interface DeleteOrderDecision {
  lineItemIndex: number;
  inventoryId: string;
  action: 'restore' | 'revive' | 'waste';
  expiryDate?: string;
}

/**
 * POST /v1/sales/orders/{id}/delete — confirm delete with per-batch decisions.
 */
export async function deleteOrderConfirm(
  orderId: string,
  decisions: DeleteOrderDecision[],
): Promise<any> {
  const r = await apiClient.post(`/v1/sales/orders/${orderId}/delete`, { decisions });
  return r.data;
}

/**
 * Single item entry in the report-return request body.
 */
export interface ReportReturnItem {
  orderItemIndex: number;
  quantity: number;
  containerCount?: number;
  containerSize?: number;
  condition: 'sellable' | 'spoiled';
  reason?: string;
  disposalMethod?: string;
}

/**
 * POST /v1/sales/orders/{id}/report-return — record a partial or full return.
 */
export async function reportOrderReturn(
  orderId: string,
  items: ReportReturnItem[],
  notes?: string,
): Promise<any> {
  const r = await apiClient.post(`/v1/sales/orders/${orderId}/report-return`, { items, notes });
  return r.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#4B4844'; // gray
    case 'confirmed':
      return '#0F6E56'; // blue
    case 'processing':
      return '#B8842A'; // amber
    case 'shipped':
      return '#4B4844'; // purple
    case 'delivered':
      return '#0F6E56'; // green
    case 'cancelled':
      return '#9E2A2A'; // red
    default:
      return '#4B4844';
  }
}

/**
 * Get payment status color
 */
export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return '#B8842A'; // amber
    case 'partial':
      return '#0F6E56'; // blue
    case 'paid':
      return '#0F6E56'; // green
    default:
      return '#4B4844';
  }
}

/**
 * Get inventory status color
 */
export function getInventoryStatusColor(status: string): string {
  switch (status) {
    case 'available':
      return '#0F6E56'; // green
    case 'reserved':
      return '#0F6E56'; // blue
    case 'sold':
      return '#4B4844'; // gray
    case 'expired':
      return '#9E2A2A'; // red
    default:
      return '#4B4844';
  }
}

/**
 * Get purchase order status color
 */
export function getPurchaseOrderStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#4B4844'; // gray
    case 'sent':
      return '#0F6E56'; // blue
    case 'confirmed':
      return '#4B4844'; // purple
    case 'received':
      return '#0F6E56'; // green
    case 'cancelled':
      return '#9E2A2A'; // red
    default:
      return '#4B4844';
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'AED'): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get quality grade label
 */
export function getQualityGradeLabel(grade: string): string {
  switch (grade) {
    case 'A':
      return 'Grade A (Premium)';
    case 'B':
      return 'Grade B (Standard)';
    case 'C':
      return 'Grade C (Economy)';
    default:
      return grade;
  }
}

/**
 * Calculate total order value
 */
export function calculateOrderTotal(subtotal: number, tax?: number, discount?: number): number {
  return subtotal + (tax || 0) - (discount || 0);
}

// Export all functions as a single object for convenience
// Exported as both salesApi and salesService for compatibility
export const salesApi = {
  // Sales Orders
  getSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  updateOrderStatus,
  deleteSalesOrder,

  // Phase 4: two-step delete + report return
  getOrderDeletePreview,
  deleteOrderConfirm,
  reportOrderReturn,

  // Purchase Orders
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,

  // Return Orders
  createReturnOrder,
  getReturns,
  getReturnOrder,
  getReturnsForOrder,
  processReturnOrder,
  deleteReturnOrder,

  // Dashboard
  getDashboardStats,

  // Farming Year
  getAvailableFarmingYears,

  // Utilities
  getOrderStatusColor,
  getPaymentStatusColor,
  getInventoryStatusColor,
  getPurchaseOrderStatusColor,
  formatCurrency,
  formatDate,
  getQualityGradeLabel,
  calculateOrderTotal,
};

// Alias for compatibility with imports using 'salesService' name
export const salesService = salesApi;

export default salesApi;
