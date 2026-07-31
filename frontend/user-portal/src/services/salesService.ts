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
import { theme } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
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
 *
 * Night Observatory (T-901): routed onto colors.phase.* per spec §5.2.
 * `shipped` previously (mis)used the raw gold ramp (`secondary[700]`) — gold
 * is reserved for the literal Harvesting phase (spec §3); moved to
 * phase.colonizing ("partially done" — in transit, not yet complete).
 * `cancelled` moved from a generic error/coral read to phase.decommissioned
 * — the table separates "cancelled/void/archived" from
 * "rejected/failed/overdue/expired" (quarantined).
 */
export function getOrderStatusPhaseKey(status: string): PhaseKey | undefined {
  switch (status) {
    case 'draft':
      return 'empty';
    case 'confirmed':
      return 'fruitingInit'; // pending / awaiting processing
    case 'processing':
      return 'inoculated'; // open / active / in progress
    case 'shipped':
      return 'colonizing'; // partially done — in transit
    case 'delivered':
      return 'fruiting';
    case 'cancelled':
      return 'decommissioned';
    default:
      return undefined;
  }
}

export function getOrderStatusColor(status: string): string {
  const key = getOrderStatusPhaseKey(status);
  return key ? theme.colors.phase[key] : theme.colors.textSecondary;
}

/**
 * Get payment status color
 *
 * Night Observatory (T-901): routed onto colors.phase.* — exact §5.2 table
 * matches (pending→fruitingInit, partial→colonizing, paid→fruiting).
 */
export function getPaymentStatusColor(status: string): string {
  const c = theme.colors;
  switch (status) {
    case 'pending':
      return c.phase.fruitingInit;
    case 'partial':
      return c.phase.colonizing;
    case 'paid':
      return c.phase.fruiting;
    default:
      return c.textSecondary;
  }
}

/**
 * Get inventory status color
 *
 * Night Observatory (T-901): routed onto colors.phase.* per spec §5.2
 * (reserved≈"partially done"→colonizing, sold≈"closed/completed"→resting,
 * expired→quarantined, the exact table entry).
 */
export function getInventoryStatusColor(status: string): string {
  const c = theme.colors;
  switch (status) {
    case 'available':
      return c.phase.inoculated;
    case 'reserved':
      return c.phase.colonizing;
    case 'sold':
      return c.phase.resting;
    case 'expired':
      return c.phase.quarantined;
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
  getOrderStatusPhaseKey,
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
