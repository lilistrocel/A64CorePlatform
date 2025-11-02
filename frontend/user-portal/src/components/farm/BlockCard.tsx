/**
 * BlockCard Component
 *
 * Displays a single block with state-based color coding and actions.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Block, BlockSummary, BlockState } from '../../types/farm';
import { BLOCK_STATE_COLORS, BLOCK_STATE_LABELS } from '../../types/farm';

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

const Card = styled.div<{ $stateColor: string }>`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${({ $stateColor }) => $stateColor};
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
`;

const BlockIcon = styled.div`
  font-size: 24px;
  margin-bottom: 8px;
`;

const BlockName = styled.h4`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
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

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
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
  const [summary, setSummary] = useState<BlockSummary | null>(null);
  const [validTransitions, setValidTransitions] = useState<BlockState[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleStateChange = async (newState: BlockState) => {
    if (newState === block.state) return;

    try {
      setLoading(true);
      await farmApi.transitionBlockState(farmId, block.blockId, {
        fromState: block.state,
        toState: newState,
      });
      onStateChange?.();
    } catch (error) {
      alert('Failed to transition block state. Please try again.');
      console.error('Error transitioning state:', error);
    } finally {
      setLoading(false);
    }
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

  const getStateIcon = (state: BlockState) => {
    const icons = {
      empty: '⬜',
      planned: '📋',
      planted: '🌱',
      harvesting: '🌾',
      alert: '⚠️',
    };
    return icons[state];
  };

  return (
    <Card $stateColor={stateColor}>
      <Header>
        <div>
          <BlockIcon>{getStateIcon(block.state)}</BlockIcon>
          <BlockName>{block.name}</BlockName>
        </div>
        <StateBadge $color={stateColor}>{stateLabel}</StateBadge>
      </Header>

      <StatsGrid>
        <StatItem>
          <StatLabel>Area</StatLabel>
          <StatValue>{block.area.toFixed(1)} ha</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Capacity</StatLabel>
          <StatValue>{block.maxPlants}</StatValue>
        </StatItem>
      </StatsGrid>

      {summary && summary.currentPlantCount > 0 && (
        <>
          <CapacityBar>
            <CapacityFill $percent={utilizationPercent} $color={stateColor} />
          </CapacityBar>
          <CapacityText>
            {summary.currentPlantCount} / {block.maxPlants} plants ({utilizationPercent.toFixed(0)}%)
          </CapacityText>
        </>
      )}

      {summary?.currentPlanting && (
        <PlantingInfo>
          <PlantingLabel>Current Planting</PlantingLabel>
          <PlantingDetail>{summary.currentPlanting.plantCount} plants</PlantingDetail>
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
    </Card>
  );
}
