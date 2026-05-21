/**
 * Finance Tax Codes — TanStack Query hook
 *
 * Fetches the list of VAT/tax codes for the given organisation.
 * Tax codes change rarely — uses a 5-minute staleTime to avoid unnecessary
 * refetches on every navigation.
 *
 * On network error the hook sets `isError` true; callers fall back to
 * FALLBACK_TAX_CODES from `taxCodesService.ts` so the dropdown stays usable.
 *
 * Query key namespace: ['finance', 'tax-codes', orgId]
 */

import { useQuery } from '@tanstack/react-query';
import { listTaxCodes } from '../../services/taxCodesService';

/**
 * Fetch all tax codes for the given organisation.
 * The query is disabled when orgId is null/undefined/empty.
 *
 * @param orgId - The organisation UUID. Pass null or undefined to disable.
 */
export function useTaxCodes(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finance', 'tax-codes', orgId] as const,
    queryFn: () => listTaxCodes(orgId!),
    enabled: !!orgId,
    // Tax codes are long-lived master data — 5 minutes before considered stale.
    staleTime: 5 * 60_000,
  });
}
