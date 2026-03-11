/**
 * useMushroomStrains Hook
 *
 * CRUD hooks for mushroom strain library.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api';
import type { MushroomStrain, CreateStrainPayload } from '../../types/mushroom';

// ============================================================================
// LIST & GET
// ============================================================================

export function useMushroomStrains() {
  return useQuery<MushroomStrain[]>({
    queryKey: ['mushroom', 'strains'],
    queryFn: async () => {
      const { data } = await apiClient.get('/v1/mushroom/strains');
      return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
    },
  });
}

export function useMushroomStrain(strainId: string | undefined) {
  return useQuery<MushroomStrain>({
    queryKey: ['mushroom', 'strains', strainId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/v1/mushroom/strains/${strainId}`);
      return data.data;
    },
    enabled: !!strainId,
  });
}

// ============================================================================
// CREATE
// ============================================================================

export function useCreateStrain() {
  const queryClient = useQueryClient();

  return useMutation<MushroomStrain, Error, CreateStrainPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post('/v1/mushroom/strains', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'strains'] });
    },
  });
}

// ============================================================================
// UPDATE
// ============================================================================

export function useUpdateStrain(strainId: string) {
  const queryClient = useQueryClient();

  return useMutation<MushroomStrain, Error, Partial<CreateStrainPayload>>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.patch(
        `/v1/mushroom/strains/${strainId}`,
        payload
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'strains'] });
      queryClient.invalidateQueries({ queryKey: ['mushroom', 'strains', strainId] });
    },
  });
}
