/**
 * Block Details Modal
 *
 * Comprehensive modal showing:
 * - Block header (code, status, plant info)
 * - Current planting details
 * - Harvest history with visualization
 * - Growth cycle timeline
 */

import { useState, useEffect } from 'react';
import styled, { useTheme } from 'styled-components';
import {
  ClipboardList,
  Sprout,
  Flower2,
  Wheat,
  Sparkles,
  Inbox,
  X,
} from 'lucide-react';
import { glassPanel, monoLabel, phaseBadge, hexToRgba } from '@a64core/shared';
import type { Theme, PhaseKey } from '@a64core/shared';
import { getBlockHarvestSummary, getBlockHarvests } from '../../services/farmApi';
import { farmApi } from '../../services/farmApi';
import type { DashboardBlock, BlockHarvest } from '../../types/farm';
import { BLOCK_STATE_PHASE_KEYS } from '../../types/farm';
import { BlockAutomationTab } from './BlockAutomationTab';

type QualityGrade = 'A' | 'B' | 'C';

// Quality grade extrapolates the phase vocabulary (spec §5.2) — gold/warning
// stays reserved for the literal Harvesting phase, not an ordinary grade
// chip (spec §3). This is a distinct vocabulary from block state — see
// BLOCK_STATE_PHASE_KEYS (types/farm.ts) for the canonical state→phase map.
function getHarvestGradeColor(theme: Theme, grade: QualityGrade): string {
  const map: Record<QualityGrade, string> = {
    A: theme.colors.phase.fruiting,
    B: theme.colors.phase.inoculated,
    C: theme.colors.phase.fruitingInit,
  };
  return map[grade];
}


const HARVEST_GRADE_LABELS: Record<QualityGrade, string> = {
  A: 'Premium',
  B: 'Good',
  C: 'Standard',
};

interface BlockHarvestSummary {
  blockId: string;
  totalHarvests: number;
  totalQuantityKg: number;
  qualityAKg: number;
  qualityBKg: number;
  qualityCKg: number;
  averageQualityGrade: string;
  firstHarvestDate?: string;
  lastHarvestDate?: string;
}

interface BlockDetailsModalProps {
  isOpen: boolean;
  block: DashboardBlock;
  farmId: string;
  onClose: () => void;
}

type TabType = 'overview' | 'timeline' | 'harvests' | 'automation';

