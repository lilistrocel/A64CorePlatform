/**
 * useFacilityData Hook
 *
 * CRUD hooks for mushroom facilities using TanStack React Query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type {
  Facility,
  CreateFacilityPayload,
  UpdateFacilityPayload,
} from '../../types/mushroom';

// ============================================================================
// LIST & GET
// ============================================================================

export function useFacilities() {
  return useQuery<Facility[]>({
    queryKey: ['mushroom', 'facilities'],
    queryFn: async () => {
      const { data } = await apiClient.get('/v1/mushroom/facilities');
      // Handle both paginated and direct array responses
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
  });
}

export function useFacility(facilityId: string | undefined) {
  return useQuery<Facility>({
    queryKey: ['mushroom', 'facilities', facilityId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/v1/mushroom/facilities/${facilityId}`);
      return data.data;
    },
    enabled: !!facilityId,
  });
}

// ============================================================================
// CREATE
// ============================================================================

export function useCreateFacility() {
  const queryClient = useQueryClient();

  return useMutation<Facility, Error, CreateFacilityPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post('/v1/mushroom/facilities', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'facilities'] });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}

// ============================================================================
// UPDATE
// ============================================================================

export function useUpdateFacility(facilityId: string) {
  const queryClient = useQueryClient();

  return useMutation<Facility, Error, UpdateFacilityPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/facilities/${facilityId}`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'facilities'] });
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId],
      });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}
