/**
 * Protocol status extrapolates onto the phase map (spec §5.2): draft ->
 * empty (not yet in force), active -> fruiting (approved/live), retired ->
 * decommissioned (archived, out of use). Shared across every protocols
 * screen that renders a status chip.
 */
import type { PhaseKey } from '@a64core/shared';
import type { ProtocolStatus } from '../../types/protocols';

export const PROTOCOL_STATUS_TO_PHASE: Record<ProtocolStatus, PhaseKey> = {
  draft: 'empty',
  active: 'fruiting',
  retired: 'decommissioned',
};
