/**
 * StatusBadge — the shared finance status pill (spec §4 "Badge / pill").
 * Renders the Night Observatory phase-badge pattern (radius 99px, Space Mono
 * uppercase, glowing dot, text = phase colour, background/border = phase
 * tints) for any finance status string, via `statusToPhaseKey` (statusPhase.ts).
 *
 * One shared component, not a per-page switch statement — spec §5.2 note:
 * "there is one place to change" period/approval/payment/JE/invoice status
 * colours across this shard.
 */
import styled from 'styled-components';
import { phaseBadge, type PhaseKey } from '@a64core/shared';
import { statusToPhaseKey } from './statusPhase';

export interface StatusBadgeProps {
  /** Raw status/action string, e.g. "approved", "PENDING", "partially_paid". */
  status: string;
  /** Override display text — defaults to `status` as-is (label always carries
   * the meaning, colour is never the only signal, per spec §9). */
  label?: string;
  className?: string;
}

const Pill = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const phase = statusToPhaseKey(status);
  return (
    <Pill $phase={phase} className={className}>
      {label ?? status}
    </Pill>
  );
}
