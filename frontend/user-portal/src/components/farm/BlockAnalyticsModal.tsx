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
import styled, { keyframes, css, useTheme } from 'styled-components';
import {
  BarChart3,
  Wheat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Sprout,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanel, glassOpaque, monoLabel, colorBadge } from '@a64core/shared';
import type { Theme } from '@a64core/shared';
import { BLOCK_STATE_PHASE_KEYS } from '../../types/farm';
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
import type { TimePeriod, StateProgressStep, HarvestRecord } from '../../types/analytics';
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

const TABS: Array<{ key: TabType; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'yield', label: 'Yield', icon: Wheat },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { key: 'alerts', label: 'Alerts', icon: AlertTriangle },
];

// Quality grade and lifecycle state extrapolate the phase vocabulary (spec
// §5.2) — gold/warning stays reserved for the literal Harvesting phase, not
// an ordinary grade or state chip (spec §3).
function getQualityColor(theme: Theme, grade: string): string {
  const map: Record<string, string> = {
    A: theme.colors.phase.fruiting,
    B: theme.colors.phase.inoculated,
    C: theme.colors.phase.fruitingInit,
  };
  return map[grade] ?? theme.colors.muted;
}

// `state` arrives as a loose string here (analytics payload isn't typed as
// BlockState), so the lookup goes through BLOCK_STATE_PHASE_KEYS
// (types/farm.ts, the canonical state→phase map) via a widened index rather
// than re-deriving the mapping.
function getStateColor(theme: Theme, state: string): string {
  const phaseKey = (BLOCK_STATE_PHASE_KEYS as Record<string, (typeof BLOCK_STATE_PHASE_KEYS)[keyof typeof BLOCK_STATE_PHASE_KEYS]>)[state];
  return theme.colors.phase[phaseKey ?? 'empty'];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockAnalyticsModal({ isOpen, onClose, blockId, farmId }: BlockAnalyticsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const { analytics, loading, error, refetch } = useBlockAnalytics(farmId, blockId, period, isOpen);

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
          <ErrorIcon><AlertTriangle size={48} strokeWidth={1.4} /></ErrorIcon>
          <ErrorTitle>Failed to load analytics</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
          <RetryButton onClick={refetch}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    if (!analytics) {
      return (
        <EmptyContainer>
          <EmptyIcon><BarChart3 size={48} strokeWidth={1.4} /></EmptyIcon>
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
            <ModalTitle><BarChart3 size={22} strokeWidth={1.8} /> Block Analytics</ModalTitle>
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
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
          </HeaderRight>
        </ModalHeader>

        {/* Tabs */}
        <TabsContainer>
          {TABS.map((tab) => (
            <Tab key={tab.key} $active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
              <TabIcon><tab.icon size={15} strokeWidth={1.8} /></TabIcon>
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

// ---------------------------------------------------------------------------
// StateProgressBar — horizontal lifecycle stepper shown at the top of Overview
// ---------------------------------------------------------------------------

function StateProgressBar({ steps }: { steps: StateProgressStep[] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <Section>
      <SectionTitle>Lifecycle Progress</SectionTitle>
      <ProgressBarRow>
        {steps.map((step, index) => {
          // Determine node visual state
          const nodeState: 'active' | 'completed' | 'upcoming' =
            step.isCurrent ? 'active' : step.reached ? 'completed' : 'upcoming';

          // Date display logic per spec:
          // - reached + date present  → formatted date
          // - reached + date null     → em dash (recorded as passed, no date)
          // - not reached             → nothing
          let dateText: string | null = null;
          if (step.reached) {
            dateText = step.transitionDate
              ? new Date(step.transitionDate).toLocaleDateString()
              : '—'; // em dash
          }

          const label = step.state.charAt(0).toUpperCase() + step.state.slice(1);

          return (
            <StepWrapper key={step.state}>
              {index > 0 && <StepConnector $completed={step.reached} />}
              <StepNode $state={nodeState}>
                {nodeState === 'completed' && <StepCheckmark>&#10003;</StepCheckmark>}
                {nodeState === 'active' && <StepDot />}
              </StepNode>
              <StepLabel $state={nodeState}>{label}</StepLabel>
              {dateText !== null && <StepDate>{dateText}</StepDate>}
            </StepWrapper>
          );
        })}
      </ProgressBarRow>
    </Section>
  );
}

function OverviewTab({ analytics }: { analytics: any }) {
  const theme = useTheme();

  if (!analytics || !analytics.performanceMetrics || !analytics.blockInfo) {
    return <TabContent><EmptyText>Loading overview data...</EmptyText></TabContent>;
  }

  const performanceScore = analytics?.performanceMetrics?.overallScore ?? 0;
  // Tiered performance score extrapolates the phase vocabulary (spec §5.2) —
  // gold/warning stays reserved for the literal Harvesting phase (spec §3).
  const performanceColor =
    performanceScore >= 80
      ? theme.colors.bright.emerald
      : performanceScore >= 60
      ? theme.colors.bright.lapis
      : performanceScore >= 40
      ? theme.colors.bright.terra
      : theme.colors.bright.coral;

  return (
    <TabContent>
      <StateProgressBar steps={analytics.stateProgress ?? []} />
      <Section>
        <SectionTitle>
          Block Information
          {analytics.blockInfo.plantDataIsStale && (
            <StalenessChip>
              Plant data v{analytics.blockInfo.plantDataVersion ?? '?'} · latest v{analytics.blockInfo.latestPlantDataVersion ?? '?'} (outdated)
            </StalenessChip>
          )}
        </SectionTitle>
        <InfoGrid>
          <InfoCard>
            <InfoLabel>Current State</InfoLabel>
            <InfoValue>
              <StateBadge $color={getStateColor(theme, analytics.blockInfo.currentState)}>
                {analytics.blockInfo.currentState.charAt(0).toUpperCase() + analytics.blockInfo.currentState.slice(1)}
              </StateBadge>
            </InfoValue>
          </InfoCard>
          {analytics.blockInfo.currentCrop && (
            <InfoCard>
              <InfoLabel>Current Crop</InfoLabel>
              <InfoValue style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sprout size={14} strokeWidth={1.8} /> {analytics.blockInfo.currentCrop}
              </InfoValue>
            </InfoCard>
          )}
          {analytics.blockInfo.actualPlantCount != null && (
            <InfoCard>
              <InfoLabel>Number of Plants</InfoLabel>
              <InfoValue style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sprout size={14} strokeWidth={1.8} /> {analytics.blockInfo.actualPlantCount.toLocaleString()}
              </InfoValue>
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
            <ul style={{ margin: 0, paddingLeft: '20px', color: theme.colors.bright.emerald }}>
              {analytics.performanceMetrics.strengths.map((strength: string, idx: number) => (
                <li key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>{strength}</li>
              ))}
            </ul>
          </div>
        )}
        {analytics.performanceMetrics.improvements?.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <InfoLabel style={{ marginBottom: '8px' }}>Areas for Improvement:</InfoLabel>
            <ul style={{ margin: 0, paddingLeft: '20px', color: theme.colors.bright.terra }}>
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
            <QuickStatIcon><Wheat size={26} strokeWidth={1.6} /></QuickStatIcon>
            <QuickStatValue>{(analytics.yieldAnalytics?.totalYieldKg || 0).toFixed(1)} kg</QuickStatValue>
            <QuickStatLabel>Total Yield</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon><CheckCircle2 size={26} strokeWidth={1.6} /></QuickStatIcon>
            <QuickStatValue>{(analytics.taskAnalytics?.completionRate || 0).toFixed(0)}%</QuickStatValue>
            <QuickStatLabel>Task Completion</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon><AlertTriangle size={26} strokeWidth={1.6} /></QuickStatIcon>
            <QuickStatValue>{analytics.alertAnalytics?.activeAlerts || 0}</QuickStatValue>
            <QuickStatLabel>Active Alerts</QuickStatLabel>
          </QuickStatCard>
          <QuickStatCard>
            <QuickStatIcon><Clock size={26} strokeWidth={1.6} /></QuickStatIcon>
            <QuickStatValue>{analytics.timelineAnalytics?.cycleDuration || 0}</QuickStatValue>
            <QuickStatLabel>Days in Cycle</QuickStatLabel>
          </QuickStatCard>
        </QuickStatsGrid>
      </Section>
    </TabContent>
  );
}

function YieldTab({ analytics }: { analytics: any }) {
  const theme = useTheme();
  const qualityData = [
    { name: 'Grade A (Premium)', value: analytics.yieldAnalytics.yieldByQuality.A, color: getQualityColor(theme, 'A') },
    { name: 'Grade B (Good)', value: analytics.yieldAnalytics.yieldByQuality.B, color: getQualityColor(theme, 'B') },
    { name: 'Grade C (Standard)', value: analytics.yieldAnalytics.yieldByQuality.C, color: getQualityColor(theme, 'C') },
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
                  ? theme.colors.bright.emerald
                  : analytics.yieldAnalytics.yieldEfficiencyPercent >= 70
                  ? theme.colors.bright.lapis
                  : theme.colors.bright.terra
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

      {/* Yield Records — individual harvest log entries */}
      {(() => {
        const records: HarvestRecord[] = analytics.yieldAnalytics.harvestRecords ?? [];
        if (records.length === 0) return null;
        return (
          <Section>
            <SectionTitle>Yield Records</SectionTitle>
            <YieldRecordList>
              {records.map((record) => (
                <YieldRecordItem key={record.harvestId}>
                  <YieldRecordMain>
                    <YieldRecordLeft>
                      <YieldRecordDate>{new Date(record.harvestDate).toLocaleDateString()}</YieldRecordDate>
                      <GradeBadge $color={getQualityColor(theme, record.qualityGrade)}>
                        Grade {record.qualityGrade}
                      </GradeBadge>
                      <YieldRecordQuantity>{record.quantityKg.toFixed(1)} kg</YieldRecordQuantity>
                    </YieldRecordLeft>
                    <YieldRecordMeta>
                      Recorded {new Date(record.recordedAt).toLocaleDateString()} by {record.recordedByEmail}
                    </YieldRecordMeta>
                  </YieldRecordMain>
                  {record.notes && <YieldRecordNotes>{record.notes}</YieldRecordNotes>}
                </YieldRecordItem>
              ))}
            </YieldRecordList>
          </Section>
        );
      })()}

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
                    <Line type="monotone" dataKey="cumulativeKg" stroke={theme.colors.celeste} name="Cumulative Yield" strokeWidth={2} />
                    <Line type="monotone" dataKey="quantityKg" stroke={theme.colors.bright.emerald} name="Harvest Quantity" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Section>
          )}
        </>
      ) : (
        <EmptyStateSection>
          <EmptyIcon><Wheat size={48} strokeWidth={1.4} /></EmptyIcon>
          <EmptyText>No harvest data recorded yet</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function TimelineTab({ analytics }: { analytics: any }) {
  const theme = useTheme();
  const stateDurationData = Object.entries(analytics.timelineAnalytics.daysInEachState).map(([state, days]) => ({
    state: state.charAt(0).toUpperCase() + state.slice(1),
    days: days as number,
    color: getStateColor(theme, state),
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
  const theme = useTheme();
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
            <TaskStatValue $color={theme.colors.bright.emerald}>{analytics.taskAnalytics.completedTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Pending</TaskStatLabel>
            <TaskStatValue $color={theme.colors.bright.terra}>{analytics.taskAnalytics.pendingTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Overdue</TaskStatLabel>
            <TaskStatValue $color={theme.colors.bright.coral}>{analytics.taskAnalytics.overdueTasks}</TaskStatValue>
          </TaskStatCard>
          <TaskStatCard>
            <TaskStatLabel>Completion Rate</TaskStatLabel>
            <TaskStatValue $color={theme.colors.bright.lapis}>{analytics.taskAnalytics.completionRate.toFixed(0)}%</TaskStatValue>
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
                    <Bar dataKey="total" fill={theme.colors.bright.lapis} name="Total Tasks" />
                    <Bar dataKey="completed" fill={theme.colors.bright.emerald} name="Completed" />
                    <Bar dataKey="pending" fill={theme.colors.bright.terra} name="Pending" />
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
                <MetricValue $color={analytics.taskAnalytics.overdueTasks > 0 ? theme.colors.bright.coral : theme.colors.bright.emerald}>
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
          <EmptyIcon><CheckCircle2 size={48} strokeWidth={1.4} /></EmptyIcon>
          <EmptyText>No tasks recorded yet</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

function AlertsTab({ analytics }: { analytics: any }) {
  const theme = useTheme();
  // Severity extrapolates the phase vocabulary (spec §5.2) — gold/warning
  // stays reserved for the literal Harvesting phase (spec §3).
  const alertSeverityData = [
    { severity: 'Critical', count: analytics.alertAnalytics.criticalCount, color: theme.colors.bright.coral },
    { severity: 'High', count: analytics.alertAnalytics.highCount, color: theme.colors.bright.terra },
    { severity: 'Medium', count: analytics.alertAnalytics.mediumCount, color: theme.colors.bright.lapis },
    { severity: 'Low', count: analytics.alertAnalytics.lowCount, color: theme.colors.muted },
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
            <AlertStatValue $color={theme.colors.bright.coral}>{analytics.alertAnalytics.activeAlerts}</AlertStatValue>
          </AlertStatCard>
          <AlertStatCard>
            <AlertStatLabel>Resolved</AlertStatLabel>
            <AlertStatValue $color={theme.colors.bright.emerald}>{analytics.alertAnalytics.resolvedAlerts}</AlertStatValue>
          </AlertStatCard>
          <AlertStatCard>
            <AlertStatLabel>Dismissed</AlertStatLabel>
            <AlertStatValue $color={theme.colors.muted}>{analytics.alertAnalytics.dismissedAlerts}</AlertStatValue>
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
                    <MetricValue $color={theme.colors.bright.emerald}>
                      {analytics.alertAnalytics.fastestResolutionHours.toFixed(1)} hours
                    </MetricValue>
                  </MetricItem>
                )}
                {analytics.alertAnalytics.slowestResolutionHours !== null && (
                  <MetricItem>
                    <MetricLabel>Slowest Resolution:</MetricLabel>
                    <MetricValue $color={theme.colors.bright.coral}>
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
          <EmptyIcon><AlertTriangle size={48} strokeWidth={1.4} /></EmptyIcon>
          <EmptyText>No alerts recorded</EmptyText>
        </EmptyStateSection>
      )}
    </TabContent>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  justify-content: center;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 1200px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 768px) {
    max-width: 100%;
    height: 95vh;
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
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const BlockInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const BlockCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const BlockName = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`;

const PeriodFilter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PeriodLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`;

const PeriodSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.glass.base};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.muted)};
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? '700' : '500')};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : 'transparent')};
  white-space: nowrap;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
  }
`;

const TabIcon = styled.span`
  display: inline-flex;
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
  ${glassPanel}
  padding: 20px;
`;

const SectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.celeste};
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
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StateBadge = styled.span<{ $color: string }>`
  ${({ $color }) => colorBadge($color)}
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
  font-weight: 800;
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
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const SubScoreValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const QuickStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

// Nested one level inside a glass Section — flat tinted card, no blur, per
// the two-glass-layer rule (spec §2).
const QuickStatCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  text-align: center;
`;

const QuickStatIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
`;

const QuickStatValue = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const QuickStatLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const YieldStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const YieldStatCard = styled.div`
  padding: 16px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
`;

const YieldStatLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const YieldStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 800;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
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
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;

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
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TransitionArrow = styled.span`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
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
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TransitionDuration = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
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
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;

const SummaryLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`;

const SummaryValue = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TaskStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const TaskStatCard = styled.div`
  padding: 16px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
`;

const TaskStatLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const TaskStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 800;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
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
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
`;

const MetricLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`;

const MetricValue = styled.div<{ $color?: string }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
`;

const AlertStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const AlertStatCard = styled.div`
  padding: 16px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
`;

const AlertStatLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const AlertStatValue = styled.div<{ $color?: string }>`
  font-size: 20px;
  font-weight: 800;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
`;

// ---------------------------------------------------------------------------
// StateProgressBar styled components
// ---------------------------------------------------------------------------

/**
 * Row that holds all step wrappers in a single horizontal line.
 * Top padding ensures the active node's halo ring is never clipped.
 */
const ProgressBarRow = styled.div`
  display: flex;
  align-items: flex-start;
  /* Top padding so the active node's halo ring is never clipped. No overflow clipping. */
  padding: 16px 8px 4px;
`;

/**
 * Equal-width column for one step: connector (if not first) + node + label + date.
 * flex:1 1 0 gives all steps the same width so nodes are evenly spaced.
 */
const StepWrapper = styled.div`
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

/* Absolutely-positioned line spanning from the PREVIOUS node's center to THIS node's
   center (left:-50%; width:100% across equal-width columns), sitting behind the nodes. */
const StepConnector = styled.div<{ $completed: boolean }>`
  position: absolute;
  top: 15px;        /* node is 32px tall → center 16px; minus half the 2px line */
  left: -50%;
  width: 100%;
  height: 2px;
  z-index: 0;
  background: ${({ $completed, theme }) => ($completed ? theme.colors.bright.emerald : theme.colors.line)};
  transition: background 150ms ease-in-out;
`;

type NodeState = 'active' | 'completed' | 'upcoming';

/**
 * Water-drop ripple: a ring expands outward from the node, fast at first then
 * decelerating as it spreads and fades (driven by the ease-out timing function).
 */
const ripple = keyframes`
  0%   { transform: scale(1);   opacity: 0.4; }
  55%  { transform: scale(1.7); opacity: 0; }
  100% { transform: scale(1.7); opacity: 0; } /* hold faded = pause before next ripple */
`;

const StepNode = styled.div<{ $state: NodeState }>`
  position: relative;
  z-index: 1;       /* above the connector so lines tuck under the circle */
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 150ms ease-in-out, border-color 150ms ease-in-out;

  ${({ $state, theme }) =>
    $state === 'active' &&
    css`
      background: ${theme.colors.bright.lapis};
      border: 2px solid ${theme.colors.bright.lapis};
      box-shadow: 0 0 0 4px rgba(107, 138, 224, 0.18);

      /* Two staggered rings emanate from behind the node like ripples on water.
         z-index: -1 keeps them behind the solid node so they radiate from under it. */
      &::before,
      &::after {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: 50%;
        border: 1.5px solid ${theme.colors.bright.lapis};
        z-index: -1;
        pointer-events: none;
        animation: ${ripple} 2.8s ease-out infinite;
      }
      &::after {
        animation-delay: 1.4s;
      }
    `}

  ${({ $state, theme }) =>
    $state === 'completed' &&
    `
    background: ${theme.colors.bright.emerald};
    border: 2px solid ${theme.colors.bright.emerald};
  `}

  ${({ $state, theme }) =>
    $state === 'upcoming' &&
    `
    background: transparent;
    border: 2px solid ${theme.colors.glass.border};
  `}
`;

const StepCheckmark = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  line-height: 1;
`;

const StepDot = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.onDark};
`;

const StepLabel = styled.div<{ $state: NodeState }>`
  margin-top: 8px;
  font-size: 12px;
  font-weight: ${({ $state }) => ($state === 'active' ? '600' : '500')};
  color: ${({ $state, theme }) =>
    $state === 'upcoming' ? theme.colors.muted : theme.colors.textPrimary};
  text-align: center;
  white-space: nowrap;
`;

const StepDate = styled.div`
  margin-top: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  white-space: nowrap;
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
  border: 4px solid ${({ theme }) => theme.colors.glass.border};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
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
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-bottom: 16px;
`;

const ErrorTitle = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 8px;
`;

const ErrorMessage = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
`;

// Isolated in the error state — this view's one gold-gradient CTA (spec §3).
const RetryButton = styled.button`
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
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
`;

const EmptyIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
  opacity: 0.7;
`;

const EmptyText = styled.div`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ---------------------------------------------------------------------------
// Yield Records styled components
// ---------------------------------------------------------------------------

const YieldRecordList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
`;

const YieldRecordItem = styled.div`
  padding: 12px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const YieldRecordMain = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const YieldRecordLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const YieldRecordDate = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const GradeBadge = styled.span<{ $color: string }>`
  ${({ $color }) => colorBadge($color)}
`;

const YieldRecordQuantity = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
`;

const YieldRecordMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;

  @media (max-width: 768px) {
    white-space: normal;
  }
`;

const YieldRecordNotes = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  padding-left: 2px;
`;

// ---------------------------------------------------------------------------
// Plant data staleness chip (Overview tab — Block Information section)
// ---------------------------------------------------------------------------

// "Outdated" is a pending-action signal (spec §5.2 "pending" → fruitingInit),
// not gold-b — gold stays reserved for the literal Harvesting phase (spec §3).
const StalenessChip = styled.span`
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(232, 147, 95, 0.16);
  color: ${({ theme }) => theme.colors.bright.terra};
  border: 1px solid rgba(232, 147, 95, 0.45);
  margin-left: 8px;
  vertical-align: middle;
`;
