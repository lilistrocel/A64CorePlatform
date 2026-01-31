/**
 * Farm Data Query Hooks
 *
 * React Query hooks for farm-related data fetching
 * Prevents duplicate API calls through intelligent caching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { farmApi } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';
import type { FarmCreate, FarmUpdate } from '../../types/farm';

/**
 * Get all farms with pagination
 *
 * Caches farm list data to prevent duplicate calls
 * Stale time: 30s (from global config)
 */
export function useFarms(page: number = 1, perPage: number = 20) {
  return useQuery({
    queryKey: queryKeys.farms.list(page, perPage),
    queryFn: () => farmApi.getFarms(page, perPage),
  });
}

/**
 * Get single farm by ID
 *
 * Caches individual farm data
 * Stale time: 30s (from global config)
 */
export function useFarm(farmId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farms.detail(farmId!),
    queryFn: () => farmApi.getFarm(farmId!),
    enabled: !!farmId, // Only run query if farmId exists
  });
}

/**
 * Get farm summary statistics
 *
 * Caches farm summary data separately from farm details
 * This allows independent refetching of summary vs details
 */
export function useFarmSummary(farmId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farms.summary(farmId!),
    queryFn: () => farmApi.getFarmSummary(farmId!),
    enabled: !!farmId,
  });
}

/**
 * Get farm blocks with category filter
 *
 * Caches blocks separately by category to avoid duplicate fetches
 * Category: 'virtual' | 'physical' | 'all'
 */
export function useFarmBlocks(
  farmId: string | undefined,
  blockCategory: 'virtual' | 'physical' | 'all' = 'virtual'
) {
  return useQuery({
    queryKey: queryKeys.farms.blocks(farmId!, blockCategory),
    queryFn: () => farmApi.getBlocks(farmId!, blockCategory),
    enabled: !!farmId,
  });
}

/**
 * Get farm harvests
 *
 * Caches harvest data to prevent duplicate calls
 */
export function useFarmHarvests(farmId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farms.harvests(farmId!),
    queryFn: async () => {
      // Fetch all harvests for the farm
      const response = await farmApi.getBlockHarvests(farmId!, 'all', 1, 100);
      return response.items || [];
    },
    enabled: !!farmId,
  });
}

/**
 * Create new farm mutation
 *
 * Invalidates farm list cache after successful creation
 */
export function useCreateFarm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FarmCreate) => farmApi.createFarm(data),
    onSuccess: () => {
      // Invalidate farm lists to refetch with new farm
      queryClient.invalidateQueries({ queryKey: queryKeys.farms.lists() });
    },
  });
}

/**
 * Update farm mutation
 *
 * Invalidates specific farm cache after update
 */
export function useUpdateFarm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ farmId, data }: { farmId: string; data: FarmUpdate }) =>
      farmApi.updateFarm(farmId, data),
    onSuccess: (_data, variables) => {
      // Invalidate specific farm to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.farms.detail(variables.farmId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.farms.summary(variables.farmId) });
    },
  });
}

/**
 * Delete farm mutation
 *
 * Invalidates farm list cache after deletion
 */
export function useDeleteFarm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (farmId: string) => farmApi.deleteFarm(farmId),
    onSuccess: () => {
      // Invalidate farm lists to refetch without deleted farm
      queryClient.invalidateQueries({ queryKey: queryKeys.farms.lists() });
    },
  });
}
