/**
 * useContamination Hook
 *
 * Create, list, and resolve hooks for contamination reports.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type {
  ContaminationReport,
  CreateContaminationPayload,
  ResolveContaminationPayload,
} from '../../types/mushroom';

// ============================================================================
// LIST ROOM CONTAMINATIONS
// ============================================================================

export function useRoomContaminations(
  facilityId: string | undefined,
  roomId: string | undefined
) {
  return useQuery<ContaminationReport[]>({
    queryKey: [
      'mushroom',
      'facilities',
      facilityId,
      'rooms',
      roomId,
      'contamination',
    ],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/contamination`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId && !!roomId,
  });
}

// ============================================================================
// REPORT CONTAMINATION
// ============================================================================

export function useReportContamination(facilityId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<ContaminationReport, Error, CreateContaminationPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post(
        `/v1/mushroom/facilities/${facilityId}/rooms/${roomId}/contamination`,
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
          'contamination',
        ],
      });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'dashboard'] });
    },
  });
}

// ============================================================================
// RESOLVE CONTAMINATION
// ============================================================================

export function useResolveContamination() {
  const queryClient = useQueryClient();

  return useMutation<
    ContaminationReport,
    Error,
    { contaminationId: string; payload: ResolveContaminationPayload }
  >({
    mutationFn: async ({ contaminationId, payload }) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/contamination/${contaminationId}/resolve`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      // Invalidate all contamination-related queries since we may not know the
      // facilityId/roomId at the point of resolution from the dashboard.
      queryClient.invalidateQueries({ queryKey: ['mushroom'] });
    },
  });
}
