/**
 * Finance-module status -> Night Observatory phase-colour map.
 *
 * Source of truth: Docs/2-Working-Progress/night-observatory-spec.md §5.2
 * ("Extrapolated vocabularies" — normative, not per-module variants).
 * `colors.phase.*` is the single semantic vocabulary; this file is the ONE
 * place finance status strings (period status, approval status, payment
 * status, JE status, invoice status, audit actions, …) translate to a
 * `PhaseKey`. Every finance page/component imports this instead of hand-
 * rolling its own status -> colour switch.
 *
 * `harvesting` (gold) is reserved for the literal harvest phase (spec §5.2
 * note) and never appears here — no finance status maps to it.
 */
import type { PhaseKey } from '@a64core/shared';

const STATUS_PHASE_MAP: Record<string, PhaseKey> = {
  // draft / not started
  draft: 'empty',
  unposted: 'empty',
  new: 'empty',
  notstarted: 'empty',

  // pending / awaiting approval
  pending: 'fruitingInit',
  pendingapproval: 'fruitingInit',
  submitted: 'fruitingInit',
  awaitingapproval: 'fruitingInit',
  inreview: 'fruitingInit',

  // open / active / in progress
  open: 'inoculated',
  active: 'inoculated',
  inprogress: 'inoculated',
  unpaid: 'inoculated',
  outstanding: 'inoculated',

  // partially done
  partial: 'colonizing',
  partiallypaid: 'colonizing',
  partiallyreceived: 'colonizing',
  partiallyreconciled: 'colonizing',

  // approved / posted / paid / delivered
  approved: 'fruiting',
  posted: 'fruiting',
  paid: 'fruiting',
  reconciled: 'fruiting',
  delivered: 'fruiting',
  matched: 'fruiting',

  // closed / settled / completed — also "reopen -> closed" style action targets
  closed: 'resting',
  settled: 'resting',
  completed: 'resting',
  complete: 'resting',
  locked: 'resting',
  close: 'resting', // AuditHistoryModal CLOSE action -> resulting "closed" state

  // rejected / failed / overdue / expired
  rejected: 'quarantined',
  failed: 'quarantined',
  overdue: 'quarantined',
  expired: 'quarantined',
  declined: 'quarantined',
  error: 'quarantined',

  // cancelled / void / archived
  cancelled: 'decommissioned',
  canceled: 'decommissioned',
  void: 'decommissioned',
  voided: 'decommissioned',
  archived: 'decommissioned',
  inactive: 'decommissioned',

  // maintenance / on hold / suspended
  onhold: 'maintenance',
  suspended: 'maintenance',
  hold: 'maintenance',

  // cleaning / reconciling / syncing (transient system states)
  reconciling: 'cleaning',
  syncing: 'cleaning',
  processing: 'cleaning',

  // AuditHistoryModal REOPEN action -> resulting "open" state
  reopen: 'inoculated',
};

/** Normalise a status/action string to a PhaseKey. Case- and separator-
 * insensitive ("Partially Paid", "partially_paid", "PARTIALLY-PAID" all hit
 * the same entry). Unmapped/unknown values fall back to `empty` (draft/
 * not-started slate) rather than guessing at a more specific meaning. */
export function statusToPhaseKey(status: string | undefined | null): PhaseKey {
  if (!status) return 'empty';
  const key = status.toLowerCase().replace(/[\s_-]/g, '');
  return STATUS_PHASE_MAP[key] ?? 'empty';
}
