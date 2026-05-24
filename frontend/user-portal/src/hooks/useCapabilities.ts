/**
 * useCapabilities — Wave 0 (T-059.3)
 *
 * TanStack Query hook that returns the per-tenant module capability
 * status. Used by route gates, sidebar gates, and purchasing forms to
 * degrade gracefully when finance is off or unreachable.
 */

import { useQuery } from '@tanstack/react-query';
import { getCapabilities } from '../services/systemService';
import type { Capabilities } from '../types/capabilities';

const CAPABILITIES_QUERY_KEY = ['system', 'capabilities'] as const;

export function useCapabilities() {
  return useQuery<Capabilities>({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: getCapabilities,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Reason: capabilities feed every render decision — keep an old value
    // in the cache while refetching so the UI doesn't flicker.
    placeholderData: (previous) => previous,
  });
}

/**
 * Cheap sync derivative: returns true when finance is on AND enabled
 * for the current tenant. Use this in render code where you only need
 * the on/off bit (most route + sidebar gates).
 */
export function useFinanceEnabled(): boolean {
  const { data } = useCapabilities();
  return data?.modules.finance.enabled ?? false;
}

/**
 * Returns true when finance is enabled by the operator but the service
 * is currently unreachable. Use to trigger the amber banner inside
 * purchasing forms.
 */
export function useFinanceUnreachable(): boolean {
  const { data } = useCapabilities();
  if (!data) return false;
  const f = data.modules.finance;
  return f.enabled && !f.reachable;
}

export { CAPABILITIES_QUERY_KEY };
