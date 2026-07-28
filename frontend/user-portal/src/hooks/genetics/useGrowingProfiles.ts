/**
 * Growing Profile Hooks (T-801)
 *
 * A "growing profile" is the cultivation-parameters record a genetic line can
 * point at — `mushroom_strains` for fungi, `plant_data_enhanced` for plants.
 *
 * The two libraries answer a different question from the Genetics Repo: the
 * profile says *what conditions this species wants*, the line says *which
 * lineage you are holding*. These hooks join the two so the targets can be read
 * next to the lineage instead of in a separate module.
 */

import { useQuery } from '@tanstack/react-query';
import { getPlantDataEnhancedList, getPlantDataEnhancedById } from '../../services/plantDataEnhancedApi';
import { apiClient } from '../../services/api';
import type { PlantDataEnhanced } from '../../types/farm';
import type { MushroomStrain } from '../../types/mushroom';
import type { OrganismKind } from '../../types/genetics';

/** Normalised option shown in the growing-profile picker. */
export interface ProfileOption {
  id: string;
  label: string;
  scientificName?: string;
  species?: string;
}

/**
 * Which profile source a given organism kind maps to.
 * Animals have no growing-profile library yet, hence null.
 */
export function profileSourceForKind(kind: OrganismKind): 'strain' | 'plant' | null {
  if (kind === 'fungus') return 'strain';
  if (kind === 'plant') return 'plant';
  return null;
}

export const PROFILE_SOURCE_LABEL: Record<'strain' | 'plant', string> = {
  strain: 'Strain Library',
  plant: 'Plant Library',
};

/**
 * Selectable growing profiles for a kind. Returns an empty list (and does not
 * fetch) for kinds with no library.
 */
export function useProfileOptions(kind: OrganismKind) {
  const source = profileSourceForKind(kind);

  return useQuery<ProfileOption[]>({
    queryKey: ['genetics', 'profile-options', source],
    enabled: source !== null,
    staleTime: 60_000,
    queryFn: async () => {
      if (source === 'strain') {
        // Mushroom strains are a flat global catalogue, so one page is enough.
        const { data } = await apiClient.get('/v1/mushroom/strains', {
          params: { perPage: 100, activeOnly: true },
        });
        const strains: MushroomStrain[] = Array.isArray(data.data)
          ? data.data
          : data.data?.items ?? [];
        return strains.map((s) => ({
          id: s.id,
          label: s.commonName,
          scientificName: s.scientificName ?? undefined,
          species: s.species ?? undefined,
        }));
      }

      const page = await getPlantDataEnhancedList({ perPage: 100 });
      return (page.items ?? []).map((p: PlantDataEnhanced) => ({
        id: p.plantDataId,
        label: p.plantName,
        scientificName: p.scientificName ?? undefined,
      }));
    },
  });
}

/** The mushroom strain a line is linked to, if any. */
export function useLinkedStrain(strainId: string | null | undefined) {
  return useQuery<MushroomStrain>({
    queryKey: ['genetics', 'linked-strain', strainId],
    enabled: !!strainId,
    queryFn: async () => {
      const { data } = await apiClient.get(`/v1/mushroom/strains/${strainId}`);
      return data.data;
    },
  });
}

/** The plant data record a line is linked to, if any. */
export function useLinkedPlantData(plantDataId: string | null | undefined) {
  return useQuery<PlantDataEnhanced>({
    queryKey: ['genetics', 'linked-plant', plantDataId],
    enabled: !!plantDataId,
    queryFn: () => getPlantDataEnhancedById(plantDataId as string),
  });
}
