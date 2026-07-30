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
import { AddVirtualCropModal } from './AddVirtualCropModal';
import { AreaBudgetBar } from './AreaBudgetBar';
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
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  border-left: 4px solid ${({ theme }) => theme.colors.success};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
  cursor: pointer;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
    text-decoration: underline;
  }
`;

const BlockCode = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: 'Courier New', monospace;
  margin-bottom: 4px;
`;

const BlockType = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: capitalize;
`;

const PlantingCountBadge = styled.div<{ $count: number }>`
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: ${({ $count, theme }) => ($count > 0 ? theme.colors.successBg : theme.colors.surface)};
  color: ${({ $count, theme }) => ($count > 0 ? theme.colors.emerald[600] : theme.colors.textDisabled)};
  white-space: nowrap;
`;


const PlantingsSection = styled.div`
  margin-bottom: 16px;
`;

const PlantingsSectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
`;

const EmptyPlantingsMessage = styled.div`
  padding: 24px;
  text-align: center;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 8px;
  border: 2px dashed ${({ theme }) => theme.colors.neutral[300]};
  color: ${({ theme }) => theme.colors.textDisabled};
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
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  background: transparent;
  color: ${({ theme }) => theme.colors.primary[500]};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;

  &:hover {
    background: ${({ theme }) => theme.colors.infoBg};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
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
        background: ${theme.colors.success};
        color: ${theme.colors.onAccent};
        &:hover {
          background: ${theme.colors.success};
          filter: brightness(0.85);
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: ${theme.colors.terracotta[600]};
        border: 1px solid ${theme.colors.terracotta[600]};
        &:hover {
          background: ${theme.colors.errorBg};
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.primary[500]};
      border: 1px solid ${theme.colors.primary[500]};
      &:hover {
        background: ${theme.colors.infoBg};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const AddNewPlantingButton = styled.button`
  width: 100%;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onAccent};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    filter: brightness(0.85);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.success};
    outline-offset: 2px;
  }
`;

const PhysicalBlockPlantingInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.successBg};
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
        return theme.colors.infoBg;
      case 'growing':
        return theme.colors.successBg;
      case 'fruiting':
        return theme.colors.warningBg;
      case 'harvesting':
        return theme.colors.errorBg;
      default:
        return theme.colors.surface;
    }
  }};
  color: ${({ $state, theme }) => {
    switch ($state) {
      case 'planned':
        return theme.colors.primary[700];
      case 'growing':
        return theme.colors.emerald[600];
      case 'fruiting':
        return theme.colors.terracotta[600];
      // No brand token matches the original magenta exactly (not in the migration
      // table); terracotta[800] keeps it in the errorBg-paired family while staying
      // visually distinct (darker) from the fruiting terracotta[600] above.
      case 'harvesting':
        return theme.colors.terracotta[800];
      default:
        return theme.colors.neutral[700];
    }
  }};
`;

const PlantingDetails = styled.div`
  flex: 1;
`;

const PlantingCrop = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PlantingMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
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
  const [showActions, setShowActions] = useState(false);

  // Include 'cleaning' so a virtual block stays in the active list (and reachable
  // via "View Active Plantings") until it is explicitly emptied.
  const activePlantings = virtualBlocks.filter(
    (vb) => vb.state !== 'empty'
  );

  // Check if the physical block itself has an active planting (not just virtual children)
  // Exclude: empty, cleaning, partial (partial = has virtual children, not a direct planting)
  const physicalBlockHasPlanting =
    physicalBlock.state !== 'empty' &&
    physicalBlock.state !== 'cleaning' &&
    physicalBlock.state !== 'partial';

  const isBlockCleaning = physicalBlock.state === 'cleaning';

  // Occupancy-based empty detection: state may lag behind reality (backend doesn't always
  // reset partial → empty), so we check actual content rather than trusting state alone.
  const isFullyEmpty = !physicalBlockHasPlanting && activePlantings.length === 0 && !isBlockCleaning;

  // Can add planting if not cleaning AND either there is available area OR the block is fully empty
  const canAddPlanting = !isBlockCleaning && ((physicalBlock.availableArea || 0) > 0 || isFullyEmpty);

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
    <Card
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
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

      <AreaBudgetBar
        usedAreaM2={(physicalBlock.area || 0) - (physicalBlock.availableArea || 0)}
        totalAreaM2={physicalBlock.area || 0}
        displayUnit="ha"
      />

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

        {/* Show cleaning state message or empty-state CTA */}
        {!physicalBlockHasPlanting && activePlantings.length === 0 && (
          isBlockCleaning ? (
            <EmptyPlantingsMessage>
              🧹 This block is being cleaned and will be ready for planting soon
            </EmptyPlantingsMessage>
          ) : (
            <AddNewPlantingButton onClick={() => setShowPlantModal(true)}>
              <span>🌱</span>
              <span>Add New Planting</span>
            </AddNewPlantingButton>
          )
        )}
      </PlantingsSection>

      {showActions && (
        <Actions>
          {/* Add Another Planting — only for non-empty blocks that still have capacity */}
          {!isFullyEmpty && canAddPlanting && (
            <ActionButton $variant="primary" onClick={() => setShowPlantModal(true)}>
              <span>🌱</span>
              <span>Add Another Planting</span>
            </ActionButton>
          )}

          {/* Cleaning in progress indicator */}
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
      )}

      {/* Add Virtual Crop Modal */}
      {createPortal(
        <AddVirtualCropModal
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
