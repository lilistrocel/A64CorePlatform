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
 * Status vocab sourced from:
 *  - services/purchasingApi.ts: PRStatus, POStatus
 *  - services/goodsReceiptsService.ts: GRStatus ('Draft' | 'Posted')
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

/** Every literal status string used across PR/PO/GR/AP. */
export type PurchasingDocStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Closed'
  | 'Open'
  | 'Sent'
  | 'Partially Received'
  | 'Received'
  | 'Posted';

const PURCHASING_STATUS_PHASE: Record<PurchasingDocStatus, PhaseKey> = {
  Draft: 'empty',
  'Pending Approval': 'fruitingInit',
  Open: 'inoculated',
  // 'Sent' (PO mailed to vendor, not yet acknowledged/received against) reads
  // as an active/in-progress state, same bucket as 'Open'.
  Sent: 'inoculated',
  'Partially Received': 'colonizing',
  Received: 'fruiting',
  Posted: 'fruiting',
  Approved: 'fruiting',
  Rejected: 'quarantined',
  Closed: 'resting',
  Cancelled: 'decommissioned',
};

/** Maps any PR/PO/GR/AP status string onto the shared `colors.phase.*`
 * vocabulary. Unrecognised input falls back to `empty` rather than throwing --
 * status enums are server-controlled strings that a redesign pass should
 * never let crash the page. */
export function purchasingStatusToPhase(status: string): PhaseKey {
  return PURCHASING_STATUS_PHASE[status as PurchasingDocStatus] ?? 'empty';
}
