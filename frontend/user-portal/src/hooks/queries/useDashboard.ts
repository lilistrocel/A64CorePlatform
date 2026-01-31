/**
 * Dashboard Data Query Hooks
 *
 * React Query hooks for dashboard widgets
 * Prevents duplicate API calls across multiple widgets
 */

import { useQuery } from '@tanstack/react-query';
import { dashboardDataService } from '../../services/dashboard-data.service';
import { queryKeys } from '../../config/react-query.config';

/**
 * Get complete dashboard summary in a single optimized call
 *
 * RECOMMENDED: Use this instead of individual hooks for maximum performance.
 * Replaces 80+ API calls with a single aggregated endpoint.
 *
 * Returns all dashboard data:
 * - Overview metrics (total farms, blocks, active plantings, upcoming harvests)
 * - Block counts by state (across all farms)
 * - Block counts grouped by farm
 * - Harvest totals by farm
 * - Recent activity counts
 *
 * Response time: ~28ms vs 1000ms+ for individual calls
 */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => dashboardDataService.getDashboardSummary(),
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Get farm statistics for dashboard
 *
 * @deprecated Use useDashboardSummary() instead for better performance
 *
 * Caches farm stats to prevent duplicate calls
 * Used by multiple widgets: total-farms, total-blocks, total-harvests
 */
export function useFarmStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.farmStats(),
    queryFn: () => dashboardDataService.getFarmStats(),
  });
}

/**
 * Get sales statistics for dashboard
 *
 * Caches sales stats to prevent duplicate calls
 * Used by multiple widgets: total-orders, revenue, etc.
 */
export function useSalesStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.salesStats(),
    queryFn: () => dashboardDataService.getSalesStats(),
  });
}

/**
 * Get orders by status for chart
 *
 * Caches chart data separately from raw stats
 */
export function useOrdersByStatus() {
  return useQuery({
    queryKey: queryKeys.dashboard.ordersByStatus(),
    queryFn: () => dashboardDataService.getOrdersByStatus(),
  });
}

/**
 * Get blocks by farm for chart
 *
 * Caches chart data separately from raw farm data
 */
export function useBlocksByFarm() {
  return useQuery({
    queryKey: queryKeys.dashboard.blocksByFarm(),
    queryFn: () => dashboardDataService.getBlocksByFarm(),
  });
}
