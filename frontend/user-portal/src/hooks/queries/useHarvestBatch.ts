/**
 * Harvest Batch Query/Mutation Hooks (Plant Library product extension
 * Stage 4 — design doc §5/§7)
 *
 * TanStack Query hooks for the multi-line harvest batch submission and the
 * batch-lookup view. Mirrors usePlantMothers.ts's pattern.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { farmApi } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';
import type { HarvestBatchSubmitRequest } from '../../types/farm';

/**
 * Submit a multi-line harvest batch. Invalidates the block's harvest list
 * and the farm's aggregate harvest cache on success.
 */
export function useSubmitHarvestBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      farmId,
      blockId,
      data,
    }: {
      farmId: string;
      blockId: string;
      data: HarvestBatchSubmitRequest;
    }) => farmApi.submitHarvestBatch(farmId, blockId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.blocks.harvests(variables.farmId, variables.blockId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.farms.harvests(variables.farmId) });
    },
  });
}

/**
 * Look up every harvest line for a block on a calendar date, across all
 * three destinations, grouped by harvestBatchId. Disabled until a date is
 * chosen — this is a deliberately more expensive lookup, only fetched when
 * the user asks to review/edit a mixed submission (design doc §7).
 */
export function useHarvestBatchLookup(
  farmId: string | undefined,
  blockId: string | undefined,
  harvestDate: string | undefined
) {
  return useQuery({
    queryKey: queryKeys.blocks.harvestBatchLookup(farmId ?? '', blockId ?? '', harvestDate ?? ''),
    queryFn: () => farmApi.getHarvestBatchLookup(farmId!, blockId!, harvestDate!),
    enabled: !!farmId && !!blockId && !!harvestDate,
  });
}
