/**
 * VirtualBlockItem Component
 *
 * Compact inline display of a virtual block (planting) within a physical block card.
 * Shows crop name, state, and days in current state in a single row.
 */

import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { BLOCK_STATE_COLORS, BLOCK_STATE_LABELS } from '../../types/farm';
import type { Block, BlockState } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VirtualBlockItemProps {
  virtualBlock: Block;
  farmId: string;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 8px;
  border-left: 3px solid #1976d2;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
    transform: translateX(4px);
  }
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
`;

const CropIcon = styled.span`
  font-size: 20px;
  flex-shrink: 0;
`;

const CropInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
`;

const CropName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BlockCode = styled.div`
  font-size: 11px;
  color: #757575;
  font-family: 'Courier New', monospace;
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

const StateBadge = styled.span<{ $color: string }>`
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $color }) => $color};
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
`;

const DaysInfo = styled.div`
  font-size: 12px;
  color: #757575;
  white-space: nowrap;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function VirtualBlockItem({ virtualBlock, farmId }: VirtualBlockItemProps) {
  const navigate = useNavigate();

  const stateColor = BLOCK_STATE_COLORS[virtualBlock.state];
  const stateLabel = BLOCK_STATE_LABELS[virtualBlock.state];

  // Calculate days in current state
  const calculateDaysInState = (): number => {
    if (!virtualBlock.plantedDate) return 0;
    const planted = new Date(virtualBlock.plantedDate);
    const now = new Date();
    const diffMs = now.getTime() - planted.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const daysInState = calculateDaysInState();

  const getCropIcon = (state: BlockState): string => {
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
    return icons[state] || '🌱';
  };

  const handleClick = () => {
    navigate(`/farm/farms/${farmId}/blocks/${virtualBlock.blockId}`);
  };

  return (
    <Container onClick={handleClick}>
      <LeftSection>
        <CropIcon>{getCropIcon(virtualBlock.state)}</CropIcon>
        <CropInfo>
          <CropName>{virtualBlock.targetCropName || virtualBlock.name || 'Unknown Crop'}</CropName>
          <BlockCode>{virtualBlock.blockCode || virtualBlock.legacyBlockCode || 'N/A'}</BlockCode>
        </CropInfo>
      </LeftSection>

      <RightSection>
        <StateBadge $color={stateColor}>{stateLabel}</StateBadge>
        {daysInState > 0 && <DaysInfo>📊 {daysInState}d</DaysInfo>}
      </RightSection>
    </Container>
  );
}
