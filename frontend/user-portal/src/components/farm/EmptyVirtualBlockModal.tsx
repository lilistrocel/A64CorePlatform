/**
 * EmptyVirtualBlockModal Component
 *
 * Unified confirmation modal for removing a virtual block. Supports two modes:
 *
 *   - 'archive' (default): end the crop cycle — transfer completed tasks and
 *     harvests to the parent block, return allocated area, write a record to
 *     `block_archives`, then hard-delete the virtual block row.
 *
 *   - 'delete' (advanced): cascade-delete the virtual block outright. Tasks
 *     and harvests are moved to the deleted_* trash collections, archives are
 *     preserved under deleted_block_archives, and nothing is transferred to
 *     the parent. Use this for misclicks / mis-created virtuals where there's
 *     no meaningful cycle to archive.
 *
 * Both the trash-icon on a virtual planting row and the "End / Remove" button
 * on BlockDetail open this modal — the user picks the mode inside.
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Block, EmptyVirtualBlockPreview } from '../../types/farm';

// ============================================================================
// TYPES
// ============================================================================

type RemoveMode = 'archive' | 'delete';

interface EmptyVirtualBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: Block;
  onSuccess: () => void;
  /**
   * Initial mode when the modal opens. Users can still toggle inside; this
   * only controls the default. Defaults to 'archive' (safer, matches
   * "finish cycle" semantics).
   */
  initialMode?: RemoveMode;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;
`;

const WarningIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
  text-align: center;
`;

const ModalDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  text-align: center;
`;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const TransferSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SummaryItem = styled.div<{ $warning?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: ${({ $warning, theme }) => ($warning ? theme.colors.warningBg : theme.colors.successBg)};
  border-radius: 8px;
  border-left: 4px solid ${({ $warning }) => ($warning ? '#f59e0b' : '#4caf50')};
`;

const Icon = styled.div<{ $warning?: boolean }>`
  font-size: 20px;
  font-weight: 600;
  color: ${({ $warning }) => ($warning ? '#f59e0b' : '#4caf50')};
  flex-shrink: 0;
  margin-top: 2px;
`;

const Text = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.5;
`;

const WarningText = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  padding: 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  margin-top: 24px;
`;

const ModeSelector = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ModeOption = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 8px;
  background: ${({ $active, theme }) => ($active ? theme.colors.infoBg : theme.colors.surface)};
  border: 2px solid
    ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.neutral[300])};
  cursor: pointer;
  text-align: left;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ModeLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ModeHint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.4;
`;

const LoadingContainer = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 8px;
`;

