/**
 * useMushroomHarvests Hook
 *
 * Create and list hooks for room harvests (flush-aware).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type { MushroomHarvest, CreateHarvestPayload } from '../../types/mushroom';

// ============================================================================
// LIST ROOM HARVESTS
// ============================================================================

export function useRoomHarvests(
  facilityId: string | undefined,
  roomId: string | undefined
) {
  return useQuery<MushroomHarvest[]>({
    queryKey: ['mushroom', 'facilities', facilityId, 'rooms', roomId, 'harvests'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/harvests`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId && !!roomId,
  });
}

// ============================================================================
// LIST ALL FACILITY HARVESTS
// ============================================================================

export function useFacilityHarvests(facilityId: string | undefined) {
  return useQuery<MushroomHarvest[]>({
    queryKey: ['mushroom', 'facilities', facilityId, 'harvests'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/harvests`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId,
  });
}

// ============================================================================
// CREATE HARVEST
// ============================================================================

export function useCreateHarvest(facilityId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<MushroomHarvest, Error, CreateHarvestPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/harvests`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      // Invalidate room-level harvests
      queryClient.invalidateQueries({
        queryKey: [
          'mushroom',
          'facilities',
          facilityId,
          'rooms',
          roomId,
          'harvests',
        ],
      });
      // Invalidate facility-level harvests
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'harvests'],
      });
      // Invalidate room state (BE% updates)
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms', roomId],
      });
      // Invalidate dashboard summary
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}
