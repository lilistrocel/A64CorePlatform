/**
 * useRoomData Hook
 *
 * CRUD and phase transition hooks for growing rooms.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type {
  GrowingRoom,
  CreateRoomPayload,
  UpdateRoomPayload,
  AdvancePhasePayload,
} from '../../types/mushroom';

// ============================================================================
// LIST & GET
// ============================================================================

export function useFacilityRooms(facilityId: string | undefined) {
  return useQuery<GrowingRoom[]>({
    queryKey: ['mushroom', 'facilities', facilityId, 'rooms'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId,
  });
}

export function useRoom(facilityId: string | undefined, roomId: string | undefined) {
  return useQuery<GrowingRoom>({
    queryKey: ['mushroom', 'facilities', facilityId, 'rooms', roomId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}`
      );
      return data.data;
    },
    enabled: !!facilityId && !!roomId,
  });
}

// ============================================================================
// CREATE
// ============================================================================

export function useCreateRoom(facilityId: string) {
  const queryClient = useQueryClient();

  return useMutation<GrowingRoom, Error, CreateRoomPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post(
        `/v1/mushroom/facilities/${facilityId}/rooms`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms'],
      });
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId],
      });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}

// ============================================================================
// UPDATE
// ============================================================================

export function useUpdateRoom(facilityId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<GrowingRoom, Error, UpdateRoomPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms'],
      });
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms', roomId],
      });
    },
  });
}

// ============================================================================
// ADVANCE PHASE
// ============================================================================

export function useAdvancePhase(facilityId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<GrowingRoom, Error, AdvancePhasePayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/phase`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms'],
      });
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'rooms', roomId],
      });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}
