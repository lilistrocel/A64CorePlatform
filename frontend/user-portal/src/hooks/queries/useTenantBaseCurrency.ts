/**
 * useTenantBaseCurrency
 *
 * Returns the tenant's base currency code (ISO 4217, e.g. "AED") by reading
 * the first company entry from useFinanceCompanies.
 *
 * Falls back to 'AED' if:
 *  - orgId is empty/null
 *  - The finance companies list has not loaded yet
 *  - The org has no finance company configured
 *
 * Single source of truth for base-currency comparisons across all 8 sales forms.
 * Used by the Exchange Rate visibility logic: show the field only when the
 * selected transaction currency differs from this base currency.
 */

import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from './useFinanceCompanies';

const FALLBACK_CURRENCY = 'AED';

/**
 * Returns the tenant's default (base) currency code.
 *
 * @returns ISO 4217 currency code string, e.g. "AED". Never undefined.
 */
export function useTenantBaseCurrency(): string {
  const orgId = useAuthStore((s) => s.user?.organizationId ?? '');
  const { data: companies } = useFinanceCompanies(orgId || null);

  if (!companies || companies.length === 0) {
    return FALLBACK_CURRENCY;
  }

  return companies[0].defaultCurrency || FALLBACK_CURRENCY;
}
