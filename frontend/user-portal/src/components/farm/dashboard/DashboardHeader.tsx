/**
 * DashboardHeader Component
 *
 * Displays farm information and aggregated summary statistics.
 * Shows key metrics at a glance.
 */

import styled from 'styled-components';
import type { FarmInfo, DashboardSummary } from '../../../types/farm';

interface DashboardHeaderProps {
  farmInfo: FarmInfo;
  summary: DashboardSummary;
}

export function DashboardHeader({ farmInfo, summary }: DashboardHeaderProps) {
  return (
    <Container>
      {/* Farm Info Section */}
      <FarmInfoSection>
        <FarmName>{farmInfo.name}</FarmName>
        <FarmMeta>
          <MetaItem>
            <MetaIcon>🏷️</MetaIcon>
            <MetaValue>{farmInfo.code}</MetaValue>
          </MetaItem>
          {farmInfo.totalArea && (
            <MetaItem>
              <MetaIcon>📏</MetaIcon>
              <MetaValue>
                {farmInfo.totalArea} {farmInfo.areaUnit}
              </MetaValue>
            </MetaItem>
          )}
          {farmInfo.managerName && (
            <MetaItem>
              <MetaIcon>👤</MetaIcon>
              <MetaValue>{farmInfo.managerName}</MetaValue>
            </MetaItem>
          )}
        </FarmMeta>
      </FarmInfoSection>

      {/* Summary Stats Section */}
      <StatsGrid>
        <StatCard>
          <StatIcon>🔢</StatIcon>
          <StatValue>{summary.totalBlocks}</StatValue>
          <StatLabel>Total Blocks</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon>🌱</StatIcon>
          <StatValue>{summary.totalActivePlantings}</StatValue>
          <StatLabel>Active Plantings</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon>📊</StatIcon>
          <StatValue>
            {summary.avgYieldEfficiency > 0
              ? `${summary.avgYieldEfficiency.toFixed(1)}%`
              : 'N/A'}
          </StatValue>
          <StatLabel>Avg Yield Efficiency</StatLabel>
          {summary.avgYieldEfficiency >= 100 && (
            <PerformanceBadge $type="exceeding">Exceeding Target</PerformanceBadge>
          )}
          {summary.avgYieldEfficiency >= 70 && summary.avgYieldEfficiency < 100 && (
            <PerformanceBadge $type="good">On Track</PerformanceBadge>
          )}
        </StatCard>

        <StatCard>
          <StatIcon>🎯</StatIcon>
          <StatValue>
            {summary.totalPredictedYieldKg > 0
              ? `${summary.totalPredictedYieldKg.toFixed(0)} kg`
              : 'N/A'}
          </StatValue>
          <StatLabel>Predicted Yield</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon>✅</StatIcon>
          <StatValue>
            {summary.totalActualYieldKg > 0
              ? `${summary.totalActualYieldKg.toFixed(0)} kg`
              : 'N/A'}
          </StatValue>
          <StatLabel>Actual Yield</StatLabel>
        </StatCard>

        {/* Alerts Summary */}
        {Object.values(summary.activeAlerts).some((count) => count > 0) && (
          <StatCard>
            <StatIcon>⚠️</StatIcon>
            <AlertsGrid>
              {summary.activeAlerts.critical > 0 && (
                <AlertBadge $severity="critical">
                  {summary.activeAlerts.critical} Critical
                </AlertBadge>
              )}
              {summary.activeAlerts.high > 0 && (
                <AlertBadge $severity="high">
                  {summary.activeAlerts.high} High
                </AlertBadge>
              )}
              {summary.activeAlerts.medium > 0 && (
                <AlertBadge $severity="medium">
                  {summary.activeAlerts.medium} Medium
                </AlertBadge>
              )}
            </AlertsGrid>
            <StatLabel>Active Alerts</StatLabel>
          </StatCard>
        )}
      </StatsGrid>

      {/* Blocks by State */}
      <StateBreakdown>
        <StateTitle>Blocks by State:</StateTitle>
        <StateGrid>
          {Object.entries(summary.blocksByState).map(([state, count]) => (
            <StateChip key={state} $state={state}>
              <StateIcon>{getStateIcon(state)}</StateIcon>
              <StateCount>{count}</StateCount>
              <StateLabel>{formatStateName(state)}</StateLabel>
            </StateChip>
          ))}
        </StateGrid>
      </StateBreakdown>
    </Container>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStateIcon(state: string): string {
  const icons: Record<string, string> = {
    empty: '⚪',
    planned: '🔵',
    planted: '🟢',
    growing: '🌿',
    fruiting: '🍇',
    harvesting: '🧺',
    cleaning: '🧹',
  };
  return icons[state] || '⚫';
}

function formatStateName(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  margin-bottom: 24px;
`;

const FarmInfoSection = styled.div`
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface};
`;

const FarmName = styled.h2`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px 0;
`;

const FarmMeta = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const MetaIcon = styled.span`
  font-size: 16px;
`;

const MetaValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 500;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  text-align: center;
  position: relative;
`;

const StatIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const PerformanceBadge = styled.div<{ $type: 'exceeding' | 'good' }>`
  margin-top: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => (props.$type === 'exceeding' ? '#10B981' : '#3B82F6')};
  color: white;
`;

const AlertsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const AlertBadge = styled.div<{ $severity: 'critical' | 'high' | 'medium' }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: ${(props) => {
    switch (props.$severity) {
      case 'critical':
        return '#DC2626';
      case 'high':
        return '#F59E0B';
      case 'medium':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  }};
  color: white;
`;

const StateBreakdown = styled.div`
  padding-top: 16px;
  border-top: 2px solid ${({ theme }) => theme.colors.surface};
`;

const StateTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
`;

const StateGrid = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const StateChip = styled.div<{ $state: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 20px;
  background: ${(props) => getStateColor(props.$state)}15;
  border: 2px solid ${(props) => getStateColor(props.$state)}40;
`;

const StateIcon = styled.span`
  font-size: 16px;
`;

const StateCount = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StateLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 500;
`;

function getStateColor(state: string): string {
  const colors: Record<string, string> = {
    empty: '#9E9E9E',
    planned: '#3B82F6',
    planted: '#10B981',
    growing: '#84CC16',
    fruiting: '#FBBF24',
    harvesting: '#F59E0B',
    cleaning: '#8B5CF6',
  };
  return colors[state] || '#6B7280';
}
