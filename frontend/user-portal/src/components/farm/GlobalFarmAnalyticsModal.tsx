/**
 * GlobalFarmAnalyticsModal Component
 *
 * Comprehensive modal displaying system-wide statistics across all farms.
 * Provides global insights with 4 tabs:
 * - System Overview (aggregated metrics, utilization, system-wide stats)
 * - Farm Comparison (sortable table comparing all farms)
 * - Production Timeline (global yield timeline chart)
 * - Performance Insights (top performers, farms needing attention, trends)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useGlobalAnalytics } from '../../hooks/farm/useGlobalAnalytics';
import type { TimePeriod, FarmSummary } from '../../types/global-analytics';
import { TIME_PERIOD_OPTIONS } from '../../types/global-analytics';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface GlobalFarmAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

type TabType = 'overview' | 'comparison' | 'timeline' | 'insights';

const TABS: Array<{ key: TabType; label: string; icon: string }> = [
  { key: 'overview', label: 'System Overview', icon: '🌍' },
  { key: 'comparison', label: 'Farm Comparison', icon: '📊' },
  { key: 'timeline', label: 'Production Timeline', icon: '📈' },
  { key: 'insights', label: 'Performance Insights', icon: '💡' },
];

const STATE_COLORS: Record<string, string> = {
  empty: '#6B7280',
  planned: '#3B82F6',
  growing: '#10B981',
  fruiting: '#A855F7',
  harvesting: '#F59E0B',
  cleaning: '#F97316',
  alert: '#EF4444',
};

const STATE_LABELS: Record<string, string> = {
  empty: 'Empty',
  planned: 'Planned',
  growing: 'Growing',
  fruiting: 'Fruiting',
  harvesting: 'Harvesting',
  cleaning: 'Cleaning',
  alert: 'Alert',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function GlobalFarmAnalyticsModal({ isOpen, onClose }: GlobalFarmAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const { analytics, loading, error, refetch } = useGlobalAnalytics(period);

  // Reset to overview tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('overview');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingText>Loading global analytics...</LoadingText>
        </LoadingContainer>
      );
    }

    if (error) {
      return (
        <ErrorContainer>
          <ErrorIcon>❌</ErrorIcon>
          <ErrorTitle>Failed to load global analytics</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
          <RetryButton onClick={refetch}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    if (!analytics) {
      return (
        <EmptyContainer>
          <EmptyIcon>🌍</EmptyIcon>
          <EmptyText>No global analytics data available</EmptyText>
        </EmptyContainer>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewTab analytics={analytics} />;
      case 'comparison':
        return <ComparisonTab analytics={analytics} />;
      case 'timeline':
        return <TimelineTab analytics={analytics} />;
      case 'insights':
        return <InsightsTab analytics={analytics} />;
      default:
        return null;
    }
  };

  const modalContent = (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <ModalHeader>
          <HeaderLeft>
            <ModalTitle>🌍 Global Farm Statistics</ModalTitle>
            <SystemInfo>
              <InfoText>Production insights across all farms</InfoText>
            </SystemInfo>
          </HeaderLeft>
          <HeaderRight>
            <PeriodFilter>
              <PeriodLabel>Period:</PeriodLabel>
              <PeriodSelect value={period} onChange={(e) => handlePeriodChange(e.target.value as TimePeriod)}>
                {TIME_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </PeriodSelect>
            </PeriodFilter>
            <CloseButton onClick={onClose} aria-label="Close modal">
              ×
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* Tabs */}
        <TabsContainer>
          {TABS.map((tab) => (
            <Tab key={tab.key} $active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
              <TabIcon>{tab.icon}</TabIcon>
              <TabLabel>{tab.label}</TabLabel>
            </Tab>
          ))}
        </TabsContainer>

        {/* Content */}
        <ModalBody>{renderContent()}</ModalBody>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OverviewTab({ analytics }: { analytics: any }) {
  if (!analytics || !analytics.aggregatedMetrics) {
    return <TabContent><EmptyText>Loading overview data...</EmptyText></TabContent>;
  }

  const metrics = analytics.aggregatedMetrics;
  const performanceScore = metrics.avgPerformanceScore ?? 0;
  const performanceColor =
    performanceScore >= 80 ? '#10B981' : performanceScore >= 60 ? '#3B82F6' : performanceScore >= 40 ? '#F59E0B' : '#EF4444';

  // Prepare state breakdown pie chart data
  const stateData = Object.entries(analytics.stateBreakdown)
    .filter(([key]) => key !== 'totalBlocks')
    .map(([state, count]: [string, any]) => ({
      name: STATE_LABELS[state] || state,
      value: count,
      color: STATE_COLORS[state] || '#6B7280',
    }))
    .filter((item) => item.value > 0);

  // Calculate overall trend indicator
  const trendIcon = analytics.performanceInsights?.overallTrend === 'improving' ? '🔼' :
                    analytics.performanceInsights?.overallTrend === 'declining' ? '🔽' : '➡️';
  const trendLabel = analytics.performanceInsights?.overallTrend === 'improving' ? 'Improving' :
                     analytics.performanceInsights?.overallTrend === 'declining' ? 'Declining' : 'Stable';
  const trendColor = analytics.performanceInsights?.overallTrend === 'improving' ? '#10B981' :
                     analytics.performanceInsights?.overallTrend === 'declining' ? '#EF4444' : '#3B82F6';

  return (
    <TabContent>
      {/* Key Metrics */}
      <Section>
        <SectionTitle>System-Wide Metrics</SectionTitle>
        <MetricsGrid>
          <MetricCard>
            <MetricIcon>🏞️</MetricIcon>
            <MetricValue>{metrics.totalFarms}</MetricValue>
            <MetricLabel>Total Farms</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🏗️</MetricIcon>
            <MetricValue>{metrics.totalBlocks}</MetricValue>
            <MetricLabel>Total Blocks</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🌱</MetricIcon>
            <MetricValue>{metrics.totalActivePlantings}</MetricValue>
            <MetricLabel>Active Plantings</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🌾</MetricIcon>
            <MetricValue>{metrics.totalYieldKg.toFixed(1)} kg</MetricValue>
            <MetricLabel>Total Yield</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>📊</MetricIcon>
            <MetricValue>{metrics.avgYieldEfficiencyAcrossFarms.toFixed(1)}%</MetricValue>
            <MetricLabel>Avg Yield Efficiency</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>⭐</MetricIcon>
            <MetricValue $color={performanceColor}>{performanceScore.toFixed(0)}</MetricValue>
            <MetricLabel>Avg Performance Score</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>📦</MetricIcon>
            <MetricValue>{metrics.avgUtilization.toFixed(0)}%</MetricValue>
            <MetricLabel>System Utilization</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🔮</MetricIcon>
            <MetricValue>{metrics.totalPredictedYieldKg.toFixed(1)} kg</MetricValue>
            <MetricLabel>Predicted Yield</MetricLabel>
          </MetricCard>
        </MetricsGrid>
      </Section>

      {/* Overall Trend */}
      <Section>
        <SectionTitle>System Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon>{trendIcon}</TrendIcon>
          <TrendInfo>
            <TrendLabel $color={trendColor}>{trendLabel}</TrendLabel>
            <TrendDescription>
              {analytics.performanceInsights?.overallTrend === 'improving' && 'Overall system performance is improving'}
              {analytics.performanceInsights?.overallTrend === 'stable' && 'System performance is consistent'}
              {analytics.performanceInsights?.overallTrend === 'declining' && 'System performance needs attention'}
              {analytics.performanceInsights?.overallTrend === 'insufficient_data' && 'Not enough data to determine trend'}
            </TrendDescription>
          </TrendInfo>
        </TrendIndicator>
      </Section>

      {/* State Distribution */}
      {stateData.length > 0 && (
        <Section>
          <SectionTitle>Block State Distribution</SectionTitle>
          <ChartContainer>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stateData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.name}: ${entry.value} (${((entry.value / analytics.stateBreakdown.totalBlocks) * 100).toFixed(0)}%)`}
                >
                  {stateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Section>
      )}
    </TabContent>
  );
}

function ComparisonTab({ analytics }: { analytics: any }) {
  const [sortField, setSortField] = useState<keyof FarmSummary>('overallPerformanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  if (!analytics || !analytics.farmSummaries || analytics.farmSummaries.length === 0) {
    return (
      <TabContent>
        <EmptyStateSection>
          <EmptyIcon>📊</EmptyIcon>
          <EmptyText>No farms to compare</EmptyText>
        </EmptyStateSection>
      </TabContent>
    );
  }

  const handleSort = (field: keyof FarmSummary) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedFarms = [...analytics.farmSummaries].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc' ? (aValue > bValue ? 1 : -1) : (bValue > aValue ? 1 : -1);
  });

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#3B82F6';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <TabContent>
      <Section>
        <SectionTitle>Farm Comparison Table</SectionTitle>
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <TableHeader onClick={() => handleSort('farmName')} $sortable>
                  Farm Name {sortField === 'farmName' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('totalBlocks')} $sortable>
                  Total Blocks {sortField === 'totalBlocks' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('activePlantings')} $sortable>
                  Active Plantings {sortField === 'activePlantings' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('totalYieldKg')} $sortable>
                  Total Yield (kg) {sortField === 'totalYieldKg' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('avgYieldEfficiency')} $sortable>
                  Avg Efficiency (%) {sortField === 'avgYieldEfficiency' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('overallPerformanceScore')} $sortable>
                  Performance {sortField === 'overallPerformanceScore' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('currentUtilization')} $sortable>
                  Utilization (%) {sortField === 'currentUtilization' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
              </tr>
            </thead>
            <tbody>
              {sortedFarms.map((farm) => (
                <TableRow key={farm.farmId}>
                  <TableCell $bold>{farm.farmName}</TableCell>
                  <TableCell>{farm.totalBlocks}</TableCell>
                  <TableCell>{farm.activePlantings}</TableCell>
                  <TableCell>{farm.totalYieldKg.toFixed(1)}</TableCell>
                  <TableCell>{farm.avgYieldEfficiency.toFixed(1)}</TableCell>
                  <TableCell>
                    <PerformanceScore $color={getPerformanceColor(farm.overallPerformanceScore)}>
                      {farm.overallPerformanceScore.toFixed(0)}
                    </PerformanceScore>
                  </TableCell>
                  <TableCell>{farm.currentUtilization.toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Section>
    </TabContent>
  );
}

function TimelineTab({ analytics }: { analytics: any }) {
  if (!analytics || !analytics.yieldTimeline) {
    return <TabContent><EmptyText>Loading timeline data...</EmptyText></TabContent>;
  }

  const hasYieldData = analytics.yieldTimeline && analytics.yieldTimeline.length > 0;

  // Calculate cumulative metrics
  let cumulativeYield = 0;
  const timelineWithCumulative = analytics.yieldTimeline.map((point: any) => {
    cumulativeYield += point.totalYieldKg;
    return {
      ...point,
      cumulativeYield,
    };
  });

  return (
    <TabContent>
      {hasYieldData ? (
        <>
          {/* Yield Timeline Chart */}
          <Section>
            <SectionTitle>Production Timeline</SectionTitle>
            <ChartContainer>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timelineWithCumulative}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis yAxisId="left" label={{ value: 'Daily Yield (kg)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Cumulative (kg)', angle: 90, position: 'insideRight' }} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value: number, name: string) => {
                      if (name === 'Daily Yield' || name === 'Cumulative Yield') return [`${value.toFixed(2)} kg`, name];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="totalYieldKg" stroke="#10B981" name="Daily Yield" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="cumulativeYield" stroke="#3B82F6" name="Cumulative Yield" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </Section>

          {/* Harvest Metrics */}
          <Section>
            <SectionTitle>Harvest Metrics</SectionTitle>
            <MetricsGrid>
              <MetricCard>
                <MetricIcon>🌾</MetricIcon>
                <MetricValue>{analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.harvestCount, 0)}</MetricValue>
                <MetricLabel>Total Harvests</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricIcon>🏞️</MetricIcon>
                <MetricValue>{analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.farmCount, 0) / analytics.yieldTimeline.length}</MetricValue>
                <MetricLabel>Avg Farms Harvesting</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricIcon>📊</MetricIcon>
                <MetricValue>
                  {(analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.totalYieldKg, 0) / analytics.yieldTimeline.length).toFixed(1)} kg
                </MetricValue>
                <MetricLabel>Avg Daily Yield</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricIcon>🔝</MetricIcon>
                <MetricValue>
                  {Math.max(...analytics.yieldTimeline.map((p: any) => p.totalYieldKg)).toFixed(1)} kg
                </MetricValue>
                <MetricLabel>Peak Daily Yield</MetricLabel>
              </MetricCard>
            </MetricsGrid>
          </Section>
        </>
      ) : (
        <EmptyStateSection>
          <EmptyIcon>📈</EmptyIcon>
          <EmptyText>No production data available for this period</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function InsightsTab({ analytics }: { analytics: any }) {
  if (!analytics || !analytics.performanceInsights) {
    return <TabContent><EmptyText>Loading insights data...</EmptyText></TabContent>;
  }

  const insights = analytics.performanceInsights;

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#3B82F6';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
  };

  const getTrendIcon = () => {
    switch (insights.overallTrend) {
      case 'improving': return '🔼';
      case 'stable': return '➡️';
      case 'declining': return '🔽';
      default: return '➖';
    }
  };

  const getTrendLabel = () => {
    switch (insights.overallTrend) {
      case 'improving': return 'Improving';
      case 'stable': return 'Stable';
      case 'declining': return 'Declining';
      default: return 'Insufficient Data';
    }
  };

  const getTrendColor = () => {
    switch (insights.overallTrend) {
      case 'improving': return '#10B981';
      case 'stable': return '#3B82F6';
      case 'declining': return '#EF4444';
      default: return '#9e9e9e';
    }
  };

  return (
    <TabContent>
      {/* Overall Trend */}
      <Section>
        <SectionTitle>Overall System Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon>{getTrendIcon()}</TrendIcon>
          <TrendInfo>
            <TrendLabel $color={getTrendColor()}>{getTrendLabel()}</TrendLabel>
            <TrendDescription>
              {insights.overallTrend === 'improving' && 'System performance is improving across farms'}
              {insights.overallTrend === 'stable' && 'System performance is consistent across farms'}
              {insights.overallTrend === 'declining' && 'System performance declining - multiple farms need attention'}
              {insights.overallTrend === 'insufficient_data' && 'Not enough data to determine system-wide trend'}
            </TrendDescription>
          </TrendInfo>
        </TrendIndicator>
      </Section>

      {/* Top Performing Farms */}
      {insights.topPerformingFarms && insights.topPerformingFarms.length > 0 && (
        <Section>
          <SectionTitle>🏆 Top Performing Farms</SectionTitle>
          <PerformersList>
            {insights.topPerformingFarms.map((farm: FarmSummary, index: number) => (
              <PerformerItem key={farm.farmId}>
                <PerformerRank $rank={index + 1}>{index + 1}</PerformerRank>
                <PerformerInfo>
                  <PerformerName>{farm.farmName}</PerformerName>
                  <PerformerDetails>
                    <span>Performance: {farm.overallPerformanceScore.toFixed(0)}/100</span>
                    <span>Yield: {farm.totalYieldKg.toFixed(1)} kg</span>
                    <span>Efficiency: {farm.avgYieldEfficiency.toFixed(1)}%</span>
                  </PerformerDetails>
                </PerformerInfo>
              </PerformerItem>
            ))}
          </PerformersList>
        </Section>
      )}

      {/* Farms Needing Attention */}
      {insights.farmsNeedingAttention && insights.farmsNeedingAttention.length > 0 && (
        <Section>
          <SectionTitle>⚠️ Farms Needing Attention</SectionTitle>
          <AttentionList>
            {insights.farmsNeedingAttention.map((farm: FarmSummary) => (
              <AttentionItem key={farm.farmId}>
                <AttentionInfo>
                  <AttentionName>{farm.farmName}</AttentionName>
                  <AttentionDetails>
                    <PerformanceBadge $score={farm.overallPerformanceScore}>
                      Performance: {farm.overallPerformanceScore.toFixed(0)}%
                    </PerformanceBadge>
                    {farm.currentUtilization < 50 && (
                      <UtilizationBadge>Low Utilization: {farm.currentUtilization.toFixed(0)}%</UtilizationBadge>
                    )}
                  </AttentionDetails>
                </AttentionInfo>
              </AttentionItem>
            ))}
          </AttentionList>
        </Section>
      )}

      {/* Under Performing Farms */}
      {insights.underPerformingFarms && insights.underPerformingFarms.length > 0 && (
        <Section>
          <SectionTitle>📉 Under Performing Farms</SectionTitle>
          <UnderPerformersList>
            {insights.underPerformingFarms.map((farm: FarmSummary) => (
              <UnderPerformerItem key={farm.farmId}>
                <UnderPerformerName>{farm.farmName}</UnderPerformerName>
                <UnderPerformerMetrics>
                  <MetricBadge $color={getPerformanceColor(farm.overallPerformanceScore)}>
                    Score: {farm.overallPerformanceScore.toFixed(0)}
                  </MetricBadge>
                  <MetricBadge $color="#757575">
                    Yield: {farm.totalYieldKg.toFixed(1)} kg
                  </MetricBadge>
                  <MetricBadge $color="#757575">
                    Efficiency: {farm.avgYieldEfficiency.toFixed(1)}%
                  </MetricBadge>
                </UnderPerformerMetrics>
              </UnderPerformerItem>
            ))}
          </UnderPerformersList>
        </Section>
      )}
    </TabContent>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: 1100;
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 1400px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  @media (max-width: 768px) {
    max-width: 100%;
    max-height: 95vh;
  }
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  flex-shrink: 0;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const SystemInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #616161;
`;

const InfoText = styled.span`
  font-weight: 500;
  color: #757575;
`;

const PeriodFilter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PeriodLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #616161;
`;

const PeriodSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  color: #212121;
  background: white;
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 32px;
  color: #757575;
  cursor: pointer;
  padding: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
    color: #212121;
  }
`;

const TabsContainer = styled.div`
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  background: #fafafa;
  overflow-x: auto;
  flex-shrink: 0;

  @media (max-width: 768px) {
    overflow-x: scroll;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 20px;
  border: none;
  background: ${({ $active }) => ($active ? 'white' : 'transparent')};
  color: ${({ $active }) => ($active ? '#3b82f6' : '#616161')};
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? '600' : '500')};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#3b82f6' : 'transparent')};
  white-space: nowrap;

  &:hover {
    background: ${({ $active }) => ($active ? 'white' : '#f0f0f0')};
  }
`;

const TabIcon = styled.span`
  font-size: 16px;
`;

const TabLabel = styled.span``;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  background: #fafafa;
`;

const TabContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 16px 0;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
`;

const MetricCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  text-align: center;
`;

const MetricIcon = styled.div`
  font-size: 32px;
`;

const MetricValue = styled.div<{ $color?: string }>`
  font-size: 28px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#212121'};
  line-height: 1;
`;

const MetricLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ChartContainer = styled.div`
  width: 100%;
  margin-top: 16px;
`;

const TrendIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const TrendIcon = styled.div`
  font-size: 64px;
`;

const TrendInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TrendLabel = styled.div<{ $color: string }>`
  font-size: 24px;
  font-weight: 700;
  color: ${({ $color }) => $color};
`;

const TrendDescription = styled.div`
  font-size: 14px;
  color: #757575;
`;

const TableContainer = styled.div`
  overflow-x: auto;
  margin-top: 16px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`;

const TableHeader = styled.th<{ $sortable?: boolean }>`
  text-align: left;
  padding: 12px;
  background: #f5f5f5;
  font-weight: 600;
  color: #616161;
  border-bottom: 2px solid #e0e0e0;
  white-space: nowrap;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    background: ${({ $sortable }) => ($sortable ? '#eeeeee' : '#f5f5f5')};
  }
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #e0e0e0;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f9f9f9;
  }
`;

const TableCell = styled.td<{ $bold?: boolean }>`
  padding: 12px;
  color: #212121;
  font-weight: ${({ $bold }) => ($bold ? '600' : '400')};
`;

const PerformanceScore = styled.span<{ $color: string }>`
  font-weight: 700;
  color: ${({ $color }) => $color};
`;

const PerformersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PerformerItem = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const PerformerRank = styled.div<{ $rank: number }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: ${({ $rank }) => {
    if ($rank === 1) return 'linear-gradient(135deg, #FFD700, #FFA500)';
    if ($rank === 2) return 'linear-gradient(135deg, #C0C0C0, #A0A0A0)';
    if ($rank === 3) return 'linear-gradient(135deg, #CD7F32, #8B4513)';
    return '#e0e0e0';
  }};
  color: white;
  flex-shrink: 0;
`;

const PerformerInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PerformerName = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #212121;
`;

const PerformerDetails = styled.div`
  font-size: 13px;
  color: #757575;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const AttentionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const AttentionItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff3cd;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
`;

const AttentionInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const AttentionName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
`;

const AttentionDetails = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const PerformanceBadge = styled.span<{ $score: number }>`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${({ $score }) => ($score < 40 ? '#fee' : '#fef3cd')};
  color: ${({ $score }) => ($score < 40 ? '#c00' : '#f59e0b')};
  font-weight: 500;
`;

const UtilizationBadge = styled.span`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 500;
`;

const UnderPerformersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const UnderPerformerItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fee;
  border-left: 4px solid #ef4444;
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const UnderPerformerName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
`;

const UnderPerformerMetrics = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const MetricBadge = styled.span<{ $color: string }>`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${({ $color }) => `${$color}20`};
  color: ${({ $color }) => $color};
  font-weight: 500;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  font-size: 16px;
  color: #616161;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
`;

const ErrorIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const ErrorTitle = styled.div`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin-bottom: 8px;
`;

const ErrorMessage = styled.div`
  font-size: 14px;
  color: #616161;
  margin-bottom: 24px;
`;

const RetryButton = styled.button`
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  background: #3b82f6;
  color: white;
  border: none;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #2563eb;
  }
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
`;

const EmptyStateSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  background: white;
  border-radius: 12px;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 16px;
  color: #757575;
`;
