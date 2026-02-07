/**
 * React Query Configuration
 *
 * Central configuration for TanStack Query (React Query) v5
 * Optimized to reduce duplicate API calls and improve performance
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Create QueryClient with optimized default options
 *
 * Key settings:
 * - staleTime: 30s - Data is considered fresh for 30 seconds, preventing unnecessary refetches
 * - gcTime: 5m - Cached data garbage collected after 5 minutes of inactivity
 * - refetchOnWindowFocus: false - Don't refetch when user returns to tab (reduces API load)
 * - retry: 1 - Only retry failed requests once (prevents retry storms)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 30 seconds - prevents duplicate fetches
      staleTime: 30 * 1000, // 30 seconds

      // Unused cache entries garbage collected after 5 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes

      // Don't refetch when window regains focus (reduces unnecessary API calls)
      refetchOnWindowFocus: false,

      // Don't refetch when component remounts if data is still fresh
      refetchOnMount: false,

      // Don't refetch on reconnect (prevents spam when connection fluctuates)
      refetchOnReconnect: false,

      // Only retry failed requests once (prevents retry storms)
      retry: 1,

      // Retry delay: 1 second
      retryDelay: 1000,
    },
  },
});

/**
 * Query Keys Factory
 *
 * Centralized query key management for consistency
 * Helps with cache invalidation and debugging
 */
export const queryKeys = {
  // Farm queries
  farms: {
    all: ['farms'] as const,
    lists: () => [...queryKeys.farms.all, 'list'] as const,
    list: (page: number, perPage: number) =>
      [...queryKeys.farms.lists(), { page, perPage }] as const,
    details: () => [...queryKeys.farms.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.farms.details(), id] as const,
    summary: (id: string) => [...queryKeys.farms.detail(id), 'summary'] as const,
    blocks: (farmId: string, category?: 'virtual' | 'physical' | 'all') =>
      [...queryKeys.farms.detail(farmId), 'blocks', category] as const,
    harvests: (farmId: string) =>
      [...queryKeys.farms.detail(farmId), 'harvests'] as const,
  },

  // Block queries
  blocks: {
    all: ['blocks'] as const,
    detail: (farmId: string, blockId: string) => ['blocks', farmId, blockId] as const,
    alerts: (farmId: string, blockId: string) =>
      [...queryKeys.blocks.detail(farmId, blockId), 'alerts'] as const,
    harvests: (farmId: string, blockId: string) =>
      [...queryKeys.blocks.detail(farmId, blockId), 'harvests'] as const,
  },

  // Sales queries
  sales: {
    all: ['sales'] as const,
    dashboard: () => [...queryKeys.sales.all, 'dashboard'] as const,
    orders: {
      all: () => [...queryKeys.sales.all, 'orders'] as const,
      list: (params?: any) => [...queryKeys.sales.orders.all(), params] as const,
    },
    inventory: {
      all: () => [...queryKeys.sales.all, 'inventory'] as const,
      list: (params?: any) => [...queryKeys.sales.inventory.all(), params] as const,
    },
  },

  // Dashboard queries
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    farmStats: () => [...queryKeys.dashboard.all, 'farmStats'] as const,
    salesStats: () => [...queryKeys.dashboard.all, 'salesStats'] as const,
    ordersByStatus: () => [...queryKeys.dashboard.all, 'ordersByStatus'] as const,
    blocksByFarm: () => [...queryKeys.dashboard.all, 'blocksByFarm'] as const,
  },

  // MFA/Auth queries
  mfa: {
    all: ['mfa'] as const,
    setup: () => [...queryKeys.mfa.all, 'setup'] as const,
    status: () => [...queryKeys.mfa.all, 'status'] as const,
  },
} as const;
