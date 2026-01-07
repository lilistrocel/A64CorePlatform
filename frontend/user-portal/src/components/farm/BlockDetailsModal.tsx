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
import styled from 'styled-components';
import { getBlockHarvestSummary } from '../../services/farmApi';
import type { DashboardBlock } from '../../types/farm';
import { BlockAutomationTab } from './BlockAutomationTab';

type QualityGrade = 'A' | 'B' | 'C';

const HARVEST_GRADE_COLORS: Record<QualityGrade, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
};

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
  const [loading, setLoading] = useState(true);
  const [harvestSummary, setHarvestSummary] = useState<BlockHarvestSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (isOpen) {
      loadBlockDetails();
    }
  }, [isOpen, block.blockId]);

  const loadBlockDetails = async () => {
    try {
      setLoading(true);

      // Fetch block harvest summary (only if block is harvesting or has harvests)
      if (block.state === 'harvesting' || block.kpi.totalHarvests > 0) {
        const summary = await getBlockHarvestSummary(farmId, block.blockId);
        setHarvestSummary(summary);
      }
    } catch (error) {
      console.error('Failed to load block harvest summary:', error);
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

  const getStatusColor = () => {
    const colors: Record<string, string> = {
      empty: '#6B7280',
      planned: '#3B82F6',
      planted: '#10B981',
      growing: '#10B981',
      fruiting: '#A855F7',
      harvesting: '#F59E0B',
      cleaning: '#F97316',
    };
    return colors[block.state] || '#6B7280';
  };

  const renderGrowthTimeline = () => {
    const stages = [
      { key: 'planned', label: 'Planned', date: null, icon: '📋' },
      { key: 'planted', label: 'Planted', date: block.plantedDate, icon: '🌱' },
      { key: 'growing', label: 'Growing', date: block.expectedStatusChanges?.growing, icon: '🌿' },
      { key: 'fruiting', label: 'Fruiting', date: block.expectedStatusChanges?.fruiting, icon: '🌸' },
      { key: 'harvesting', label: 'Harvesting', date: block.expectedHarvestDate, icon: '🧺' },
      { key: 'cleaning', label: 'Cleaning', date: null, icon: '🧹' },
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

          return (
            <TimelineStage key={stage.key}>
              <TimelineIcon
                $status={isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}
              >
                {stage.icon}
              </TimelineIcon>
              <TimelineContent>
                <TimelineLabel $isCurrent={isCurrent}>{stage.label}</TimelineLabel>
                {stage.date && (
                  <TimelineDate>{formatDate(stage.date)}</TimelineDate>
                )}
                {!stage.date && (isCompleted || isCurrent) && (
                  <TimelineDate>Completed</TimelineDate>
                )}
                {!stage.date && isPending && (
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
    if (!harvestSummary || harvestSummary.totalHarvests === 0) {
      return (
        <EmptyState>
          <EmptyIcon>🧺</EmptyIcon>
          <EmptyText>No harvest entries yet</EmptyText>
        </EmptyState>
      );
    }

    const grades: QualityGrade[] = ['A', 'B', 'C'];
    const gradeQuantities: Record<QualityGrade, number> = {
      A: harvestSummary.qualityAKg,
      B: harvestSummary.qualityBKg,
      C: harvestSummary.qualityCKg,
    };
    const hasGradeData = grades.some((grade) => gradeQuantities[grade] > 0);

    return (
      <HarvestHistorySection>
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
                  <GradeCard key={grade} $color={HARVEST_GRADE_COLORS[grade]}>
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
            <BlockCode>{block.blockCode}</BlockCode>
            <StatusBadge $color={getStatusColor()}>
              {block.state.charAt(0).toUpperCase() + block.state.slice(1)}
            </StatusBadge>
          </HeaderLeft>
          <CloseButton onClick={onClose}>×</CloseButton>
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
                      <InfoValue>🌿 {block.targetCropName}</InfoValue>
                    </InfoItem>
                  )}
                  <InfoItem>
                    <InfoLabel>Capacity:</InfoLabel>
                    <InfoValue>
                      {block.actualPlantCount || 0} / {block.maxPlants} plants
                      {' '}({block.calculated.capacityPercent.toFixed(0)}%)
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

              {/* Performance Metrics */}
              {block.state === 'harvesting' && (
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
            <BlockAutomationTab blockId={block.blockId} farmId={farmId} />
          )}
        </Content>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl};
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.xl};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  overflow-x: auto;
  background: ${({ theme }) => theme.colors.surface};

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.neutral[300]};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ $active, theme }) => ($active ? theme.colors.surface : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.textSecondary)};
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary[500] : 'transparent')};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BlockCode = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  font-family: 'Courier New', monospace;
`;

const StatusBadge = styled.div<{ $color: string }>`
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  text-transform: capitalize;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
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
    background: ${({ theme }) => theme.colors.neutral[100]};
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
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const SectionSubtitle = styled.h4`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
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
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'completed':
        return theme.colors.success;
      case 'current':
        return theme.colors.primary[500];
      case 'pending':
        return theme.colors.neutral[200];
    }
  }};
  border: 3px solid ${({ theme }) => theme.colors.surface};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  font-weight: ${({ $isCurrent, theme }) =>
    $isCurrent
      ? theme.typography.fontWeight.semibold
      : theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TimelineDate = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TimelineConnector = styled.div<{ $completed: boolean }>`
  position: absolute;
  left: 20px;
  top: 50px;
  width: 2px;
  height: calc(100% + 16px);
  background: ${({ $completed, theme }) =>
    $completed ? theme.colors.success : theme.colors.neutral[300]};
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
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const StatLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const StatValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatSubtext = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
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
  background: ${({ $color }) => `${$color}10`};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const GradeQuantity = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const GradePercentage = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const HarvestDates = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DateValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PerformanceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const PerformanceCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const PerformanceLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PerformanceValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
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
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const LoadingState = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
