/**
 * System capability types (Wave 0 — T-059).
 *
 * Mirrors the backend's CapabilitiesResponse Pydantic model at
 * src/api/v1/system.py. Keep in sync.
 */

export interface FinanceModuleCapability {
  /** Operator decision (per-tenant flag). When false the UI hides all
   *  finance entries even if the service is reachable. */
  enabled: boolean;
  /** Health-ping result. When false the UI shows an amber banner and
   *  degrades dropdowns to free-text inputs. */
  reachable: boolean;
  /** Finance service version when reachable; null otherwise. */
  version: string | null;
}

export interface ModuleCapabilities {
  finance: FinanceModuleCapability;
}

export interface Capabilities {
  /** Organization (tenant) ID the response is scoped to. May be null
   *  when the user is not yet assigned to an organization. */
  tenantId: string | null;
  modules: ModuleCapabilities;
  /** ISO timestamp when the capability snapshot was taken. */
  checkedAt: string;
}
