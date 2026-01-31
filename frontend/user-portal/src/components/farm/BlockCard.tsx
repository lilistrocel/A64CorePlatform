/**
 * BlockCard Component
 *
 * Displays a single block with state-based color coding and actions.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Block, BlockSummary, BlockState } from '../../types/farm';
import { BLOCK_STATE_COLORS, BLOCK_STATE_LABELS } from '../../types/farm';
import { PlantAssignmentModal } from './PlantAssignmentModal';
import { PendingTasksWarningModal } from './PendingTasksWarningModal';
import { BlockAnalyticsModal } from './BlockAnalyticsModal';
import { formatNumber } from '../../utils';

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

const Card = styled.div<{ $stateColor: string; $isVirtual?: boolean }>`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${({ $stateColor }) => $stateColor};
  ${({ $isVirtual }) =>
    $isVirtual &&
    `
    border: 2px dashed #1976d2;
    border-left-width: 4px;
    border-left-style: solid;
  `}
  transition: all 150ms ease-in-out;
  position: relative;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  position: relative;
`;

const VirtualBadge = styled.span`
  position: absolute;
  top: -8px;
  right: -8px;
  background: #e3f2fd;
  color: #1976d2;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid #1976d2;
`;

const BlockIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

const BlockName = styled.h4`
  font-size: 18px;
  font-weight: 600;
  color: #3b82f6;
  margin: 0 0 8px 0;
  cursor: pointer;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #2563eb;
    text-decoration: underline;
  }
`;

const StateBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color};
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  font-size: 11px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const PlantingInfo = styled.div`
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 13px;
`;

const PlantingLabel = styled.div`
  font-weight: 500;
  color: #616161;
  margin-bottom: 4px;
`;

const PlantingDetail = styled.div`
  color: #9e9e9e;
`;

const CapacityBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
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
  color: #616161;
  text-align: center;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'analytics' }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  flex: 1;
  min-width: fit-content;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        &:hover {
          background: #1976d2;
        }
      `;
    }
    if ($variant === 'success') {
      return `
        background: #4CAF50;
        color: white;
        &:hover {
          background: #388E3C;
        }
      `;
    }
    if ($variant === 'analytics') {
      return `
        background: #6366F1;
        color: white;
        &:hover {
          background: #4F46E5;
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #EF4444;
        border: 1px solid #EF4444;
        &:hover {
          background: #FEE2E2;
        }
      `;
    }
    return `
      background: transparent;
      color: #3B82F6;
      border: 1px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const StateSelect = styled.select`
  padding: 6px 12px;
  border: 1px solid #3B82F6;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #3B82F6;
  background: white;
  cursor: pointer;
  flex: 1;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #e3f2fd;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockCard({ block, farmId, onEdit, onDelete, onStateChange }: BlockCardProps) {
  const navigate = useNavigate();
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

  const stateColor = BLOCK_STATE_COLORS[block.state];
  const stateLabel = BLOCK_STATE_LABELS[block.state];
  const utilizationPercent = summary ? summary.utilizationPercent : 0;
  const isVirtual = block.blockCategory === 'virtual';

  const getStateIcon = (state: BlockState) => {
    const icons = {
      empty: '⬜',
      planned: '📋',
      planted: '🌱',
      growing: '🌱',
      fruiting: '🍇',
      harvesting: '🌾',
      cleaning: '🧹',
      alert: '⚠️',
      partial: '📊',
    };
    return icons[state] || '📦';
  };

  return (
    <Card $stateColor={stateColor} $isVirtual={isVirtual}>
      <Header>
        {isVirtual && <VirtualBadge>Virtual</VirtualBadge>}
        <div>
          <BlockIcon>{getStateIcon(block.state)}</BlockIcon>
          <BlockName onClick={() => navigate(`/farm/farms/${farmId}/blocks/${block.blockId}`)}>
            {block.name || block.targetCropName || block.blockCode}
          </BlockName>
          {block.blockCode && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {block.blockCode}
              {block.legacyBlockCode && ` (${block.legacyBlockCode})`}
            </div>
          )}
        </div>
        <StateBadge $color={stateColor}>{stateLabel}</StateBadge>
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
          <StatLabel>Capacity</StatLabel>
          <StatValue>{formatNumber(block.maxPlants)}</StatValue>
        </StatItem>
      </StatsGrid>

      {summary && summary.currentPlantCount > 0 && (
        <>
          <CapacityBar>
            <CapacityFill $percent={utilizationPercent} $color={stateColor} />
          </CapacityBar>
          <CapacityText>
            {formatNumber(summary.currentPlantCount)} / {formatNumber(block.maxPlants)} plants ({formatNumber(utilizationPercent, { decimals: 0 })}%)
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
          📊 Statistics
        </ActionButton>

        {/* Show Plant Crop button only for empty blocks */}
        {block.state === 'empty' && (
          <ActionButton $variant="success" onClick={() => setShowPlantModal(true)} disabled={loading}>
            🌱 Plant Crop
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
          <PlantAssignmentModal
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
