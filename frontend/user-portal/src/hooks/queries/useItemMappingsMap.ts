/**
 * useItemMappingsMap
 *
 * Returns a Map<itemId, PurchaseItemFinanceExt> built from the active item
 * mappings. Consumers use this for O(1) lookup of an item's finance defaults
 * (taxCodeDefault, inventoryAccountId, etc.) when building line forms that
 * need to auto-default from the item's configured mapping.
 *
 * The underlying query fetches up to 200 active items (the service default),
 * which is sufficient for any operational purchase catalogue.
 *
 * Usage:
 *   const itemMappings = useItemMappingsMap(orgId);
 *   const defaultTaxCode = itemMappings.get(itemId)?.taxCodeDefault ?? null;
 */

import { useMemo } from 'react';
import { useItemMappings } from './useItemMappings';
import type { PurchaseItemFinanceExt } from '../../services/itemMappingService';

export function useItemMappingsMap(
  orgId: string | null | undefined,
): Map<string, PurchaseItemFinanceExt> {
  // Fetch only active items — inactive items should not contribute defaults
  // to new purchasing lines.
  const { data } = useItemMappings(orgId ?? '', { isActive: true });

  return useMemo(() => {
    const m = new Map<string, PurchaseItemFinanceExt>();
    if (data?.items) {
      for (const item of data.items) {
        m.set(item.itemId, item);
      }
    }
    return m;
  }, [data]);
}