export function BlockDetailsModal({ isOpen, block, farmId, onClose }: BlockDetailsModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [harvestSummary, setHarvestSummary] = useState<BlockHarvestSummary | null>(null);
  const [harvests, setHarvests] = useState<BlockHarvest[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (isOpen) {
      loadBlockDetails();
    }
  }, [isOpen, block.blockId]);

  const loadBlockDetails = async () => {
    try {
      setLoading(true);

      // Fetch block harvest summary and individual harvests (only if block is harvesting or has harvests)
      if (block.state === 'harvesting' || block.kpi.totalHarvests > 0) {
        const [summary, harvestsResponse] = await Promise.all([
          getBlockHarvestSummary(farmId, block.blockId).catch(() => null),
          getBlockHarvests(farmId, block.blockId, 1, 100).catch(() => ({ items: [] })),
        ]);
        setHarvestSummary(summary);
        setHarvests(harvestsResponse.items || []);
      }
    } catch (error) {
      console.error('Failed to load block harvest data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderGrowthTimeline = () => {
    // Helper to find actual status change date from history
    const getActualChangeDate = (status: string): string | null => {
      const change = block.statusChanges?.find(c => c.status === status);
      return change?.changedAt || null;
    };

    // Build stages with both expected and actual dates
    const stages = [
      {
        key: 'planned',
        label: 'Planned',
        actualDate: getActualChangeDate('planned'),
        expectedDate: null,
        icon: ClipboardList
      },
      {
        key: 'growing',
        label: 'Growing/Planted',
        actualDate: getActualChangeDate('growing') || block.plantedDate,
        expectedDate: block.expectedStatusChanges?.growing,
        icon: Sprout
      },
      {
        key: 'fruiting',
        label: 'Fruiting',
        actualDate: getActualChangeDate('fruiting'),
        expectedDate: block.expectedStatusChanges?.fruiting,
        icon: Flower2
      },
      {
        key: 'harvesting',
        label: 'Harvesting',
        actualDate: getActualChangeDate('harvesting'),
        expectedDate: block.expectedHarvestDate || block.expectedStatusChanges?.harvesting,
        icon: Wheat
      },
      {
        key: 'cleaning',
        label: 'Cleaning',
        actualDate: getActualChangeDate('cleaning'),
        expectedDate: null,
        icon: Sparkles
      },
    ];

    // Filter out fruiting if not applicable
    const relevantStages = block.expectedStatusChanges?.fruiting
      ? stages
      : stages.filter((s) => s.key !== 'fruiting');

    const currentStageIndex = relevantStages.findIndex((s) => s.key === block.state);

    return (
      <Timeline>
        {relevantStages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;

          // Determine what date to show
          const hasActualDate = stage.actualDate !== null;
          const hasExpectedDate = stage.expectedDate !== null;

          const StageIcon = stage.icon;
          return (
            <TimelineStage key={stage.key}>
              <TimelineIcon
                $status={isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}
              >
                <StageIcon size={18} strokeWidth={1.8} />
              </TimelineIcon>
              <TimelineContent>
                <TimelineLabel $isCurrent={isCurrent}>{stage.label}</TimelineLabel>

                {/* Show actual date if we have it (for completed or current stages) */}
                {hasActualDate && (
                  <TimelineDate>{formatDate(stage.actualDate)}</TimelineDate>
                )}

                {/* Show expected date for pending stages or as secondary info */}
                {!hasActualDate && hasExpectedDate && isPending && (
                  <TimelineDate>Expected: {formatDate(stage.expectedDate)}</TimelineDate>
                )}

                {/* Show comparison for completed stages */}
                {hasActualDate && hasExpectedDate && (isCompleted || isCurrent) && (
                  <TimelineExpected>Expected: {formatDate(stage.expectedDate)}</TimelineExpected>
                )}

                {/* Fallback for stages with no dates */}
                {!hasActualDate && !hasExpectedDate && (isCompleted || isCurrent) && (
                  <TimelineDate>Completed</TimelineDate>
                )}
                {!hasActualDate && !hasExpectedDate && isPending && (
                  <TimelineDate>Pending</TimelineDate>
                )}
              </TimelineContent>
              {index < relevantStages.length - 1 && (
                <TimelineConnector $completed={isCompleted} />
              )}
            </TimelineStage>
          );
        })}
      </Timeline>
    );
  };

  const renderHarvestHistory = () => {
    // Show empty state only if both summary and harvests are empty
    if ((!harvestSummary || harvestSummary.totalHarvests === 0) && harvests.length === 0) {
      return (
        <EmptyState>
          <EmptyIcon><Inbox size={40} strokeWidth={1.4} /></EmptyIcon>
          <EmptyText>No harvest entries yet</EmptyText>
        </EmptyState>
      );
    }

    const grades: QualityGrade[] = ['A', 'B', 'C'];
    const gradeQuantities: Record<QualityGrade, number> = harvestSummary ? {
      A: harvestSummary.qualityAKg,
      B: harvestSummary.qualityBKg,
      C: harvestSummary.qualityCKg,
    } : { A: 0, B: 0, C: 0 };
    const hasGradeData = grades.some((grade) => gradeQuantities[grade] > 0);

    return (
      <HarvestHistorySection>
        {harvestSummary && (
          <>
            <HarvestStats>
              <StatCard>
                <StatLabel>Total Harvested</StatLabel>
                <StatValue>{harvestSummary.totalQuantityKg.toFixed(2)} kg</StatValue>
              </StatCard>
              <StatCard>
                <StatLabel>Total Harvests</StatLabel>
                <StatValue>{harvestSummary.totalHarvests}</StatValue>
              </StatCard>
              <StatCard>
                <StatLabel>Yield Progress</StatLabel>
                <StatValue>
                  {block.kpi.actualYieldKg.toFixed(1)} / {block.kpi.predictedYieldKg.toFixed(1)} kg
                </StatValue>
                <StatSubtext>
                  {block.calculated.yieldProgress.toFixed(0)}% of predicted
                </StatSubtext>
              </StatCard>
            </HarvestStats>

            {hasGradeData && (
              <GradeBreakdown>
                <SectionSubtitle>Quality Grade Breakdown</SectionSubtitle>
                <GradeGrid>
                  {grades.map((grade) => {
                    const quantity = gradeQuantities[grade];
                    if (quantity === 0) return null;
                    const percentage = (quantity / harvestSummary.totalQuantityKg) * 100;

                    return (
                      <GradeCard key={grade} $color={getHarvestGradeColor(theme, grade)}>
                        <GradeHeader>
                          <GradeBadge>{grade}</GradeBadge>
                          <GradeLabel>{HARVEST_GRADE_LABELS[grade]}</GradeLabel>
                        </GradeHeader>
                        <GradeQuantity>{quantity.toFixed(2)} kg</GradeQuantity>
                        <GradePercentage>{percentage.toFixed(1)}%</GradePercentage>
                      </GradeCard>
                    );
                  })}
                </GradeGrid>
              </GradeBreakdown>
            )}

            {harvestSummary.firstHarvestDate && (
              <HarvestDates>
                <DateInfo>
                  <DateLabel>First Harvest:</DateLabel>
                  <DateValue>{formatDate(harvestSummary.firstHarvestDate)}</DateValue>
                </DateInfo>
                {harvestSummary.lastHarvestDate && (
                  <DateInfo>
                    <DateLabel>Last Harvest:</DateLabel>
                    <DateValue>{formatDate(harvestSummary.lastHarvestDate)}</DateValue>
                  </DateInfo>
                )}
              </HarvestDates>
            )}
          </>
        )}

        {/* Individual Harvest Records */}
        {harvests.length > 0 && (
          <HarvestRecordsSection>
            <SectionSubtitle>Harvest Records ({harvests.length})</SectionSubtitle>
            <HarvestRecordsList>
              {harvests.map((harvest) => (
                <HarvestRecordCard key={harvest.harvestId}>
                  <HarvestRecordInfo>
                    <HarvestRecordDate>
                      {farmApi.formatDateForDisplay(harvest.harvestDate)}
                      {harvest.metadata?.crop && (
                        <HarvestRecordCrop>({harvest.metadata.crop})</HarvestRecordCrop>
                      )}
                    </HarvestRecordDate>
                    <HarvestRecordMeta>
                      <span>{harvest.quantityKg} kg</span>
                      <HarvestRecordDot />
                      <HarvestQualityBadge $grade={harvest.qualityGrade as QualityGrade}>
                        Grade {harvest.qualityGrade}
                      </HarvestQualityBadge>
                      {harvest.recordedByEmail && (
                        <>
                          <HarvestRecordDot />
                          <span>by {harvest.recordedByEmail}</span>
                        </>
                      )}
                    </HarvestRecordMeta>
                    {harvest.notes && (
                      <HarvestRecordNotes>{harvest.notes}</HarvestRecordNotes>
                    )}
                  </HarvestRecordInfo>
                </HarvestRecordCard>
              ))}
            </HarvestRecordsList>
          </HarvestRecordsSection>
        )}
      </HarvestHistorySection>
    );
  };

  return (
    <Overlay
      onClick={onClose}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      <Modal
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <Header>
          <HeaderLeft>
            <HeaderTitles>
              <BlockCodeSmall>{block.blockCode}</BlockCodeSmall>
              <BlockName>{block.name || block.blockCode}</BlockName>
            </HeaderTitles>
            <StatusBadge $phaseKey={BLOCK_STATE_PHASE_KEYS[block.state] ?? 'empty'}>
              {block.state.charAt(0).toUpperCase() + block.state.slice(1)}
            </StatusBadge>
          </HeaderLeft>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </Header>

        <TabBar>
          <Tab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab $active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')}>
            Timeline
          </Tab>
          <Tab $active={activeTab === 'harvests'} onClick={() => setActiveTab('harvests')}>
            Harvests
          </Tab>
          <Tab $active={activeTab === 'automation'} onClick={() => setActiveTab('automation')}>
            Automation
          </Tab>
        </TabBar>

        <Content>
          {activeTab === 'overview' && (
            <>
              {/* Block Overview */}
              <Section>
                <SectionTitle>Block Overview</SectionTitle>
                <InfoGrid>
                  <InfoItem>
                    <InfoLabel>Name:</InfoLabel>
                    <InfoValue>{block.name || 'Unnamed Block'}</InfoValue>
                  </InfoItem>
                  {block.targetCropName && (
                    <InfoItem>
                      <InfoLabel>Current Crop:</InfoLabel>
                      <InfoValue style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Sprout size={14} strokeWidth={1.8} /> {block.targetCropName}
                      </InfoValue>
                    </InfoItem>
                  )}
                  <InfoItem>
                    <InfoLabel>Plants:</InfoLabel>
                    <InfoValue>
                      {block.actualPlantCount || 0} plants
                      {' '}({block.calculated.capacityPercent.toFixed(0)}% capacity)
                    </InfoValue>
                  </InfoItem>
                  {block.plantedDate && (
                    <InfoItem>
                      <InfoLabel>Planted:</InfoLabel>
                      <InfoValue>{formatDate(block.plantedDate)}</InfoValue>
                    </InfoItem>
                  )}
                  {block.expectedHarvestDate && (
                    <InfoItem>
                      <InfoLabel>Expected Harvest:</InfoLabel>
                      <InfoValue>{formatDate(block.expectedHarvestDate)}</InfoValue>
                    </InfoItem>
                  )}
                </InfoGrid>
              </Section>

              {/* Yield: Predicted vs Actual */}
              {block.kpi.predictedYieldKg > 0 && (
                <Section>
                  <SectionTitle>Yield</SectionTitle>
                  <YieldContainer>
                    <YieldHeader>
                      <YieldActual>{block.kpi.actualYieldKg.toFixed(0)} kg</YieldActual>
                      <YieldSeparator>/</YieldSeparator>
                      <YieldPredicted>{block.kpi.predictedYieldKg.toFixed(0)} kg predicted</YieldPredicted>
                    </YieldHeader>
                    <YieldBarBackground>
                      <YieldBarFill
                        $percent={Math.min(block.calculated.yieldProgress, 100)}
                        $overTarget={block.calculated.yieldProgress > 100}
                      />
                    </YieldBarBackground>
                    <YieldFooter>
                      <YieldPercent $overTarget={block.calculated.yieldProgress > 100}>
                        {block.calculated.yieldProgress.toFixed(1)}%
                      </YieldPercent>
                      {block.kpi.totalHarvests > 0 && (
                        <YieldHarvestCount>{block.kpi.totalHarvests} harvests</YieldHarvestCount>
                      )}
                    </YieldFooter>
                  </YieldContainer>
                </Section>
              )}

              {/* Performance Metrics */}
              {block.state !== 'empty' && block.state !== 'planned' && (
                <Section>
                  <SectionTitle>Performance</SectionTitle>
                  <PerformanceGrid>
                    <PerformanceCard>
                      <PerformanceLabel>Yield Efficiency</PerformanceLabel>
                      <PerformanceValue>
                        {block.kpi.yieldEfficiencyPercent.toFixed(1)}%
                      </PerformanceValue>
                    </PerformanceCard>
                    <PerformanceCard>
                      <PerformanceLabel>Performance</PerformanceLabel>
                      <PerformanceValue>
                        {block.calculated.performanceCategory
                          .charAt(0)
                          .toUpperCase() +
                          block.calculated.performanceCategory.slice(1)}
                      </PerformanceValue>
                    </PerformanceCard>
                  </PerformanceGrid>
                </Section>
              )}
            </>
          )}

          {activeTab === 'timeline' && (
            <Section>
              <SectionTitle>Growth Timeline</SectionTitle>
              {renderGrowthTimeline()}
            </Section>
          )}

          {activeTab === 'harvests' && (
            <Section>
              <SectionTitle>Harvest History</SectionTitle>
              {loading ? (
                <LoadingState>Loading harvest data...</LoadingState>
              ) : (
                renderHarvestHistory()
              )}
            </Section>
          )}

          {activeTab === 'automation' && (
            <BlockAutomationTab blockId={block.parentBlockId || block.blockId} farmId={farmId} />
          )}
        </Content>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers"). This is a
// read-only details view (not a data-entry form), so backdrop-click-to-close
// is existing, intentional behaviour — left unchanged.
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  flex-shrink: 0;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  overflow-x: auto;
  flex-shrink: 0;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.cosmosHi};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 16px 24px;
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.muted)};
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : 'transparent')};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const HeaderTitles = styled.div`
  display: flex;
  flex-direction: column;
`;

