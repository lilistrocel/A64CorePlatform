/**
 * FarmCard Component
 *
 * Displays a single farm in a rich card layout with:
 * - Icon badge + title block + status badge header
 * - 3-stat metric grid (area, blocks, active plantings)
 * - Yield achievement progress bar (actual vs predicted)
 * - Block state pill row (all states, always visible)
 * - Action button row (mobile 2-up layout)
 *
 * Self-contained: same props used in FarmList and dashboard View Farms tab.
 * Mobile-ready down to 280px width.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Mountain, MapPin, User, BarChart3, ArrowUp } from 'lucide-react';
import { glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { Theme, PhaseKey } from '@a64core/shared';
import type { Farm, FarmSummary } from '../../types/farm';
import { formatNumber } from '../../utils';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FarmCardProps {
  farm: Farm;
  summary?: FarmSummary;
  onEdit?: (farmId: string) => void;
  onDelete?: (farmId: string) => void;
  onViewStatistics?: (farmId: string, farmName: string) => void;
}

// ============================================================================
// YIELD ACHIEVEMENT HELPERS
// ============================================================================

/** Band thresholds mapped to theme tokens (brand semantic colors, not fixed hexes) */
type YieldColor = string;

function getYieldColor(ratio: number, hasData: boolean, theme: Theme): YieldColor {
  if (!hasData) return theme.colors.muted;           // grey   — no data
  if (ratio >= 0.9) return theme.colors.success;      // emerald — >= 90%
  // Night Observatory (T-901): gold is budget-limited to ~4 elements per
  // view (spec §3) and reserved for the literal Harvesting phase — this is a
  // continuous yield metric, not a status, so the mid band uses bright.terra
  // instead of the old `warning` (gold-b) token to stay off the gold budget.
  if (ratio >= 0.7) return theme.colors.bright.terra; // terra   — 70–89%
  return theme.colors.error;                          // coral   — < 70%
}

// ============================================================================
// BLOCK STATE PILL DEFINITIONS
// ============================================================================

interface StatePillDef {
  key: keyof FarmSummary['blocksByState'];
  label: string;
  color: string;
}

/**
 * Ordered list of states to always render in the pill row.
 * Maps the FarmSummary.blocksByState keys to display info.
 * Note: FarmSummary uses "growing" for what the UI calls "Planted".
 * A function (not a module-level constant) because it needs the runtime theme.
 *
 * Night Observatory (T-901, spec §5.2): block lifecycle states route through
 * the single `colors.phase.*` vocabulary rather than the old ad-hoc
 * success/warning/error/primary tokens. `harvesting` is the one legitimate
 * use of gold here — this literally IS the harvest phase (spec §5.1's own
 * reservation for that colour), not a repurposed "pending"/"warning" state.
 */
function getStatePillDefs(theme: Theme): StatePillDef[] {
  return [
    { key: 'empty',      label: 'Empty',      color: theme.colors.phase.empty },
    { key: 'planned',    label: 'Planned',    color: theme.colors.phase.preparing },
    { key: 'growing',    label: 'Planted',    color: theme.colors.phase.colonizing },
    { key: 'harvesting', label: 'Harvesting', color: theme.colors.phase.harvesting },
    { key: 'alert',      label: 'Alert',      color: theme.colors.phase.quarantined },
  ];
}

/** Farm-level active/inactive → the same phase vocabulary (spec §5.2:
 * "open / active / in progress" → inoculated; anything else that isn't a
 * real workflow status falls to `decommissioned`, the dim/neutral phase). */
function getFarmStatusPhase(isActive: boolean): PhaseKey {
  return isActive ? 'inoculated' : 'decommissioned';
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div`
  ${glassPanelHover}
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 480px) {
    padding: 16px;
    gap: 14px;
  }
`;

/* ---- Header ---- */

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
  flex: 1 1 0;
`;

const IconBadge = styled.div`
  width: 56px;
  height: 56px;
  min-width: 56px;
  border-radius: 12px;
  background: rgba(107, 138, 224, 0.12);
  border: 1px solid rgba(107, 138, 224, 0.35);
  color: ${({ theme }) => theme.colors.bright.lapis};
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 480px) {
    width: 48px;
    height: 48px;
    min-width: 48px;
    border-radius: 10px;
  }
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
`;

const FarmTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  /* Allow wrapping at narrow widths — more readable than ellipsis at 280px */
  word-break: break-word;
  line-height: 1.3;

  @media (max-width: 480px) {
    font-size: 18px;
  }
`;

const FarmCodeChip = styled.span`
  ${monoLabel}
  display: inline-flex;
  align-items: center;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
`;


const MetaLine = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  flex-wrap: wrap;
  min-width: 0;
