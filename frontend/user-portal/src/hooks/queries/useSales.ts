/**
 * Sales Data Query Hooks (trimmed — T-200.11 legacy cutover)
 *
 * Only useSalesDashboard remains after the legacy cutover.
 * Wave 3 sales order hooks live in useSalesOrders.ts.
 * Wave 3 returns hooks live in useReturns.ts.
 */

import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../../services/salesService';
import { queryKeys } from '../../config/react-query.config';

/**
 * Get sales dashboard statistics
 *
 * Caches dashboard stats to prevent duplicate calls.
 */
export function useSalesDashboard() {
  return useQuery({
    queryKey: queryKeys.sales.dashboard(),
    queryFn: () => salesApi.getDashboardStats(),
  });
}
