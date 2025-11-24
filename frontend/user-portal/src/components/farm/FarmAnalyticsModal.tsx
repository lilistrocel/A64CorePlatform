/**
 * FarmAnalyticsModal Component
 *
 * Comprehensive modal displaying farm-level statistics aggregated from all blocks.
 * Provides farm-wide insights with 4 tabs:
 * - Overview (key metrics, state breakdown, top performers)
 * - Block Comparison (sortable table of all blocks)
 * - Historical Trends (yield timeline, performance trends)
 * - Current State Details (blocks by state)
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
import { useFarmAnalytics } from '../../hooks/farm/useFarmAnalytics';
import type { TimePeriod, BlockComparisonItem } from '../../types/farm-analytics';
import { TIME_PERIOD_OPTIONS } from '../../types/farm-analytics';

type BlockState = 'empty' | 'planned' | 'growing' | 'fruiting' | 'harvesting' | 'cleaning' | 'alert';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FarmAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmId: string | null;
  farmName?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

type TabType = 'overview' | 'comparison' | 'trends' | 'states';

const TABS: Array<{ key: TabType; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'comparison', label: 'Block Comparison', icon: '📋' },
  { key: 'trends', label: 'Historical Trends', icon: '📈' },
  { key: 'states', label: 'Current State Details', icon: '🔍' },
];

const STATE_COLORS: Record<string, string> = {
  empty: '#6B7280',
  planned: '#3B82F6',
  planted: '#10B981',
  growing: '#10B981',
  fruiting: '#A855F7',
  harvesting: '#F59E0B',
  cleaning: '#F97316',
  alert: '#EF4444',
};

const STATE_ICONS: Record<string, string> = {
  empty: '⚪',
  planned: '📋',
  growing: '🌱',
  fruiting: '🍇',
  harvesting: '🌾',
  cleaning: '🧹',
  alert: '⚠️',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmAnalyticsModal({ isOpen, onClose, farmId, farmName }: FarmAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const { analytics, loading, error, refetch } = useFarmAnalytics(farmId, period);

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
          <LoadingText>Loading farm analytics...</LoadingText>
        </LoadingContainer>
      );
    }

    if (error) {
      return (
        <ErrorContainer>
          <ErrorIcon>❌</ErrorIcon>
          <ErrorTitle>Failed to load analytics</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
          <RetryButton onClick={refetch}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    if (!analytics) {
      return (
        <EmptyContainer>
          <EmptyIcon>📊</EmptyIcon>
          <EmptyText>No analytics data available</EmptyText>
        </EmptyContainer>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewTab analytics={analytics} />;
      case 'comparison':
        return <ComparisonTab analytics={analytics} />;
      case 'trends':
        return <TrendsTab analytics={analytics} />;
      case 'states':
        return <StatesTab analytics={analytics} />;
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
            <ModalTitle>📊 Farm Analytics</ModalTitle>
            <FarmInfo>
              <FarmName>{analytics?.farmName || farmName || 'Farm Statistics'}</FarmName>
            </FarmInfo>
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

  const performanceScore = analytics.aggregatedMetrics.overallPerformanceScore ?? 0;
  const performanceColor =
    performanceScore >= 80 ? '#10B981' : performanceScore >= 60 ? '#3B82F6' : performanceScore >= 40 ? '#F59E0B' : '#EF4444';

  // Prepare state breakdown pie chart data
  const stateData = Object.entries(analytics.stateBreakdown)
    .map(([state, info]: [string, any]) => ({
      name: state.charAt(0).toUpperCase() + state.slice(1),
      value: info.count,
      color: STATE_COLORS[state] || '#6B7280',
    }))
    .filter((item) => item.value > 0);

  // Find top performers (top 3 by performance score)
  const topPerformers = [...(analytics.blockComparison || [])]
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, 3);

  // Find blocks needing attention (active alerts or low performance)
  const needsAttention = [...(analytics.blockComparison || [])]
    .filter((block) => block.activeAlerts > 0 || block.performanceScore < 60)
    .sort((a, b) => b.activeAlerts - a.activeAlerts || a.performanceScore - b.performanceScore)
    .slice(0, 5);

  return (
    <TabContent>
      {/* Key Metrics */}
      <Section>
        <SectionTitle>Key Metrics</SectionTitle>
        <MetricsGrid>
          <MetricCard>
            <MetricIcon>🏗️</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.totalBlocks}</MetricValue>
            <MetricLabel>Total Blocks</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🌱</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.activePlantings}</MetricValue>
            <MetricLabel>Active Plantings</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🌾</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.totalYieldKg.toFixed(1)} kg</MetricValue>
            <MetricLabel>Total Yield</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>📊</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.avgYieldEfficiency.toFixed(1)}%</MetricValue>
            <MetricLabel>Avg Yield Efficiency</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>⭐</MetricIcon>
            <MetricValue $color={performanceColor}>{performanceScore.toFixed(0)}</MetricValue>
            <MetricLabel>Overall Performance</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>📦</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.currentUtilization.toFixed(0)}%</MetricValue>
            <MetricLabel>Capacity Utilization</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon>🔮</MetricIcon>
            <MetricValue>{analytics.aggregatedMetrics.predictedYieldKg.toFixed(1)} kg</MetricValue>
            <MetricLabel>Predicted Yield</MetricLabel>
          </MetricCard>
        </MetricsGrid>
      </Section>

      {/* State Breakdown */}
      {stateData.length > 0 && (
        <Section>
          <SectionTitle>Blocks by State</SectionTitle>
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
                  label={(entry) => `${entry.name}: ${entry.value} (${((entry.value / analytics.aggregatedMetrics.totalBlocks) * 100).toFixed(0)}%)`}
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

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <Section>
          <SectionTitle>🏆 Top Performing Blocks</SectionTitle>
          <PerformersList>
            {topPerformers.map((block, index) => (
              <PerformerItem key={block.blockId}>
                <PerformerRank $rank={index + 1}>{index + 1}</PerformerRank>
                <PerformerInfo>
                  <PerformerName>
                    {block.blockCode} {block.name && `- ${block.name}`}
                  </PerformerName>
                  <PerformerDetails>
                    {block.currentCrop && <span>🌿 {block.currentCrop}</span>}
                    <span>Performance: {block.performanceScore.toFixed(0)}/100</span>
                  </PerformerDetails>
                </PerformerInfo>
              </PerformerItem>
            ))}
          </PerformersList>
        </Section>
      )}

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <Section>
          <SectionTitle>⚠️ Needs Attention</SectionTitle>
          <AttentionList>
            {needsAttention.map((block) => (
              <AttentionItem key={block.blockId}>
                <AttentionInfo>
                  <AttentionName>
                    {block.blockCode} {block.name && `- ${block.name}`}
                  </AttentionName>
                  <AttentionIssue>
                    {block.activeAlerts > 0 && <AlertBadge>{block.activeAlerts} Active Alert{block.activeAlerts > 1 ? 's' : ''}</AlertBadge>}
                    {block.performanceScore < 60 && (
                      <PerformanceBadge $score={block.performanceScore}>
                        Low Performance: {block.performanceScore.toFixed(0)}%
                      </PerformanceBadge>
                    )}
                  </AttentionIssue>
                </AttentionInfo>
              </AttentionItem>
            ))}
          </AttentionList>
        </Section>
      )}
    </TabContent>
  );
}