`;

const StatusBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
  flex-shrink: 0;
  white-space: nowrap;
  align-self: flex-start;
`;

/* ---- Metric grid ---- */

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
`;

/* Second glass layer inside the (already glass) Card would turn to mud per
   spec §2's two-layer nesting rule — a plain \`line\` border with no fill
   instead of a nested glassPanel/glassControl. */
const MetricCard = styled.div`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  padding: 12px;
  min-width: 0;
`;

const MetricLabel = styled.span`
  ${monoLabel}
  display: block;
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const MetricValue = styled.span`
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-word;

  @media (max-width: 480px) {
    font-size: 16px;
  }
`;

const MetricSubValue = styled.span`
  font-size: 13px;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

/* ---- Yield achievement bar ---- */

const YieldSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const YieldTopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const YieldLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const YieldPercentGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const YieldPercent = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const OverflowChip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  border-radius: 9999px;
  background: ${({ $color }) => $color}22;
  color: ${({ $color }) => $color};
  font-size: 11px;
  font-weight: 600;
`;

const BarTrack = styled.div`
  height: 8px;
  border-radius: 9999px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  overflow: hidden;
`;

const BarFill = styled.div<{ $width: number; $color: string }>`
  height: 100%;
  width: ${({ $width }) => $width}%;
  border-radius: 9999px;
  background: ${({ $color }) => $color};
  transition: width 250ms ease-out;
`;

const YieldBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  flex-wrap: wrap;
`;

const NoYieldText = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`;

/* ---- Block state pill row ---- */

const StatePillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const StatePill = styled.span<{ $color: string; $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  background: ${({ $color, $active }) => ($active ? `${$color}18` : 'transparent')};
  color: ${({ $color, $active, theme }) =>
    $active ? $color : theme.colors.muted};
  border: 1px solid ${({ $color, $active, theme }) =>
    $active ? `${$color}44` : theme.colors.neutral[200]};
  transition: all 150ms ease-in-out;
`;

const StateDot = styled.span<{ $color: string; $active: boolean }>`
  width: 6px;
  height: 6px;
  min-width: 6px;
  border-radius: 50%;
  background: ${({ $color, $active, theme }) =>
    $active ? $color : theme.colors.neutral[400]};
`;

/* ---- Action row ---- */

const ActionsRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;

  ${({ $variant, theme }) => {
    // Night Observatory (T-901, spec §3/§4): a card repeated many times per
    // grid can't each carry the gold "primary CTA" treatment — that budget
    // belongs to the page's single Create action (FarmList). "View" instead
    // gets glass + celeste (emphasis without gold); Edit/Statistics are
    // plain glass secondary; Delete is coral-tinted glass, never solid red.
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.glass.base};
        color: ${theme.colors.celeste};
        border: 1px solid rgba(180, 200, 220, 0.35);
        &:hover { background: ${theme.colors.glass.hi}; }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: rgba(240, 138, 112, 0.12);
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover { background: rgba(240, 138, 112, 0.2); }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.onDark};
      border: 1px solid ${theme.colors.glass.border};
      &:hover { background: ${theme.colors.glass.hi}; }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:active {
    transform: scale(0.98);
  }

  /* Under 360px: pair up 2-per-row */
  @media (max-width: 360px) {
    flex: 1 1 calc(50% - 4px);
    min-height: 44px;
    padding: 10px 8px;
    font-size: 13px;
  }

  @media (max-width: 480px) {
    min-height: 44px;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmCard({ farm, summary, onEdit, onDelete, onViewStatistics }: FarmCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();

  // --- Event handlers (stopPropagation keeps button clicks from triggering card nav) ---

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    navigate(`/farm/farms/${farm.farmId}`);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/farm/farms/${farm.farmId}`);
  };

  const handleStatistics = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewStatistics?.(farm.farmId, farm.name);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(farm.farmId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${farm.name}"?`)) {
      onDelete?.(farm.farmId);
    }
  };

  // --- Location string ---
  const locationText = [farm.location?.city, farm.location?.state, farm.location?.country]
    .filter(Boolean)
    .join(', ');

  // --- Manager / staff meta line ---
  const managerDisplay = farm.owner ?? null;
  const staffCount = farm.numberOfStaff ?? 0;
  const managerLine =
    managerDisplay
      ? `${managerDisplay}${staffCount > 0 ? ` · ${staffCount} staff` : ''}`
      : staffCount > 0
        ? `${staffCount} staff`
        : null;

  // --- Yield achievement computations ---
  const predicted = summary?.predictedYield ?? 0;
  const actual    = summary?.actualYield    ?? 0;
  const hasYieldData = predicted > 0 || actual > 0;
  const ratio = predicted > 0 ? actual / predicted : 0;
  const cappedPercent = Math.min(100, ratio * 100);
  const displayPercent = Math.round(ratio * 100);
  const overflowPercent = ratio > 1 ? Math.round((ratio - 1) * 100) : 0;
  const yieldColor = getYieldColor(ratio, hasYieldData, theme);

  // --- Block counts ---
  const physicalCount = summary?.physicalBlocks ?? summary?.totalBlocks;
  const virtualCount  = summary?.virtualBlocks;

  return (
    <Card onClick={handleCardClick}>

      {/* 1. Header row */}
      <CardHeader>
        <HeaderLeft>
          <IconBadge aria-hidden="true">
            <Mountain size={24} strokeWidth={1.6} />
          </IconBadge>
          <TitleBlock>
            <TitleRow>
              <FarmTitle>{farm.name}</FarmTitle>
              {farm.farmCode && <FarmCodeChip>{farm.farmCode}</FarmCodeChip>}
            </TitleRow>
            {locationText && (
              <MetaLine>
                <MapPin size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>{locationText}</span>
              </MetaLine>
            )}
            {managerLine && (
              <MetaLine>
                <User size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>{managerLine}</span>
              </MetaLine>
            )}
          </TitleBlock>
        </HeaderLeft>
        <StatusBadge $phase={getFarmStatusPhase(farm.isActive)}>
          {farm.isActive ? 'Active' : 'Inactive'}
        </StatusBadge>
      </CardHeader>

      {/* 2. Metric grid */}
      <MetricGrid>
        <MetricCard>
          <MetricLabel>Total Area</MetricLabel>
          <MetricValue>
            {farm.totalArea ? `${formatNumber(farm.totalArea, { decimals: 1 })} ha` : '—'}
          </MetricValue>
        </MetricCard>

        <MetricCard>
          <MetricLabel>Blocks</MetricLabel>
          <MetricValue>
            {physicalCount !== undefined ? formatNumber(physicalCount) : '—'}
            {virtualCount !== undefined && (
              <MetricSubValue> ({formatNumber(virtualCount)})</MetricSubValue>
            )}
          </MetricValue>
        </MetricCard>

        <MetricCard>
          <MetricLabel>Active Plantings</MetricLabel>
          <MetricValue>
            {formatNumber(summary?.activePlantings ?? 0)}
          </MetricValue>
        </MetricCard>
      </MetricGrid>

      {/* 3. Yield achievement bar */}
      <YieldSection>
        <YieldTopRow>
          <YieldLabel>Yield Achievement</YieldLabel>
          <YieldPercentGroup>
            {hasYieldData && (
              <YieldPercent>{displayPercent}%</YieldPercent>
            )}
            {overflowPercent > 0 && (
              <OverflowChip $color={yieldColor}>
                <ArrowUp size={10} strokeWidth={2} /> +{overflowPercent}% over
              </OverflowChip>
            )}
          </YieldPercentGroup>
        </YieldTopRow>

        <BarTrack aria-label={`Yield achievement: ${displayPercent}%`}>
          <BarFill $width={cappedPercent} $color={yieldColor} />
        </BarTrack>

        {hasYieldData ? (
          <YieldBottomRow>
            <span>{formatNumber(actual, { decimals: 0 })} kg actual</span>
            <span>{formatNumber(predicted, { decimals: 0 })} kg predicted</span>
          </YieldBottomRow>
        ) : (
          <NoYieldText>No yield data — start a planting to see this</NoYieldText>
        )}
      </YieldSection>

      {/* 4. Block state pill row — always rendered, greyed when count is 0 */}
      {summary && (
        <StatePillRow role="list" aria-label="Blocks by state">
          {getStatePillDefs(theme).map(({ key, label, color }) => {
            const count = summary.blocksByState[key] ?? 0;
            const active = count > 0;
            return (
              <StatePill
                key={key}
                $color={color}
                $active={active}
                role="listitem"
                aria-label={`${label}: ${count}`}
              >
                <StateDot $color={color} $active={active} aria-hidden="true" />
                {count} {label}
              </StatePill>
            );
          })}
        </StatePillRow>
      )}

      {/* 5. Action row */}
      <ActionsRow>
        <ActionButton $variant="primary" onClick={handleView}>
          View
        </ActionButton>
        {onViewStatistics && (
          <ActionButton $variant="secondary" onClick={handleStatistics}>
            <BarChart3 size={13} strokeWidth={1.6} /> Statistics
          </ActionButton>
        )}
        {onEdit && (
          <ActionButton $variant="secondary" onClick={handleEdit}>
            Edit
          </ActionButton>
        )}
        {onDelete && (
          <ActionButton $variant="danger" onClick={handleDelete}>
            Delete
          </ActionButton>
        )}
      </ActionsRow>
    </Card>
  );
}
