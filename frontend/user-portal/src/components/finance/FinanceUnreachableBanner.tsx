/**
 * FinanceUnreachableBanner — Wave 0 (T-059.3)
 *
 * Amber banner shown at the top of purchasing forms when finance is
 * enabled for the tenant but the service is currently unreachable.
 *
 * Renders nothing in the (common) reachable case, so callers can drop
 * it into any form without conditional logic at the call site.
 */

import styled from 'styled-components';
import { useFinanceUnreachable } from '../../hooks/useCapabilities';

// Night Observatory: text must be the warning colour itself (gold-b) on the
// warningBg tint, not `gold[800]` — that ramp step is a dark-cream-ground
// shade (#6B5A24) that reads as nearly invisible on the Cosmos Ink ground.
// Same "text = phase colour, background = phase tint" rule as the badge
// pattern (spec §4).
const Banner = styled.div`
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.warning};
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.warning};
  box-shadow: 0 0 8px ${({ theme }) => theme.colors.warning};
  display: inline-block;
  flex-shrink: 0;
`;

export function FinanceUnreachableBanner() {
  const unreachable = useFinanceUnreachable();
  if (!unreachable) return null;

  return (
    <Banner role="alert" aria-live="polite">
      <Dot />
      <span>
        <strong>Finance service is starting up / unreachable.</strong>{' '}
        Tax-code and cost-centre dropdowns are showing free-text fallback —
        values you enter will be persisted as typed and validated once
        finance is back.
      </span>
    </Banner>
  );
}
