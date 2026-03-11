/**
 * useSubstrateBatches Hook
 *
 * CRUD hooks for substrate batch management per facility.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type { SubstrateBatch, CreateSubstratePayload } from '../../types/mushroom';

// ============================================================================
// LIST
// ============================================================================

export function useFacilitySubstrates(facilityId: string | undefined) {
  return useQuery<SubstrateBatch[]>({
    queryKey: ['mushroom', 'facilities', facilityId, 'substrates'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/facilities/${facilityId}/substrates`
      );
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
    enabled: !!facilityId,
  });
}

export function useSubstrateBatch(substrateId: string | undefined) {
  return useQuery<SubstrateBatch>({
    queryKey: ['mushroom', 'substrates', substrateId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/v1/mushroom/substrates/${substrateId}`
      );
      return data.data;
    },
    enabled: !!substrateId,
  });
}

// ============================================================================
// CREATE
// ============================================================================

export function useCreateSubstrate(facilityId: string) {
  const queryClient = useQueryClient();

  return useMutation<SubstrateBatch, Error, CreateSubstratePayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post(
        `/v1/mushroom/facilities/${facilityId}/substrates`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'facilities', facilityId, 'substrates'],
      });
    },
  });
}

// ============================================================================
// UPDATE
// ============================================================================

export function useUpdateSubstrate(substrateId: string, facilityId?: string) {
  const queryClient = useQueryClient();

  return useMutation<SubstrateBatch, Error, Partial<CreateSubstratePayload>>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/substrates/${substrateId}`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['mushroom', 'substrates', substrateId],
      });
      if (facilityId) {
        queryClient.invalidateQueries({
          queryKey: ['mushroom', 'facilities', facilityId, 'substrates'],
        });
      }
    },
  });
}
