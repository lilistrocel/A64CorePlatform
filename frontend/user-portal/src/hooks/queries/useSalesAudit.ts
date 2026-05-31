/**
 * Sales Audit History — TanStack Query hook (T-200.x)
 *
 * Fetches the per-document audit trail for any Wave 3 sales document via
 * GET /api/v1/sales/audit?docType=<TYPE>&docEntry=<UUID>&organizationId=<UUID>.
 *
 * Design decisions:
 *  - staleTime 60s: Audit rows are append-only after creation; a 60s cache
 *    means users re-opening the modal within a minute get instant results.
 *  - Query disabled until all three required params are non-empty strings.
 *    Prevents spurious API calls on component mount before data is available.
 *  - Actor name resolution is NOT performed here — the modal uses useAdminUsers
 *    (T-064) to map actorUserId → displayName after the data is fetched.
 *
 * Usage:
 *   const { data, isLoading, isError, refetch } = useSalesAudit({
 *     docType: 'AR_INVOICE',
 *     docEntry: invoice.docEntry,
 *     organizationId: orgId,
 *   });
 *   const entries = data?.entries ?? [];
 */

import { useQuery } from '@tanstack/react-query';
import { getSalesAudit } from '../../services/salesApi';
import type { SalesAuditDocType } from '../../services/salesApi';

// ─── Query key factory ────────────────────────────────────────────────────────

/**
 * Stable query key factory for sales audit queries.
 *
 * Shape: ['sales', 'audit', docType, docEntry, organizationId]
 *
 * Scoping by all three dimensions ensures the cache stays isolated even if
 * the same docEntry UUID appears in multiple doc types (highly unlikely but
 * correct by design).
 */
export const salesAuditKeys = {
  all: () => ['sales', 'audit'] as const,
  byDoc: (docType: string, docEntry: string, organizationId: string) =>
    ['sales', 'audit', docType, docEntry, organizationId] as const,
};

// ─── Params type ─────────────────────────────────────────────────────────────

export interface UseSalesAuditParams {
  docType: SalesAuditDocType;
  docEntry: string;
  organizationId: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the audit event list for a Wave 3 sales document.
 *
 * Returns all events ordered newest-first (timestamp DESC).
 * The backend returns { entries: SalesAuditEntry[], total: number }.
 *
 * @param params.docType        - Sales document type (e.g. 'AR_INVOICE').
 * @param params.docEntry       - UUID of the document.
 * @param params.organizationId - Organisation UUID.
 */
export function useSalesAudit({ docType, docEntry, organizationId }: UseSalesAuditParams) {
  return useQuery({
    queryKey: salesAuditKeys.byDoc(docType, docEntry, organizationId),
    queryFn: () => getSalesAudit(docType, docEntry, organizationId),
    // Reason: disable until all required params are present to prevent fetching
    // on partial state during modal open animation or component mounting.
    enabled: !!docType && !!docEntry && !!organizationId,
    // Reason: audit rows are immutable after creation; 60s stale time is
    // conservative enough to be fresh while avoiding re-fetches on every open.
    staleTime: 60_000,
  });
}
