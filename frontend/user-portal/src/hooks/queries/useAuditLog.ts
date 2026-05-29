/**
 * Audit Log — TanStack Query hooks
 *
 * - useAuditLog(params)  — fetch paginated audit events for a specific entity
 *
 * Stale time: 60 seconds. Audit log rows are append-only — once written they
 * never change. A 60s cache means users navigating back to the modal within a
 * minute get instant results without a network round-trip.
 *
 * Query enabled: only when organizationId, entityType, and entityId are all
 * non-empty strings. This prevents spurious API calls during initialisation.
 *
 * Actor resolution:
 *   No shared user-fetch hook exists in this codebase. The modal renders
 *   actorUserId truncated to 8 chars as a fallback. See T-064 follow-up.
 */

import { useQuery } from '@tanstack/react-query';
import * as auditLogService from '../../services/auditLogService';
import type { ListAuditLogParams } from '../../services/auditLogService';

// ─── Query key factory ────────────────────────────────────────────────────────

/**
 * Stable query key factory for audit log queries.
 *
 * Shape: ['finance', 'audit-log', orgId, entityType, entityId, action?, page?, size?]
 *
 * Scoping by entityType + entityId (not just entityId) ensures the cache
 * stays isolated if the same UUID is used as both a FiscalPeriod and a
 * JournalEntry (unlikely but correct by design).
 */
export const auditLogKeys = {
  all: (orgId: string) =>
    ['finance', 'audit-log', orgId] as const,
  byEntity: (
    orgId: string,
    entityType: string,
    entityId: string,
    action?: string,
    page?: number,
    size?: number
  ) =>
    [
      'finance',
      'audit-log',
      orgId,
      entityType,
      entityId,
      action ?? null,
      page ?? 1,
      size ?? 200,
    ] as const,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch audit log events for a specific entity.
 *
 * Required params: organizationId, entityType, entityId.
 * Query is disabled (no fetch) until all three required params are non-empty.
 *
 * The response envelope is PaginatedResponse — access `data.items` for the
 * list of AuditLogEntry objects. Total/page metadata is available but the
 * modal intentionally skips pagination UI (KISS; default size=200 covers all
 * realistic fiscal-period audit histories).
 */
export function useAuditLog(params: ListAuditLogParams) {
  const { organizationId, entityType, entityId, action, page, size } = params;

  return useQuery({
    queryKey: auditLogKeys.byEntity(
      organizationId,
      entityType,
      entityId,
      action,
      page,
      size
    ),
    queryFn: () => auditLogService.listAuditLog(params),
    // Disable until all required params are present — prevents fetch on partial
    // state during modal open animation or component mounting.
    enabled:
      !!organizationId &&
      !!entityType &&
      !!entityId,
    // Audit rows are immutable after creation. 60s before re-fetching is fine
    // for the read-heavy audit history modal.
    staleTime: 60_000,
  });
}
