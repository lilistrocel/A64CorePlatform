/**
 * BlockAnalyticsModal Component
 *
 * Comprehensive modal displaying block statistics with tabs:
 * - Overview (summary metrics, performance score)
 * - Yield Analytics (charts and quality breakdown)
 * - Timeline (state durations, transition history)
 * - Tasks (completion rates, by type)
 * - Alerts (counts, resolution times)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useBlockAnalytics } from '../../hooks/farm/useBlockAnalytics';
import type { TimePeriod } from '../../types/analytics';
import { TIME_PERIOD_OPTIONS } from '../../types/analytics';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface BlockAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockId: string;
  farmId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

type TabType = 'overview' | 'yield' | 'timeline' | 'tasks' | 'alerts';

const TABS: Array<{ key: TabType; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'yield', label: 'Yield', icon: '🌾' },
  { key: 'timeline', label: 'Timeline', icon: '⏱️' },
  { key: 'tasks', label: 'Tasks', icon: '✅' },
  { key: 'alerts', label: 'Alerts', icon: '⚠️' },
];

const QUALITY_COLORS: Record<string, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
};

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

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockAnalyticsModal({ isOpen, onClose, blockId, farmId }: BlockAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const { analytics, loading, error, refetch } = useBlockAnalytics(farmId, blockId, period);

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
          <LoadingText>Loading analytics...</LoadingText>
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
      case 'yield':
        return <YieldTab analytics={analytics} />;
      case 'timeline':
        return <TimelineTab analytics={analytics} />;
      case 'tasks':
        return <TasksTab analytics={analytics} />;
      case 'alerts':
        return <AlertsTab analytics={analytics} />;
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
            <ModalTitle>📊 Block Analytics</ModalTitle>
            {analytics?.blockInfo && (
              <BlockInfo>
                <BlockCode>{analytics.blockInfo.blockCode}</BlockCode>
                {analytics.blockInfo.name && <BlockName>• {analytics.blockInfo.name}</BlockName>}
              </BlockInfo>
            )}
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
  if (!analytics || !analytics.performanceMetrics || !analytics.blockInfo) {
    return <TabContent><EmptyText>Loading overview data...</EmptyText></TabContent>;
  }

  const performanceScore = analytics?.performanceMetrics?.overallScore ?? 0;
  const performanceColor =
    performanceScore >= 80
      ? '#10B981'
      : performanceScore >= 60
      ? '#3B82F6'
      : performanceScore >= 40
      ? '#F59E0B'
      : '#EF4444';

  return (
    <TabContent>
      <Section>
        <SectionTitle>Block Information</SectionTitle>
        <InfoGrid>
          <InfoCard>
            <InfoLabel>Current State</InfoLabel>
            <InfoValue>
              <StateBadge $color={STATE_COLORS[analytics.blockInfo.currentState] || '#6B7280'}>
                {analytics.blockInfo.currentState.charAt(0).toUpperCase() + analytics.blockInfo.currentState.slice(1)}
              </StateBadge>
            </InfoValue>
          </InfoCard>
          {analytics.blockInfo.currentCrop && (
            <InfoCard>
              <InfoLabel>Current Crop</InfoLabel>
              <InfoValue>🌿 {analytics.blockInfo.currentCrop}</InfoValue>
            </InfoCard>
          )}
          {analytics.blockInfo.daysInCurrentCycle !== null && (
            <InfoCard>
              <InfoLabel>Cycle Duration</InfoLabel>
              <InfoValue>{analytics.blockInfo.daysInCurrentCycle} days</InfoValue>
            </InfoCard>
          )}
          {analytics.blockInfo.expectedHarvestDate && (
            <InfoCard>
              <InfoLabel>Expected Harvest</InfoLabel>
              <InfoValue>{new Date(analytics.blockInfo.expectedHarvestDate).toLocaleDateString()}</InfoValue>
            </InfoCard>
          )}
        </InfoGrid>
      </Section>

      <Section>
        <SectionTitle>Performance Score</SectionTitle>
        <PerformanceContainer>
          <PerformanceScore $color={performanceColor}>
            {performanceScore.toFixed(0)}
          </PerformanceScore>
          <PerformanceSubScores>
            <SubScore>
              <SubScoreLabel>Yield Efficiency</SubScoreLabel>
              <SubScoreValue>{(analytics.performanceMetrics.yieldEfficiencyPercent || 0).toFixed(0)}%</SubScoreValue>
            </SubScore>
            <SubScore>
              <SubScoreLabel>On-Time Rate</SubScoreLabel>
              <SubScoreValue>{(analytics.performanceMetrics.onTimeRate || 0).toFixed(0)}%</SubScoreValue>
            </SubScore>
            <SubScore>
              <SubScoreLabel>Task Completion</SubScoreLabel>
              <SubScoreValue>{(analytics.performanceMetrics.taskCompletionRate || 0).toFixed(0)}%</SubScoreValue>
            </SubScore>
          </PerformanceSubScores>
        </PerformanceContainer>

        {/* Performance Strengths and Improvements */}
        {analytics.performanceMetrics.strengths?.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <InfoLabel style={{ marginBottom: '8px' }}>Strengths:</InfoLabel>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#10B981' }}>
              {analytics.performanceMetrics.strengths.map((strength: string, idx: number) => (
                <li key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>{strength}</li>
              ))}
            </ul>
          </div>
        )}
        {analytics.performanceMetrics.improvements?.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <InfoLabel style={{ marginBottom: '8px' }}>Areas for Improvement:</InfoLabel>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#F59E0B' }}>
              {analytics.performanceMetrics.improvements.map((improvement: string, idx: number) => (
                <li key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>{improvement}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section>
        <SectionTitle>Quick Stats</SectionTitle>
        <QuickStatsGrid>
          <QuickStatCard>
            <QuickStatIcon>🌾</QuickStatIcon>
            <QuickStatValue>{(analytics.yieldAnalytics?.totalYieldKg || 0).toFixed(1)} kg</QuickStatValue>
            <QuickStatLabel>Total Yield</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon>✅</QuickStatIcon>
            <QuickStatValue>{(analytics.taskAnalytics?.completionRate || 0).toFixed(0)}%</QuickStatValue>
            <QuickStatLabel>Task Completion</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon>⚠️</QuickStatIcon>
            <QuickStatValue>{analytics.alertAnalytics?.activeAlerts || 0}</QuickStatValue>
            <QuickStatLabel>Active Alerts</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon>⏱️</QuickStatIcon>
            <QuickStatValue>{analytics.timelineAnalytics?.cycleDuration || 0}</QuickStatValue>
            <QuickStatLabel>Days in Cycle</QuickStatLabel>
          </QuickStatCard>
        </QuickStatsGrid>
      </Section>
    </TabContent>
  );
}

function YieldTab({ analytics }: { analytics: any }) {
  const qualityData = [
    { name: 'Grade A (Premium)', value: analytics.yieldAnalytics.yieldByQuality.A, color: QUALITY_COLORS.A },
    { name: 'Grade B (Good)', value: analytics.yieldAnalytics.yieldByQuality.B, color: QUALITY_COLORS.B },
    { name: 'Grade C (Standard)', value: analytics.yieldAnalytics.yieldByQuality.C, color: QUALITY_COLORS.C },
  ].filter((item) => item.value > 0);

  const hasYieldData = analytics.yieldAnalytics.totalYieldKg > 0;

  return (
    <TabContent>
      <Section>
        <SectionTitle>Yield Summary</SectionTitle>
        <YieldStatsGrid>
          <YieldStatCard>
            <YieldStatLabel>Total Yield</YieldStatLabel>
            <YieldStatValue>{analytics.yieldAnalytics.totalYieldKg.toFixed(2)} kg</YieldStatValue>
          </YieldStatCard>
          <YieldStatCard>
            <YieldStatLabel>Predicted Yield</YieldStatLabel>
            <YieldStatValue>{analytics.yieldAnalytics.predictedYieldKg.toFixed(2)} kg</YieldStatValue>
          </YieldStatCard>
          <YieldStatCard>
            <YieldStatLabel>Efficiency</YieldStatLabel>
            <YieldStatValue
              $color={
                analytics.yieldAnalytics.yieldEfficiencyPercent >= 90
                  ? '#10B981'
                  : analytics.yieldAnalytics.yieldEfficiencyPercent >= 70
                  ? '#3B82F6'
                  : '#F59E0B'
              }
            >
              {analytics.yieldAnalytics.yieldEfficiencyPercent.toFixed(1)}%
            </YieldStatValue>
          </YieldStatCard>
          <YieldStatCard>
            <YieldStatLabel>Avg. Quality</YieldStatLabel>
            <YieldStatValue>Grade {analytics.yieldAnalytics.averageQualityGrade}</YieldStatValue>
          </YieldStatCard>
        </YieldStatsGrid>
      </Section>

      {hasYieldData ? (
        <>
          {qualityData.length > 0 && (
            <Section>
              <SectionTitle>Yield by Quality Grade</SectionTitle>
              <ChartContainer>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={qualityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.name}: ${entry.value.toFixed(1)} kg`}
                    >
                      {qualityData.map((entry, index) => (
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

          {analytics.yieldAnalytics.yieldTrend && analytics.yieldAnalytics.yieldTrend.length > 0 && (
            <Section>
              <SectionTitle>Yield Trend Over Time</SectionTitle>
              <ChartContainer>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.yieldAnalytics.yieldTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis label={{ value: 'Yield (kg)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      formatter={(value: number) => [`${value.toFixed(2)} kg`, '']}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="cumulativeKg" stroke="#3B82F6" name="Cumulative Yield" strokeWidth={2} />
                    <Line type="monotone" dataKey="quantityKg" stroke="#10B981" name="Harvest Quantity" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Section>
          )}
        </>
      ) : (
        <EmptyStateSection>
          <EmptyIcon>🌾</EmptyIcon>
          <EmptyText>No harvest data recorded yet</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function TimelineTab({ analytics }: { analytics: any }) {
  const stateDurationData = Object.entries(analytics.timelineAnalytics.daysInEachState).map(([state, days]) => ({
    state: state.charAt(0).toUpperCase() + state.slice(1),
    days: days as number,
    color: STATE_COLORS[state] || '#6B7280',
  }));

  return (
    <TabContent>
      <Section>
        <SectionTitle>Time in Each State</SectionTitle>
        <ChartContainer>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stateDurationData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="state" />
              <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value: number) => [`${value} days`, 'Duration']} />
              <Legend />
              <Bar dataKey="days" name="Days in State">
                {stateDurationData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </Section>

      {analytics.timelineAnalytics.stateTransitions && analytics.timelineAnalytics.stateTransitions.length > 0 && (
        <Section>
          <SectionTitle>State Transition History</SectionTitle>
          <TransitionList>
            {analytics.timelineAnalytics.stateTransitions.map((transition: any, index: number) => (
              <TransitionItem key={index}>
                <TransitionStates>
                  <TransitionState>
                    {transition.fromState.charAt(0).toUpperCase() + transition.fromState.slice(1)}
                  </TransitionState>
                  <TransitionArrow>→</TransitionArrow>
                  <TransitionState>
                    {transition.toState.charAt(0).toUpperCase() + transition.toState.slice(1)}
                  </TransitionState>
                </TransitionStates>
                <TransitionDetails>
                  <TransitionDate>{new Date(transition.transitionDate).toLocaleDateString()}</TransitionDate>
                  <TransitionDuration>
                    After {transition.daysInPreviousState} day{transition.daysInPreviousState !== 1 ? 's' : ''}
                  </TransitionDuration>
                </TransitionDetails>
              </TransitionItem>
            ))}
          </TransitionList>
        </Section>
      )}

      <Section>
        <SectionTitle>Timeline Summary</SectionTitle>
        <TimelineSummary>
          {analytics.timelineAnalytics.cycleDuration !== null && (
            <SummaryItem>
              <SummaryLabel>Cycle Duration:</SummaryLabel>
              <SummaryValue>{analytics.timelineAnalytics.cycleDuration} days</SummaryValue>
            </SummaryItem>
          )}
          {analytics.timelineAnalytics.expectedCycleDuration !== null && (
            <SummaryItem>
              <SummaryLabel>Expected Duration:</SummaryLabel>
              <SummaryValue>{analytics.timelineAnalytics.expectedCycleDuration} days</SummaryValue>
            </SummaryItem>
          )}
          {analytics.timelineAnalytics.currentStateStartDate && (
            <SummaryItem>
              <SummaryLabel>Current State Since:</SummaryLabel>
              <SummaryValue>
                {new Date(analytics.timelineAnalytics.currentStateStartDate).toLocaleDateString()}
              </SummaryValue>
            </SummaryItem>
          )}
          <SummaryItem>
            <SummaryLabel>On-Time Transitions:</SummaryLabel>
            <SummaryValue>{analytics.timelineAnalytics.onTimeTransitions}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Late Transitions:</SummaryLabel>
            <SummaryValue>{analytics.timelineAnalytics.lateTransitions}</SummaryValue>
          </SummaryItem>
        </TimelineSummary>
      </Section>
    </TabContent>
  );
}

function TasksTab({ analytics }: { analytics: any }) {
  const taskTypeData = Object.entries(analytics.taskAnalytics.tasksByType).map(([type, stats]: [string, any]) => ({
    type: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '),
    total: stats.total,
    completed: stats.completed,
    pending: stats.pending,
  }));

  const hasTaskData = analytics.taskAnalytics.totalTasks > 0;

  return (
    <TabContent>
      <Section>
        <SectionTitle>Task Summary</SectionTitle>
        <TaskStatsGrid>
          <TaskStatCard>
            <TaskStatLabel>Total Tasks</TaskStatLabel>
            <TaskStatValue>{analytics.taskAnalytics.totalTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Completed</TaskStatLabel>
            <TaskStatValue $color="#10B981">{analytics.taskAnalytics.completedTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Pending</TaskStatLabel>
            <TaskStatValue $color="#F59E0B">{analytics.taskAnalytics.pendingTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Overdue</TaskStatLabel>
            <TaskStatValue $color="#EF4444">{analytics.taskAnalytics.overdueTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Completion Rate</TaskStatLabel>
            <TaskStatValue $color="#3B82F6">{analytics.taskAnalytics.completionRate.toFixed(0)}%</TaskStatValue>
          </TaskStatCard>
        </TaskStatsGrid>
      </Section>

      {hasTaskData ? (
        <>
          {taskTypeData.length > 0 && (
            <Section>
              <SectionTitle>Tasks by Type</SectionTitle>
              <ChartContainer>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={taskTypeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#3B82F6" name="Total Tasks" />
                    <Bar dataKey="completed" fill="#10B981" name="Completed" />
                    <Bar dataKey="pending" fill="#F59E0B" name="Pending" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Section>
          )}

          <Section>
            <SectionTitle>Task Metrics</SectionTitle>
            <TaskMetrics>
              {analytics.taskAnalytics.avgCompletionDelay !== null && (
                <MetricItem>
                  <MetricLabel>Average Completion Delay:</MetricLabel>
                  <MetricValue>
                    {analytics.taskAnalytics.avgCompletionDelay.toFixed(1)} day
                    {Math.abs(analytics.taskAnalytics.avgCompletionDelay) !== 1 ? 's' : ''}
                  </MetricValue>
                </MetricItem>
              )}
              <MetricItem>
                <MetricLabel>Overdue Tasks:</MetricLabel>
                <MetricValue $color={analytics.taskAnalytics.overdueTasks > 0 ? '#EF4444' : '#10B981'}>
                  {analytics.taskAnalytics.overdueTasks}
                </MetricValue>
              </MetricItem>
              <MetricItem>
                <MetricLabel>Recent Completed (7d):</MetricLabel>
                <MetricValue>{analytics.taskAnalytics.recentCompletedTasks}</MetricValue>
              </MetricItem>
              <MetricItem>
                <MetricLabel>Upcoming (7d):</MetricLabel>
                <MetricValue>{analytics.taskAnalytics.upcomingTasks}</MetricValue>
              </MetricItem>
            </TaskMetrics>
          </Section>
        </>
      ) : (
        <EmptyStateSection>
          <EmptyIcon>✅</EmptyIcon>
          <EmptyText>No tasks recorded yet</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function AlertsTab({ analytics }: { analytics: any }) {
  const alertSeverityData = [
    { severity: 'Critical', count: analytics.alertAnalytics.criticalCount, color: '#DC2626' },
    { severity: 'High', count: analytics.alertAnalytics.highCount, color: '#F59E0B' },
    { severity: 'Medium', count: analytics.alertAnalytics.mediumCount, color: '#3B82F6' },
    { severity: 'Low', count: analytics.alertAnalytics.lowCount, color: '#6B7280' },
  ].filter((item) => item.count > 0);

  const hasAlertData = analytics.alertAnalytics.totalAlerts > 0;

  return (
    <TabContent>
      <Section>
        <SectionTitle>Alert Summary</SectionTitle>
        <AlertStatsGrid>
          <AlertStatCard>
            <AlertStatLabel>Total Alerts</AlertStatLabel>
            <AlertStatValue>{analytics.alertAnalytics.totalAlerts}</AlertStatValue>
          </AlertStatCard>
          <AlertStatCard>
            <AlertStatLabel>Active</AlertStatLabel>
            <AlertStatValue $color="#EF4444">{analytics.alertAnalytics.activeAlerts}</AlertStatValue>
          </AlertStatCard>
          <AlertStatCard>
            <AlertStatLabel>Resolved</AlertStatLabel>
            <AlertStatValue $color="#10B981">{analytics.alertAnalytics.resolvedAlerts}</AlertStatValue>
          </AlertStatCard>
          <AlertStatCard>
            <AlertStatLabel>Dismissed</AlertStatLabel>
            <AlertStatValue $color="#6B7280">{analytics.alertAnalytics.dismissedAlerts}</AlertStatValue>
          </AlertStatCard>
        </AlertStatsGrid>
      </Section>

      {hasAlertData ? (
        <>
          {alertSeverityData.length > 0 && (
            <Section>
              <SectionTitle>Alerts by Severity</SectionTitle>
              <ChartContainer>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={alertSeverityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="severity" />
                    <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Alert Count">
                      {alertSeverityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Section>
          )}

          {analytics.alertAnalytics.avgResolutionTimeHours !== null && (
            <Section>
              <SectionTitle>Resolution Metrics</SectionTitle>
              <TaskMetrics>
                <MetricItem>
                  <MetricLabel>Average Resolution Time:</MetricLabel>
                  <MetricValue>{analytics.alertAnalytics.avgResolutionTimeHours.toFixed(1)} hours</MetricValue>
                </MetricItem>
                {analytics.alertAnalytics.fastestResolutionHours !== null && (
                  <MetricItem>
                    <MetricLabel>Fastest Resolution:</MetricLabel>
                    <MetricValue $color="#10B981">
                      {analytics.alertAnalytics.fastestResolutionHours.toFixed(1)} hours
                    </MetricValue>
                  </MetricItem>
                )}
                {analytics.alertAnalytics.slowestResolutionHours !== null && (
                  <MetricItem>
                    <MetricLabel>Slowest Resolution:</MetricLabel>
                    <MetricValue $color="#EF4444">
                      {analytics.alertAnalytics.slowestResolutionHours.toFixed(1)} hours
                    </MetricValue>
                  </MetricItem>
                )}
              </TaskMetrics>
            </Section>
          )}
        </>
      ) : (
        <EmptyStateSection>
          <EmptyIcon>⚠️</EmptyIcon>
          <EmptyText>No alerts recorded</EmptyText>
        </EmptyStateSection>
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
  max-width: 1200px;
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

const BlockInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #616161;
`;

const BlockCode = styled.span`
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: #212121;
`;

const BlockName = styled.span`
  color: #616161;
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

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const InfoCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InfoLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const StateBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  background: ${({ $color }) => `${$color}20`};
  color: ${({ $color }) => $color};
`;

const PerformanceContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const PerformanceScore = styled.div<{ $color: string }>`
  font-size: 64px;
  font-weight: 700;
  color: ${({ $color }) => $color};
  line-height: 1;
`;

const PerformanceSubScores = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`;

const SubScore = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SubScoreLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
`;

const SubScoreValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
`;

const QuickStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const QuickStatCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
  text-align: center;
`;

const QuickStatIcon = styled.div`
  font-size: 32px;
`;

const QuickStatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #212121;
`;

const QuickStatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
`;

const YieldStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const YieldStatCard = styled.div`
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const YieldStatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const YieldStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#212121'};
`;

const ChartContainer = styled.div`
  width: 100%;
  margin-top: 16px;
`;

const TransitionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
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

const TransitionStates = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TransitionState = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const TransitionArrow = styled.span`
  font-size: 16px;
  color: #757575;
`;

const TransitionDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;

  @media (max-width: 768px) {
    align-items: flex-start;
  }
`;

const TransitionDate = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #212121;
`;

const TransitionDuration = styled.div`
  font-size: 12px;
  color: #757575;
`;

const TimelineSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SummaryItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;

const SummaryLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #616161;
`;

const SummaryValue = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
`;

const TaskStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const TaskStatCard = styled.div`
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const TaskStatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const TaskStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#212121'};
`;

const TaskMetrics = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const MetricItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;

const MetricLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #616161;
`;

const MetricValue = styled.div<{ $color?: string }>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ $color }) => $color || '#212121'};
`;

const AlertStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const AlertStatCard = styled.div`
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const AlertStatLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const AlertStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#212121'};
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
