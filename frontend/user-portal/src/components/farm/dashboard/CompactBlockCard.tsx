/**
 * CompactBlockCard Component
 *
 * Compact block card showing state-specific information.
 * Displays different layouts for each of the 8 block states.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { useTheme, type DefaultTheme } from 'styled-components';
import {
  Circle,
  Sprout,
  Leaf,
  Wheat,
  Sparkles,
  Clock,
  AlertTriangle,
  Calendar,
  BarChart3,
  Check,
  ClipboardList,
  Inbox,
} from 'lucide-react';
import { glassPanelHover, monoLabel, colorBadge } from '@a64core/shared';
import { useBlockActions } from '../../../hooks/farm/useBlockActions';
import { QuickPlanModal } from './QuickPlanModal';
import { ResolveAlertModal } from './ResolveAlertModal';
import { BlockHarvestEntryModal } from '../BlockHarvestEntryModal';
import { BlockAnalyticsModal } from '../BlockAnalyticsModal';
import type { DashboardBlock, DashboardBlockStatus } from '../../../types/farm';
import type { DashboardConfig } from '../../../hooks/farm/useDashboardConfig';
import { STATE_ICON_COMPONENTS } from '../../../hooks/farm/useDashboardConfig';
import { formatNumber } from '../../../utils';

// Alert severity is a distinct vocabulary from the room-phase map (spec
// §5.2) — extrapolated onto bright.* hues rather than reusing warning/gold-b
// for "high" (spec §3: gold is never a status colour except Harvesting).
// Matches BlockAlertsTab.tsx's getSeverityColor.
function getAlertSeverityColor(theme: DefaultTheme, severity: string): string {
  switch (severity) {
    case 'critical':
      return theme.colors.bright.coral;
    case 'high':
      return theme.colors.bright.terra;
    case 'medium':
      return theme.colors.bright.lapis;
    default:
      return theme.colors.muted;
  }
}

interface CompactBlockCardProps {
  block: DashboardBlock;
  farmId: string;
  config: DashboardConfig;
  onUpdate?: () => void;
}

export function CompactBlockCard({ block, farmId, config, onUpdate }: CompactBlockCardProps) {
  const theme = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showResolveAlertModal, setShowResolveAlertModal] = useState(false);
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [planMode, setPlanMode] = useState<'plan' | 'plant'>('plan');
  const { transitionBlock, recordHarvest, transitioning, recordingHarvest } = useBlockActions();

  const stateColor = config.colorScheme.stateColors[block.state] || theme.colors.textSecondary;
  const StateIcon = STATE_ICON_COMPONENTS[block.state];

  /**
   * Get performance color
   */
  const getPerformanceColor = () => {
    const category = block.calculated?.performanceCategory || 'good';
    return config.colorScheme?.performanceColors?.[category] || theme.colors.textSecondary;
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
  const handleTransition = async (newState: DashboardBlockStatus, force: boolean = false) => {
    try {
      await transitionBlock(farmId, block.blockId, { newState, force });
      onUpdate?.();
    } catch (error) {
      console.error('Transition failed:', error);
    }
  };

  /**
   * Handle plan/plant confirmation with crop data
   */
  const handlePlanConfirm = async (cropId: string, plantCount: number) => {
    try {
      const newState = planMode === 'plan' ? 'planned' : 'growing';
      await transitionBlock(farmId, block.blockId, {
        newState: newState as DashboardBlockStatus,
        targetCrop: cropId,
        actualPlantCount: plantCount,
        force: true,
      });
      setShowPlanModal(false);
      onUpdate?.();
    } catch (error) {
      console.error('Plan/Plant failed:', error);
    }
  };

  /**
   * Handle harvest button click - open harvest entry modal
   */
  const handleHarvestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHarvestModal(true);
  };

  /**
   * Handle harvest entry completion
   */
  const handleHarvestComplete = () => {
    setShowHarvestModal(false);
    onUpdate?.();
  };

  return (
    <>
      <Card
      $stateColor={stateColor}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        // Don't hide actions if any modal is open
        if (!showPlanModal && !showResolveAlertModal && !showHarvestModal && !showAnalyticsModal) {
          setShowActions(false);
        }
      }}
    >
      {/* Header - code as small top text */}
      <Header>
        <BlockCode>{config.layout.showBlockCode && block.blockCode}</BlockCode>
      </Header>

      {/* Status Badge */}
      <StateBadge $color={stateColor}>
        {StateIcon && <StateIcon size={12} strokeWidth={1.8} />}
        <span>{block.state.charAt(0).toUpperCase() + block.state.slice(1)}</span>
      </StateBadge>

      {/* Block Name - primary label */}
      {config.layout.showBlockName && (
        <BlockName>{block.name || block.blockCode}</BlockName>
      )}

      {/* State-Specific Content */}
      <Content>
        {/* EMPTY STATE */}
        {block.state === 'empty' && (
          <EmptyContent>
            <EmptyIcon><Circle size={28} strokeWidth={1.6} /></EmptyIcon>
            <EmptyText>Block is empty</EmptyText>
          </EmptyContent>
        )}

        {/* PLANNED STATE */}
        {block.state === 'planned' && (
          <PlannedContent>
            {block.targetCropName && (
              <CropInfo>
                <CropIcon><Sprout size={14} strokeWidth={1.8} /></CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}
            <Capacity>
              {formatNumber(block.actualPlantCount || 0)} plants · {formatNumber(block.kpi.predictedYieldKg, { decimals: 1 })} kg expected
            </Capacity>
            {block.calculated.daysUntilNextTransition !== null && block.calculated.daysUntilNextTransition !== undefined && (
              <Timeline>
                <TimelineIcon>{block.calculated.isDelayed ? <AlertTriangle size={12} strokeWidth={1.8} /> : <Calendar size={12} strokeWidth={1.8} />}</TimelineIcon>
                <TimelineText>
                  {block.calculated.daysUntilNextTransition > 0
                    ? `Plant in ${formatNumber(block.calculated.daysUntilNextTransition)} days`
                    : block.calculated.daysUntilNextTransition === 0
                    ? 'Plant today'
                    : `${formatNumber(Math.abs(block.calculated.daysUntilNextTransition))} days overdue`}
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
                <CropIcon><Leaf size={14} strokeWidth={1.8} /></CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}

            <Capacity>
              {formatNumber(block.actualPlantCount || 0)} plants · {formatNumber(block.kpi.predictedYieldKg, { decimals: 1 })} kg expected
            </Capacity>

            <StateInfo>
              <InfoItem>
                <InfoIcon><Clock size={12} strokeWidth={1.8} /></InfoIcon>
                <InfoText>
                  {formatNumber(block.calculated.daysInCurrentState)} days in {block.state}
                </InfoText>
              </InfoItem>

              {block.calculated.daysUntilNextTransition !== null && block.calculated.daysUntilNextTransition !== undefined && (
                <InfoItem>
                  <InfoIcon>{block.calculated.isDelayed ? <AlertTriangle size={12} strokeWidth={1.8} /> : <Calendar size={12} strokeWidth={1.8} />}</InfoIcon>
                  <InfoText>
                    {block.calculated.daysUntilNextTransition > 0
                      ? `${formatNumber(block.calculated.daysUntilNextTransition)}d until next transition`
                      : block.calculated.daysUntilNextTransition === 0
                      ? 'Transition due today'
                      : `${formatNumber(Math.abs(block.calculated.daysUntilNextTransition))}d overdue`}
                  </InfoText>
                </InfoItem>
              )}

              {block.calculated.isDelayed && (
                <DelayBadge $color={getTimelineColor()}>
                  {formatNumber(block.calculated.delayDays)}d late
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
                <CropIcon><Wheat size={14} strokeWidth={1.8} /></CropIcon>
                <CropName>{block.targetCropName}</CropName>
              </CropInfo>
            )}

            <YieldProgress>
              <YieldLabel>
                {formatNumber(block.kpi.actualYieldKg, { decimals: 1 })} / {formatNumber(block.kpi.predictedYieldKg, { decimals: 1 })} kg
              </YieldLabel>
              <ProgressBar>
                <ProgressFill
                  $percent={Math.min(block.calculated.yieldProgress, 100)}
                  $color={getPerformanceColor()}
                />
              </ProgressBar>
              <PerformanceBadge>
                {/* T-901 final cleanup: this used to append
                    `config.icons.metrics.performance[...]`, but
                    DashboardConfig['icons']['metrics'] has no `performance`
                    field — that lookup always evaluated to `undefined` and
                    rendered a bare " • " separator with nothing after it.
                    Dead code removed rather than replaced; there is no
                    per-category icon/glyph to restore. */}
                {formatNumber(block.calculated.yieldProgress, { decimals: 0 })}%
              </PerformanceBadge>
            </YieldProgress>

            <HarvestInfo>
              <InfoItem>
                <InfoIcon><BarChart3 size={12} strokeWidth={1.8} /></InfoIcon>
                <InfoText>
                  {formatNumber(block.kpi.totalHarvests)} harvest{block.kpi.totalHarvests !== 1 ? 's' : ''}
                </InfoText>
              </InfoItem>
            </HarvestInfo>
          </HarvestingContent>
        )}

        {/* CLEANING STATE */}
        {block.state === 'cleaning' && (
          <CleaningContent>
            <CleaningIcon><Sparkles size={28} strokeWidth={1.6} /></CleaningIcon>
            <CleaningText>Preparing for next cycle</CleaningText>
            {block.kpi.actualYieldKg > 0 && (
              <LastYield>
                Last yield: {formatNumber(block.kpi.actualYieldKg, { decimals: 1 })} kg (
                {formatNumber(block.kpi.yieldEfficiencyPercent, { decimals: 0 })}%)
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
              <AlertTriangle size={11} strokeWidth={1.8} /> {alert.title}
            </AlertBadge>
          ))}
          {block.activeAlerts.length > 2 && (
            <MoreAlerts>+{formatNumber(block.activeAlerts.length - 2)} more</MoreAlerts>
          )}
        </AlertsSection>
      )}

      {/* Quick Actions (on hover) */}
      {showActions && (
        <QuickActions>
          {/* Statistics Button - always available */}
          <ActionButton
            onClick={(e) => {
              e.stopPropagation();
              setShowAnalyticsModal(true);
            }}
            $variant="analytics"
          >
            <BarChart3 size={12} strokeWidth={1.8} /> Stats
          </ActionButton>

          {/* Resolve Alert Button - shows when block has active alerts */}
          {block.activeAlerts.length > 0 && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                setShowResolveAlertModal(true);
              }}
              $variant="warning"
            >
              <Check size={12} strokeWidth={1.8} /> Resolve Alert
            </ActionButton>
          )}

          {block.state === 'empty' && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                setPlanMode('plan');
                setShowPlanModal(true);
              }}
              disabled={transitioning}
              $variant="plan"
            >
              <ClipboardList size={12} strokeWidth={1.8} /> Plan
            </ActionButton>
          )}
          {block.state === 'planned' && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                setPlanMode('plant');
                setShowPlanModal(true);
              }}
              disabled={transitioning}
              $variant="plant"
            >
              <Sprout size={12} strokeWidth={1.8} /> Plant
            </ActionButton>
          )}
          {block.state === 'planted' && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                handleTransition('growing');
              }}
              disabled={transitioning}
            >
              → Growing
            </ActionButton>
          )}
          {block.state === 'growing' && (
            <>
              {/* Check if block has fruiting in timeline - skip if not */}
              {block.expectedStatusChanges?.fruiting ? (
                <ActionButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransition('fruiting', true);
                  }}
                  disabled={transitioning}
                >
                  → Fruiting
                </ActionButton>
              ) : (
                <ActionButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransition('harvesting', true);
                  }}
                  disabled={transitioning}
                >
                  → Harvesting
                </ActionButton>
              )}
            </>
          )}
          {block.state === 'fruiting' && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                handleTransition('harvesting', true);
              }}
              disabled={transitioning}
            >
              → Harvesting
            </ActionButton>
          )}
          {block.state === 'harvesting' && (
            <>
              <ActionButton
                onClick={handleHarvestClick}
                disabled={recordingHarvest}
                $variant="success"
              >
                <Inbox size={12} strokeWidth={1.8} /> Harvest
              </ActionButton>
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleTransition('cleaning', true);
                }}
                disabled={transitioning}
              >
                → Cleaning
              </ActionButton>
            </>
          )}
          {block.state === 'cleaning' && (
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                handleTransition('empty', true);
              }}
              disabled={transitioning}
            >
              → Empty
            </ActionButton>
          )}
        </QuickActions>
      )}
    </Card>

    {/* Modals rendered outside the Card via portal so they're not constrained
        by the card's overflow/aspect-ratio styling. */}
    {createPortal(
      <>
        {/* Quick Plan Modal (for Plan and Plant actions) */}
        <QuickPlanModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          block={block}
          mode={planMode}
          onConfirm={handlePlanConfirm}
        />

        {/* Resolve Alert Modal */}
        <ResolveAlertModal
          isOpen={showResolveAlertModal}
          onClose={() => setShowResolveAlertModal(false)}
          farmId={farmId}
          blockId={block.blockId}
          blockName={block.name || block.blockCode}
          alerts={block.activeAlerts}
          onSuccess={() => {
            setShowResolveAlertModal(false);
            onUpdate?.();
          }}
        />

        {/* Block Harvest Entry Modal */}
        {showHarvestModal && (
          <BlockHarvestEntryModal
            isOpen={showHarvestModal}
            farmId={farmId}
            blockId={block.blockId}
            blockCode={block.blockCode}
            blockName={block.name}
            targetCropName={block.targetCropName}
            actualPlantCount={block.actualPlantCount}
            predictedYieldKg={block.kpi?.predictedYieldKg}
            actualYieldKg={block.kpi?.actualYieldKg}
            totalHarvests={block.kpi?.totalHarvests}
            onClose={() => setShowHarvestModal(false)}
            onComplete={handleHarvestComplete}
          />
        )}

        {/* Block Analytics Modal */}
        <BlockAnalyticsModal
          isOpen={showAnalyticsModal}
          onClose={() => setShowAnalyticsModal(false)}
          blockId={block.blockId}
          farmId={farmId}
        />
      </>,
      document.body
    )}
    </>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Interactive room-style card (spec §4 mockup ".card") — hover lift/gold-rim.