const ModalFooter = styled.div`
  padding: 20px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  background: ${({ theme }) => theme.colors.background};
  flex-shrink: 0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'danger':
        return `
          background: ${theme.colors.error};
          color: white;
          &:hover:not(:disabled) {
            background: #dc2626;
          }
        `;
      default:
        return `
          background: ${theme.colors.surface};
          color: ${theme.colors.textSecondary};
          &:hover:not(:disabled) {
            background: ${theme.colors.neutral[300]};
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function EmptyVirtualBlockModal({
  isOpen,
  onClose,
  block,
  onSuccess,
  initialMode = 'archive',
}: EmptyVirtualBlockModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmptyVirtualBlockPreview | null>(null);
  const [mode, setMode] = useState<RemoveMode>(initialMode);

  useEffect(() => {
    if (isOpen) {
      // Reset mode to the caller's intent each time the modal opens.
      setMode(initialMode);
      if (block.blockCategory === 'virtual') {
        loadPreview();
      }
    }
  }, [isOpen, block.blockId, initialMode]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const previewData = await farmApi.previewEmptyVirtualBlock(block.farmId, block.blockId);
      setPreview(previewData);
    } catch (err: any) {
      console.error('Error loading preview:', err);
      setError('Failed to load preview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);

      if (mode === 'archive') {
        const result = await farmApi.emptyVirtualBlock(block.farmId, block.blockId);
        alert(
          `Virtual block ${result.virtualBlockCode} end-of-cycle complete.\n\n` +
            `Tasks transferred: ${result.tasksTransferred}\n` +
            `Harvests transferred: ${result.harvestsTransferred}\n` +
            `Area returned: ${result.areaReturned} m²`
        );
      } else {
        // 'delete' mode — cascade delete. Data goes to deleted_* collections,
        // nothing transfers to parent, no archive entry is created.
        await farmApi.deleteBlock(block.farmId, block.blockId);
        alert(`Virtual block ${block.blockCode || block.name} deleted.`);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(`Error ${mode === 'archive' ? 'emptying' : 'deleting'} virtual block:`, error);
      const errorMsg =
        error.response?.data?.detail ||
        `Failed to ${mode === 'archive' ? 'end cycle for' : 'delete'} virtual block. Please try again.`;
      alert(errorMsg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const isArchive = mode === 'archive';
  const titleText = isArchive
    ? `End Cycle for ${block.blockCode || block.name}?`
    : `Delete ${block.blockCode || block.name}?`;
  const descriptionText = isArchive
    ? 'Transfer this block\u2019s history to its parent, archive the cycle, and free up the allocated area.'
    : 'Permanently remove this virtual block. Data is moved to the deleted-items trash (recoverable) but nothing is transferred to the parent and no archive is created.';
  const confirmButtonLabel = submitting
    ? isArchive
      ? 'Ending cycle…'
      : 'Deleting…'
    : isArchive
      ? 'End cycle & archive'
      : 'Delete without archiving';

  const modalContent = (
    <Overlay $isOpen={isOpen}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <WarningIcon>⚠️</WarningIcon>
          <ModalTitle>{titleText}</ModalTitle>
          <ModalDescription>{descriptionText}</ModalDescription>
        </ModalHeader>

        <ModalBody>
          {/* Mode toggle — always visible so the user can switch before confirming */}
          <ModeSelector role="radiogroup" aria-label="Removal mode">
            <ModeOption
              type="button"
              role="radio"
              aria-checked={isArchive}
              $active={isArchive}
              onClick={() => setMode('archive')}
              disabled={submitting}
            >
              <ModeLabel>End cycle &amp; archive</ModeLabel>
              <ModeHint>Default. Transfers history to parent, archives the cycle.</ModeHint>
            </ModeOption>
            <ModeOption
              type="button"
              role="radio"
              aria-checked={!isArchive}
              $active={!isArchive}
              onClick={() => setMode('delete')}
              disabled={submitting}
            >
              <ModeLabel>Delete without archiving</ModeLabel>
              <ModeHint>Use for misclicks / mis-created virtuals.</ModeHint>
            </ModeOption>
          </ModeSelector>

          {loading && <LoadingContainer>Loading preview...</LoadingContainer>}

          {error && <ErrorContainer>{error}</ErrorContainer>}

          {!loading && !error && preview && isArchive && (
            <>
              <TransferSummary>
                <SummaryItem>
                  <Icon>✓</Icon>
                  <Text>
                    <strong>{preview.tasksToTransfer} completed tasks</strong> will be transferred to parent
                    block <strong>{preview.parentBlockCode}</strong>
                  </Text>
                </SummaryItem>

                <SummaryItem>
                  <Icon>✓</Icon>
                  <Text>
                    <strong>{preview.harvestsToTransfer} harvest records</strong> will be transferred to
                    parent block
                  </Text>
                </SummaryItem>

                <SummaryItem>
                  <Icon>✓</Icon>
                  <Text>
                    <strong>{preview.areaToReturn} m²</strong> will be returned to parent block's area budget
                  </Text>
                </SummaryItem>

                {preview.tasksToDelete > 0 && (
                  <SummaryItem $warning>
                    <Icon $warning>✗</Icon>
                    <Text>
                      <strong>{preview.tasksToDelete} pending tasks</strong> will be permanently deleted (not
                      yet completed)
                    </Text>
                  </SummaryItem>
                )}

                <SummaryItem $warning>
                  <Icon $warning>✗</Icon>
                  <Text>
                    Virtual block <strong>{preview.virtualBlockCode}</strong> will be permanently deleted
                  </Text>
                </SummaryItem>
              </TransferSummary>

              <WarningText>⚠️ This action cannot be undone.</WarningText>
            </>
          )}

          {!loading && !error && preview && !isArchive && (
            <>
              <TransferSummary>
                <SummaryItem $warning>
                  <Icon $warning>✗</Icon>
                  <Text>
                    Virtual block <strong>{preview.virtualBlockCode}</strong> will be removed. Nothing is
                    transferred to parent <strong>{preview.parentBlockCode}</strong>.
                  </Text>
                </SummaryItem>

                <SummaryItem $warning>
                  <Icon $warning>✗</Icon>
                  <Text>
                    <strong>{preview.tasksToTransfer + preview.tasksToDelete} tasks</strong> and{' '}
                    <strong>{preview.harvestsToTransfer} harvest records</strong> will be moved to
                    deleted-items storage.
                  </Text>
                </SummaryItem>

                <SummaryItem>
                  <Icon>✓</Icon>
                  <Text>
                    <strong>{preview.areaToReturn} m²</strong> will be returned to parent block's area budget.
                  </Text>
                </SummaryItem>
              </TransferSummary>

              <WarningText>
                ⚠️ Deleted data is preserved in trash collections but there is no UI to restore it —
                contact an admin if you need to recover.
              </WarningText>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button type="button" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>

          <Button
            type="button"
            $variant="danger"
            onClick={handleConfirm}
            disabled={loading || !!error || !preview || submitting}
          >
            {confirmButtonLabel}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
