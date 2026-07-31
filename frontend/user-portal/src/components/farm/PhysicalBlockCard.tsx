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
import {
  Home,
  Wheat,
  Droplet,
  Building2,
  Package,
  Sprout,
  ArrowRight,
  Sparkles,
  TrendingUp,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
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
// PHASE MAP
// ============================================================================

// BlockState -> Night Observatory phase colour (spec §5.2 extrapolation, plus
// literal matches where the crop-growth vocabulary already lines up with the
// room-phase one: empty/fruiting/harvesting/cleaning are exact). Kept in sync
// with the identical map in VirtualBlockItem.tsx — same status vocabulary
// (BlockState), same colour everywhere (spec §5: "same status = same colour
// in every context").
const BLOCK_STATE_PHASE: Record<string, PhaseKey> = {
  empty: 'empty',
  planned: 'fruitingInit', // pending / awaiting — not yet actively growing
  growing: 'inoculated', // open / active / in progress
  fruiting: 'fruiting', // literal match
  harvesting: 'harvesting', // literal match — the one gold status
  cleaning: 'cleaning', // literal match
  alert: 'quarantined', // rejected / failed / needs attention
  partial: 'colonizing', // partially done
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div<{ $phase: PhaseKey }>`
  ${glassPanelHover}
  padding: 24px;
  border-left: 3px solid ${({ theme, $phase }) => theme.colors.phase[$phase]};
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
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
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
    color: ${({ theme }) => theme.colors.celeste};
    text-decoration: underline;
  }
`;

const BlockCode = styled.div`
  ${monoLabel}
  font-size: 0.68rem;
  text-transform: none;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const BlockType = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: capitalize;
`;

const PlantingCountBadge = styled.div<{ $count: number }>`
  ${monoLabel}
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.72rem;
  background: ${({ $count, theme }) => ($count > 0 ? theme.colors.successBg : theme.colors.surface)};
  color: ${({ $count, theme }) => ($count > 0 ? theme.colors.bright.emerald : theme.colors.textDisabled)};
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: 8px;
  border: 1px dashed ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.textDisabled};
  font-size: 14px;
`;

const ViewPlantingsButton = styled.button`
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    border-color: ${({ theme }) => theme.colors.celeste};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
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
  border-radius: 10px;
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
        color: ${theme.colors.onDark};
        &:hover {
          background: ${theme.colors.success};
          filter: brightness(0.9);
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover {
          filter: brightness(1.15);
        }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover {
        background: ${theme.colors.glass.hi};
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
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onDark};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    filter: brightness(0.9);
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
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  margin-bottom: 8px;
`;

const PlantingState = styled.div<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
  text-transform: capitalize;
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
  ${monoLabel}
  font-size: 0.66rem;
  text-transform: none;
  letter-spacing: 0.02em;
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

  const cardPhase: PhaseKey = BLOCK_STATE_PHASE[physicalBlock.state] ?? 'empty';

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

  const BlockTypeIcon = (() => {
    const blockType = physicalBlock.metadata?.blockType?.toString().toLowerCase() || '';
    if (blockType.includes('greenhouse')) return Home;
    if (blockType.includes('open')) return Wheat;
    if (blockType.includes('hydro')) return Droplet;
    if (blockType.includes('vertical')) return Building2;
    return Package;
  })();

  return (
    <Card
      $phase={cardPhase}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Header>
        <LeftSection>
          <BlockIcon>
            <BlockTypeIcon size={26} strokeWidth={1.6} />
          </BlockIcon>
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
            <PlantingState $phase={cardPhase}>
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
            <Sprout size={13} strokeWidth={1.6} />
            <span>View Active Plantings ({activePlantings.length})</span>
            <ArrowRight size={13} strokeWidth={1.6} />
          </ViewPlantingsButton>
        )}

        {/* Show cleaning state message or empty-state CTA */}
        {!physicalBlockHasPlanting && activePlantings.length === 0 && (
          isBlockCleaning ? (
            <EmptyPlantingsMessage>
              <Sparkles size={13} strokeWidth={1.6} />
              <span>This block is being cleaned and will be ready for planting soon</span>
            </EmptyPlantingsMessage>
          ) : (
            <AddNewPlantingButton onClick={() => setShowPlantModal(true)}>
              <Sprout size={13} strokeWidth={1.6} />
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
              <Sprout size={13} strokeWidth={1.6} />
              <span>Add Another Planting</span>
            </ActionButton>
          )}

          {/* Cleaning in progress indicator */}
          {isBlockCleaning && (
            <ActionButton $variant="secondary" disabled>
              <Sparkles size={13} strokeWidth={1.6} />
              <span>Cleaning in Progress</span>
            </ActionButton>
          )}

          {physicalBlockHasPlanting && (
            <ActionButton $variant="secondary" onClick={handleBlockNameClick}>
              <TrendingUp size={13} strokeWidth={1.6} />
              <span>Manage Planting</span>
            </ActionButton>
          )}

          <ActionButton $variant="secondary" onClick={handleBlockNameClick}>
            <BarChart3 size={13} strokeWidth={1.6} />
            <span>View Details</span>
          </ActionButton>

          <ActionButton $variant="danger" onClick={handleDeleteBlock} disabled={isDeleting}>
            <Trash2 size={13} strokeWidth={1.6} />
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
