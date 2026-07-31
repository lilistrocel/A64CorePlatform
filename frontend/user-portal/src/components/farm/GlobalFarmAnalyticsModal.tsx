/**
 * GlobalFarmAnalyticsModal Component
 *
 * Comprehensive modal displaying system-wide statistics across all farms.
 * Provides global insights with 4 tabs:
 * - System Overview (aggregated metrics, utilization, system-wide stats)
 * - Farm Comparison (sortable table comparing all farms)
 * - Production Timeline (global yield timeline chart)
 * - Performance Insights (top performers, farms needing attention, trends)
 *
 * Night Observatory (T-901): glass modal shell over the fixed sky, phase-
 * colour routing for performance tiering, lucide-react icons in place of
 * emoji. See Docs/2-Working-Progress/night-observatory-spec.md.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled, { useTheme } from 'styled-components';
import type { Theme } from '@a64core/shared';
import { glassPanel, glassControl, goldThread, monoLabel } from '@a64core/shared';
import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  X,
  Mountain,
  Construction,
  Sprout,
  Wheat,
  Star,
  Package,
  Wand2,
  Trophy,
  AlertTriangle,
  ArrowRight,
  Minus,
  Flame,
} from 'lucide-react';
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
import { formatNumber, formatCompact } from '../../utils';

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

const TABS: Array<{ key: TabType; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'System Overview', icon: Globe },
  { key: 'comparison', label: 'Farm Comparison', icon: BarChart3 },
  { key: 'timeline', label: 'Production Timeline', icon: TrendingUp },
  { key: 'insights', label: 'Performance Insights', icon: Lightbulb },
];

// Night Observatory (T-901, spec §5): block state -> the single phase
// vocabulary, mirrors FarmAnalyticsModal.tsx's identical map/rationale.
const STATE_PHASE_MAP: Record<string, string> = {
  empty: 'empty',
  planned: 'preparing',
  growing: 'colonizing',
  fruiting: 'fruiting',
  harvesting: 'harvesting',
  cleaning: 'cleaning',
  alert: 'quarantined',
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

// Performance-score tiering shared by every tab in this modal — see the
// identical rationale in FarmAnalyticsModal.tsx: bright.terra (NOT
// warning/gold-b) for the middle tier, since gold is not a status colour
// outside the literal Harvesting phase (spec §3).
function getPerformanceColor(score: number, theme: Theme): string {
  if (score >= 80) return theme.colors.phase.fruiting;
  if (score >= 60) return theme.colors.phase.inoculated;
  if (score >= 40) return theme.colors.bright.terra;
  return theme.colors.phase.quarantined;
}

// ── Recharts styling helpers (spec §4 "Charts") — identical to
// FarmAnalyticsModal.tsx; Recharts needs plain values, not styled-components
// template literals.

function chartTooltipStyle(theme: Theme) {
  return {
    background: theme.colors.cosmosHi,
    border: `1px solid ${theme.colors.glass.border}`,
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: '0.72rem',
    padding: '8px 12px',
  };
}

function chartLegendStyle(theme: Theme) {
  return {
    color: theme.colors.celeste,
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: '0.7rem',
    paddingTop: 8,
  };
}

function chartAxisTick(theme: Theme) {
  return { fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 };
}

function renderPieLabel(theme: Theme) {
  return (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, outerRadius, name, value, percent } = props;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill={theme.colors.celeste}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontFamily={theme.typography.fontFamily.mono}
        fontSize={11}
      >
        {`${name}: ${formatNumber(value)} (${formatNumber(percent * 100, { decimals: 0 })}%)`}
      </text>
    );
  };
}

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
          <ErrorIcon>
            <X size={40} strokeWidth={1.6} />
          </ErrorIcon>
          <ErrorTitle>Failed to load global analytics</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
          <RetryButton onClick={refetch}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    if (!analytics) {
      return (
        <EmptyContainer>
          <EmptyHeadline>No global analytics data available</EmptyHeadline>
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
            <ModalTitle>
              <Globe size={22} strokeWidth={1.7} />
              Global Farm Statistics
            </ModalTitle>
            <SystemInfo>
              <InfoText>Production insights across all farms</InfoText>
            </SystemInfo>
          </HeaderLeft>
          <HeaderRight>
            <PeriodFilter>
              <PeriodLabel>Period</PeriodLabel>
              <PeriodSelect value={period} onChange={(e) => handlePeriodChange(e.target.value as TimePeriod)}>
                {TIME_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </PeriodSelect>
            </PeriodFilter>
            <CloseButton onClick={onClose} aria-label="Close modal">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* Tabs */}
        <TabsContainer>
          {TABS.map((tab) => {
            const TabIconComp = tab.icon;
            return (
              <Tab key={tab.key} $active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
                <TabIcon>
                  <TabIconComp size={15} strokeWidth={1.6} />
                </TabIcon>
                <TabLabel>{tab.label}</TabLabel>
              </Tab>
            );
          })}
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
  const theme = useTheme();

  if (!analytics || !analytics.aggregatedMetrics) {
    return <TabContent><EmptyText>Loading overview data...</EmptyText></TabContent>;
  }

  const metrics = analytics.aggregatedMetrics;
  const performanceScore = metrics.avgPerformanceScore ?? 0;
  const performanceColor = getPerformanceColor(performanceScore, theme);

  // Prepare state breakdown pie chart data — routed through the single phase
  // vocabulary (spec §5), not an arbitrary chart palette, since this chart is
  // a literal state/status breakdown.
  const stateData = Object.entries(analytics.stateBreakdown)
    .filter(([key]) => key !== 'totalBlocks')
    .map(([state, count]: [string, any]) => ({
      name: STATE_LABELS[state] || state,
      value: count,
      color: theme.colors.phase[(STATE_PHASE_MAP[state] ?? 'empty') as keyof typeof theme.colors.phase],
    }))
    .filter((item) => item.value > 0);

  // Overall trend — 3-way read (the 4th 'insufficient_data' outcome falls
  // through to the "stable" visual here; InsightsTab below has the full
  // 4-way version). Extrapolated status vocabulary per spec §5.2.
  const trend = analytics.performanceInsights?.overallTrend;
  const TrendIconComponent = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : ArrowRight;
  const trendLabel = trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable';
  const trendColor =
    trend === 'improving' ? theme.colors.phase.fruiting : trend === 'declining' ? theme.colors.phase.quarantined : theme.colors.phase.inoculated;

  return (
    <TabContent>
      {/* Key Metrics */}
      <Section>
        <SectionTitle>System-Wide Metrics</SectionTitle>
        <MetricsGrid>
          <MetricCard>
            <MetricIcon><Mountain size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.totalFarms)}</MetricValue>
            <MetricLabel>Total Farms</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Construction size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.totalBlocks)}</MetricValue>
            <MetricLabel>Total Blocks</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Sprout size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.totalActivePlantings)}</MetricValue>
            <MetricLabel>Active Plantings</MetricLabel>
          </MetricCard>
          {/* The single headline metric for this grid — everything else in
              the grid stays celeste (spec §3 gold discipline). */}
          <MetricCard $primary>
            <MetricIcon><Wheat size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue $primary>{formatNumber(metrics.totalYieldKg, { decimals: 1 })} kg</MetricValue>
            <MetricLabel>Total Yield</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><BarChart3 size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.avgYieldEfficiencyAcrossFarms, { decimals: 1 })}%</MetricValue>
            <MetricLabel>Avg Yield Efficiency</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Star size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue $color={performanceColor}>{formatNumber(performanceScore, { decimals: 0 })}</MetricValue>
            <MetricLabel>Avg Performance Score</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Package size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.avgUtilization, { decimals: 0 })}%</MetricValue>
            <MetricLabel>System Utilization</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Wand2 size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(metrics.totalPredictedYieldKg, { decimals: 1 })} kg</MetricValue>
            <MetricLabel>Predicted Yield</MetricLabel>
          </MetricCard>
        </MetricsGrid>
      </Section>

      {/* Overall Trend */}
      <Section>
        <SectionTitle>System Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon $color={trendColor}>
            <TrendIconComponent size={40} strokeWidth={1.5} />
          </TrendIcon>
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
                  label={renderPieLabel(theme)}
                  labelLine={{ stroke: theme.colors.line }}
                >
                  {stateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle(theme)}
                  labelStyle={{ color: theme.colors.celeste }}
                  itemStyle={{ color: theme.colors.textPrimary }}
                />
                <Legend wrapperStyle={chartLegendStyle(theme)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Section>
      )}
    </TabContent>
  );
}