const BlockCodeSmall = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const BlockName = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// The §4 badge pattern via the shared phaseBadge mixin.
const StatusBadge = styled.div<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: all 0.2s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
  position: relative;
  z-index: 1;
  /* Enable proper scrolling in flex container */
  flex: 1;
  min-height: 0;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const SectionSubtitle = styled.h4`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const InfoLabel = styled.div`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Timeline = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  position: relative;
`;

const TimelineStage = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  position: relative;
`;

const TimelineIcon = styled.div<{ $status: 'completed' | 'current' | 'pending' }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'completed':
        return theme.colors.bright.emerald;
      case 'current':
        return theme.colors.bright.lapis;
      case 'pending':
        return 'rgba(180, 200, 220, 0.1)';
    }
  }};
  color: ${({ $status, theme }) => ($status === 'pending' ? theme.colors.muted : theme.colors.onDark)};
  border: 3px solid ${({ theme }) => theme.colors.cosmosHi};
  box-shadow: 0 2px 8px rgba(4, 6, 18, 0.4);
  z-index: 1;
  flex-shrink: 0;
`;

const TimelineContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
`;

const TimelineLabel = styled.div<{ $isCurrent: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ $isCurrent }) => ($isCurrent ? 700 : 500)};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TimelineDate = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const TimelineExpected = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const TimelineConnector = styled.div<{ $completed: boolean }>`
  position: absolute;
  left: 20px;
  top: 50px;
  width: 2px;
  height: calc(100% + 16px);
  background: ${({ $completed, theme }) =>
    $completed ? theme.colors.bright.emerald : theme.colors.line};
`;

const HarvestHistorySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const HarvestStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const StatCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const StatValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatSubtext = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const GradeBreakdown = styled.div``;

const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const GradeCard = styled.div<{ $color: string }>`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ $color }) => hexToRgba($color, 0.16)};
  border: 2px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const GradeHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const GradeBadge = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

const GradeLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.muted};
`;

const GradeQuantity = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const GradePercentage = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const HarvestDates = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const DateInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const DateLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.muted};
`;

const DateValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const YieldContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
`;

const YieldHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const YieldActual = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const YieldSeparator = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.muted};
`;

const YieldPredicted = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.muted};
`;

const YieldBarBackground = styled.div`
  width: 100%;
  height: 10px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
`;

const YieldBarFill = styled.div<{ $percent: number; $overTarget: boolean }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: ${({ $overTarget, theme }) => ($overTarget ? theme.colors.bright.emerald : theme.colors.bright.lapis)};
  border-radius: 99px;
  transition: width 0.5s ease-in-out;
`;

const YieldFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const YieldPercent = styled.span<{ $overTarget: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 700;
  color: ${({ $overTarget, theme }) => ($overTarget ? theme.colors.bright.emerald : theme.colors.bright.lapis)};
`;

const YieldHarvestCount = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const PerformanceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const PerformanceCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(180, 200, 220, 0.05);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
`;

const PerformanceLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PerformanceValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
`;

const EmptyIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const EmptyText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.muted};
`;

const LoadingState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`;

// Individual Harvest Records Styles
const HarvestRecordsSection = styled.div`
  margin-top: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  padding-top: ${({ theme }) => theme.spacing.lg};
`;

const HarvestRecordsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  max-height: 300px;
  overflow-y: auto;
`;

const HarvestRecordCard = styled.div`
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.08);
  }
`;

const HarvestRecordInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const HarvestRecordDate = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const HarvestRecordCrop = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme }) => theme.colors.bright.emerald};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const HarvestRecordMeta = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const HarvestRecordDot = styled.span`
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.muted};
`;

const HarvestRecordNotes = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

// Quality grade extrapolates the phase vocabulary (spec §5.2) — gold/warning
// stays reserved for the literal Harvesting phase (spec §3). onDark, not
// onAccent, since these fills are phase colours, not gold.
const HarvestQualityBadge = styled.span<{ $grade: QualityGrade }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.onDark};
  background: ${({ $grade, theme }) => {
    switch ($grade) {
      case 'A':
        return theme.colors.phase.fruiting;
      case 'B':
        return theme.colors.phase.inoculated;
      case 'C':
        return theme.colors.phase.fruitingInit;
      default:
        return theme.colors.phase.empty;
    }
  }};
`;