function ComparisonTab({ analytics }: { analytics: any }) {
  const [sortField, setSortField] = useState<keyof BlockComparisonItem>('performanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  if (!analytics || !analytics.blockComparison || analytics.blockComparison.length === 0) {
    return (
      <TabContent>
        <EmptyStateSection>
          <EmptyIcon>📋</EmptyIcon>
          <EmptyText>No blocks to compare</EmptyText>
        </EmptyStateSection>
      </TabContent>
    );
  }

  const handleSort = (field: keyof BlockComparisonItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedBlocks = [...analytics.blockComparison].sort((a, b) => {
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
        <SectionTitle>Block Comparison Table</SectionTitle>
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <TableHeader onClick={() => handleSort('blockCode')} $sortable>
                  Block Code {sortField === 'blockCode' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('name')} $sortable>
                  Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('state')} $sortable>
                  State {sortField === 'state' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('currentCrop')} $sortable>
                  Crop {sortField === 'currentCrop' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('yieldKg')} $sortable>
                  Yield (kg) {sortField === 'yieldKg' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('yieldEfficiency')} $sortable>
                  Efficiency (%) {sortField === 'yieldEfficiency' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('performanceScore')} $sortable>
                  Performance {sortField === 'performanceScore' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('daysInCycle')} $sortable>
                  Days in Cycle {sortField === 'daysInCycle' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('taskCompletionRate')} $sortable>
                  Task Comp. (%) {sortField === 'taskCompletionRate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
                <TableHeader onClick={() => handleSort('activeAlerts')} $sortable>
                  Alerts {sortField === 'activeAlerts' && (sortDirection === 'asc' ? '↑' : '↓')}
                </TableHeader>
              </tr>
            </thead>
            <tbody>
              {sortedBlocks.map((block) => (
                <TableRow key={block.blockId}>
                  <TableCell $bold>{block.blockCode}</TableCell>
                  <TableCell>{block.name || '-'}</TableCell>
                  <TableCell>
                    <StateBadge $color={STATE_COLORS[block.state] || '#6B7280'}>
                      {block.state.charAt(0).toUpperCase() + block.state.slice(1)}
                    </StateBadge>
                  </TableCell>
                  <TableCell>{block.currentCrop || '-'}</TableCell>
                  <TableCell>{block.yieldKg.toFixed(1)}</TableCell>
                  <TableCell>{block.yieldEfficiency.toFixed(1)}</TableCell>
                  <TableCell>
                    <PerformanceScore $color={getPerformanceColor(block.performanceScore)}>
                      {block.performanceScore.toFixed(0)}
                    </PerformanceScore>
                  </TableCell>
                  <TableCell>{block.daysInCycle}</TableCell>
                  <TableCell>{block.taskCompletionRate.toFixed(0)}</TableCell>
                  <TableCell>
                    {block.activeAlerts > 0 ? (
                      <AlertCount>{block.activeAlerts}</AlertCount>
                    ) : (
                      <span style={{ color: '#9e9e9e' }}>0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Section>
    </TabContent>
  );
}

function TrendsTab({ analytics }: { analytics: any }) {
  if (!analytics || !analytics.historicalTrends) {
    return <TabContent><EmptyText>Loading trend data...</EmptyText></TabContent>;
  }

  const hasYieldData = analytics.historicalTrends.yieldTimeline && analytics.historicalTrends.yieldTimeline.length > 0;
  const hasTransitionData = analytics.historicalTrends.stateTransitions && analytics.historicalTrends.stateTransitions.length > 0;

  const getTrendIcon = () => {
    switch (analytics.historicalTrends.performanceTrend) {
      case 'improving': return '🔼';
      case 'stable': return '➡️';
      case 'declining': return '🔽';
      default: return '➖';
    }
  };

  const getTrendLabel = () => {
    switch (analytics.historicalTrends.performanceTrend) {
      case 'improving': return 'Improving';
      case 'stable': return 'Stable';
      case 'declining': return 'Declining';
      default: return 'Insufficient Data';
    }
  };

  const getTrendColor = () => {
    switch (analytics.historicalTrends.performanceTrend) {
      case 'improving': return '#10B981';
      case 'stable': return '#3B82F6';
      case 'declining': return '#EF4444';
      default: return '#9e9e9e';
    }
  };

  return (
    <TabContent>
      {/* Performance Trend Indicator */}
      <Section>
        <SectionTitle>Performance Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon>{getTrendIcon()}</TrendIcon>
          <TrendInfo>
            <TrendLabel $color={getTrendColor()}>{getTrendLabel()}</TrendLabel>
            <TrendDescription>
              {analytics.historicalTrends.performanceTrend === 'improving' && 'Farm performance is improving over time'}
              {analytics.historicalTrends.performanceTrend === 'stable' && 'Farm performance is consistent'}
              {analytics.historicalTrends.performanceTrend === 'declining' && 'Farm performance needs attention'}
              {!['improving', 'stable', 'declining'].includes(analytics.historicalTrends.performanceTrend) && 'Not enough data to determine trend'}
            </TrendDescription>
          </TrendInfo>
        </TrendIndicator>
      </Section>

      {/* Harvest Frequency */}
      <Section>
        <SectionTitle>Harvest Frequency</SectionTitle>
        <FrequencyCard>
          <FrequencyIcon>📅</FrequencyIcon>
          <FrequencyValue>{analytics.historicalTrends.avgHarvestsPerWeek.toFixed(1)}</FrequencyValue>
          <FrequencyLabel>Average Harvests Per Week</FrequencyLabel>
        </FrequencyCard>
      </Section>

      {/* Yield Timeline Chart */}
      {hasYieldData ? (
        <Section>
          <SectionTitle>Yield Timeline</SectionTitle>
          <ChartContainer>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.historicalTrends.yieldTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis label={{ value: 'Yield (kg)', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value: number, name: string) => {
                    if (name === 'Total Yield') return [`${value.toFixed(2)} kg`, name];
                    return [value, name];
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="totalYieldKg" stroke="#10B981" name="Total Yield" strokeWidth={2} />
                <Line type="monotone" dataKey="harvestCount" stroke="#3B82F6" name="Harvest Count" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Section>
      ) : (
        <EmptyStateSection>
          <EmptyIcon>📈</EmptyIcon>
          <EmptyText>No yield data available for this period</EmptyText>
        </EmptyStateSection>
      )}

      {/* Recent State Transitions */}
      {hasTransitionData && (
        <Section>
          <SectionTitle>Recent State Transitions</SectionTitle>
          <TransitionsList>
            {analytics.historicalTrends.stateTransitions.slice(0, 10).map((transition: any, index: number) => (
              <TransitionItem key={index}>
                <TransitionDate>{new Date(transition.date).toLocaleDateString()}</TransitionDate>
                <TransitionDetails>
                  <TransitionBlock>{transition.blockCode}</TransitionBlock>
                  <TransitionArrow>→</TransitionArrow>
                  <TransitionState>{transition.toState.charAt(0).toUpperCase() + transition.toState.slice(1)}</TransitionState>
                </TransitionDetails>
              </TransitionItem>
            ))}
          </TransitionsList>
        </Section>
      )}
    </TabContent>
  );
}

function StatesTab({ analytics }: { analytics: any }) {
  if (!analytics || !analytics.stateBreakdown) {
    return <TabContent><EmptyText>Loading state data...</EmptyText></TabContent>;
  }

  const stateOrder: BlockState[] = ['empty', 'planned', 'growing', 'fruiting', 'harvesting', 'cleaning', 'alert'];

  return (
    <TabContent>
      {stateOrder.map((state) => {
        const stateInfo = analytics.stateBreakdown[state];
        if (!stateInfo) return null;

        const stateLabel = state.charAt(0).toUpperCase() + state.slice(1);
        const stateIcon = STATE_ICONS[state] || '⚪';
        const stateColor = STATE_COLORS[state] || '#6B7280';

        return (
          <Section key={state}>
            <StateHeader>
              <StateTitle>
                <StateIconLarge>{stateIcon}</StateIconLarge>
                <StateTitleText>{stateLabel}</StateTitleText>
                <StateCount $color={stateColor}>{stateInfo.count}</StateCount>
              </StateTitle>
              {stateInfo.avgDaysInState > 0 && (
                <StateMetric>Avg. {stateInfo.avgDaysInState.toFixed(0)} days in this state</StateMetric>
              )}
            </StateHeader>

            {stateInfo.count > 0 ? (
              <BlockChipsContainer>
                {analytics.blockComparison
                  ?.filter((block: BlockComparisonItem) => block.state === state)
                  .map((block: BlockComparisonItem) => (
                    <BlockChip key={block.blockId} $color={stateColor}>
                      {block.blockCode}
                    </BlockChip>
                  ))}
              </BlockChipsContainer>
            ) : (
              <NoBlocksText>No blocks in this state</NoBlocksText>
            )}
          </Section>
        );
      })}
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

const FarmInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #616161;
`;

const FarmName = styled.span`
  font-weight: 600;
  color: #212121;
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

const AttentionIssue = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const AlertBadge = styled.span`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fee;
  color: #c00;
  font-weight: 500;
`;

const PerformanceBadge = styled.span<{ $score: number }>`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${({ $score }) => $score < 40 ? '#fee' : '#fef3cd'};
  color: ${({ $score }) => $score < 40 ? '#c00' : '#f59e0b'};
  font-weight: 500;
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
  cursor: ${({ $sortable }) => $sortable ? 'pointer' : 'default'};
  user-select: none;

  &:hover {
    background: ${({ $sortable }) => $sortable ? '#eeeeee' : '#f5f5f5'};
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
  font-weight: ${({ $bold }) => $bold ? '600' : '400'};
`;

const StateBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => `${$color}20`};
  color: ${({ $color }) => $color};
`;

const PerformanceScore = styled.span<{ $color: string }>`
  font-weight: 700;
  color: ${({ $color }) => $color};
`;

const AlertCount = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fee;
  color: #c00;
  font-weight: 600;
  font-size: 13px;
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

const FrequencyCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const FrequencyIcon = styled.div`
  font-size: 48px;
`;

const FrequencyValue = styled.div`
  font-size: 48px;
  font-weight: 700;
  color: #3b82f6;
`;

const FrequencyLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
`;

const TransitionsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
`;

const TransitionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const TransitionDate = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #757575;
`;

const TransitionDetails = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TransitionBlock = styled.span`
  font-weight: 600;
  color: #212121;
`;

const TransitionArrow = styled.span`
  color: #757575;
`;

const TransitionState = styled.span`
  font-weight: 500;
  color: #3b82f6;
`;

const StateHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const StateTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StateIconLarge = styled.div`
  font-size: 32px;
`;

const StateTitleText = styled.h4`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const StateCount = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border-radius: 9999px;
  background: ${({ $color }) => `${$color}20`};
  color: ${({ $color }) => $color};
  font-size: 16px;
  font-weight: 700;
`;

const StateMetric = styled.div`
  font-size: 13px;
  color: #757575;
`;

const BlockChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const BlockChip = styled.div<{ $color: string }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}40`};
`;

const NoBlocksText = styled.div`
  padding: 20px;
  text-align: center;
  color: #9e9e9e;
  font-style: italic;
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
