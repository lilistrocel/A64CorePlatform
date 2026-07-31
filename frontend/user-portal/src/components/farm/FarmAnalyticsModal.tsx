/**
 * FarmAnalyticsModal Component
 *
 * Comprehensive modal displaying farm-level statistics aggregated from all blocks.
 * Provides farm-wide insights with 4 tabs:
 * - Overview (key metrics, state breakdown, top performers)
 * - Block Comparison (sortable table of all blocks)
 * - Historical Trends (yield timeline, performance trends)
 * - Current State Details (blocks by state)
 *
 * Night Observatory (T-901): glass modal shell over the fixed sky, phase-
 * colour routing for every block state, lucide-react icons in place of
 * emoji. See Docs/2-Working-Progress/night-observatory-spec.md.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled, { useTheme } from 'styled-components';
import type { Theme, PhaseKey } from '@a64core/shared';
import { glassPanel, glassControl, goldThread, monoLabel, phaseBadge } from '@a64core/shared';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  Construction,
  Sprout,
  Wheat,
  Star,
  Package,
  Wand2,
  Trophy,
  Leaf,
  AlertTriangle,
  Calendar,
  ArrowRight,
  Minus,
  Circle,
  Grape,
  Sparkles,
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
import { useFarmAnalytics } from '../../hooks/farm/useFarmAnalytics';
import type { TimePeriod, BlockComparisonItem } from '../../types/farm-analytics';
import { TIME_PERIOD_OPTIONS } from '../../types/farm-analytics';
import { formatNumber, formatPercentage } from '../../utils';

type BlockState = 'empty' | 'planned' | 'growing' | 'fruiting' | 'harvesting' | 'cleaning' | 'alert';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FarmAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmId: string | null;
  farmName?: string;
  farmingYear?: number | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

type TabType = 'overview' | 'comparison' | 'trends' | 'states';

const TABS: Array<{ key: TabType; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'comparison', label: 'Block Comparison', icon: ClipboardList },
  { key: 'trends', label: 'Historical Trends', icon: TrendingUp },
  { key: 'states', label: 'Current State Details', icon: Search },
];

// Night Observatory (T-901, spec §5): block state -> the single phase
// vocabulary. "planted" is a legacy synonym for "growing" some aggregation
// payloads still emit; both route to "colonizing" (the in-progress phase).
// Falls back to "empty" for anything unrecognised.
const STATE_PHASE_MAP: Record<string, PhaseKey> = {
  empty: 'empty',
  planned: 'preparing',
  planted: 'colonizing',
  growing: 'colonizing',
  fruiting: 'fruiting',
  harvesting: 'harvesting',
  cleaning: 'cleaning',
  alert: 'quarantined',
};

function statePhaseKey(state: string): PhaseKey {
  return STATE_PHASE_MAP[state] ?? 'empty';
}

const STATE_ICONS: Record<string, LucideIcon> = {
  empty: Circle,
  planned: ClipboardList,
  growing: Sprout,
  fruiting: Grape,
  harvesting: Wheat,
  cleaning: Sparkles,
  alert: AlertTriangle,
};

// Performance-score tiering shared by the overview headline stat and the
// comparison table. Uses phase hexes for the top/bottom tiers (they are
// identical values to success/error already) and bright.terra — NOT
// warning/gold-b — for the middle tier, since gold is not a status colour
// outside the literal Harvesting phase (spec §3).
function getPerformanceColor(score: number, theme: Theme): string {
  if (score >= 80) return theme.colors.phase.fruiting;
  if (score >= 60) return theme.colors.phase.inoculated;
  if (score >= 40) return theme.colors.bright.terra;
  return theme.colors.phase.quarantined;
}

// ── Recharts styling helpers (spec §4 "Charts") ────────────────────────────
// Recharts props need plain values, not styled-components template literals,
// so these read the theme object directly instead of composing a mixin.

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

// Custom Pie label renderer — the default recharts label ignores the theme
// and renders dark text that disappears against the sky. Same content as
// before, just legible.
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

export function FarmAnalyticsModal({ isOpen, onClose, farmId, farmName, farmingYear }: FarmAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const { analytics, loading, error, refetch } = useFarmAnalytics(farmId, period, farmingYear);

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
          <ErrorIcon>
            <X size={40} strokeWidth={1.6} />
          </ErrorIcon>
          <ErrorTitle>Failed to load analytics</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
          <RetryButton onClick={refetch}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    if (!analytics) {
      return (
        <EmptyContainer>
          <EmptyHeadline>No analytics data available</EmptyHeadline>
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
            <ModalTitle>
              <BarChart3 size={22} strokeWidth={1.7} />
              Farm Analytics
            </ModalTitle>
            <FarmInfo>
              <FarmName>{analytics?.farmName || farmName || 'Farm Statistics'}</FarmName>
            </FarmInfo>
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

  const performanceScore = analytics.aggregatedMetrics.overallPerformanceScore ?? 0;
  const performanceColor = getPerformanceColor(performanceScore, theme);

  // Prepare state breakdown pie chart data — routed through the single phase
  // vocabulary (spec §5), not an arbitrary chart palette, since this chart is
  // a literal state/status breakdown.
  const stateData = Object.entries(analytics.stateBreakdown)
    .map(([state, info]: [string, any]) => ({
      name: state.charAt(0).toUpperCase() + state.slice(1),
      value: info.count,
      color: theme.colors.phase[statePhaseKey(state)],
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
            <MetricIcon><Construction size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(analytics.aggregatedMetrics.totalBlocks)}</MetricValue>
            <MetricLabel>Total Blocks</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Sprout size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(analytics.aggregatedMetrics.activePlantings)}</MetricValue>
            <MetricLabel>Active Plantings</MetricLabel>
          </MetricCard>
          {/* The single headline metric for this grid — everything else in
              the grid stays celeste (spec §3 gold discipline). */}
          <MetricCard $primary>
            <MetricIcon><Wheat size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue $primary>{formatNumber(analytics.aggregatedMetrics.totalYieldKg, { decimals: 1 })} kg</MetricValue>
            <MetricLabel>Total Yield</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><BarChart3 size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatPercentage(analytics.aggregatedMetrics.avgYieldEfficiency, 1)}</MetricValue>
            <MetricLabel>Avg Yield Efficiency</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Star size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue $color={performanceColor}>{formatNumber(performanceScore, { decimals: 0 })}</MetricValue>
            <MetricLabel>Overall Performance</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Package size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatPercentage(analytics.aggregatedMetrics.currentUtilization, 0)}</MetricValue>
            <MetricLabel>Capacity Utilization</MetricLabel>
          </MetricCard>
          <MetricCard>
            <MetricIcon><Wand2 size={20} strokeWidth={1.6} /></MetricIcon>
            <MetricValue>{formatNumber(analytics.aggregatedMetrics.predictedYieldKg, { decimals: 1 })} kg</MetricValue>
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

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <Section>
          <SectionTitle><Trophy size={16} strokeWidth={1.7} /> Top Performing Blocks</SectionTitle>
          <PerformersList>
            {topPerformers.map((block, index) => (
              <PerformerItem key={block.blockId}>
                <PerformerRank $rank={index + 1}>{index + 1}</PerformerRank>
                <PerformerInfo>
                  <PerformerName>
                    {block.blockCode} {block.name && `- ${block.name}`}
                  </PerformerName>
                  <PerformerDetails>
                    {block.currentCrop && (
                      <span><Leaf size={13} strokeWidth={1.6} /> {block.currentCrop}</span>
                    )}
                    <span>Performance: {formatNumber(block.performanceScore, { decimals: 0 })}/100</span>
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
          <SectionTitle><AlertTriangle size={16} strokeWidth={1.7} /> Needs Attention</SectionTitle>
          <AttentionList>
            {needsAttention.map((block) => (
              <AttentionItem key={block.blockId}>
                <AttentionInfo>
                  <AttentionName>
                    {block.blockCode} {block.name && `- ${block.name}`}
                  </AttentionName>
                  <AttentionIssue>
                    {block.activeAlerts > 0 && <AlertBadge>{formatNumber(block.activeAlerts)} Active Alert{block.activeAlerts > 1 ? 's' : ''}</AlertBadge>}
                    {block.performanceScore < 60 && (
                      <PerformanceBadge $score={block.performanceScore}>
                        Low Performance: {formatPercentage(block.performanceScore, 0)}
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
  const theme = useTheme();
  const [sortField, setSortField] = useState<keyof BlockComparisonItem>('performanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  if (!analytics || !analytics.blockComparison || analytics.blockComparison.length === 0) {
    return (
      <TabContent>
        <EmptyStateSection>
          <EmptyHeadline>No blocks to compare</EmptyHeadline>
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
                    <StateBadge $phase={statePhaseKey(block.state)}>
                      {block.state.charAt(0).toUpperCase() + block.state.slice(1)}
                    </StateBadge>
                  </TableCell>
                  <TableCell>{block.currentCrop || '-'}</TableCell>
                  <TableCell>{formatNumber(block.yieldKg, { decimals: 1 })}</TableCell>
                  <TableCell>{formatNumber(block.yieldEfficiency, { decimals: 1 })}</TableCell>
                  <TableCell>
                    <PerformanceScore $color={getPerformanceColor(block.performanceScore, theme)}>
                      {formatNumber(block.performanceScore, { decimals: 0 })}
                    </PerformanceScore>
                  </TableCell>
                  <TableCell>{formatNumber(block.daysInCycle)}</TableCell>
                  <TableCell>{formatNumber(block.taskCompletionRate, { decimals: 0 })}</TableCell>
                  <TableCell>
                    {block.activeAlerts > 0 ? (
                      <AlertCount>{formatNumber(block.activeAlerts)}</AlertCount>
                    ) : (
                      <span style={{ color: 'inherit', opacity: 0.5 }}>0</span>
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
  const theme = useTheme();
  if (!analytics || !analytics.historicalTrends) {
    return <TabContent><EmptyText>Loading trend data...</EmptyText></TabContent>;
  }

  const hasYieldData = analytics.historicalTrends.yieldTimeline && analytics.historicalTrends.yieldTimeline.length > 0;
  const hasTransitionData = analytics.historicalTrends.stateTransitions && analytics.historicalTrends.stateTransitions.length > 0;

  const trend = analytics.historicalTrends.performanceTrend;
  const TrendIconComponent =
    trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : trend === 'stable' ? ArrowRight : Minus;
  const trendLabel =
    trend === 'improving' ? 'Improving' : trend === 'stable' ? 'Stable' : trend === 'declining' ? 'Declining' : 'Insufficient Data';
  // Trend is a 3-state improving/stable/declining read — the same extrapolated
  // vocabulary as approved/open/rejected (spec §5.2).
  const trendColor =
    trend === 'improving'
      ? theme.colors.phase.fruiting
      : trend === 'stable'
      ? theme.colors.phase.inoculated
      : trend === 'declining'
      ? theme.colors.phase.quarantined
      : theme.colors.muted;

  return (
    <TabContent>
      {/* Performance Trend Indicator */}
      <Section>
        <SectionTitle>Performance Trend</SectionTitle>
        <TrendIndicator>
          <TrendIcon $color={trendColor}>
            <TrendIconComponent size={40} strokeWidth={1.5} />
          </TrendIcon>
          <TrendInfo>
            <TrendLabel $color={trendColor}>{trendLabel}</TrendLabel>
            <TrendDescription>
              {trend === 'improving' && 'Farm performance is improving over time'}
              {trend === 'stable' && 'Farm performance is consistent'}
              {trend === 'declining' && 'Farm performance needs attention'}
              {!['improving', 'stable', 'declining'].includes(trend) && 'Not enough data to determine trend'}
            </TrendDescription>
          </TrendInfo>
        </TrendIndicator>
      </Section>

      {/* Harvest Frequency — the single headline stat of this tab */}
      <Section>
        <SectionTitle>Harvest Frequency</SectionTitle>
        <FrequencyCard>
          <FrequencyIcon><Calendar size={28} strokeWidth={1.6} /></FrequencyIcon>
          <FrequencyValue>{formatNumber(analytics.historicalTrends.avgHarvestsPerWeek, { decimals: 1 })}</FrequencyValue>
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
                <CartesianGrid stroke={theme.colors.line} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={chartAxisTick(theme)}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis
                  tick={chartAxisTick(theme)}
                  label={{ value: 'Yield (kg)', angle: -90, position: 'insideLeft', fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(theme)}
                  labelStyle={{ color: theme.colors.celeste }}
                  itemStyle={{ color: theme.colors.textPrimary }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value: number, name: string) => {
                    if (name === 'Total Yield') return [`${value.toFixed(2)} kg`, name];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={chartLegendStyle(theme)} />
                {/* Chart series order (spec §4): celeste, then bright.gold */}
                <Line type="monotone" dataKey="totalYieldKg" stroke={theme.colors.celeste} name="Total Yield" strokeWidth={2} />
                <Line type="monotone" dataKey="harvestCount" stroke={theme.colors.bright.gold} name="Harvest Count" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Section>
      ) : (
        <EmptyStateSection>
          <EmptyHeadline>No yield data available for this period</EmptyHeadline>
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
                  <TransitionState $phase={statePhaseKey(transition.toState)}>
                    {transition.toState.charAt(0).toUpperCase() + transition.toState.slice(1)}
                  </TransitionState>
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
  const theme = useTheme();

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
        const StateIconComp = STATE_ICONS[state] || Circle;
        const phaseKey = statePhaseKey(state);
        const stateColor = theme.colors.phase[phaseKey];

        return (
          <Section key={state}>
            <StateHeader>
              <StateTitle>
                <StateIconLarge $color={stateColor}>
                  <StateIconComp size={26} strokeWidth={1.6} />
                </StateIconLarge>
                <StateTitleText>{stateLabel}</StateTitleText>
                <StateCount $color={stateColor}>{stateInfo.count}</StateCount>
              </StateTitle>
              {stateInfo.avgDaysInState > 0 && (
                <StateMetric>Avg. {formatNumber(stateInfo.avgDaysInState, { decimals: 0 })} days in this state</StateMetric>
              )}
            </StateHeader>

            {stateInfo.count > 0 ? (
              <BlockChipsContainer>
                {analytics.blockComparison
                  ?.filter((block: BlockComparisonItem) => block.state === state)
                  .map((block: BlockComparisonItem) => (
                    <BlockChip key={block.blockId} $phase={phaseKey}>
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

const FarmInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const FarmName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
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
    // Medal ranks 1-3 keep the traditional gold/silver/bronze read. Rank 1 is
    // the ONLY genuinely gold fill here — a literal medal is the same
    // real-world exception the brief already makes for the Harvesting phase,
    // so it is counted deliberately in the gold budget, not accidentally.
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

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  svg {
    color: ${({ theme }) => theme.colors.bright.laurel};
  }
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

const AttentionIssue = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const AlertBadge = styled.span`
  ${monoLabel}
  padding: 3px 9px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
`;

const PerformanceBadge = styled.span<{ $score: number }>`
  ${monoLabel}
  padding: 3px 9px;
  border-radius: 99px;
  background: ${({ $score, theme }) => ($score < 40 ? theme.colors.errorBg : theme.colors.warningBg)};
  color: ${({ $score, theme }) => ($score < 40 ? theme.colors.error : theme.colors.warning)};
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

const StateBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const PerformanceScore = styled.span<{ $color: string }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  color: ${({ $color }) => $color};
`;

const AlertCount = styled.span`
  ${monoLabel}
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
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

const FrequencyCard = styled.div`
  ${goldThread}
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
`;

const FrequencyIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
`;

const FrequencyValue = styled.div`
  font-size: 40px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.secondary[500]};
  text-shadow: 0 0 20px rgba(220, 185, 79, 0.4);
`;

const FrequencyLabel = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
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
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const TransitionDate = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

const TransitionDetails = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TransitionBlock = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TransitionArrow = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`;

const TransitionState = styled.span<{ $phase: PhaseKey }>`
  font-weight: 600;
  color: ${({ theme, $phase }) => theme.colors.phase[$phase]};
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

const StateIconLarge = styled.div<{ $color: string }>`
  display: flex;
  color: ${({ $color }) => $color};
`;

const StateTitleText = styled.h4`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const StateCount = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 10px;
  border-radius: 99px;
  background: ${({ $color }) => `${$color}29`};
  border: 1px solid ${({ $color }) => `${$color}73`};
  color: ${({ $color }) => $color};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 14px;
  font-weight: 700;
`;

const StateMetric = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

const BlockChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const BlockChip = styled.div<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const NoBlocksText = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
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
