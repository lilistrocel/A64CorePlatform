/**
 * PhysicalBlockCard Component
 *
 * Displays a physical block with embedded virtual blocks (plantings).
 * Shows physical block infrastructure info with inline list of active plantings.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { VirtualBlockItem } from './VirtualBlockItem';
import { PlantAssignmentModal } from './PlantAssignmentModal';
import { formatNumber } from '../../utils';
import type { Block } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PhysicalBlockCardProps {
  physicalBlock: Block;
  virtualBlocks: Block[];
  farmId: string;
  onRefresh?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #4caf50;
  transition: all 150ms ease-in-out;

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

const LeftSection = styled.div`
  flex: 1;
`;

const BlockIcon = styled.div`
  font-size: 28px;
  margin-bottom: 8px;
`;

const BlockName = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
  cursor: pointer;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #3b82f6;
    text-decoration: underline;
  }
`;

const BlockCode = styled.div`
  font-size: 13px;
  color: #757575;
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
`;

const BlockType = styled.div`
  font-size: 12px;
  color: #9e9e9e;
  text-transform: capitalize;
`;

const PlantingCountBadge = styled.div<{ $count: number }>`
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $count }) => ($count > 0 ? '#e8f5e9' : '#f5f5f5')};
  color: ${({ $count }) => ($count > 0 ? '#2e7d32' : '#9e9e9e')};
  white-space: nowrap;
`;

const StatsRow = styled.div`
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const PlantingsSection = styled.div`
  margin-bottom: 16px;
`;

const PlantingsSectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
`;

const VirtualBlocksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const EmptyPlantingsMessage = styled.div`
  padding: 24px;
  text-align: center;
  background: #fafafa;
  border-radius: 8px;
  border: 2px dashed #e0e0e0;
  color: #9e9e9e;
  font-size: 14px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #4caf50;
        color: white;
        &:hover {
          background: #388e3c;
        }
      `;
    }
    return `
      background: transparent;
      color: #3b82f6;
      border: 1px solid #3b82f6;
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

const AvailableAreaInfo = styled.div`
  font-size: 12px;
  color: #757575;
  margin-top: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PhysicalBlockCard({
  physicalBlock,
  virtualBlocks,
  farmId,
  onRefresh,
}: PhysicalBlockCardProps) {
  const navigate = useNavigate();
  const [showPlantModal, setShowPlantModal] = useState(false);

  const activePlantings = virtualBlocks.filter(
    (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
  );

  const handleBlockNameClick = () => {
    navigate(`/farm/farms/${farmId}/blocks/${physicalBlock.blockId}`);
  };

  const getBlockTypeIcon = (): string => {
    const blockType = physicalBlock.metadata?.blockType?.toString().toLowerCase() || '';
    if (blockType.includes('greenhouse')) return '🏡';
    if (blockType.includes('open')) return '🌾';
    if (blockType.includes('hydro')) return '💧';
    if (blockType.includes('vertical')) return '🏢';
    return '📦';
  };

  return (
    <Card>
      <Header>
        <LeftSection>
          <BlockIcon>{getBlockTypeIcon()}</BlockIcon>
          <BlockName onClick={handleBlockNameClick}>
            {physicalBlock.name || physicalBlock.blockCode || 'Unnamed Block'}
          </BlockName>
          <BlockCode>
            {physicalBlock.blockCode}
            {physicalBlock.legacyBlockCode && ` (${physicalBlock.legacyBlockCode})`}
          </BlockCode>
          <BlockType>{physicalBlock.metadata?.blockType || 'Physical Block'}</BlockType>
        </LeftSection>

        <PlantingCountBadge $count={activePlantings.length}>
          {activePlantings.length} Active {activePlantings.length === 1 ? 'Planting' : 'Plantings'}
        </PlantingCountBadge>
      </Header>

      <StatsRow>
        <StatItem>
          <StatLabel>Total Area</StatLabel>
          <StatValue>
            {formatNumber((physicalBlock.area || 0) / 10000, { decimals: 2 })} ha
          </StatValue>
        </StatItem>

        <StatItem>
          <StatLabel>Available</StatLabel>
          <StatValue>
            {formatNumber((physicalBlock.availableArea || 0) / 10000, { decimals: 2 })} ha
          </StatValue>
        </StatItem>

        <StatItem>
          <StatLabel>Capacity</StatLabel>
          <StatValue>{formatNumber(physicalBlock.maxPlants)}</StatValue>
        </StatItem>
      </StatsRow>

      <PlantingsSection>
        <PlantingsSectionTitle>
          {activePlantings.length > 0 ? 'Active Plantings' : 'No Active Plantings'}
        </PlantingsSectionTitle>

        {activePlantings.length > 0 ? (
          <VirtualBlocksList>
            {activePlantings.map((virtualBlock) => (
              <VirtualBlockItem
                key={virtualBlock.blockId}
                virtualBlock={virtualBlock}
                farmId={farmId}
              />
            ))}
          </VirtualBlocksList>
        ) : (
          <EmptyPlantingsMessage>
            This block is empty and ready for planting
          </EmptyPlantingsMessage>
        )}
      </PlantingsSection>

      {physicalBlock.availableArea !== undefined && physicalBlock.availableArea > 0 && (
        <AvailableAreaInfo>
          💡 {formatNumber((physicalBlock.availableArea || 0) / 10000, { decimals: 2 })} ha available for new plantings
        </AvailableAreaInfo>
      )}

      <Actions>
        <ActionButton $variant="primary" onClick={() => setShowPlantModal(true)}>
          <span>🌱</span>
          <span>Add New Planting</span>
        </ActionButton>

        <ActionButton $variant="secondary" onClick={handleBlockNameClick}>
          <span>📊</span>
          <span>View Details</span>
        </ActionButton>
      </Actions>

      {/* Plant Assignment Modal */}
      {createPortal(
        <PlantAssignmentModal
          isOpen={showPlantModal}
          onClose={() => setShowPlantModal(false)}
          block={physicalBlock}
          onSuccess={() => {
            setShowPlantModal(false);
            onRefresh?.();
          }}
        />,
        document.body
      )}
    </Card>
  );
}
