/**
 * Finance Tax Codes API Service
 *
 * Typed API calls for the Finance Tax Codes master data.
 * Endpoint: GET /api/v1/finance/tax-codes?organization_id={orgId}
 *
 * Reuses the shared apiClient (same axios instance, same JWT auth interceptor).
 * Finance endpoints are proxied via nginx on the same host — no separate base URL needed.
 */

import { apiClient } from './api';

// ─── Shape ────────────────────────────────────────────────────────────────────

/**
 * A VAT/tax code as returned by GET /api/v1/finance/tax-codes.
 * Tax codes are long-lived master data — consumers should use a generous staleTime.
 */
export interface TaxCode {
  organizationId: string;
  taxCode: string;          // e.g. "S", "Z", "E", "N", "SR"
  description: string;
  rate: string;             // Decimal as string, e.g. "5.00"
  inputTaxAccountId: string | null;
  outputTaxAccountId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Backend list response wrapper for the tax-codes endpoint. */
interface TaxCodeListResponse {
  data: TaxCode[];
  message?: string;
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Hard-coded fallback codes matching the seeded demo data.
 * Used when the API call fails so the dropdown remains usable.
 */
export const FALLBACK_TAX_CODES: TaxCode[] = [
  {
    organizationId: '',
    taxCode: 'S',
    description: 'Standard Rate',
    rate: '5.00',
    inputTaxAccountId: null,
    outputTaxAccountId: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    organizationId: '',
    taxCode: 'Z',
    description: 'Zero Rate',
    rate: '0.00',
    inputTaxAccountId: null,
    outputTaxAccountId: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    organizationId: '',
    taxCode: 'E',
    description: 'Exempt',
    rate: '0.00',
    inputTaxAccountId: null,
    outputTaxAccountId: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    organizationId: '',
    taxCode: 'N',
    description: 'Out of Scope',
    rate: '0.00',
    inputTaxAccountId: null,
    outputTaxAccountId: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    organizationId: '',
    taxCode: 'SR',
    description: 'Reverse Charge',
    rate: '5.00',
    inputTaxAccountId: null,
    outputTaxAccountId: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
];

// ─── API function ─────────────────────────────────────────────────────────────

/**
 * Fetch all tax codes for the given organisation.
 * The backend returns `{ data: [...] }` — NOT paginated.
 */
export async function listTaxCodes(orgId: string): Promise<TaxCode[]> {
  const response = await apiClient.get<TaxCodeListResponse>(
    '/v1/finance/tax-codes',
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}
