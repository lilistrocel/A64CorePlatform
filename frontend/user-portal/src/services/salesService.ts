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
import { lightTheme } from '@a64core/shared';
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
  const c = lightTheme.colors;
  switch (status) {
    case 'draft':
      return c.textSecondary;
    case 'confirmed':
      return c.primary[500]; // lapis
    case 'processing':
      return c.warning; // gold
    case 'shipped':
      return c.secondary[700]; // gold, deep step — was purple (spec §3 judgement call)
    case 'delivered':
      return c.success; // emerald
    case 'cancelled':
      return c.error; // terracotta
    default:
      return c.textSecondary;
  }
}

/**
 * Get payment status color
 */
export function getPaymentStatusColor(status: string): string {
  const c = lightTheme.colors;
  switch (status) {
    case 'pending':
      return c.warning; // gold
    case 'partial':
      return c.primary[500]; // lapis
    case 'paid':
      return c.success; // emerald
    default:
      return c.textSecondary;
  }
}

/**
 * Get inventory status color
 */
export function getInventoryStatusColor(status: string): string {
  const c = lightTheme.colors;
  switch (status) {
    case 'available':
      return c.success; // emerald
    case 'reserved':
      return c.primary[500]; // lapis
    case 'sold':
      return c.textSecondary;
    case 'expired':
      return c.error; // terracotta
    default:
      return c.textSecondary;
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
