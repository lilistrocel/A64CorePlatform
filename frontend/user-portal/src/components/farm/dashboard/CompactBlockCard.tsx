/**
 * CompactBlockCard Component
 *
 * Compact block card showing state-specific information.
 * Displays different layouts for each of the 8 block states.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useBlockActions } from '../../../hooks/farm/useBlockActions';
import type { DashboardBlock, DashboardBlockStatus } from '../../../types/farm';
import type { DashboardConfig } from '../../../hooks/farm/useDashboardConfig';

interface CompactBlockCardProps {
  block: DashboardBlock;
  farmId: string;
  config: DashboardConfig;
  onUpdate?: () => void;
}

export function CompactBlockCard({ block, farmId, config, onUpdate }: CompactBlockCardProps) {
  const [showActions, setShowActions] = useState(false);
  const { transitionBlock, recordHarvest, transitioning, recordingHarvest } = useBlockActions();

  const stateColor = config.colorScheme.stateColors[block.state] || '#6B7280';
  const stateIcon = config.icons.states[block.state] || '⚫';

  /**
   * Get performance color
   */
  const getPerformanceColor = () => {
    return config.colorScheme.performanceColors[block.calculated.performanceCategory] || '#6B7280';
  };

  /**
   * Get timeline color (early/on-time/late)
   */
  const getTimelineColor = () => {
    if (block.calculated.delayDays < 0) {
      return config.colorScheme.timelinessColors.early;
    } else if (block.calculated.delayDays === 0) {
      return config.colorScheme.timelinessColors.onTime;
    } else if (block.calculated.delayDays <= 3) {
      return config.colorScheme.timelinessColors.slightlyLate;
    } else if (block.calculated.delayDays <= 7) {
      return config.colorScheme.timelinessColors.late;
    } else {
      return config.colorScheme.timelinessColors.veryLate;
    }
  };

  /**
   * Handle quick transition
   */
  const handleTransition = async (newState: DashboardBlockStatus) => {
    try {
      await transitionBlock(farmId, block.blockId, { newState });
      onUpdate?.();
    } catch (error) {
      console.error('Transition failed:', error);
    }
  };

  /**
   * Handle quick harvest (for demo - would show modal in real app)
   */
  const handleQuickHarvest = async () => {
    try {
      await recordHarvest(farmId, block.blockId, {
        quantityKg: 10,
        qualityGrade: 'A',
        notes: 'Quick harvest from dashboard',
      });
      onUpdate?.();
    } catch (error) {
      console.error('Harvest recording failed:', error);
    }
  };

  return (
    <Card
      $stateColor={stateColor}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <Header>
        <BlockCode>{config.layout.showBlockCode && block.blockCode}</BlockCode>
        <StateBadge $color={stateColor}>
          <span>{stateIcon}</span>
          <span>{block.state.charAt(0).toUpperCase() + block.state.slice(1)}</span>
        </StateBadge>
      </Header>

      {/* Block Name */}
      {block.name && config.layout.showBlockName && (
        <BlockName>{block.name}</BlockName>
      )}

      {/* State-Specific Content */}
      <Content>
        {/* EMPTY STATE */}
        {block.state === 'empty' && (
          <EmptyContent>
            <EmptyIcon>⚪</EmptyIcon>
            <EmptyText>Block is empty</EmptyText>
            <Capacity>
              Capacity: {block.maxPlants} plants
            </Capacity>
          </EmptyContent>
        )}

        {/* PLANNED STATE */}
        {block.state === 'planned' && (
          <PlannedContent>
            {block.targetCropName && (
              <CropInfo>
                <CropIcon>🌱</CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}
            <Capacity>
              Planned: {block.actualPlantCount || 0} / {block.maxPlants} plants
            </Capacity>
            {block.calculated.expectedStateChangeDate && (
              <Timeline>
                <TimelineIcon>📅</TimelineIcon>
                <TimelineText>
                  Plant in {Math.abs(block.calculated.daysUntilNextTransition || 0)} days
                </TimelineText>
              </Timeline>
            )}
          </PlannedContent>
        )}

        {/* PLANTED, GROWING, FRUITING STATES */}
        {(block.state === 'planted' || block.state === 'growing' || block.state === 'fruiting') && (
          <GrowingContent>
            {block.targetCropName && (
              <CropInfo>
                <CropIcon>🌿</CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}

            <CapacityBar>
              <CapacityLabel>
                Capacity: {block.actualPlantCount || 0} / {block.maxPlants}
              </CapacityLabel>
              <ProgressBar>
                <ProgressFill
                  $percent={block.calculated.capacityPercent}
                  $color={stateColor}
                />
              </ProgressBar>
              <CapacityPercent>
                {block.calculated.capacityPercent.toFixed(0)}%
              </CapacityPercent>
            </CapacityBar>

            <StateInfo>
              <InfoItem>
                <InfoIcon>⏱️</InfoIcon>
                <InfoText>
                  {block.calculated.daysInCurrentState} days in {block.state}
                </InfoText>
              </InfoItem>

              {block.calculated.isDelayed && (
                <DelayBadge $color={getTimelineColor()}>
                  {block.calculated.delayDays}d late
                </DelayBadge>
              )}
            </StateInfo>
          </GrowingContent>
        )}

        {/* HARVESTING STATE */}
        {block.state === 'harvesting' && (
          <HarvestingContent>
            {block.targetCropName && (
              <CropInfo>
                <CropIcon>🧺</CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}

            <YieldProgress>
              <YieldLabel>
                {block.kpi.actualYieldKg.toFixed(1)} / {block.kpi.predictedYieldKg.toFixed(1)} kg
              </YieldLabel>
              <ProgressBar>
                <ProgressFill
                  $percent={Math.min(block.calculated.yieldProgress, 100)}
                  $color={getPerformanceColor()}
                />
              </ProgressBar>
              <PerformanceBadge $color={getPerformanceColor()}>
                {block.calculated.yieldProgress.toFixed(0)}% •{' '}
                {config.icons.metrics.performance[block.calculated.performanceCategory]}
              </PerformanceBadge>
            </YieldProgress>

            <HarvestInfo>
              <InfoItem>
                <InfoIcon>📊</InfoIcon>
                <InfoText>
                  {block.kpi.totalHarvests} harvest{block.kpi.totalHarvests !== 1 ? 's' : ''}
                </InfoText>
              </InfoItem>
            </HarvestInfo>
          </HarvestingContent>
        )}

        {/* CLEANING STATE */}
        {block.state === 'cleaning' && (
          <CleaningContent>
            <CleaningIcon>🧹</CleaningIcon>
            <CleaningText>Preparing for next cycle</CleaningText>
            {block.kpi.actualYieldKg > 0 && (
              <LastYield>
                Last yield: {block.kpi.actualYieldKg.toFixed(1)} kg (
                {block.kpi.yieldEfficiencyPercent.toFixed(0)}%)
              </LastYield>
            )}
          </CleaningContent>
        )}
      </Content>

      {/* Alerts */}
      {block.activeAlerts.length > 0 && (
        <AlertsSection>
          {block.activeAlerts.slice(0, 2).map((alert) => (
            <AlertBadge key={alert.alertId} $severity={alert.severity}>
              ⚠️ {alert.title}
            </AlertBadge>
          ))}
          {block.activeAlerts.length > 2 && (
            <MoreAlerts>+{block.activeAlerts.length - 2} more</MoreAlerts>
          )}
        </AlertsSection>
      )}

      {/* Quick Actions (on hover) */}
      {showActions && (
        <QuickActions>
          {block.state === 'empty' && (
            <ActionButton
              onClick={() => handleTransition('planned')}
              disabled={transitioning}
              $variant="plan"
            >
              📋 Plan
            </ActionButton>
          )}
          {block.state === 'planned' && (
            <ActionButton
              onClick={() => handleTransition('growing')}
              disabled={transitioning}
              $variant="plant"
            >
              🌱 Plant
            </ActionButton>
          )}
          {block.state === 'planted' && (
            <ActionButton
              onClick={() => handleTransition('growing')}
              disabled={transitioning}
            >
              → Growing
            </ActionButton>
          )}
          {block.state === 'growing' && (
            <ActionButton
              onClick={() => handleTransition('fruiting')}
              disabled={transitioning}
            >
              → Fruiting
            </ActionButton>
          )}
          {block.state === 'fruiting' && (
            <ActionButton
              onClick={() => handleTransition('harvesting')}
              disabled={transitioning}
            >
              → Harvesting
            </ActionButton>
          )}
          {block.state === 'harvesting' && (
            <ActionButton
              onClick={handleQuickHarvest}
              disabled={recordingHarvest}
              $variant="success"
            >
              📥 Harvest
            </ActionButton>
          )}
        </QuickActions>
      )}
    </Card>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div<{ $stateColor: string }>`
  background: white;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  border-left: 4px solid ${(props) => props.$stateColor};
  transition: all 200ms ease-in-out;
  position: relative;
  min-height: 180px;
  display: flex;
  flex-direction: column;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const BlockCode = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #212121;
  font-family: 'Courier New', monospace;
`;

const StateBadge = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: ${(props) => `${props.$color}15`};
  font-size: 10px;
  font-weight: 600;
  color: ${(props) => props.$color};
  text-transform: uppercase;
`;

const BlockName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #616161;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// Empty State
const EmptyContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  opacity: 0.6;
`;

const EmptyIcon = styled.div`
  font-size: 32px;
  margin-bottom: 8px;
`;

const EmptyText = styled.div`
  font-size: 12px;
  color: #757575;
  margin-bottom: 4px;
`;

// Planned State
const PlannedContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

// Growing States
const GrowingContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// Harvesting State
const HarvestingContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// Cleaning State
const CleaningContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
`;

const CleaningIcon = styled.div`
  font-size: 32px;
  margin-bottom: 8px;
`;

const CleaningText = styled.div`
  font-size: 12px;
  color: #757575;
  margin-bottom: 4px;
`;

const LastYield = styled.div`
  font-size: 11px;
  color: #9e9e9e;
`;

// Common Elements
const CropInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CropIcon = styled.span`
  font-size: 16px;
`;

const CropName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #212121;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Capacity = styled.div`
  font-size: 11px;
  color: #757575;
`;

const CapacityBar = styled.div``;

const CapacityLabel = styled.div`
  font-size: 11px;
  color: #757575;
  margin-bottom: 4px;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
`;

const ProgressFill = styled.div<{ $percent: number; $color: string }>`
  height: 100%;
  width: ${(props) => Math.min(props.$percent, 100)}%;
  background: ${(props) => props.$color};
  transition: width 300ms ease-in-out;
`;

const CapacityPercent = styled.div`
  font-size: 10px;
  color: #9e9e9e;
  text-align: right;
`;

const StateInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const InfoIcon = styled.span`
  font-size: 12px;
`;

const InfoText = styled.span`
  font-size: 11px;
  color: #616161;
`;

const DelayBadge = styled.div<{ $color: string }>`
  padding: 2px 6px;
  border-radius: 4px;
  background: ${(props) => props.$color};
  color: white;
  font-size: 10px;
  font-weight: 600;
`;

const Timeline = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const TimelineIcon = styled.span`
  font-size: 12px;
`;

const TimelineText = styled.span`
  font-size: 11px;
  color: #616161;
`;

const YieldProgress = styled.div``;

const YieldLabel = styled.div`
  font-size: 12px;
  color: #212121;
  font-weight: 600;
  margin-bottom: 4px;
`;

const PerformanceBadge = styled.div<{ $color: string }>`
  font-size: 10px;
  font-weight: 600;
  color: ${(props) => props.$color};
  text-align: right;
`;

const HarvestInfo = styled.div``;

const AlertsSection = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const AlertBadge = styled.div<{ $severity: string }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: ${(props) => {
    switch (props.$severity) {
      case 'critical':
        return '#FEE2E2';
      case 'high':
        return '#FEF3C7';
      case 'medium':
        return '#DBEAFE';
      default:
        return '#F3F4F6';
    }
  }};
  color: ${(props) => {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MoreAlerts = styled.div`
  font-size: 10px;
  color: #9e9e9e;
  text-align: center;
`;

const QuickActions = styled.div`
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.95);
  padding: 4px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const ActionButton = styled.button<{ $variant?: 'success' | 'plan' | 'plant' }>`
  flex: 1;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: ${(props) => {
    switch (props.$variant) {
      case 'success':
        return '#10B981';
      case 'plan':
        return '#3B82F6';
      case 'plant':
        return '#10B981';
      default:
        return '#3B82F6';
    }
  }};
  color: white;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${(props) => {
      switch (props.$variant) {
        case 'success':
          return '#059669';
        case 'plan':
          return '#1976D2';
        case 'plant':
          return '#059669';
        default:
          return '#1976D2';
      }
    }};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
