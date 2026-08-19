/**
 * Block Query Hooks
 *
 * TanStack Query hooks for single-block reads. Currently just `useBlock`,
 * added for the Plant Library product extension Stage 4 harvest modal
 * rework — it needs a block's `productMotherId` (present on the full
 * `Block` shape returned by GET /farms/{farmId}/blocks/{blockId}, but not
 * on the lighter `DashboardBlock` projection the dashboard card renders
 * from) to resolve the live product picklist.
 */

import { useQuery } from '@tanstack/react-query';
import { getBlock } from '../../services/farmApi';
import { queryKeys } from '../../config/react-query.config';

/**
 * Get a single block by ID. Disabled until both IDs are present.
 */
export function useBlock(farmId: string | undefined, blockId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blocks.detail(farmId ?? '', blockId ?? ''),
    queryFn: () => getBlock(farmId!, blockId!),
    enabled: !!farmId && !!blockId,
  });
}
