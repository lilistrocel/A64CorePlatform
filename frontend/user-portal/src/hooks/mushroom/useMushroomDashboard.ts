/**
 * useMushroomDashboard Hook
 *
 * TanStack React Query hooks for mushroom dashboard data and facility analytics.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type { MushroomDashboardData, FacilityAnalyticsData } from '../../types/mushroom';

export function useMushroomDashboard() {
  return useQuery<MushroomDashboardData>({
    queryKey: ['mushroom', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiClient.get('/v1/mushroom/dashboard');
      return data.data;
    },
    refetchInterval: 30000,
  });
}

export function useFacilityAnalytics(facilityId: string | undefined) {
  return useQuery<FacilityAnalyticsData>({
    queryKey: ['mushroom', 'analytics', facilityId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/dashboard/facilities/${facilityId}/analytics`
      );
      return data.data;
    },
    enabled: !!facilityId,
  });
}
