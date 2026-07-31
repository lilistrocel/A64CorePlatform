/**
 * Canonical Wave 3 sales document-status -> Night Observatory phase-colour
 * map (night-observatory-spec.md §5.2). Every sales list/detail page's
 * status badge routes through this ONE function — do not re-implement the
 * draft/pending_approval/open/partly_closed/closed/cancelled switch per
 * file. This is the single place the T-200.x "shared status vocabulary"
 * (previously A20Core neutral/gold/emerald/lapis/terracotta tokens) now
 * lives, ported onto `colors.phase.*`:
 *
 *   draft             -> empty          (#7E86A6 quiet slate — not started)
 *   pending_approval   -> fruitingInit   (#E8935F terra — awaiting approval)
 *   open               -> inoculated    (#6B8AE0 lapis — active / in progress)
 *   partly_closed       -> colonizing    (#C9CBA4 laurel — partially done)
 *   closed              -> resting       (#C3A0CF lavender — settled / completed)
 *   cancelled           -> decommissioned (#5A5F7D dim — void)
 *
 * NOTE: `harvesting` (gold-b) is deliberately never used here — it is
 * reserved for the literal mushroom harvest phase (spec §5.2's explicit
 * warning). "pending" sales statuses map to `fruitingInit`, not gold.
 *
 * Covers ARInvoiceStatus | ARCreditNoteStatus | CustomerReceiptStatus |
 * QuoteStatus | SalesOrderStatus | DeliveryStatus | ReturnRequestStatus |
 * ReturnNoteStatus (services/salesApi.ts) — all are string subsets of this
 * same six-value vocabulary, so a single loosely-typed helper covers every
 * sales status type without per-doc-type overloads.
 */
import type { PhaseKey } from '@a64core/shared';

export function salesStatusToPhase(status: string): PhaseKey {
  switch (status) {
    case 'draft':
      return 'empty';
    case 'pending_approval':
      return 'fruitingInit';
    case 'open':
      return 'inoculated';
    case 'partly_closed':
      return 'colonizing';
    case 'closed':
      return 'resting';
    case 'cancelled':
      return 'decommissioned';
    default:
      return 'empty';
  }
}
