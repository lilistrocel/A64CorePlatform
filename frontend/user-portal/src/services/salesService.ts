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
  HarvestInventory,
  HarvestInventoryCreate,
  HarvestInventoryUpdate,
  InventorySearchParams,
  PaginatedInventory,
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
} from '../types/sales';

// ============================================================================
// SALES ORDER ENDPOINTS
// ============================================================================

/**
 * Get all sales orders with search and pagination
 */
export async function getSalesOrders(params?: SalesOrderSearchParams): Promise<PaginatedSalesOrders> {
  const response = await apiClient.get<any>('/v1/sales/orders', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
      paymentStatus: params?.paymentStatus,
      customerId: params?.customerId,
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
// INVENTORY ENDPOINTS
// ============================================================================

/**
 * Get all inventory items with search and pagination
 */
export async function getInventory(params?: InventorySearchParams): Promise<PaginatedInventory> {
  const response = await apiClient.get<any>('/v1/sales/inventory', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
      category: params?.category,
      quality: params?.quality,
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
 * Get available inventory items
 */
export async function getAvailableInventory(): Promise<HarvestInventory[]> {
  const response = await apiClient.get<{ data: HarvestInventory[] }>('/v1/sales/inventory/available');
  return response.data.data;
}

/**
 * Get a single inventory item by ID
 */
export async function getInventoryItem(inventoryId: string): Promise<HarvestInventory> {
  const response = await apiClient.get<{ data: HarvestInventory }>(`/v1/sales/inventory/${inventoryId}`);
  return response.data.data;
}

/**
 * Create new inventory item
 */
export async function createInventoryItem(data: HarvestInventoryCreate): Promise<HarvestInventory> {
  const response = await apiClient.post<{ data: HarvestInventory }>('/v1/sales/inventory', data);
  return response.data.data;
}

/**
 * Update existing inventory item
 */
export async function updateInventoryItem(inventoryId: string, data: HarvestInventoryUpdate): Promise<HarvestInventory> {
  const response = await apiClient.patch<{ data: HarvestInventory }>(`/v1/sales/inventory/${inventoryId}`, data);
  return response.data.data;
}

/**
 * Delete inventory item
 */
export async function deleteInventoryItem(inventoryId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/sales/inventory/${inventoryId}`);
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
 */
export async function getDashboardStats(): Promise<SalesDashboardStats> {
  const response = await apiClient.get<{ data: SalesDashboardStats }>('/v1/sales/dashboard');
  return response.data.data;
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#6B7280'; // gray
    case 'confirmed':
      return '#3B82F6'; // blue
    case 'processing':
      return '#F59E0B'; // amber
    case 'shipped':
      return '#8B5CF6'; // purple
    case 'delivered':
      return '#10B981'; // green
    case 'cancelled':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get payment status color
 */
export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return '#F59E0B'; // amber
    case 'partial':
      return '#3B82F6'; // blue
    case 'paid':
      return '#10B981'; // green
    default:
      return '#6B7280';
  }
}

/**
 * Get inventory status color
 */
export function getInventoryStatusColor(status: string): string {
  switch (status) {
    case 'available':
      return '#10B981'; // green
    case 'reserved':
      return '#3B82F6'; // blue
    case 'sold':
      return '#6B7280'; // gray
    case 'expired':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get purchase order status color
 */
export function getPurchaseOrderStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return '#6B7280'; // gray
    case 'sent':
      return '#3B82F6'; // blue
    case 'confirmed':
      return '#8B5CF6'; // purple
    case 'received':
      return '#10B981'; // green
    case 'cancelled':
      return '#EF4444'; // red
    default:
      return '#6B7280';
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

  // Inventory
  getInventory,
  getAvailableInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,

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
