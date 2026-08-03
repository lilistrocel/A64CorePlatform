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

/**
 * Mirrors `PublicInfoPageConfigUpdate` (src/models/organization.py) — every
 * field optional/`undefined` means "leave unchanged." The backend merges
 * only the keys present in the JSON body onto the stored config, so a
 * caller MUST send only the flags it actually intends to change, never a
 * full object rebuilt from stale client state (that would silently stomp
 * whatever a previous PATCH set for the flags this call doesn't care
 * about).
 */
export interface PublicInfoPageConfigPatch {
  enabled?: boolean;
  showOperatorName?: boolean;
  showMediumIngredients?: boolean;
  showProtocolSteps?: boolean;
  showFacilityName?: boolean;
}

export interface OrganizationModulesPatch {
  financeEnabled?: boolean;
  publicInfoPage?: PublicInfoPageConfigPatch;
}

/** Mirrors `PublicInfoPageConfig` (src/models/organization.py) — the
 * fully-resolved, non-partial shape returned by GET/PATCH on an
 * organization (as opposed to `PublicInfoPageConfigPatch`, the partial
 * request body). */
export interface PublicInfoPageConfig {
  enabled: boolean;
  showOperatorName: boolean;
  showMediumIngredients: boolean;
  showProtocolSteps: boolean;
  showFacilityName: boolean;
}

export interface OrganizationWithModules {
  organizationId: string;
  name: string;
  slug: string;
  industries: string[];
  logoUrl: string | null;
  modules: {
    financeEnabled: boolean;
    publicInfoPage: PublicInfoPageConfig;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch a single organization, including its full `modules` object
 * (`financeEnabled` + `publicInfoPage`). Used by ModulesSettingsCard to
 * seed the initial toggle states — `useCapabilities()` deliberately does
 * NOT carry `publicInfoPage` (it exists to gate finance-service reachability
 * for purchasing forms, not to mirror every module's config).
 *
 * Maps to GET /api/v1/organizations/{orgId}. Any authenticated user may
 * call this route; the settings card itself is gated to super_admin.
 */
export async function getOrganization(
  orgId: string
): Promise<OrganizationWithModules> {
  const { data } = await apiClient.get<OrganizationWithModules>(
    `/v1/organizations/${orgId}`
  );
  return data;
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

// ─── Deployment Settings (super_admin only) ────────────────────────────────
// Mirrors src/models/deployment_settings.py — GET/PATCH
// /api/v1/admin/deployment-settings. Lets a super_admin configure deployment
// identity (PUBLIC_BASE_URL, FRONTEND_URL) and Cloudflare Access
// (CF_ACCESS_*) from the browser instead of editing .env + recreating the
// container. See DeploymentSettingsCard.tsx for the UI.

/** Where a managed key's effective value came from. 'env' means it is
 * pinned by an environment variable on this deployment and cannot be
 * edited through this API (`editable` is false in that case). */
export type DeploymentSettingSource = 'env' | 'db' | 'unset';

/**
 * One resolved managed key. `value` is populated for every key EXCEPT
 * `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` — those two never return their
 * full value (see module docstring in deployment_settings_service.py for
 * why). For those two, `isSet` + `maskedHint` (last 4 characters, e.g.
 * "...ab12") are populated instead. There is deliberately no reveal
 * endpoint — never build a UI affordance that expects one.
 */
export interface DeploymentSettingItem {
  source: DeploymentSettingSource;
  editable: boolean;
  value?: string | boolean | null;
  isSet?: boolean | null;
  maskedHint?: string | null;
}

export type DeploymentSettingsMap = Record<string, DeploymentSettingItem>;

export interface DeploymentSettingsResponse {
  settings: DeploymentSettingsMap;
}

export type DeploymentSettingValue = string | boolean;

/**
 * PATCH request body. `currentPassword` re-authenticates the acting
 * super_admin — mandatory on every call, not just when "convenient".
 * `changes` must carry only the keys actually being modified; sending an
 * env-pinned key is a 409, an unknown key or wrong value type is a 422.
 */
export interface DeploymentSettingsPatchRequest {
  currentPassword: string;
  changes: Record<string, DeploymentSettingValue>;
}

export const DEPLOYMENT_SETTINGS_QUERY_KEY = ['deployment-settings'] as const;

/**
 * Fetch every managed deployment/Cloudflare Access key's effective value.
 *
 * Maps to GET /api/v1/admin/deployment-settings. Super_admin only — the
 * backend returns 403 for anyone else; callers should self-gate on
 * `user.role === 'super_admin'` before firing this query (see
 * DeploymentSettingsCard's `enabled` flag).
 */
export async function getDeploymentSettings(): Promise<DeploymentSettingsResponse> {
  const { data } = await apiClient.get<DeploymentSettingsResponse>(
    '/v1/admin/deployment-settings'
  );
  return data;
}

/**
 * Apply a validated set of deployment/Cloudflare Access setting changes.
 *
 * Maps to PATCH /api/v1/admin/deployment-settings. Returns the freshly
 * resolved settings (same shape as `getDeploymentSettings`).
 *
 * Distinct error cases callers must handle (see
 * services/deployment_settings_service.py `update()` docstring):
 * - 401: `currentPassword` did not match the actor's stored hash.
 * - 409: a changed key is pinned by an environment variable, OR
 *   `CF_ACCESS_EXCLUSIVE` was requested without a previously recorded
 *   successful Cloudflare Access sign-in on this deployment.
 * - 422: unknown key, wrong value type, or `CF_ACCESS_TEAM_DOMAIN` failed
 *   Cloudflare JWKS validation.
 */
export async function updateDeploymentSettings(
  patch: DeploymentSettingsPatchRequest
): Promise<DeploymentSettingsResponse> {
  const { data } = await apiClient.patch<DeploymentSettingsResponse>(
    '/v1/admin/deployment-settings',
    patch
  );
  return data;
}
