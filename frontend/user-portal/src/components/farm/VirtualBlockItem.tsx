/**
 * VirtualBlockItem Component
 *
 * Compact inline display of a virtual block (planting) within a physical block card.
 * Shows crop name, state, and days in current state in a single row.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  Square,
  ClipboardList,
  Sprout,
  Grape,
  Wheat,
  Sparkles,
  AlertTriangle,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { EmptyVirtualBlockModal } from './EmptyVirtualBlockModal';
import { BLOCK_STATE_LABELS } from '../../types/farm';
import type { Block, BlockState } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VirtualBlockItemProps {
  virtualBlock: Block;
  farmId: string;
  onRefresh?: () => void;
}

// ============================================================================
// PHASE MAP
// ============================================================================

// BlockState -> Night Observatory phase colour (spec §5.2 extrapolation, plus
// literal matches where the crop-growth vocabulary already lines up with the
// room-phase one: empty/fruiting/harvesting/cleaning are exact). Kept in sync
// with the identical map in PhysicalBlockCard.tsx — same status vocabulary
// (BlockState), same colour everywhere (spec §5: "same status = same colour
// in every context").
const BLOCK_STATE_PHASE: Record<BlockState, PhaseKey> = {
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

const Container = styled.div<{ $phase: PhaseKey }>`
  ${glassPanelHover}
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-left: 3px solid ${({ theme, $phase }) => theme.colors.phase[$phase]};
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
`;

const CropIcon = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.celeste};
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
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BlockCode = styled.div`
  ${monoLabel}
  font-size: 0.64rem;
  text-transform: none;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

const StateBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const DaysInfo = styled.div`
  ${monoLabel}
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.64rem;
  text-transform: none;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.error};
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    filter: brightness(1.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function VirtualBlockItem({ virtualBlock, farmId, onRefresh }: VirtualBlockItemProps) {
  const navigate = useNavigate();
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const statePhase: PhaseKey = BLOCK_STATE_PHASE[virtualBlock.state] ?? 'empty';
  const stateLabel = BLOCK_STATE_LABELS[virtualBlock.state];

  // Calculate days in current state
  const calculateDaysInState = (): number => {
    const currentState = virtualBlock.state;
    const now = new Date();

    // First, try to use actual statusChanges if available
    if (virtualBlock.statusChanges && virtualBlock.statusChanges.length > 0) {
      // Find the most recent status change to current state
      const currentStateChange = [...virtualBlock.statusChanges]
        .reverse()
        .find(sc => sc.status === currentState);
      if (currentStateChange?.changedAt) {
        const stateStartDate = new Date(currentStateChange.changedAt);
        const diffMs = now.getTime() - stateStartDate.getTime();
        return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    // Fall back to expectedStatusChanges (predicted dates)
    if (virtualBlock.expectedStatusChanges && virtualBlock.expectedStatusChanges[currentState]) {
      const expectedStateDate = new Date(virtualBlock.expectedStatusChanges[currentState]);
      const diffMs = now.getTime() - expectedStateDate.getTime();
      // Only return positive values (state should have started by now)
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Final fallback: use plantedDate for total days since planting
    if (!virtualBlock.plantedDate) return 0;
    const planted = new Date(virtualBlock.plantedDate);
    const diffMs = now.getTime() - planted.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const daysInState = calculateDaysInState();

  const getCropIcon = (state: BlockState) => {
    const icons = {
      empty: Square,
      planned: ClipboardList,
      planted: Sprout,
      growing: Sprout,
      fruiting: Grape,
      harvesting: Wheat,
      cleaning: Sparkles,
      alert: AlertTriangle,
      partial: BarChart3,
    };
    return icons[state] || Sprout;
  };

  const CropTypeIcon = getCropIcon(virtualBlock.state);

  const handleClick = () => {
    navigate(`/farm/farms/${farmId}/blocks/${virtualBlock.blockId}`);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking the remove button
    setShowRemoveModal(true);
  };

  return (
    <>
      <Container $phase={statePhase} onClick={handleClick}>
        <LeftSection>
          <CropIcon>
            <CropTypeIcon size={18} strokeWidth={1.6} />
          </CropIcon>
          <CropInfo>
            <CropName>{virtualBlock.targetCropName || virtualBlock.name || 'Unknown Crop'}</CropName>
            <BlockCode>{virtualBlock.blockCode || virtualBlock.legacyBlockCode || 'N/A'}</BlockCode>
          </CropInfo>
        </LeftSection>

        <RightSection>
          <StateBadge $phase={statePhase}>{stateLabel}</StateBadge>
          {daysInState > 0 && (
            <DaysInfo>
              <BarChart3 size={12} strokeWidth={1.6} />
              {daysInState}d
            </DaysInfo>
          )}
          <DeleteButton onClick={handleRemoveClick}>
            <Trash2 size={13} strokeWidth={1.6} />
          </DeleteButton>
        </RightSection>
      </Container>

      <EmptyVirtualBlockModal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        block={virtualBlock}
        onSuccess={() => {
          setShowRemoveModal(false);
          onRefresh?.();
        }}
      />
    </>
  );
}
