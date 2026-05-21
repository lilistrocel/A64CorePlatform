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
import { PlantAssignmentModal } from './PlantAssignmentModal';
import { PhysicalBlockPlantingsModal } from './PhysicalBlockPlantingsModal';
import { deleteBlock } from '../../services/farmApi';
import { formatNumber } from '../../utils';
import type { Block, DashboardBlock } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PhysicalBlockCardProps {
  physicalBlock: Block;
  virtualBlocks: Block[];
  farmId: string;
  onRefresh?: () => void;
  /** Richer DashboardBlock[] for the same virtual children — shown in the plantings modal */
  virtualDashboardBlocks?: DashboardBlock[];
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #0F6E56;
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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 8px 0;
  cursor: pointer;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #0F6E56;
    text-decoration: underline;
  }
`;

const BlockCode = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
`;

const BlockType = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-transform: capitalize;
`;

const PlantingCountBadge = styled.div<{ $count: number }>`
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $count, theme }) => ($count > 0 ? 'rgba(15,110,86,0.06)' : theme.colors.surface.raised)};
  color: ${({ $count, theme }) => ($count > 0 ? '#0B5644' : theme.colors.text.tertiary)};
  white-space: nowrap;
`;

const StatsRow = styled.div`
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.tertiary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const PlantingsSection = styled.div`
  margin-bottom: 16px;
`;

const PlantingsSectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
`;

const EmptyPlantingsMessage = styled.div`
  padding: 24px;
  text-align: center;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  border: 2px dashed ${({ theme }) => theme.colors.border.subtle};
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 14px;
`;

const ViewPlantingsButton = styled.button`
  width: 100%;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid ${({ theme }) => theme.colors.accent.sage};
  background: transparent;
  color: ${({ theme }) => theme.colors.accent.sage};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
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

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.status.success};
        color: white;
        &:hover {
          background: ${theme.colors.status.success};
          filter: brightness(0.85);
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #9E2A2A;
        border: 1px solid #9E2A2A;
        &:hover {
          background: ${theme.colors.status.danger};
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.accent.sage};
      border: 1px solid ${theme.colors.accent.sage};
      &:hover {
        background: ${theme.colors.surface.sunken};
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
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 8px;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 6px;
`;

const PhysicalBlockPlantingInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.accent.sageSoft};
  border-radius: 8px;
  margin-bottom: 8px;
`;

const PlantingState = styled.div<{ $state: string }>`
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  display: flex;
  align-items: center;
  gap: 4px;
  background: ${({ $state, theme }) => {
    switch ($state) {
      case 'planned':
        return theme.colors.surface.sunken;
      case 'growing':
        return theme.colors.accent.sageSoft;
      case 'fruiting':
        return theme.colors.status.warning;
      case 'harvesting':
        return theme.colors.status.danger;
      default:
        return theme.colors.surface.raised;
    }
  }};
  color: ${({ $state }) => {
    switch ($state) {
      case 'planned':
        return '#0B5644';
      case 'growing':
        return '#0B5644';
      case 'fruiting':
        return '#B85C2A';
      case 'harvesting':
        return '#9E2A2A';
      default:
        return '#4B4844';
    }
  }};
`;

const PlantingDetails = styled.div`
  flex: 1;
`;

const PlantingCrop = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const PlantingMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 2px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PhysicalBlockCard({
  physicalBlock,
  virtualBlocks,
  farmId,
  onRefresh,
  virtualDashboardBlocks,
}: PhysicalBlockCardProps) {
  const navigate = useNavigate();
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [showPlantingsModal, setShowPlantingsModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const activePlantings = virtualBlocks.filter(
    (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
  );

  // Check if the physical block itself has an active planting (not just virtual children)
  // Exclude: empty, cleaning, partial (partial = has virtual children, not a direct planting)
  const physicalBlockHasPlanting =
    physicalBlock.state !== 'empty' &&
    physicalBlock.state !== 'cleaning' &&
    physicalBlock.state !== 'partial';

  // Block is truly empty only if state is 'empty'
  const isBlockEmpty = physicalBlock.state === 'empty';
  const isBlockCleaning = physicalBlock.state === 'cleaning';
  const isBlockPartial = physicalBlock.state === 'partial';

  // Can add planting if block is empty OR if it's partial and has available area
  const canAddPlanting = isBlockEmpty ||
    (isBlockPartial && (physicalBlock.availableArea || 0) > 0);

  const handleBlockNameClick = () => {
    navigate(`/farm/farms/${farmId}/blocks/${physicalBlock.blockId}`);
  };

  const handleDeleteBlock = async () => {
    const blockName = physicalBlock.name || physicalBlock.blockCode;
    const hasChildren = virtualBlocks.length > 0;

    const confirmMessage = hasChildren
      ? `Are you sure you want to delete "${blockName}" and its ${virtualBlocks.length} planting(s)? This action cannot be undone.`
      : `Are you sure you want to delete "${blockName}"? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteBlock(farmId, physicalBlock.blockId);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to delete block:', error);
      alert('Failed to delete block. Please try again.');
    } finally {
      setIsDeleting(false);
    }
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

        <PlantingCountBadge $count={activePlantings.length + (physicalBlockHasPlanting ? 1 : 0)}>
          {activePlantings.length + (physicalBlockHasPlanting ? 1 : 0)} Active{' '}
          {activePlantings.length + (physicalBlockHasPlanting ? 1 : 0) === 1 ? 'Planting' : 'Plantings'}
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
          {activePlantings.length > 0 || physicalBlockHasPlanting
            ? 'Active Plantings'
            : 'No Active Plantings'}
        </PlantingsSectionTitle>

        {/* Show physical block's own planting if it has one */}
        {physicalBlockHasPlanting && (
          <PhysicalBlockPlantingInfo>
            <PlantingState $state={physicalBlock.state}>
              {physicalBlock.state === 'planned' && '📋'}
              {physicalBlock.state === 'growing' && '🌱'}
              {physicalBlock.state === 'fruiting' && '🍅'}
              {physicalBlock.state === 'harvesting' && '🌾'}
              {physicalBlock.state}
            </PlantingState>
            <PlantingDetails>
              <PlantingCrop>{physicalBlock.targetCropName || 'Unknown Crop'}</PlantingCrop>
              <PlantingMeta>
                {physicalBlock.actualPlantCount
                  ? `${formatNumber(physicalBlock.actualPlantCount)} plants`
                  : ''}
                {physicalBlock.expectedHarvestDate && (
                  <>
                    {' • '}
                    Harvest: {new Date(physicalBlock.expectedHarvestDate).toLocaleDateString()}
                  </>
                )}
              </PlantingMeta>
            </PlantingDetails>
          </PhysicalBlockPlantingInfo>
        )}

        {/* Button to open the plantings modal for virtual block children */}
        {activePlantings.length > 0 && (
          <ViewPlantingsButton onClick={() => setShowPlantingsModal(true)}>
            <span>🌱</span>
            <span>View Active Plantings ({activePlantings.length})</span>
            <span>→</span>
          </ViewPlantingsButton>
        )}

        {/* Show empty/cleaning state messages */}
        {!physicalBlockHasPlanting && activePlantings.length === 0 && (
          <EmptyPlantingsMessage>
            {isBlockCleaning
              ? '🧹 This block is being cleaned and will be ready for planting soon'
              : 'This block is empty and ready for planting'}
          </EmptyPlantingsMessage>
        )}
      </PlantingsSection>

      {physicalBlock.availableArea !== undefined && physicalBlock.availableArea > 0 && (
        <AvailableAreaInfo>
          💡 {formatNumber((physicalBlock.availableArea || 0) / 10000, { decimals: 2 })} ha available for new plantings
        </AvailableAreaInfo>
      )}

      <Actions>
        {/* Show Add New Planting for empty blocks or partial blocks with available area */}
        {canAddPlanting && (
          <ActionButton $variant="primary" onClick={() => setShowPlantModal(true)}>
            <span>🌱</span>
            <span>{isBlockEmpty ? 'Add New Planting' : 'Add Another Planting'}</span>
          </ActionButton>
        )}

        {/* Show status-appropriate action for non-empty blocks */}
        {isBlockCleaning && (
          <ActionButton $variant="secondary" disabled>
            <span>🧹</span>
            <span>Cleaning in Progress</span>
          </ActionButton>
        )}

        {physicalBlockHasPlanting && (
          <ActionButton $variant="secondary" onClick={handleBlockNameClick}>
            <span>📈</span>
            <span>Manage Planting</span>
          </ActionButton>
        )}

        <ActionButton $variant="secondary" onClick={handleBlockNameClick}>
          <span>📊</span>
          <span>View Details</span>
        </ActionButton>

        <ActionButton $variant="danger" onClick={handleDeleteBlock} disabled={isDeleting}>
          <span>🗑️</span>
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
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

      {/* Active Plantings Modal — shows virtual block children in CompactBlockCard grid */}
      <PhysicalBlockPlantingsModal
        isOpen={showPlantingsModal}
        onClose={() => setShowPlantingsModal(false)}
        physicalBlockName={physicalBlock.name || physicalBlock.blockCode || 'Block'}
        farmId={farmId}
        virtualBlocks={virtualDashboardBlocks ?? []}
        onBlockUpdate={onRefresh}
      />
    </Card>
  );
}