function ComparisonTab({ analytics }: { analytics: any }) {
  const theme = useTheme();
  const [sortField, setSortField] = useState<keyof FarmSummary>('overallPerformanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  if (!analytics || !analytics.farmSummaries || analytics.farmSummaries.length === 0) {
    return (
      <TabContent>
        <EmptyStateSection>
          <EmptyHeadline>No farms to compare</EmptyHeadline>
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
                  <TableCell>{formatNumber(farm.totalBlocks)}</TableCell>
                  <TableCell>{formatNumber(farm.activePlantings)}</TableCell>
                  <TableCell>{formatNumber(farm.totalYieldKg, { decimals: 1 })}</TableCell>
                  <TableCell>{formatNumber(farm.avgYieldEfficiency, { decimals: 1 })}</TableCell>
                  <TableCell>
                    <PerformanceScore $color={getPerformanceColor(farm.overallPerformanceScore, theme)}>
                      {formatNumber(farm.overallPerformanceScore, { decimals: 0 })}
                    </PerformanceScore>
                  </TableCell>
                  <TableCell>{formatNumber(farm.currentUtilization, { decimals: 0 })}</TableCell>
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
  const theme = useTheme();
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
                <LineChart data={timelineWithCumulative} margin={{ top: 20, right: 60, left: 50, bottom: 5 }}>
                  <CartesianGrid stroke={theme.colors.line} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={chartAxisTick(theme)}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    yAxisId="left"
                    width={50}
                    tick={chartAxisTick(theme)}
                    tickFormatter={(value) => formatCompact(value, 1)}
                    label={{
                      value: 'Daily Yield (kg)',
                      angle: -90,
                      position: 'left',
                      offset: 20,
                      style: { textAnchor: 'middle', fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={50}
                    tick={chartAxisTick(theme)}
                    tickFormatter={(value) => formatCompact(value, 1)}
                    label={{
                      value: 'Cumulative (kg)',
                      angle: 90,
                      position: 'right',
                      offset: 30,
                      style: { textAnchor: 'middle', fontSize: 11, fontFamily: theme.typography.fontFamily.mono, fill: theme.colors.muted },
                    }}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle(theme)}
                    labelStyle={{ color: theme.colors.celeste }}
                    itemStyle={{ color: theme.colors.textPrimary }}
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    formatter={(value: number, name: string) => {
                      if (name === 'Daily Yield' || name === 'Cumulative Yield') {
                        return [formatNumber(value, { decimals: 2, suffix: ' kg' }), name];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={chartLegendStyle(theme)} />
                  {/* Chart series order (spec §4): celeste, then bright.gold */}
                  <Line yAxisId="left" type="monotone" dataKey="totalYieldKg" stroke={theme.colors.celeste} name="Daily Yield" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="cumulativeYield" stroke={theme.colors.bright.gold} name="Cumulative Yield" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </Section>

          {/* Harvest Metrics */}
          <Section>
            <SectionTitle>Harvest Metrics</SectionTitle>
            <MetricsGrid>
              <MetricCard>
                <MetricIcon><Wheat size={20} strokeWidth={1.6} /></MetricIcon>
                <MetricValue>{formatNumber(analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.harvestCount, 0))}</MetricValue>
                <MetricLabel>Total Harvests</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricIcon><Mountain size={20} strokeWidth={1.6} /></MetricIcon>
                <MetricValue>
                  {formatNumber(analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.farmCount, 0) / analytics.yieldTimeline.length, { decimals: 1 })}
                </MetricValue>
                <MetricLabel>Avg Farms Harvesting</MetricLabel>
              </MetricCard>
              <MetricCard>
                <MetricIcon><BarChart3 size={20} strokeWidth={1.6} /></MetricIcon>
                <MetricValue>
                  {formatNumber(analytics.yieldTimeline.reduce((sum: number, p: any) => sum + p.totalYieldKg, 0) / analytics.yieldTimeline.length, { decimals: 1, suffix: ' kg' })}
                </MetricValue>
                <MetricLabel>Avg Daily Yield</MetricLabel>
              </MetricCard>
              {/* The single headline metric for this grid — everything else
                  stays celeste (spec §3 gold discipline). */}
              <MetricCard $primary>
                <MetricIcon><Flame size={20} strokeWidth={1.6} /></MetricIcon>
                <MetricValue $primary>
                  {formatNumber(Math.max(...analytics.yieldTimeline.map((p: any) => p.totalYieldKg)), { decimals: 1, suffix: ' kg' })}
                </MetricValue>
                <MetricLabel>Peak Daily Yield</MetricLabel>
              </MetricCard>
            </MetricsGrid>
          </Section>
        </>
      ) : (
        <EmptyStateSection>
          <EmptyHeadline>No production data available for this period</EmptyHeadline>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function InsightsTab({ analytics }: { analytics: any }) {
  const theme = useTheme();
  if (!analytics || !analytics.performanceInsights) {
    return <TabContent><EmptyText>Loading insights data...</EmptyText></TabContent>;
  }

  const insights = analytics.performanceInsights;

  const TrendIconComponent =
    insights.overallTrend === 'improving'
      ? TrendingUp
      : insights.overallTrend === 'declining'
      ? TrendingDown
      : insights.overallTrend === 'stable'
      ? ArrowRight
      : Minus;
  const trendLabel =
    insights.overallTrend === 'improving'
      ? 'Improving'
      : insights.overallTrend === 'stable'
      ? 'Stable'
      : insights.overallTrend === 'declining'
      ? 'Declining'
      : 'Insufficient Data';
  const trendColor =
    insights.overallTrend === 'improving'
      ? theme.colors.phase.fruiting
      : insights.overallTrend === 'stable'
      ? theme.colors.phase.inoculated
      : insights.overallTrend === 'declining'
      ? theme.colors.phase.quarantined
      : theme.colors.muted;

  return (
    <TabContent>
      {/* Overall Trend */}
      <Section>
        <SectionTitle>Overall System Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon $color={trendColor}>
            <TrendIconComponent size={40} strokeWidth={1.5} />
          </TrendIcon>
          <TrendInfo>
            <TrendLabel $color={trendColor}>{trendLabel}</TrendLabel>
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
          <SectionTitle><Trophy size={16} strokeWidth={1.7} /> Top Performing Farms</SectionTitle>
          <PerformersList>
            {insights.topPerformingFarms.map((farm: FarmSummary, index: number) => (
              <PerformerItem key={farm.farmId}>
                <PerformerRank $rank={index + 1}>{index + 1}</PerformerRank>
                <PerformerInfo>
                  <PerformerName>{farm.farmName}</PerformerName>
                  <PerformerDetails>
                    <span>Performance: {formatNumber(farm.overallPerformanceScore, { decimals: 0 })}/100</span>
                    <span>Yield: {formatNumber(farm.totalYieldKg, { decimals: 1, suffix: ' kg' })}</span>
                    <span>Efficiency: {formatNumber(farm.avgYieldEfficiency, { decimals: 1, suffix: '%' })}</span>
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
          <SectionTitle><AlertTriangle size={16} strokeWidth={1.7} /> Farms Needing Attention</SectionTitle>
          <AttentionList>
            {insights.farmsNeedingAttention.map((farm: FarmSummary) => (
              <AttentionItem key={farm.farmId}>
                <AttentionInfo>
                  <AttentionName>{farm.farmName}</AttentionName>
                  <AttentionDetails>
                    <PerformanceBadge $score={farm.overallPerformanceScore}>
                      Performance: {formatNumber(farm.overallPerformanceScore, { decimals: 0, suffix: '%' })}
                    </PerformanceBadge>
                    {farm.currentUtilization < 50 && (
                      <UtilizationBadge>Low Utilization: {formatNumber(farm.currentUtilization, { decimals: 0, suffix: '%' })}</UtilizationBadge>
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
          <SectionTitle><TrendingDown size={16} strokeWidth={1.7} /> Under Performing Farms</SectionTitle>
          <UnderPerformersList>
            {insights.underPerformingFarms.map((farm: FarmSummary) => (
              <UnderPerformerItem key={farm.farmId}>
                <UnderPerformerName>{farm.farmName}</UnderPerformerName>
                <UnderPerformerMetrics>
                  <MetricBadge $color={getPerformanceColor(farm.overallPerformanceScore, theme)}>
                    Score: {formatNumber(farm.overallPerformanceScore, { decimals: 0 })}
                  </MetricBadge>
                  <MetricBadge $color={theme.colors.muted}>
                    Yield: {formatNumber(farm.totalYieldKg, { decimals: 1, suffix: ' kg' })}
                  </MetricBadge>
                  <MetricBadge $color={theme.colors.muted}>
                    Efficiency: {formatNumber(farm.avgYieldEfficiency, { decimals: 1, suffix: '%' })}
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
// Night Observatory (T-901): the modal shell is glassPanel at 24px blur
// (spec §4 "Modals/drawers"); everything nested inside it stays under the
// two-glass-layer ceiling via plain line-bordered/transparent surfaces
// rather than a second glassPanel (spec §2).

const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: 1100;
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 1400px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 768px) {
    max-width: 100%;
    max-height: 95vh;
  }
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.4rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;

  svg {
    color: ${({ theme }) => theme.colors.celeste};
    flex-shrink: 0;
  }
`;

const SystemInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoText = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`;

const PeriodFilter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PeriodLabel = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

const PeriodSelect = styled.select`
  ${glassControl}
  padding: 8px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.25);
  }
`;

const TabsContainer = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
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
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '700' : '500')};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  /* Tab underline uses celeste, not gold — gold is reserved for the sidebar
     active-nav item, not every in-page tab bar (spec §3). */
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.celeste : 'transparent')};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TabIcon = styled.span`
  display: flex;
  align-items: center;
`;

const TabLabel = styled.span``;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const TabContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  position: relative;
  padding: 20px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: transparent;
`;

const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;

  svg {
    color: ${({ theme }) => theme.colors.celeste};
    flex-shrink: 0;
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
`;

const MetricCard = styled.div<{ $primary?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 14px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: transparent;
  text-align: center;
  ${({ $primary }) => $primary && goldThread}
`;

const MetricIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
`;

const MetricValue = styled.div<{ $color?: string; $primary?: boolean }>`
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  color: ${({ $color, $primary, theme }) => $color ?? ($primary ? theme.colors.secondary[500] : theme.colors.celeste)};
  text-shadow: ${({ $primary }) => ($primary ? '0 0 20px rgba(220, 185, 79, 0.4)' : 'none')};
`;

const MetricLabel = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
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
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
`;

const TrendIcon = styled.div<{ $color: string }>`
  display: flex;
  color: ${({ $color }) => $color};
`;

const TrendInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TrendLabel = styled.div<{ $color: string }>`
  font-size: 20px;
  font-weight: 800;
  color: ${({ $color }) => $color};
`;

const TrendDescription = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const TableContainer = styled.div`
  overflow-x: auto;
  margin-top: 16px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const TableHeader = styled.th<{ $sortable?: boolean }>`
  ${monoLabel}
  text-align: left;
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    color: ${({ $sortable, theme }) => ($sortable ? theme.colors.textPrimary : theme.colors.celeste)};
  }
`;

const TableRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const TableCell = styled.td<{ $bold?: boolean }>`
  padding: 10px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ $bold }) => ($bold ? '700' : '400')};
`;

const PerformanceScore = styled.span<{ $color: string }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
`;

const PerformerRank = styled.div<{ $rank: number }>`
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
  background: ${({ $rank, theme }) => {
    // Medal ranks — see the identical rationale in FarmAnalyticsModal.tsx:
    // rank 1 is the ONLY genuinely gold fill here (secondary/gold ramp), a
    // literal medal being the same real-world exception the brief already
    // makes for the Harvesting phase.
    if ($rank === 1) return `linear-gradient(135deg, ${theme.colors.gold[400]}, ${theme.colors.gold[600]})`;
    if ($rank === 2) return `linear-gradient(135deg, ${theme.colors.neutral[400]}, ${theme.colors.neutral[600]})`;
    if ($rank === 3) return `linear-gradient(135deg, ${theme.colors.terracotta[400]}, ${theme.colors.terracotta[600]})`;
    return theme.colors.neutral[300];
  }};
  /* onAccent (dark text) only on the rank-1 GOLD fill; ranks 2/3/default sit
     on non-gold fills and need onDark (spec §1.1's breaking change). */
  color: ${({ $rank, theme }) => ($rank === 1 ? theme.colors.onAccent : theme.colors.onDark)};
`;

const PerformerInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PerformerName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PerformerDetails = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
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
  background: ${({ theme }) => theme.colors.warningBg};
  border-left: 3px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
`;

const AttentionInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const AttentionName = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AttentionDetails = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const PerformanceBadge = styled.span<{ $score: number }>`
  ${monoLabel}
  padding: 3px 9px;
  border-radius: 99px;
  background: ${({ $score, theme }) => ($score < 40 ? theme.colors.errorBg : theme.colors.warningBg)};
  color: ${({ $score, theme }) => ($score < 40 ? theme.colors.error : theme.colors.warning)};
`;

const UtilizationBadge = styled.span`
  ${monoLabel}
  padding: 3px 9px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.primary[300]};
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
  background: ${({ theme }) => theme.colors.errorBg};
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const UnderPerformerName = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const UnderPerformerMetrics = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const MetricBadge = styled.span<{ $color: string }>`
  ${monoLabel}
  padding: 3px 9px;
  border-radius: 99px;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
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
  width: 42px;
  height: 42px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.celeste};
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
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
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
  display: flex;
  color: ${({ theme }) => theme.colors.error};
  margin-bottom: 16px;
`;

const ErrorTitle = styled.div`
  font-size: 17px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 8px;
`;

const ErrorMessage = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
`;

const RetryButton = styled.button`
  ${glassControl}
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.celeste};
    color: ${({ theme }) => theme.colors.celeste};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
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
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
`;

const EmptyHeadline = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const EmptyText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;
