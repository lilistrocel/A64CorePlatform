/**
 * Harvest product category display helpers (Plant Library product extension
 * Stage 3/4 — design doc §3/§5). Shared between BlockHarvestEntryModal
 * (recording a multi-line submission) and BlockHarvestBatchLookupModal
 * (reviewing one), so the label/colour vocabulary for sellable/process/waste
 * stays a single source of truth.
 */

import type { Theme } from '@a64core/shared';
import type { ProductCategory } from '../types/farm';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  sellable: 'Sellable',
  process: 'Process',
  waste: 'Waste',
};

// Where each category's line actually lands — surfaced next to the product
// picker/result so recording waste never looks like recording sellable
// stock (design doc §5).
export const DESTINATION_LABELS: Record<ProductCategory, string> = {
  sellable: 'Counted toward yield · block harvest history',
  process: 'Processing inventory',
  waste: 'Waste log · excluded from yield',
};

export function getCategoryColor(theme: Theme, category: ProductCategory): string {
  switch (category) {
    case 'sellable':
      return theme.colors.bright.emerald;
    case 'process':
      return theme.colors.bright.lapis;
    case 'waste':
      return theme.colors.bright.coral;
  }
}
