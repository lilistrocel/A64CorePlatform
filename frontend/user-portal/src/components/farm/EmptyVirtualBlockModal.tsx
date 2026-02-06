/**
 * EmptyVirtualBlockModal Component
 *
 * Confirmation modal for emptying a virtual block.
 * Shows preview of what will happen: task transfers, deletions, harvest transfers, and area return.
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Block, EmptyVirtualBlockPreview } from '../../types/farm';

// ============================================================================
// TYPES
// ============================================================================

interface EmptyVirtualBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: Block;
  onSuccess: () => void;
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
  background: white;
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
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: white;
  flex-shrink: 0;
`;

const WarningIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
  text-align: center;
`;

const ModalDescription = styled.p`
  font-size: 14px;
  color: #616161;
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
  background: ${({ $warning }) => ($warning ? '#fef3c7' : '#f0fdf4')};
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
  color: #212121;
  line-height: 1.5;
`;

const WarningText = styled.div`
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 16px;
  color: #b91c1c;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  margin-top: 24px;
`;

const LoadingContainer = styled.div`
  text-align: center;
  padding: 40px;
  color: #757575;
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: 24px;
  color: #ef4444;
  background: #fee2e2;
  border-radius: 8px;
`;

const ModalFooter = styled.div`
  padding: 20px 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  background: white;
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

  ${({ $variant }) => {
    switch ($variant) {
      case 'danger':
        return `
          background: #ef4444;
          color: white;
          &:hover:not(:disabled) {
            background: #dc2626;
          }
        `;
      default:
        return `
          background: #f5f5f5;
          color: #616161;
          &:hover:not(:disabled) {
            background: #e0e0e0;
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
}: EmptyVirtualBlockModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmptyVirtualBlockPreview | null>(null);

  useEffect(() => {
    if (isOpen && block.blockCategory === 'virtual') {
      loadPreview();
    }
  }, [isOpen, block.blockId]);

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
    try {
      setSubmitting(true);
      const result = await farmApi.emptyVirtualBlock(block.farmId, block.blockId);

      // Show success message
      alert(
        `Virtual block ${result.virtualBlockCode} emptied successfully!\n\n` +
          `Tasks transferred: ${result.tasksTransferred}\n` +
          `Harvests transferred: ${result.harvestsTransferred}\n` +
          `Area returned: ${result.areaReturned} m²`
      );

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error emptying virtual block:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to empty virtual block. Please try again.';
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const modalContent = (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <WarningIcon>⚠️</WarningIcon>
          <ModalTitle>Empty Virtual Block {block.blockCode || block.name}?</ModalTitle>
          <ModalDescription>
            This will end the crop cycle and transfer all history to the parent block.
          </ModalDescription>
        </ModalHeader>

        <ModalBody>
          {loading && <LoadingContainer>Loading preview...</LoadingContainer>}

          {error && <ErrorContainer>{error}</ErrorContainer>}

          {!loading && !error && preview && (
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
            {submitting ? 'Emptying...' : 'Confirm & Empty Block'}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
