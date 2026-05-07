/**
 * PhysicalBlockPlantingsModal Component
 *
 * Modal that renders the virtual blocks (active plantings) that belong to a
 * specific physical block, using the same CompactBlockCard grid layout as the
 * Virtual-only Block Monitor view.
 *
 * Closes only via the X button, "Close" footer button, or the Escape key.
 * Never closes on backdrop click (standing project UX rule).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { CompactBlockCard } from './dashboard/CompactBlockCard';
import { EmptyVirtualBlockModal } from './EmptyVirtualBlockModal';
import { useDashboardConfig } from '../../hooks/farm/useDashboardConfig';
import type { Block, DashboardBlock } from '../../types/farm';

// ============================================================================
// TYPES
// ============================================================================

export interface PhysicalBlockPlantingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Display name for the physical block — used in the modal title */
  physicalBlockName: string;
  farmId: string;
  /** Already-filtered list of virtual DashboardBlocks belonging to this physical block */
  virtualBlocks: DashboardBlock[];
  onBlockUpdate?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  /* Sits below all child modals that can be opened from cards inside it.
     Child modal z-indexes range from 1000 (QuickPlanModal, ResolveAlertModal)
     to 1100 (BlockDetailsModal, BlockHarvestEntryModal, BlockAnalyticsModal).
     999 keeps this modal below all of them so they overlay correctly. */
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const Dialog = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.3);
  max-width: min(1200px, 90vw);
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  align-items: center;
  gap: 16px;
`;

const TitleId = 'physical-block-plantings-modal-title';

const ModalTitle = styled.h2.attrs({ id: TitleId })`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  flex: 1;
`;

const PlantingCountChip = styled.span`
  padding: 4px 12px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all 150ms ease-in-out;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const BlocksGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  justify-content: start;
`;

/* Wraps each CompactBlockCard so we can absolutely-position a trash button
   on top of it without modifying CompactBlockCard itself (which is shared
   with Block Monitor). */
const CardWrapper = styled.div`
  position: relative;
`;

const TrashButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  color: #dc2626;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  z-index: 2;

  &:hover {
    background: rgba(220, 38, 38, 0.1);
    border-color: #dc2626;
  }

  &:focus-visible {
    outline: 2px solid #dc2626;
    outline-offset: 2px;
  }
`;

const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textDisabled};
  font-size: 14px;
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  justify-content: flex-end;
`;

const FooterCloseButton = styled.button`
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PhysicalBlockPlantingsModal({
  isOpen,
  onClose,
  physicalBlockName,
  farmId,
  virtualBlocks,
  onBlockUpdate,
}: PhysicalBlockPlantingsModalProps) {
  // Consume config internally — keeps the prop API clean.
  const { config } = useDashboardConfig();

  // Ref for the X close button so we can focus it when the modal opens.
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Tracks which virtual block (if any) the user is archiving/deleting.
  const [blockToArchive, setBlockToArchive] = useState<DashboardBlock | null>(null);

  // Esc key handler and body-scroll lock.
  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the X button for keyboard accessibility.
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    // Backdrop intentionally has NO onClick handler — modal must not close on
    // overlay click (standing project UX rule).
    <Backdrop>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={TitleId}
      >
        <ModalHeader>
          <ModalTitle>Plantings in {physicalBlockName}</ModalTitle>
          <PlantingCountChip>
            {virtualBlocks.length} {virtualBlocks.length === 1 ? 'planting' : 'plantings'}
          </PlantingCountChip>
          <CloseButton
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          {virtualBlocks.length === 0 ? (
            <EmptyState>No active plantings.</EmptyState>
          ) : (
            <BlocksGrid>
              {virtualBlocks.map((block) => (
                <CardWrapper key={block.blockId}>
                  <CompactBlockCard
                    block={block}
                    farmId={farmId}
                    config={config}
                    onUpdate={onBlockUpdate}
                  />
                  <TrashButton
                    type="button"
                    aria-label={`Archive or delete ${block.name || block.blockCode}`}
                    title="Archive / delete planting"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBlockToArchive(block);
                    }}
                  >
                    🗑️
                  </TrashButton>
                </CardWrapper>
              ))}
            </BlocksGrid>
          )}
        </ModalBody>

        <ModalFooter>
          <FooterCloseButton onClick={onClose}>
            Close
          </FooterCloseButton>
        </ModalFooter>
      </Dialog>

      {/* Archive/delete confirmation. EmptyVirtualBlockModal expects a Block
          shape; DashboardBlock supplies all the fields it actually reads
          (blockId, blockCode, name, blockCategory) plus we add farmId. */}
      {blockToArchive && (
        <EmptyVirtualBlockModal
          isOpen={blockToArchive !== null}
          onClose={() => setBlockToArchive(null)}
          block={{ ...blockToArchive, farmId } as unknown as Block}
          onSuccess={() => {
            setBlockToArchive(null);
            onBlockUpdate?.();
          }}
        />
      )}
    </Backdrop>
  );

  return createPortal(content, document.body);
}
