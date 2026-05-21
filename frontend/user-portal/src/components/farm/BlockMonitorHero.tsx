/**
 * BlockMonitorHero Component
 *
 * Pure-presentational 4-stat hero row showing the key virtual-block summary
 * metrics from DashboardSummary. Extracted from DashboardHeader so it can be
 * reused inside FarmDetail's Blocks tab header without duplicating markup.
 *
 * Props
 * -----
 * summary: DashboardSummary — the data object returned by useDashboardData.
 *
 * Fields displayed:
 *  1. Total Blocks        — summary.totalBlocks
 *  2. Active Plantings    — summary.totalActivePlantings
 *  3. Avg Yield Efficiency — summary.avgYieldEfficiency (formatted X.X%)
 *  4. Total Predicted Yield — summary.totalPredictedYieldKg (X kg)
 *
 * The >=100% / >=70% badges on the efficiency card are preserved.
 */

import styled from 'styled-components';
import { formatNumber } from '../../utils';
import type { DashboardSummary } from '../../types/farm';

interface BlockMonitorHeroProps {
  summary: DashboardSummary;
}

export function BlockMonitorHero({ summary }: BlockMonitorHeroProps) {
  return (
    <HeroGrid>
      {/* Stat 1 — Total Blocks (split into Physical / Virtual breakdown) */}
      <HeroCard>
        <HeroIcon aria-hidden="true">🔢</HeroIcon>
        {summary.physicalBlocks !== undefined && summary.virtualBlocks !== undefined ? (
          <BreakdownGrid>
            <BreakdownPair>
              <BreakdownValue>{summary.physicalBlocks}</BreakdownValue>
              <BreakdownPairLabel>Physical</BreakdownPairLabel>
            </BreakdownPair>
            <BreakdownDivider aria-hidden="true" />
            <BreakdownPair>
              <BreakdownValue>{summary.virtualBlocks}</BreakdownValue>
              <BreakdownPairLabel>Virtual</BreakdownPairLabel>
            </BreakdownPair>
          </BreakdownGrid>
        ) : (
          <HeroValue>{summary.totalBlocks}</HeroValue>
        )}
        <HeroLabel>Total Blocks</HeroLabel>
      </HeroCard>

      {/* Stat 2 — Active Plantings */}
      <HeroCard>
        <HeroIcon aria-hidden="true">🌱</HeroIcon>
        <HeroValue>{summary.totalActivePlantings}</HeroValue>
        <HeroLabel>Active Plantings</HeroLabel>
      </HeroCard>

      {/* Stat 3 — Avg Yield Efficiency */}
      <HeroCard>
        <HeroIcon aria-hidden="true">📊</HeroIcon>
        <HeroValue>
          {summary.avgYieldEfficiency > 0
            ? `${summary.avgYieldEfficiency.toFixed(1)}%`
            : 'N/A'}
        </HeroValue>
        <HeroLabel>Avg Yield Efficiency</HeroLabel>
        {summary.avgYieldEfficiency >= 100 && (
          <PerformanceBadge $variant="exceeding">Exceeding Target</PerformanceBadge>
        )}
        {summary.avgYieldEfficiency >= 70 && summary.avgYieldEfficiency < 100 && (
          <PerformanceBadge $variant="good">On Track</PerformanceBadge>
        )}
      </HeroCard>

      {/* Stat 4 — Total Predicted Yield */}
      <HeroCard>
        <HeroIcon aria-hidden="true">🎯</HeroIcon>
        <HeroValue>
          {summary.totalPredictedYieldKg > 0
            ? `${formatNumber(summary.totalPredictedYieldKg, { decimals: 0 })} kg`
            : 'N/A'}
        </HeroValue>
        <HeroLabel>Predicted Yield</HeroLabel>
      </HeroCard>
    </HeroGrid>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
`;

const HeroCard = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 8px;
  text-align: center;
  position: relative;
`;

const HeroIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

const HeroValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: 4px;
`;

/* Two-column breakdown used by the Total Blocks card so Physical and Virtual
   counts are visually distinct rather than collapsed into "X (Y)". */
const BreakdownGrid = styled.div`
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
  margin-bottom: 4px;
`;

const BreakdownPair = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const BreakdownValue = styled.div`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: 1;
`;

const BreakdownPairLabel = styled.div`
  font-size: 10px;
  margin-top: 4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const BreakdownDivider = styled.div`
  width: 1px;
  background: ${({ theme }) => theme.colors.border.subtle};
`;

const HeroLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const PerformanceBadge = styled.div<{ $variant: 'exceeding' | 'good' }>`
  margin-top: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${({ $variant }) => ($variant === 'exceeding' ? '#10B981' : '#3B82F6')};
  color: white;
`;
