/**
 * System / capability API client (Wave 0 — T-059).
 */

import axios from 'axios';
import { apiClient } from './api';
import type { Capabilities } from '../types/capabilities';

/**
 * Safe default capability snapshot used when the backend doesn't yet
 * expose `/api/v1/system/capabilities` (e.g. a pre-Wave-0 deployment
 * the frontend hasn't been redeployed against yet). Treats finance as
 * **enabled** so the UI mirrors pre-Wave-0 behaviour, but reports
 * **unreachable** so purchasing forms still degrade dropdowns to free-
 * text rather than throwing on a missing finance call.
 */
const DEFAULT_CAPABILITIES: Capabilities = {
  tenantId: null,
  modules: {
    finance: {
      enabled: true,
      reachable: false,
      version: null,
    },
  },
  checkedAt: new Date(0).toISOString(),
};

/**
 * Fetch the per-tenant module capability status.
 *
 * Maps to GET /api/v1/system/capabilities. Silently degrades to
 * `DEFAULT_CAPABILITIES` on 404 so a stale backend never surfaces a
 * confusing "Not Found" toast on every page load.
 */
export async function getCapabilities(): Promise<Capabilities> {
  try {
    const { data } = await apiClient.get<Capabilities>(
      '/v1/system/capabilities'
    );
    return data;
  } catch (err) {
    // Reason: 404 means the backend hasn't been redeployed with the
    // Wave 0 endpoint yet. Don't break the UI — fall back to the safe
    // default. Any other error still propagates so React Query can
    // retry / surface it via the normal interceptor.
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return DEFAULT_CAPABILITIES;
    }
    throw err;
  }
}

/**
 * Toggle a module flag for an organization (super_admin only).
 *
 * Maps to PATCH /api/v1/organizations/{orgId}/modules. Returns the
 * updated organization document.
 */
export interface OrganizationModulesPatch {
  financeEnabled?: boolean;
}

export interface OrganizationWithModules {
  organizationId: string;
  name: string;
  slug: string;
  industries: string[];
  logoUrl: string | null;
  modules: {
    financeEnabled: boolean;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function updateOrganizationModules(
  orgId: string,
  patch: OrganizationModulesPatch
): Promise<OrganizationWithModules> {
  const { data } = await apiClient.patch<OrganizationWithModules>(
    `/v1/organizations/${orgId}/modules`,
    patch
  );
  return data;
}
