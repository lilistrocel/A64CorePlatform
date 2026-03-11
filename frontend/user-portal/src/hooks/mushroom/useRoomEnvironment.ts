/**
 * useRoomEnvironment Hook
 *
 * Hooks for room environment readings (history + latest).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type {
  EnvironmentReading,
  CreateEnvironmentReadingPayload,
} from '../../types/mushroom';

// ============================================================================
// LIST ENVIRONMENT HISTORY
// ============================================================================

export function useRoomEnvironmentHistory(
  facilityId: string | undefined,
  roomId: string | undefined
) {
  return useQuery<EnvironmentReading[]>({
    queryKey: [
      'mushroom',
      'facilities',
      facilityId,
      'rooms',
      roomId,
      'environment',
    ],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/environment`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId && !!roomId,
  });
}

// ============================================================================
// LATEST READING
// ============================================================================

export function useLatestEnvironmentReading(
  facilityId: string | undefined,
  roomId: string | undefined
) {
  return useQuery<EnvironmentReading | null>({
    queryKey: [
      'mushroom',
      'facilities',
      facilityId,
      'rooms',
      roomId,
      'environment',
      'latest',
    ],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/environment/latest`
      );
      return data.data ?? null;
    },
    enabled: !!facilityId && !!roomId,
    refetchInterval: 60000, // Refresh every minute for live sensor data
  });
}

// ============================================================================
// LOG READING
// ============================================================================

export function useLogEnvironmentReading(facilityId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<EnvironmentReading, Error, CreateEnvironmentReadingPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/environment`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'mushroom',
          'facilities',
          facilityId,
          'rooms',
          roomId,
          'environment',
        ],
      });
    },
  });
}
