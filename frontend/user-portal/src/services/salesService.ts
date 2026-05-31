/**
 * Sales API Service (trimmed — T-200.11 legacy cutover)
 *
 * This file retains only the functions that remain in use after the Wave 3 cutover:
 *   - getDashboardStats  (SalesDashboardPage)
 *   - getAvailableFarmingYears  (kept — farming-year selector pattern)
 *   - Utility helpers   (getOrderStatusColor, formatCurrency, formatDate, etc.)
 *
 * Legacy order/return CRUD functions (getSalesOrders, createSalesOrder,
 * getReturns, reportReturn, deleteOrderConfirm, etc.) have been removed.
 * The Wave 3 equivalents live in salesApi.ts (salesOrdersApi, returnsApi, etc.).
 */

import { apiClient } from './api';
import type {
  SalesDashboardStats,
  FarmingYearItem,
} from '../types/sales';

// ============================================================================
// DASHBOARD ENDPOINT
// ============================================================================

/**
 * Get sales dashboard statistics
 * @param farmingYear - Optional farming year to filter statistics by
 */
export async function getDashboardStats(farmingYear?: number | null): Promise<SalesDashboardStats> {
  const params: Record<string, unknown> = {};
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
 * Sourced from the global farming-year config endpoint.
 */
export async function getAvailableFarmingYears(): Promise<{ years: FarmingYearItem[] }> {
  const response = await apiClient.get<{ years: FarmingYearItem[]; count: number }>(
    '/v1/farm/config/farming-years-list'
  );
  return { years: response.data.years };
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
      return '#6B7280';
    case 'confirmed':
      return '#3B82F6';
    case 'processing':
      return '#F59E0B';
    case 'shipped':
      return '#8B5CF6';
    case 'delivered':
      return '#10B981';
    case 'cancelled':
      return '#EF4444';
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
      return '#F59E0B';
    case 'partial':
      return '#3B82F6';
    case 'paid':
      return '#10B981';
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
      return '#10B981';
    case 'reserved':
      return '#3B82F6';
    case 'sold':
      return '#6B7280';
    case 'expired':
      return '#EF4444';
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

// Export as both salesApi and salesService for compatibility with SalesDashboardPage
export const salesApi = {
  // Dashboard
  getDashboardStats,

  // Farming Year
  getAvailableFarmingYears,

  // Utilities
  getOrderStatusColor,
  getPaymentStatusColor,
  getInventoryStatusColor,
  formatCurrency,
  formatDate,
  getQualityGradeLabel,
  calculateOrderTotal,
};

// Alias for compatibility with imports using 'salesService' name
export const salesService = salesApi;

export default salesApi;
