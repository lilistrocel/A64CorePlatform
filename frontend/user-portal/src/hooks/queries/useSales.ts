/**
 * Sales Data Query Hooks
 *
 * React Query hooks for sales-related data fetching
 * Prevents duplicate API calls through intelligent caching
 */

import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../../services/salesService';
import { queryKeys } from '../../config/react-query.config';
import type { SalesOrderSearchParams, InventorySearchParams } from '../../types/sales';

/**
 * Get sales dashboard statistics
 *
 * Caches dashboard stats to prevent duplicate calls
 * This is heavily used across the app, so caching is critical
 */
export function useSalesDashboard() {
  return useQuery({
    queryKey: queryKeys.sales.dashboard(),
    queryFn: () => salesApi.getDashboardStats(),
  });
}

/**
 * Get sales orders with filters
 *
 * Caches orders based on filter parameters
 */
export function useSalesOrders(params?: SalesOrderSearchParams) {
  return useQuery({
    queryKey: queryKeys.sales.orders.list(params),
    queryFn: () => salesApi.getSalesOrders(params),
  });
}

/**
 * Get single sales order by ID
 */
export function useSalesOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.sales.orders.all(), orderId],
    queryFn: () => salesApi.getSalesOrder(orderId!),
    enabled: !!orderId,
  });
}

/**
 * Get inventory items with filters
 *
 * Caches inventory based on filter parameters
 */
export function useInventory(params?: InventorySearchParams) {
  return useQuery({
    queryKey: queryKeys.sales.inventory.list(params),
    queryFn: () => salesApi.getInventory(params),
  });
}

/**
 * Get available inventory items
 *
 * Specialized query for available-only inventory
 */
export function useAvailableInventory() {
  return useQuery({
    queryKey: [...queryKeys.sales.inventory.all(), 'available'],
    queryFn: () => salesApi.getAvailableInventory(),
  });
}