const Card = styled.div<{ $stateColor: string }>`
  ${glassPanelHover}
  padding: 12px;
  border-left: 4px solid ${(props) => props.$stateColor};
  aspect-ratio: 1 / 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 4px;
`;

const BlockCode = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const StateBadge = styled.div<{ $color: string }>`
  ${({ $color }) => colorBadge($color)}
  margin-bottom: 4px;
`;

const BlockName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const EmptyText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
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
  display: flex;
  color: ${({ theme }) => theme.colors.bright.verdi};
  margin-bottom: 8px;
`;

const CleaningText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const LastYield = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Common Elements
const CropInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CropIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.celeste};
`;

const CropName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Capacity = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 4px;
`;

const ProgressFill = styled.div<{ $percent: number; $color: string }>`
  height: 100%;
  width: ${(props) => Math.min(props.$percent, 100)}%;
  background: ${(props) => props.$color};
  transition: width 300ms ease-in-out;
`;

const StateInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const InfoIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoText = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Delay is "behind schedule" — coral (quarantined), not a raw prop colour
// with literal white text (spec: no pure white; use onDark).
const DelayBadge = styled.div<{ $color: string }>`
  padding: 2px 6px;
  border-radius: 4px;
  background: ${(props) => props.$color};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
`;

const Timeline = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const TimelineIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.muted};
`;

