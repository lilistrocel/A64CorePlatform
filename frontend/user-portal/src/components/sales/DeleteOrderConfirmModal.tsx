/**
 * DeleteOrderConfirmModal
 *
 * Two-step delete confirmation modal for sales orders (Phase 4).
 * Displays the allocation preview returned by GET /v1/sales/orders/{id}/delete-preview
 * and lets the user choose what to do with expired batches before confirming.
 *
 * Design constraints (enforced):
 *  - Modal never closes on overlay click — X / Cancel / Esc only.
 *  - Active allocations: auto-restored, no user choice needed.
 *  - Expired allocations: user chooses "revive" (requires new expiry date) or "waste" (default).
 *  - Missing allocations: informational only, will be wasted automatically.
 *  - Confirm button disabled until all "revive" decisions have a valid future expiry date.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import type { DeleteOrderPreview, DeleteOrderAllocationPreview, DeleteOrderDecision } from '../../services/salesService';
import { salesApi } from '../../services/salesService';

// ============================================================================
// PROPS
// ============================================================================

export interface DeleteOrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  preview: DeleteOrderPreview;
  /** Called after a successful delete so the parent can refresh the order list. */
  onSuccess: () => void;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

type ExpiredAction = 'revive' | 'waste';

interface ExpiredDecision {
  action: ExpiredAction;
  expiryDate: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Returns true if a date string is in the future (strictly > now). */
function isFutureDate(iso: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 1100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  overflow-y: auto;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 20px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  line-height: 1;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  &:focus-visible {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
  }
`;

const SubHeader = styled.p`
  margin: 0;
  padding: 12px 24px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ModalBody = styled.div`
  padding: 16px 24px;
  overflow-y: auto;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const AllocationRow = styled.div`
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ActiveRow = styled(AllocationRow)`
  color: ${({ theme }) => theme.colors.text.primary};
`;

const MissingRow = styled(AllocationRow)`
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const ExpiredPanel = styled(AllocationRow)`
  background: #FFFBEB;
  border-color: #F59E0B;
`;

const ExpiredTitle = styled.div`
  font-weight: 600;
  color: #92400E;
  margin-bottom: 10px;
`;

const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  input[type='radio'] {
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: #3B82F6;
  }
`;

const RadioDescription = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DateInput = styled.input<{ $hasError?: boolean }>`
  margin-top: 6px;
  padding: 8px 12px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#D1D5DB')};
  border-radius: 6px;
  font-size: 13px;
  background: white;
  color: #111827;
  width: 180px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const DateError = styled.div`
  font-size: 11px;
  color: #EF4444;
  margin-top: 2px;
`;

const GroupLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 4px;
  margin-bottom: 2px;
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const FooterButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: ${theme.colors.text.secondary};
        border: 1px solid ${theme.colors.border.subtle};
        &:hover:not(:disabled) { background: ${theme.colors.surface.raised}; }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: #EF4444;
        color: white;
        &:hover:not(:disabled) { background: #DC2626; }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      `;
    }
    return `
      background: #3B82F6;
      color: white;
      &:hover:not(:disabled) { background: #1D4ED8; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }}
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  border-radius: 8px;
  font-size: 13px;
  margin: 0 24px 12px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function DeleteOrderConfirmModal({
  isOpen,
  onClose,
  orderId,
  preview,
  onSuccess,
}: DeleteOrderConfirmModalProps) {
  // Per-allocation decisions for expired batches.
  // Key: `${lineItemIndex}-${inventoryId}`
  const [expiredDecisions, setExpiredDecisions] = useState<Record<string, ExpiredDecision>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Initialise all expired allocations to "waste" on open.
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, ExpiredDecision> = {};
    for (const alloc of preview.allocations) {
      if (alloc.state === 'expired') {
        const key = `${alloc.lineItemIndex}-${alloc.inventoryId}`;
        initial[key] = { action: 'waste', expiryDate: '' };
      }
    }
    setExpiredDecisions(initial);
    setSubmitError(null);
  }, [isOpen, preview]);

  // Focus the close button when the modal opens.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard: Esc closes the modal.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isSubmitting, onClose]);

  const setExpiredDecision = useCallback(
    (key: string, partial: Partial<ExpiredDecision>) => {
      setExpiredDecisions((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...partial },
      }));
    },
    [],
  );

  // Validation: confirm is disabled if any "revive" decision has no valid future date.
  const canConfirm = (() => {
    for (const [, dec] of Object.entries(expiredDecisions)) {
      if (dec.action === 'revive' && !isFutureDate(dec.expiryDate)) {
        return false;
      }
    }
    return true;
  })();

  const handleConfirm = async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Build decisions array. Active allocations don't need explicit entries
      // (backend handles them); include entries only for expired/missing.
      const decisions: DeleteOrderDecision[] = [];
      for (const alloc of preview.allocations) {
        const key = `${alloc.lineItemIndex}-${alloc.inventoryId}`;
        if (alloc.state === 'expired') {
          const dec = expiredDecisions[key];
          decisions.push({
            lineItemIndex: alloc.lineItemIndex,
            inventoryId: alloc.inventoryId,
            action: dec?.action ?? 'waste',
            expiryDate: dec?.action === 'revive' ? dec.expiryDate : undefined,
          });
        } else if (alloc.state === 'missing') {
          decisions.push({
            lineItemIndex: alloc.lineItemIndex,
            inventoryId: alloc.inventoryId,
            action: 'waste',
          });
        }
        // 'active' allocations: no explicit decision needed (backend defaults to restore)
      }

      await salesApi.deleteOrderConfirm(orderId, decisions);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      setSubmitError(
        axiosErr?.response?.data?.message ??
        axiosErr?.response?.data?.detail ??
        'Failed to delete order. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group allocations by line item index for display.
  const grouped = preview.allocations.reduce<Record<number, DeleteOrderAllocationPreview[]>>(
    (acc, alloc) => {
      if (!acc[alloc.lineItemIndex]) acc[alloc.lineItemIndex] = [];
      acc[alloc.lineItemIndex].push(alloc);
      return acc;
    },
    {},
  );

  if (!isOpen) return null;

  return createPortal(
    <Overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-order-modal-title"
    >
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle id="delete-order-modal-title">
            Delete Order {preview.orderCode}?
          </ModalTitle>
          <CloseButton
            ref={firstFocusRef}
            onClick={onClose}
            aria-label="Close modal"
            disabled={isSubmitting}
          >
            &times;
          </CloseButton>
        </ModalHeader>

        <SubHeader>
          This will return reserved stock to its source batches. Choose what to do with each expired batch.
        </SubHeader>

        <ModalBody>
          {Object.entries(grouped).map(([lineIndexStr, allocs]) => {
            const lineIndex = parseInt(lineIndexStr, 10);
            return (
              <div key={lineIndex}>
                {Object.keys(grouped).length > 1 && (
                  <GroupLabel>Line item {lineIndex + 1}</GroupLabel>
                )}
                {allocs.map((alloc) => {
                  const farmLabel = alloc.farmName ?? 'returned stock';
                  const key = `${alloc.lineItemIndex}-${alloc.inventoryId}`;

                  if (alloc.state === 'active') {
                    return (
                      <ActiveRow key={key}>
                        Restore {alloc.quantity.toLocaleString()} kg to {farmLabel}
                      </ActiveRow>
                    );
                  }

                  if (alloc.state === 'missing') {
                    return (
                      <MissingRow key={key}>
                        {alloc.quantity.toLocaleString()} kg from {farmLabel} — batch no longer in inventory; will be marked as waste
                      </MissingRow>
                    );
                  }

                  // Expired
                  const dec = expiredDecisions[key] ?? { action: 'waste', expiryDate: '' };
                  const showDateError =
                    dec.action === 'revive' && dec.expiryDate !== '' && !isFutureDate(dec.expiryDate);

                  return (
                    <ExpiredPanel key={key}>
                      <ExpiredTitle>
                        {alloc.quantity.toLocaleString()} kg from {farmLabel} — batch was marked expired on {fmtDate(alloc.expiredOn)}
                      </ExpiredTitle>
                      <RadioGroup role="radiogroup" aria-label={`Action for expired batch from ${farmLabel}`}>
                        <RadioLabel>
                          <input
                            type="radio"
                            name={key}
                            value="revive"
                            checked={dec.action === 'revive'}
                            onChange={() => setExpiredDecision(key, { action: 'revive' })}
                            disabled={isSubmitting}
                          />
                          <RadioDescription>
                            <span>Revive batch and restore the stock</span>
                            {dec.action === 'revive' && (
                              <>
                                <DateInput
                                  type="date"
                                  value={dec.expiryDate}
                                  $hasError={showDateError}
                                  onChange={(e) =>
                                    setExpiredDecision(key, { expiryDate: e.target.value })
                                  }
                                  min={new Date().toISOString().split('T')[0]}
                                  placeholder="New expiry date"
                                  aria-label="New expiry date"
                                  disabled={isSubmitting}
                                />
                                {showDateError && (
                                  <DateError>Expiry date must be in the future</DateError>
                                )}
                                {dec.expiryDate === '' && (
                                  <DateError>New expiry date is required</DateError>
                                )}
                              </>
                            )}
                          </RadioDescription>
                        </RadioLabel>
                        <RadioLabel>
                          <input
                            type="radio"
                            name={key}
                            value="waste"
                            checked={dec.action === 'waste'}
                            onChange={() => setExpiredDecision(key, { action: 'waste', expiryDate: '' })}
                            disabled={isSubmitting}
                          />
                          <span>Move to waste (no recovery)</span>
                        </RadioLabel>
                      </RadioGroup>
                    </ExpiredPanel>
                  );
                })}
              </div>
            );
          })}
        </ModalBody>

        {submitError && (
          <ErrorBanner role="alert">{submitError}</ErrorBanner>
        )}

        <ModalFooter>
          <FooterButton
            $variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </FooterButton>
          <FooterButton
            $variant="danger"
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            aria-disabled={!canConfirm || isSubmitting}
          >
            {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
          </FooterButton>
        </ModalFooter>
      </ModalBox>
    </Overlay>,
    document.body,
  );
}
