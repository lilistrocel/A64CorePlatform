/**
 * AreaBudgetBar — Shared area-budget stacked bar component.
 *
 * Renders a horizontal track with:
 *   - Green segment: already-committed used area
 *   - Optional red segment: projected new planting area (omit for current-only view)
 *   - Neutral background: remaining capacity
 *
 * Extracted from AddVirtualCropModal; used in both the virtual-crop modal and
 * PhysicalBlockCard to keep a single visual source of truth.
 */

import styled, { useTheme } from 'styled-components';

// ============================================================================
// PUBLIC PROPS INTERFACE
// ============================================================================

export interface AreaBudgetBarProps {
  /** Already-committed used area in m² */
  usedAreaM2: number;
  /** Block total area in m² */
  totalAreaM2: number;
  /**
   * Optional projected new planting area in m² (shown as red segment).
   * Omit or pass undefined for a current-only (green-only) view.
   */
  newAreaM2?: number;
  /**
   * Display unit for the summary text line.
   * - 'ha'  → value / 10000, 2 decimal places + ' ha'
   * - 'm2'  → value.toFixed(1) + ' m²'
   * Defaults to 'm2'.
   */
  displayUnit?: 'ha' | 'm2';
  /**
   * Whether to render the "{available} available · {used} used · {total} total" line.
   * Defaults to true.
   */
  showSummary?: boolean;
}

// ============================================================================
// STYLED COMPONENTS (internal — match the originals in AddVirtualCropModal)
// ============================================================================

/**
 * Stacked area-budget track.
 * Green (existing) + optional red (new) + neutral background (remaining).
 */
const AreaBudgetBarTrack = styled.div`
  width: 100%;
  height: 24px;
  background: ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;
  display: flex;
`;

const AreaBudgetBarSegment = styled.div<{ $widthPct: number; $color: string }>`
  width: ${({ $widthPct }) => Math.min($widthPct, 100)}%;
  background: ${({ $color }) => $color};
  transition: width 300ms ease-in-out;
  flex-shrink: 0;
`;

const SummaryText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: 8px;
`;

// ============================================================================
// HELPERS
// ============================================================================

function formatArea(valueM2: number, unit: 'ha' | 'm2'): string {
  if (unit === 'ha') {
    return `${(valueM2 / 10000).toFixed(2)} ha`;
  }
  return `${valueM2.toFixed(1)} m²`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AreaBudgetBar({
  usedAreaM2,
  totalAreaM2,
  newAreaM2,
  displayUnit = 'm2',
  showSummary = true,
}: AreaBudgetBarProps) {
  // Green segment: used area capped at 100%
  const usedPct = totalAreaM2 > 0 ? Math.min((usedAreaM2 / totalAreaM2) * 100, 100) : 0;

  // Red segment: projected new area, capped at remaining bar space (avoids overflow past 100%)
  const newPct =
    totalAreaM2 > 0 && newAreaM2 != null
      ? Math.min((newAreaM2 / totalAreaM2) * 100, 100 - usedPct)
      : 0;

  // Summary figures: available = total − used (committed); newArea handled by the caller
  const availableM2 = Math.max(0, totalAreaM2 - usedAreaM2);

  const ariaLabel =
    newAreaM2 != null ? 'Projected area budget' : 'Current area budget';

  const theme = useTheme();

  return (
    <>
      <AreaBudgetBarTrack aria-label={ariaLabel}>
        <AreaBudgetBarSegment $widthPct={usedPct} $color={theme.colors.success} />
        {newAreaM2 != null && (
          <AreaBudgetBarSegment $widthPct={newPct} $color={theme.colors.error} />
        )}
      </AreaBudgetBarTrack>

      {showSummary && (
        <SummaryText>
          {formatArea(availableM2, displayUnit)} available
          {' · '}
          {formatArea(usedAreaM2, displayUnit)} used
          {' · '}
          {formatArea(totalAreaM2, displayUnit)} total
        </SummaryText>
      )}
    </>
  );
}
