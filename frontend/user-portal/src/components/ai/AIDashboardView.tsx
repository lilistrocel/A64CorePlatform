/**
 * AIDashboardView Component
 *
 * Renders an automated farm inspection report. Handles four display states:
 * 1. Null report   — empty state with call-to-action
 * 2. Generating    — loading overlay while report is being created
 * 3. AI summary    — full AI-generated executive summary + checklist + recommendations
 * 4. Raw data only — fallback table view when aiSummary is null but rawData exists
 *    (occurs when status === 'generation_failed')
 *
 * Uses transient props ($ prefix) for all styled-component conditional props
 * per the project UI-Standards.md requirements.
 */

import styled, { keyframes } from 'styled-components';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  TrendingUp,
  Cpu,
  Zap,
  BarChart2,
  Loader,
} from 'lucide-react';
import type {
  DashboardReport,
  HealthRating,
  InspectionVerdict,
  RecommendationPriority,
  InspectionResult,
  FarmStatusCard,
  Recommendation,
} from '../../types/aiDashboard';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface AIDashboardViewProps {
  report: DashboardReport | null;
  generating: boolean;
}

// ============================================================================
// CONSTANTS — colour maps
// ============================================================================

const HEALTH_COLORS: Record<HealthRating, string> = {
  excellent: '#4caf50',
  good: '#2196f3',
  fair: '#ff9800',
  poor: '#ff5722',
  critical: '#f44336',
};

const VERDICT_COLORS: Record<InspectionVerdict, string> = {
  pass: '#4caf50',
  warning: '#ff9800',
  fail: '#f44336',
};

const PRIORITY_COLORS: Record<RecommendationPriority, string> = {
  high: '#f44336',
  medium: '#ff9800',
  low: '#2196f3',
};

// ============================================================================
// ANIMATIONS
// ============================================================================

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ============================================================================
// STYLED COMPONENTS
// All custom boolean/string props use the $ transient prefix so they are not
// forwarded to the DOM, preventing React prop warnings.
// ============================================================================

const ViewContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  animation: ${fadeIn} 300ms ease-out;
`;

/** Semi-transparent overlay shown while a report is being generated. */
const GeneratingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  z-index: 10;
`;

const SpinnerIcon = styled(Loader)`
  animation: ${spin} 1s linear infinite;
  color: ${({ theme }) => theme.colors.primary[500]};
`;

const GeneratingLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const GeneratingSubLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// ----- Empty state -----

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  text-align: center;
  min-height: 240px;
`;

const EmptyStateTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyStateDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  max-width: 400px;
`;

// ----- Status banner -----

const StatusBanner = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StatusMeta = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

interface StatusBadgeProps {
  $color: string;
}

const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ $color }) => `${$color}1a`};
  color: ${({ $color }) => $color};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

// ----- Warning banner (generation_failed) -----

const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: #fff3e0;
  border: 1px solid #ffb74d;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: #e65100;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

// ----- Executive summary -----

interface ExecutiveSummaryProps {
  $color: string;
}

const ExecutiveSummary = styled.div<ExecutiveSummaryProps>`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ $color }) => `${$color}0d`};
  border-left: 4px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const SummaryHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const SummaryTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

interface HealthBadgeProps {
  $color: string;
}

const HealthBadge = styled.span<HealthBadgeProps>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  background: ${({ $color }) => $color};
  color: #fff;
  text-transform: capitalize;
`;

const SummaryText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.6;
  margin: 0;
`;

// ----- Section wrapper -----

const Section = styled.section``;

const SectionHeading = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// ----- Inspection checklist grid -----

const ChecklistGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  list-style: none;
  margin: 0;
  padding: 0;
`;

interface ChecklistItemProps {
  $verdict: InspectionVerdict;
}

const ChecklistItem = styled.li<ChecklistItemProps>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-left: 3px solid ${({ $verdict }) => VERDICT_COLORS[$verdict]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const ChecklistIconWrapper = styled.span<{ $color: string }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ $color }) => $color};
  margin-top: 2px;
`;

const ChecklistContent = styled.div`
  min-width: 0;
`;

const ChecklistTaskName = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 2px;
`;

const ChecklistSummary = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// ----- Farm status cards -----

const FarmCardsGrid = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const FarmCard = styled.li`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
`;

const FarmCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FarmCardName = styled.h4`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FarmHealthBadge = styled.span`
  flex-shrink: 0;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const FarmEfficiency = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
`;

const FarmEfficiencyLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: ${({ theme }) => theme.spacing.xs};
`;

const FarmIssuesList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FarmIssueItem = styled.li`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding-left: ${({ theme }) => theme.spacing.sm};
  position: relative;

  &::before {
    content: '•';
    position: absolute;
    left: 0;
    color: ${({ theme }) => theme.colors.neutral[500] ?? '#9e9e9e'};
  }
`;

// ----- Recommendations list -----

const RecommendationsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

interface RecommendationItemProps {
  $priority: RecommendationPriority;
}

const RecommendationItem = styled.li<RecommendationItemProps>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-left: 3px solid ${({ $priority }) => PRIORITY_COLORS[$priority]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

interface PriorityTagProps {
  $priority: RecommendationPriority;
}

const PriorityTag = styled.span<PriorityTagProps>`
  flex-shrink: 0;
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  background: ${({ $priority }) => `${PRIORITY_COLORS[$priority]}1a`};
  color: ${({ $priority }) => PRIORITY_COLORS[$priority]};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
`;

const RecommendationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const RecommendationCategory = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const RecommendationMessage = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
`;

const RecommendationFarms = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
`;

// ----- Raw data fallback -----

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  text-align: center;
`;

const StatValue = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
`;

const StatLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const Th = styled.th`
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  text-align: left;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

// ============================================================================
// HELPERS
// ============================================================================

function VerdictIcon({ verdict }: { verdict: InspectionVerdict }) {
  const color = VERDICT_COLORS[verdict];
  const size = 16;
  if (verdict === 'pass') return <CheckCircle size={size} color={color} aria-hidden="true" />;
  if (verdict === 'warning') return <AlertTriangle size={size} color={color} aria-hidden="true" />;
  return <XCircle size={size} color={color} aria-hidden="true" />;
}

function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    collecting: 'Collecting',
    generating: 'Generating',
    completed: 'Completed',
    generation_failed: 'AI Failed',
    failed: 'Failed',
  };
  return labels[status] ?? status;
}

function statusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    completed: '#4caf50',
    collecting: '#2196f3',
    generating: '#2196f3',
    generation_failed: '#ff9800',
    failed: '#f44336',
  };
  return colors[status] ?? '#9e9e9e';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ReportStatusBanner({ report }: { report: DashboardReport }) {
  return (
    <StatusBanner role="status" aria-label="Report metadata">
      <StatusMeta>
        <Clock size={14} aria-hidden="true" />
        Last updated:{' '}
        {report.completedAt
          ? new Date(report.completedAt).toLocaleString()
          : new Date(report.startedAt).toLocaleString()}
      </StatusMeta>

      {report.durationSeconds !== null && (
        <StatusMeta>
          <Activity size={14} aria-hidden="true" />
          Duration: {report.durationSeconds}s
        </StatusMeta>
      )}

      <StatusMeta>
        Triggered by: <strong>{report.triggeredBy}</strong>
      </StatusMeta>

      <StatusBadge $color={statusBadgeColor(report.status)}>
        {formatStatusLabel(report.status)}
      </StatusBadge>
    </StatusBanner>
  );
}

function InspectionChecklist({ results }: { results: InspectionResult[] }) {
  return (
    <Section aria-labelledby="checklist-heading">
      <SectionHeading id="checklist-heading">
        <CheckCircle size={20} aria-hidden="true" />
        Inspection Checklist
      </SectionHeading>
      <ChecklistGrid role="list">
        {results.map((item, index) => (
          <ChecklistItem key={`${item.taskName}-${index}`} $verdict={item.verdict} role="listitem">
            <ChecklistIconWrapper $color={VERDICT_COLORS[item.verdict]}>
              <VerdictIcon verdict={item.verdict} />
            </ChecklistIconWrapper>
            <ChecklistContent>
              <ChecklistTaskName>{item.taskName}</ChecklistTaskName>
              <ChecklistSummary title={item.summary}>{item.summary}</ChecklistSummary>
            </ChecklistContent>
          </ChecklistItem>
        ))}
      </ChecklistGrid>
    </Section>
  );
}

function FarmStatusCards({ cards }: { cards: FarmStatusCard[] }) {
  return (
    <Section aria-labelledby="farm-status-heading">
      <SectionHeading id="farm-status-heading">
        <TrendingUp size={20} aria-hidden="true" />
        Farm Status
      </SectionHeading>
      <FarmCardsGrid role="list">
        {cards.map((card) => (
          <FarmCard key={card.farmId} role="listitem">
            <FarmCardHeader>
              <FarmCardName title={card.farmName}>{card.farmName}</FarmCardName>
              <FarmHealthBadge>{card.health}</FarmHealthBadge>
            </FarmCardHeader>

            <FarmEfficiency>
              {card.yieldEfficiency.toFixed(1)}%
              <FarmEfficiencyLabel>yield efficiency</FarmEfficiencyLabel>
            </FarmEfficiency>

            {card.topIssues.length > 0 && (
              <FarmIssuesList aria-label={`Top issues for ${card.farmName}`}>
                {card.topIssues.slice(0, 3).map((issue, i) => (
                  <FarmIssueItem key={i}>{issue}</FarmIssueItem>
                ))}
              </FarmIssuesList>
            )}
          </FarmCard>
        ))}
      </FarmCardsGrid>
    </Section>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <Section aria-labelledby="recommendations-heading">
      <SectionHeading id="recommendations-heading">
        <BarChart2 size={20} aria-hidden="true" />
        Recommendations
      </SectionHeading>
      <RecommendationsList role="list">
        {recommendations.map((rec, index) => (
          <RecommendationItem
            key={`${rec.category}-${index}`}
            $priority={rec.priority}
            role="listitem"
          >
            <PriorityTag $priority={rec.priority}>{rec.priority}</PriorityTag>
            <RecommendationContent>
              <RecommendationCategory>{rec.category}</RecommendationCategory>
              <RecommendationMessage>{rec.message}</RecommendationMessage>
              {rec.affectedFarms.length > 0 && (
                <RecommendationFarms>
                  Affects: {rec.affectedFarms.join(', ')}
                </RecommendationFarms>
              )}
            </RecommendationContent>
          </RecommendationItem>
        ))}
      </RecommendationsList>
    </Section>
  );
}

/**
 * Fallback display when AI analysis failed but raw data is available.
 * Shows census stats, yield table, and equipment/alert counts.
 */
function RawDataFallback({ report }: { report: DashboardReport }) {
  const { rawData } = report;
  if (!rawData) return null;

  return (
    <>
      {rawData.farmCensus && (
        <Section aria-labelledby="census-heading">
          <SectionHeading id="census-heading">
            <Cpu size={20} aria-hidden="true" />
            Farm Census
          </SectionHeading>
          <StatsGrid>
            <StatCard>
              <StatValue>{rawData.farmCensus.totalFarms}</StatValue>
              <StatLabel>Total Farms</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{rawData.farmCensus.totalBlocks}</StatValue>
              <StatLabel>Total Blocks</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{(rawData.farmCensus.utilization * 100).toFixed(1)}%</StatValue>
              <StatLabel>Utilization</StatLabel>
            </StatCard>
            {Object.entries(rawData.farmCensus.blocksByState).map(([state, count]) => (
              <StatCard key={state}>
                <StatValue>{count as number}</StatValue>
                <StatLabel>{state}</StatLabel>
              </StatCard>
            ))}
          </StatsGrid>
        </Section>
      )}

      {rawData.yieldAssessment && rawData.yieldAssessment.farms.length > 0 && (
        <Section aria-labelledby="yield-heading">
          <SectionHeading id="yield-heading">
            <TrendingUp size={20} aria-hidden="true" />
            Yield Assessment
          </SectionHeading>
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th scope="col">Farm</Th>
                  <Th scope="col">Predicted (kg)</Th>
                  <Th scope="col">Actual (kg)</Th>
                  <Th scope="col">Efficiency</Th>
                </tr>
              </thead>
              <tbody>
                {rawData.yieldAssessment.farms.map((farm) => (
                  <tr key={farm.farmId}>
                    <Td>{farm.farmName}</Td>
                    <Td>{farm.predictedYieldKg.toFixed(1)}</Td>
                    <Td>{farm.actualYieldKg.toFixed(1)}</Td>
                    <Td>{farm.efficiency.toFixed(1)}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        </Section>
      )}

      {(rawData.equipmentHealth || rawData.senseHubAlerts) && (
        <Section aria-labelledby="equipment-heading">
          <SectionHeading id="equipment-heading">
            <Zap size={20} aria-hidden="true" />
            Equipment &amp; Alerts
          </SectionHeading>
          <StatsGrid>
            {rawData.equipmentHealth && (
              <>
                <StatCard>
                  <StatValue>{rawData.equipmentHealth.totalOnline}</StatValue>
                  <StatLabel>Equipment Online</StatLabel>
                </StatCard>
                <StatCard>
                  <StatValue>{rawData.equipmentHealth.totalOffline}</StatValue>
                  <StatLabel>Equipment Offline</StatLabel>
                </StatCard>
              </>
            )}
            {rawData.senseHubAlerts && (
              <>
                <StatCard>
                  <StatValue>{rawData.senseHubAlerts.totalAlerts}</StatValue>
                  <StatLabel>Total Alerts</StatLabel>
                </StatCard>
                <StatCard>
                  <StatValue>{rawData.senseHubAlerts.criticalCount}</StatValue>
                  <StatLabel>Critical Alerts</StatLabel>
                </StatCard>
              </>
            )}
          </StatsGrid>
        </Section>
      )}
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AIDashboardView({ report, generating }: AIDashboardViewProps) {
  // Empty state — no report exists yet
  if (!report && !generating) {
    return (
      <EmptyState role="status" aria-label="No inspection reports available">
        <Activity size={48} color="#9e9e9e" aria-hidden="true" />
        <EmptyStateTitle>No Inspection Reports Yet</EmptyStateTitle>
        <EmptyStateDescription>
          No inspection reports have been generated yet. Click &quot;Run Inspection&quot; to generate
          the first report.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  const generationFailed = report?.status === 'generation_failed';
  const healthRating = report?.aiSummary?.overallHealthRating;
  const healthColor = healthRating ? HEALTH_COLORS[healthRating] : '#9e9e9e';

  return (
    <ViewContainer>
      {/* Generating overlay — shown when a new report is being created */}
      {generating && (
        <GeneratingOverlay role="status" aria-live="polite" aria-label="Generating inspection report">
          <SpinnerIcon size={40} aria-hidden="true" />
          <GeneratingLabel>Generating Inspection Report</GeneratingLabel>
          <GeneratingSubLabel>
            This may take 30 to 60 seconds. Please wait...
          </GeneratingSubLabel>
        </GeneratingOverlay>
      )}

      {report && (
        <>
          {/* Report metadata header */}
          <ReportStatusBanner report={report} />

          {/* Warning banner when AI summary was unavailable */}
          {generationFailed && (
            <WarningBanner role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                AI analysis unavailable. Showing raw inspection data only.
                {report.error && <> Reason: {report.error}</>}
              </span>
            </WarningBanner>
          )}

          {/* AI-generated executive summary */}
          {report.aiSummary && (
            <>
              <ExecutiveSummary
                $color={healthColor}
                aria-label={`Overall health: ${healthRating}`}
              >
                <SummaryHeader>
                  <SummaryTitle>Executive Summary</SummaryTitle>
                  {healthRating && (
                    <HealthBadge $color={healthColor}>{healthRating}</HealthBadge>
                  )}
                </SummaryHeader>
                <SummaryText>{report.aiSummary.executiveSummary}</SummaryText>
              </ExecutiveSummary>

              {/* Inspection checklist */}
              {report.aiSummary.inspectionResults.length > 0 && (
                <InspectionChecklist results={report.aiSummary.inspectionResults} />
              )}

              {/* Farm status cards */}
              {report.aiSummary.farmStatusCards.length > 0 && (
                <FarmStatusCards cards={report.aiSummary.farmStatusCards} />
              )}

              {/* Recommendations */}
              {report.aiSummary.recommendations.length > 0 && (
                <RecommendationsSection recommendations={report.aiSummary.recommendations} />
              )}
            </>
          )}

          {/* Raw data fallback — shown when AI summary is unavailable */}
          {!report.aiSummary && report.rawData && (
            <RawDataFallback report={report} />
          )}
        </>
      )}
    </ViewContainer>
  );
}