const TimelineText = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`;

const YieldProgress = styled.div``;

const YieldLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 700;
  margin-bottom: 4px;
`;

const PerformanceBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HarvestInfo = styled.div``;

const AlertsSection = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

// Severity is a distinct vocabulary from the room-phase map (spec §5.2) —
// extrapolated onto bright.* hues rather than reusing warning/gold-b for
// "high" (spec §3: gold is never a status colour except Harvesting). Colour
// resolution lives in getAlertSeverityColor() above (matches
// BlockAlertsTab.tsx's getSeverityColor); the §4 badge recipe comes from
// colorBadge().
const AlertBadge = styled.div<{ $severity: string }>`
  ${({ $severity, theme }) => colorBadge(getAlertSeverityColor(theme, $severity))}
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MoreAlerts = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
`;

const QuickActions = styled.div`
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  background: ${({ theme }) => theme.colors.glass.opaque};
  padding: 4px;
  border-radius: 6px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  max-width: calc(100% - 16px);
`;

// Deliberately no gold anywhere here: brand spec reserves gold for the active
// nav item / one CTA per view / Harvesting phase, not ordinary per-card
// quick-action buttons that can appear on every hovered card (spec §3).
// "warning" (Resolve Alert) uses terra, not gold-b, for the same reason.
const ActionButton = styled.button<{ $variant?: 'success' | 'plan' | 'plant' | 'warning' | 'analytics' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 65px;
  max-width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: ${(props) => {
    switch (props.$variant) {
      case 'success':
        return props.theme.colors.bright.emerald;
      case 'plan':
        return props.theme.colors.bright.lapis;
      case 'plant':
        return props.theme.colors.bright.emerald;
      case 'warning':
        return props.theme.colors.bright.terra;
      case 'analytics':
        return props.theme.colors.primary[700];
      default:
        return props.theme.colors.bright.lapis;
    }
  }};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
