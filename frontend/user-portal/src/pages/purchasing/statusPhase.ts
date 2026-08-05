/**
 * Canonical PR -> PO -> GR -> AP status-to-phase map.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md
 * SS5.2). Before this file, PurchaseRequestsPage / PurchaseOrdersPage /
 * GoodsReceiptsPage / APInvoicesPage / *DetailPage each declared their own
 * StatusBadge with its own switch statement and its own colour choices for
 * the same document lifecycle. This is the ONE place that mapping lives now
 * -- every purchasing StatusBadge composes `phaseBadge(purchasingStatusToPhase(status))`
 * from here instead of hand-rolling a switch. Do not re-fragment it.
 *
 * T-811 (Wave 4 status vocabulary regression, 2026-08-04): the backend's
 * `wave4_purchasing_status_migration.py` rewrote the STORED
 * `document_headers.status` field from TitleCase to the shared
 * `DocumentStatus` lowercase_snake vocabulary (draft, pending_approval, open,
 * partly_closed, closed, cancelled). Four purchasing-internal statuses were
 * NOT touched by that migration and are still stored exactly as before:
 * 'Rejected', 'Sent', 'Partially Received', 'Received'. This map (and every
 * page that gates actions on `status`) must key off the STORED value, so the
 * TitleCase keys below are kept only as harmless aliases for any
 * not-yet-migrated document lingering during the migration window — new
 * code should never compare against them. See also `statusDisplayLabel()`,
 * which maps the stored value back to a human label (accounting for the
 * per-doc-type "open" display nuance: Approved for PR/AP, Posted for GR,
 * Open for PO).
 *
 * Status vocab sourced from:
 *  - services/purchasingApi.ts: PRStatus, POStatus
 *  - services/goodsReceiptsService.ts: GRStatus
 *  - services/apInvoicesService.ts: APStatus
 *
 * Mapping rule (spec SS5.2, "extrapolated vocabularies" -- normative):
 *   draft                        -> empty
 *   pending / awaiting approval  -> fruitingInit
 *   open / active / in progress  -> inoculated
 *   partially done               -> colonizing
 *   approved / posted / delivered-> fruiting
 *   closed / settled / completed -> resting
 *   rejected / failed / overdue  -> quarantined
 *   cancelled / void / archived  -> decommissioned
 */
import type { PhaseKey } from '@a64core/shared';

/** Every literal status string used across PR/PO/GR/AP — current (stored)
 * backend vocabulary plus the pre-migration TitleCase aliases (migration-
 * window safety only; do not key new logic off the TitleCase variants). */
export type PurchasingDocStatus =
  // Current stored vocabulary (Wave 4 migration)
  | 'draft'
  | 'pending_approval'
  | 'open'
  | 'partly_closed'
  | 'closed'
  | 'cancelled'
  // Purchasing-internal statuses the migration did NOT touch
  | 'Rejected'
  | 'Sent'
  | 'Partially Received'
  | 'Received'
  // Pre-migration TitleCase aliases — harmless, kept for migration-window
  // safety only
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Cancelled'
  | 'Closed'
  | 'Open'
  | 'Posted'
  | 'Partly Closed';

const PURCHASING_STATUS_PHASE: Record<PurchasingDocStatus, PhaseKey> = {
  // Current stored vocabulary
  draft: 'empty',
  pending_approval: 'fruitingInit',
  open: 'inoculated',
  partly_closed: 'colonizing',
  closed: 'resting',
  cancelled: 'decommissioned',
  // Purchasing-internal statuses, unchanged by the migration
  Rejected: 'quarantined',
  // 'Sent' (PO mailed to vendor, not yet acknowledged/received against) reads
  // as an active/in-progress state, same bucket as 'open'.
  Sent: 'inoculated',
  'Partially Received': 'colonizing',
  Received: 'fruiting',
  // Pre-migration TitleCase aliases (migration-window safety only)
  Draft: 'empty',
  'Pending Approval': 'fruitingInit',
  Open: 'inoculated',
  Posted: 'fruiting',
  Approved: 'fruiting',
  Closed: 'resting',
  Cancelled: 'decommissioned',
  'Partly Closed': 'colonizing',
};

/** Maps any PR/PO/GR/AP status string onto the shared `colors.phase.*`
 * vocabulary. Unrecognised input falls back to `empty` rather than throwing --
 * status enums are server-controlled strings that a redesign pass should
 * never let crash the page. */
export function purchasingStatusToPhase(status: string): PhaseKey {
  return PURCHASING_STATUS_PHASE[status as PurchasingDocStatus] ?? 'empty';
}

/**
 * Maps a stored backend status onto a human-friendly display label.
 *
 * The shared "open" stored value displays differently per doc type (the same
 * semantic-rename collapse as the backend event-payload builders in
 * `document_service.py`'s `map_pr_state_for_event` / `map_po_state_for_event`):
 *   - PR / AP -> "Approved"
 *   - GR      -> "Posted"
 *   - PO (or docType omitted) -> "Open"
 *
 * The purchasing-internal statuses the migration never touched ('Rejected',
 * 'Sent', 'Partially Received', 'Received') pass through unchanged. Unknown
 * input is returned as-is rather than thrown — never let a display helper
 * crash the page over a server-controlled string.
 */
export function statusDisplayLabel(
  status: string,
  docType?: 'PR' | 'PO' | 'GR' | 'AP'
): string {
  switch (status) {
    case 'draft':
    case 'Draft':
      return 'Draft';
    case 'pending_approval':
    case 'Pending Approval':
      return 'Pending Approval';
    case 'open':
    case 'Open':
    case 'Approved':
    case 'Posted':
      if (docType === 'GR') return 'Posted';
      if (docType === 'PR' || docType === 'AP') return 'Approved';
      return 'Open';
    case 'partly_closed':
    case 'Partly Closed':
      return 'Partially Received';
    case 'closed':
    case 'Closed':
      return 'Closed';
    case 'cancelled':
    case 'Cancelled':
      return 'Cancelled';
    // Purchasing-internal statuses, unchanged by the migration
    case 'Rejected':
    case 'Sent':
    case 'Partially Received':
    case 'Received':
      return status;
    default:
      return status;
  }
}
