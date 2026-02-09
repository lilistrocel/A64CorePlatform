/**
 * Farming Year Query Hooks
 *
 * React Query hooks for farming year configuration and available years
 */

import { useQuery } from '@tanstack/react-query';
import { farmApi, type FarmingYearItem } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';

/**
 * Get available farming years for a specific farm
 *
 * Returns years that have data (harvests or blocks) for the farm
 */
export function useAvailableFarmingYears(farmId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farms.farmingYears(farmId!),
    queryFn: () => farmApi.getAvailableFarmingYears(farmId!),
    enabled: !!farmId,
  });
}

/**
 * Get current farming year information
 */
export function useCurrentFarmingYear() {
  return useQuery({
    queryKey: queryKeys.farmingYearConfig.current(),
    queryFn: () => farmApi.getCurrentFarmingYear(),
  });
}

/**
 * Get list of farming years for selection (e.g., dropdown)
 *
 * @param count - Number of past years to include (default 5)
 * @param includeNext - Whether to include the next farming year (default true)
 */
export function useFarmingYearsList(count: number = 5, includeNext: boolean = true) {
  return useQuery({
    queryKey: queryKeys.farmingYearConfig.list(count, includeNext),
    queryFn: () => farmApi.getFarmingYearsList(count, includeNext),
  });
}

/**
 * Get farming year configuration (start month)
 */
export function useFarmingYearConfig() {
  return useQuery({
    queryKey: queryKeys.farmingYearConfig.all,
    queryFn: () => farmApi.getFarmingYearConfig(),
  });
}
