/**
 * BlockCard Component
 *
 * Displays a single block with state-based color coding and actions.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import {
  Square,
  ClipboardList,
  Sprout,
  Grape,
  Wheat,
  Sparkles,
  AlertTriangle,
  BarChart3,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanelHover, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { Theme, PhaseKey } from '@a64core/shared';
import { farmApi } from '../../services/farmApi';
import type { Block, BlockSummary, BlockState } from '../../types/farm';
import { BLOCK_STATE_LABELS, BLOCK_STATE_PHASE_KEYS } from '../../types/farm';
import { AddVirtualCropModal } from './AddVirtualCropModal';
import { PendingTasksWarningModal } from './PendingTasksWarningModal';
import { BlockAnalyticsModal } from './BlockAnalyticsModal';
import { formatNumber } from '../../utils';

// Block-state → phase colour. BLOCK_STATE_PHASE_KEYS is the canonical map
// (types/farm.ts, kept alongside BLOCK_STATE_COLORS) — do not re-derive
// per-component.
function getBlockStateColor(theme: Theme, state: BlockState): string {
  return theme.colors.phase[BLOCK_STATE_PHASE_KEYS[state] ?? 'empty'];
}

const BLOCK_STATE_ICONS: Record<BlockState, LucideIcon> = {
  empty: Square,
  planned: ClipboardList,
  growing: Sprout,
  fruiting: Grape,
  harvesting: Wheat,
  cleaning: Sparkles,
  alert: AlertTriangle,
  partial: BarChart3,
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface BlockCardProps {
  block: Block;
  farmId: string;
  onEdit?: (blockId: string) => void;
  onDelete?: (blockId: string) => void;
  onStateChange?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Interactive room-style card (spec §4 mockup ".card") — click navigates to
// the block detail route, so it earns the hover-lift/gold-rim treatment.
// The per-state edge stripe (spec mockup ".card.is-active::after") carries
// the phase colour so the same status reads identically to badges elsewhere.
const Card = styled.div<{ $stateColor: string; $isVirtual?: boolean }>`
  ${glassPanelHover}
  padding: 20px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 14%;
    bottom: 14%;
    width: 2.5px;
    border-radius: 3px;
    background: ${({ $stateColor }) => $stateColor};
    box-shadow: 0 0 12px ${({ $stateColor }) => $stateColor};
  }

  ${({ $isVirtual, theme }) =>
    $isVirtual &&
    `
    border-style: dashed;
    border-color: ${theme.colors.bright.lapis};
  `}
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  position: relative;
`;

const VirtualBadge = styled.span`
  ${monoLabel}
  position: absolute;
  top: -8px;
  right: -8px;
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 0.6rem;
  padding: 4px 8px;
  border-radius: 99px;
  border: 1px solid rgba(107, 138, 224, 0.45);
`;

const BlockIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const BlockName = styled.h4`
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
  cursor: pointer;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.celeste};
    text-decoration: underline;
  }
`;

// The §4 badge pattern via the shared phaseBadge mixin.
const StateBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PlantingInfo = styled.div`
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 13px;
`;

const PlantingLabel = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 4px;
`;

const PlantingDetail = styled.div`
  color: ${({ theme }) => theme.colors.muted};
`;

const CapacityBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 8px;
`;

const CapacityFill = styled.div<{ $percent: number; $color: string }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: ${({ $color }) => $color};
  transition: width 300ms ease-in-out;
`;

const CapacityText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'analytics' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  flex: 1;
  min-width: fit-content;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: rgba(107, 138, 224, 0.16);
        border-color: rgba(107, 138, 224, 0.4);
        color: ${theme.colors.bright.lapis};
        &:hover {
          background: rgba(107, 138, 224, 0.26);
        }
      `;
    }
    if ($variant === 'success') {
      return `
        background: rgba(84, 211, 155, 0.16);
        border-color: rgba(84, 211, 155, 0.4);
        color: ${theme.colors.bright.emerald};
        &:hover {
          background: rgba(84, 211, 155, 0.26);
        }
      `;
    }
    if ($variant === 'analytics') {
      // Deliberately lapis, not gold/secondary: brand spec reserves gold for the
      // active nav item / one CTA per view / highlight badges, not ordinary
      // per-card action buttons (spec §3).
      return `
        background: rgba(107, 138, 224, 0.28);
        border-color: rgba(107, 138, 224, 0.5);
        color: ${theme.colors.onDark};
        &:hover {
          background: rgba(107, 138, 224, 0.4);
        }
      `;
    }
    if ($variant === 'danger') {
      // Destructive: coral-tinted glass, never solid red (spec §4 "Buttons").
      return `
        background: rgba(240, 138, 112, 0.14);
        border-color: rgba(240, 138, 112, 0.4);
        color: ${theme.colors.bright.coral};
        &:hover {
          background: rgba(240, 138, 112, 0.26);
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border-color: ${theme.colors.glass.border};
      &:hover {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const StateSelect = styled.select`
  ${glassControl}
  padding: 6px 12px;
  border-color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.lapis};
  cursor: pointer;
  flex: 1;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockCard({ block, farmId, onEdit, onDelete, onStateChange }: BlockCardProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [summary, setSummary] = useState<BlockSummary | null>(null);
  const [validTransitions, setValidTransitions] = useState<BlockState[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  // Phase 3: Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [pendingStateChange, setPendingStateChange] = useState<BlockState | null>(null);

  useEffect(() => {
    loadBlockData();
  }, [block.blockId]);

  const loadBlockData = async () => {
    try {
      const [summaryData, transitionsData] = await Promise.all([
        farmApi.getBlockSummary(farmId, block.blockId),
        farmApi.getValidTransitions(farmId, block.blockId),
      ]);
      setSummary(summaryData);
      setValidTransitions(transitionsData.validTransitions);
    } catch (error) {
      console.error('Error loading block data:', error);
    }
  };

  const handleStateChange = async (newState: BlockState, force: boolean = false) => {
    if (newState === block.state) return;

    try {
      setLoading(true);
      await farmApi.transitionBlockState(farmId, block.blockId, {
        newStatus: newState,
        force, // Phase 3: Pass force parameter
      });
      onStateChange?.();
    } catch (error: any) {
      console.error('Error transitioning state:', error);

      // Phase 3: Check for HTTP 409 Conflict (pending tasks warning)
      if (error.response?.status === 409 && error.response?.data?.detail?.error === 'pending_tasks_exist') {
        const detail = error.response.data.detail;
        setPendingTasks(detail.pendingTasks || []);
        setTargetStatus(detail.targetStatus || '');
        setPendingStateChange(newState);
        setShowWarningModal(true);
      } else {
        alert('Failed to transition block state. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForceStateChange = () => {
    setShowWarningModal(false);
    if (pendingStateChange) {
      handleStateChange(pendingStateChange, true);
    }
  };

  const handleCancelWarning = () => {
    setShowWarningModal(false);
    setPendingStateChange(null);
  };

  const handleEdit = () => {
    onEdit?.(block.blockId);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete block "${block.name}"?`)) {
      onDelete?.(block.blockId);
    }
  };

  const stateColor = getBlockStateColor(theme, block.state);
  const stateLabel = BLOCK_STATE_LABELS[block.state];
  const utilizationPercent = summary ? summary.utilizationPercent : 0;
  const isVirtual = block.blockCategory === 'virtual';
  const StateIcon = BLOCK_STATE_ICONS[block.state] ?? Package;

  return (
    <Card $stateColor={stateColor} $isVirtual={isVirtual}>
      <Header>
        {isVirtual && <VirtualBadge>Virtual</VirtualBadge>}
        <div>
          <BlockIcon aria-hidden="true"><StateIcon size={22} strokeWidth={1.6} /></BlockIcon>
          <BlockName onClick={() => navigate(`/farm/farms/${farmId}/blocks/${block.blockId}`)}>
            {block.name || block.targetCropName || block.blockCode}
          </BlockName>
          {block.blockCode && (
            <div style={{ fontSize: '12px', color: 'inherit', marginTop: '4px', opacity: 0.6 }}>
              {block.blockCode}
              {block.legacyBlockCode && ` (${block.legacyBlockCode})`}
            </div>
          )}
        </div>
        <StateBadge $phaseKey={BLOCK_STATE_PHASE_KEYS[block.state] ?? 'empty'}>{stateLabel}</StateBadge>
      </Header>

      <StatsGrid>
        <StatItem>
          <StatLabel>Area</StatLabel>
          <StatValue>
            {(() => {
              // Use allocatedArea for virtual blocks, area for physical
              const areaValue = block.allocatedArea || block.area || 0;
              const unit = block.areaUnit || 'sqm';
              if (unit === 'sqm' || unit === 'sqft') {
                return `${formatNumber(areaValue / 10000, { decimals: 2 })} ha`;
              }
              return `${formatNumber(areaValue, { decimals: 2 })} ${unit}`;
            })()}
          </StatValue>
        </StatItem>
        <StatItem>
          {isVirtual ? (
            <>
              <StatLabel>Plants</StatLabel>
              <StatValue>
                {formatNumber(summary?.currentPlantCount ?? block.actualPlantCount ?? 0)}
              </StatValue>
            </>
          ) : (
            <>
              <StatLabel>Used</StatLabel>
              <StatValue>
                {formatNumber(utilizationPercent, { decimals: 0 })}%
              </StatValue>
            </>
          )}
        </StatItem>
      </StatsGrid>

      {!isVirtual && summary && summary.currentPlantCount > 0 && (
        <>
          <CapacityBar>
            <CapacityFill $percent={utilizationPercent} $color={stateColor} />
          </CapacityBar>
          <CapacityText>
            {formatNumber(utilizationPercent, { decimals: 0 })}% area used
          </CapacityText>
        </>
      )}

      {summary?.currentPlanting && (
        <PlantingInfo>
          <PlantingLabel>Current Planting</PlantingLabel>
          <PlantingDetail>{formatNumber(summary.currentPlanting.plantCount)} plants</PlantingDetail>
          {summary.currentPlanting.plantedDate && (
            <PlantingDetail>
              Planted: {farmApi.formatDateForDisplay(summary.currentPlanting.plantedDate)}
            </PlantingDetail>
          )}
          {summary.currentPlanting.estimatedHarvestDate && (
            <PlantingDetail>
              Harvest: {farmApi.formatDateForDisplay(summary.currentPlanting.estimatedHarvestDate)}
            </PlantingDetail>
          )}
        </PlantingInfo>
      )}

      <Actions>
        {/* Statistics button - always available */}
        <ActionButton $variant="analytics" onClick={() => setShowAnalyticsModal(true)} disabled={loading}>
          <BarChart3 size={13} strokeWidth={1.8} /> Statistics
        </ActionButton>

        {/* Show Plant Crop button only for empty blocks */}
        {block.state === 'empty' && (
          <ActionButton $variant="success" onClick={() => setShowPlantModal(true)} disabled={loading}>
            <Sprout size={13} strokeWidth={1.8} /> Plant Crop
          </ActionButton>
        )}
        {validTransitions.length > 0 && (
          <StateSelect
            value={block.state}
            onChange={(e) => handleStateChange(e.target.value as BlockState)}
            disabled={loading}
          >
            <option value={block.state}>{stateLabel}</option>
            {validTransitions.map((state) => (
              <option key={state} value={state}>
                → {BLOCK_STATE_LABELS[state]}
              </option>
            ))}
          </StateSelect>
        )}
        {onEdit && (
          <ActionButton $variant="secondary" onClick={handleEdit} disabled={loading}>
            Edit
          </ActionButton>
        )}
        {onDelete && (
          <ActionButton $variant="danger" onClick={handleDelete} disabled={loading}>
            Delete
          </ActionButton>
        )}
      </Actions>

      {/* Plant Assignment Modal */}
      {/* Render modals outside the Card using Portal to prevent mouse event issues */}
      {createPortal(
        <>
          <AddVirtualCropModal
            isOpen={showPlantModal}
            onClose={() => setShowPlantModal(false)}
            block={block}
            onSuccess={() => {
              loadBlockData();
              onStateChange?.();
            }}
          />

          {/* Phase 3: Warning Modal */}
          <PendingTasksWarningModal
            isOpen={showWarningModal}
            targetStatus={targetStatus}
            pendingTasks={pendingTasks}
            onCancel={handleCancelWarning}
            onForce={handleForceStateChange}
          />

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
    </Card>
  );
}
