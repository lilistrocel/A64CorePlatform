/**
 * ReportReturnModal
 *
 * Modal for reporting a partial or full return against a shipped/delivered
 * sales order (Phase 4).  Supports kg-mode and container-mode per item,
 * matching the container-mode pattern from AddOrderItemModal.
 *
 * Design constraints (enforced):
 *  - Modal never closes on overlay click — X / Cancel / Esc only.
 *  - Default mode per item: containers if the order item has containerCount
 *    and containerSize set, otherwise kg.
 *  - Container size pre-fills from the order item; user may override.
 *  - In container mode: kg total is computed (count × size), shown read-only.
 *  - "Skip this item" excludes the item from the submitted request entirely.
 *  - Validates: returnedKg + previouslyReturned ≤ originalQty per item.
 *  - previouslyReturned is derived from order.returns (Phase 4 field);
 *    treated as 0 if absent (defensive: order.returns ?? []).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import type { SalesOrder } from '../../types/sales';
import type { ReportReturnItem } from '../../services/salesService';
import { salesApi } from '../../services/salesService';
import { formatCurrency } from '../../utils/formatNumber';

// ============================================================================
// PROPS
// ============================================================================

export interface ReportReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder;
  /** Called after successful submission so the parent can refresh the order list. */
  onSuccess: () => void;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

type InputMode = 'kg' | 'containers';
type Condition = 'sellable' | 'spoiled';
type DisposalMethod = 'compost' | 'animal_feed' | 'discard' | 'sold_discount' | 'donated' | 'pending';

interface ItemReturnState {
  mode: InputMode;
  /** Quantity in kg (used when mode === 'kg'). */
  quantityKg: string;
  /** Container count (used when mode === 'containers'). */
  containerCount: string;
  /** Container size in kg (pre-filled from order item, editable). */
  containerSize: string;
  condition: Condition;
  disposalMethod: DisposalMethod;
  reason: string;
  skip: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Returns the previously-returned quantity (kg) for a given item index. */
function getPreviouslyReturned(order: SalesOrder, itemIndex: number): number {
  const returns = order.returns ?? [];
  return returns
    .filter((r) => r.orderItemIndex === itemIndex)
    .reduce((sum, r) => sum + r.quantity, 0);
}

/** Returns the effective return quantity in kg for an item's current state. */
function getReturnKg(state: ItemReturnState): number {
  if (state.mode === 'containers') {
    const count = parseFloat(state.containerCount);
    const size = parseFloat(state.containerSize);
    if (isNaN(count) || isNaN(size) || count <= 0 || size <= 0) return 0;
    return count * size;
  }
  const qty = parseFloat(state.quantityKg);
  if (isNaN(qty) || qty < 0) return 0;
  return qty;
}

function fmtKg(val: number): string {
  return `${val.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`;
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
  max-width: 700px;
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
    outline: 2px solid #0F6E56;
    outline-offset: 2px;
  }
`;

const SubHeader = styled.div`
  padding: 10px 24px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`;

const SubHeaderItem = styled.span``;

const ModalBody = styled.div`
  padding: 16px 24px;
  overflow-y: auto;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ItemBlock = styled.div<{ $skipped?: boolean }>`
  padding: 16px;
  border: 1px solid ${({ $skipped, theme }) => ($skipped ? theme.colors.surface.sunken : theme.colors.border.subtle)};
  border-radius: 10px;
  background: ${({ $skipped, theme }) => ($skipped ? theme.colors.surface.canvas : theme.colors.surface.canvas)};
  opacity: ${({ $skipped }) => ($skipped ? 0.6 : 1)};
  transition: opacity 150ms ease-in-out;
`;

const ItemTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: 2px;
`;

const ItemMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 12px;
`;

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  white-space: nowrap;
  min-width: 80px;
`;

const ModeGroup = styled.div`
  display: flex;
  gap: 16px;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  input[type='radio'] {
    accent-color: #0F6E56;
  }
`;

const NumberInput = styled.input<{ $hasError?: boolean }>`
  padding: 8px 12px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#D1D5DB')};
  border-radius: 6px;
  font-size: 13px;
  background: white;
  color: #111827;
  width: 100px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #F9FAFB;
    cursor: not-allowed;
  }
`;

const ReadonlyValue = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-style: italic;
`;

const SelectInput = styled.select`
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  color: #111827;
  cursor: pointer;
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #F9FAFB;
    cursor: not-allowed;
  }
`;

const TextInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  color: #111827;
  flex: 1;
  min-width: 160px;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background: #F9FAFB;
    cursor: not-allowed;
  }
`;

const ValidationError = styled.div`
  font-size: 12px;
  color: #9E2A2A;
  margin-top: 4px;
`;

const SkipRow = styled.div`
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const SkipLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;

  input[type='checkbox'] {
    accent-color: #0F6E56;
  }
`;

const NotesArea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: white;
  color: #111827;
  min-height: 70px;
  resize: vertical;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const NotesLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  display: block;
  margin-bottom: 6px;
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
  flex-wrap: wrap;
`;

const FooterSummary = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  flex: 1;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 10px;
`;

const FooterButton = styled.button<{ $variant?: 'primary' | 'secondary' }>`
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
    return `
      background: #0F6E56;
      color: white;
      &:hover:not(:disabled) { background: #0B5644; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
  }}
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: rgba(158,42,42,0.08);
  border: 1px solid #9E2A2A;
  color: #9E2A2A;
  border-radius: 8px;
  font-size: 13px;
  margin: 0 24px 12px;
`;

const Divider = styled.div`
  width: 1px;
  height: 20px;
  background: #D1D5DB;
  align-self: center;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function ReportReturnModal({ isOpen, onClose, order, onSuccess }: ReportReturnModalProps) {
  const [itemStates, setItemStates] = useState<ItemReturnState[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Initialise item states whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setNotes('');
    setSubmitError(null);
    setItemStates(
      order.items.map((item) => {
        const hasContainers = Boolean(item.containerCount && item.containerSize);
        return {
          mode: hasContainers ? 'containers' : 'kg',
          quantityKg: '',
          containerCount: '',
          containerSize: item.containerSize != null ? String(item.containerSize) : '',
          condition: 'sellable',
          disposalMethod: 'pending',
          reason: '',
          skip: false,
        };
      }),
    );
  }, [isOpen, order]);

  // Focus close button on open.
  useEffect(() => {
    if (isOpen) setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [isOpen]);

  // Esc closes the modal.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isSubmitting, onClose]);

  const updateItem = useCallback(
    (index: number, partial: Partial<ItemReturnState>) => {
      setItemStates((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...partial };
        return next;
      });
    },
    [],
  );

  // Summary stats for footer.
  const { activeItemCount, totalKg, estimatedRefund } = (() => {
    let count = 0;
    let kg = 0;
    let refund = 0;
    order.items.forEach((item, i) => {
      const st = itemStates[i];
      if (!st || st.skip) return;
      const returnKg = getReturnKg(st);
      if (returnKg <= 0) return;
      count += 1;
      kg += returnKg;
      refund += returnKg * item.unitPrice;
    });
    return { activeItemCount: count, totalKg: kg, estimatedRefund: refund };
  })();

  // Validation: for each non-skipped item with a positive return qty,
  // check returnedKg + previouslyReturned ≤ originalQty.
  const getItemError = (index: number): string | null => {
    const st = itemStates[index];
    if (!st || st.skip) return null;
    const returnKg = getReturnKg(st);
    if (returnKg <= 0) return null;
    const item = order.items[index];
    const alreadyReturned = getPreviouslyReturned(order, index);
    if (returnKg + alreadyReturned > item.quantity) {
      return `Return quantity (${fmtKg(returnKg)}) + already returned (${fmtKg(alreadyReturned)}) exceeds original (${fmtKg(item.quantity)})`;
    }
    return null;
  };

  const hasAnyValidItems = order.items.some((_, i) => {
    const st = itemStates[i];
    if (!st || st.skip) return false;
    return getReturnKg(st) > 0 && !getItemError(i);
  });

  const hasValidationErrors = order.items.some((_, i) => Boolean(getItemError(i)));

  const canConfirm = hasAnyValidItems && !hasValidationErrors && !isSubmitting;

  const handleConfirm = async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const items: ReportReturnItem[] = [];
      order.items.forEach((item, i) => {
        const st = itemStates[i];
        if (!st || st.skip) return;
        const returnKg = getReturnKg(st);
        if (returnKg <= 0) return;

        const entry: ReportReturnItem = {
          orderItemIndex: i,
          quantity: returnKg,
          condition: st.condition,
          reason: st.reason || undefined,
        };

        if (st.mode === 'containers') {
          const count = parseFloat(st.containerCount);
          const size = parseFloat(st.containerSize);
          if (!isNaN(count) && !isNaN(size)) {
            entry.containerCount = count;
            entry.containerSize = size;
          }
        }

        if (st.condition === 'spoiled') {
          entry.disposalMethod = st.disposalMethod || undefined;
        }

        // Suppress unused variable lint — item is only needed for quantity/unitPrice
        void item;
        items.push(entry);
      });

      await salesApi.reportOrderReturn(order.orderId, items, notes || undefined);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      setSubmitError(
        axiosErr?.response?.data?.message ??
        axiosErr?.response?.data?.detail ??
        'Failed to submit return. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || itemStates.length === 0) return null;

  return createPortal(
    <Overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-return-modal-title"
    >
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle id="report-return-modal-title">
            Report Return — Order {order.orderCode}
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
          <SubHeaderItem>{order.customerName}</SubHeaderItem>
          <SubHeaderItem>Order total: {formatCurrency(order.total)}</SubHeaderItem>
        </SubHeader>

        <ModalBody>
          {order.items.map((item, i) => {
            const st = itemStates[i];
            if (!st) return null;

            const alreadyReturned = getPreviouslyReturned(order, i);
            const computedKg =
              st.mode === 'containers' ? getReturnKg(st) : null;
            const itemError = getItemError(i);

            return (
              <ItemBlock key={i} $skipped={st.skip}>
                <ItemTitle>
                  {item.productName}
                  {item.qualityGrade ? ` · Grade ${item.qualityGrade}` : ''}
                </ItemTitle>
                <ItemMeta>
                  Originally: {fmtKg(item.quantity)}
                  {item.containerCount && item.containerSize
                    ? ` (${item.containerCount} containers × ${item.containerSize} kg)`
                    : ''}
                  {' · '}
                  Already returned: {fmtKg(alreadyReturned)} / {fmtKg(item.quantity)}
                </ItemMeta>

                {/* Mode toggle */}
                <FieldRow>
                  <FieldLabel>Mode:</FieldLabel>
                  <ModeGroup role="radiogroup" aria-label="Input mode">
                    <RadioLabel>
                      <input
                        type="radio"
                        value="containers"
                        checked={st.mode === 'containers'}
                        onChange={() => updateItem(i, { mode: 'containers', quantityKg: '' })}
                        disabled={st.skip || isSubmitting}
                      />
                      Containers
                    </RadioLabel>
                    <RadioLabel>
                      <input
                        type="radio"
                        value="kg"
                        checked={st.mode === 'kg'}
                        onChange={() => updateItem(i, { mode: 'kg', containerCount: '' })}
                        disabled={st.skip || isSubmitting}
                      />
                      kg
                    </RadioLabel>
                  </ModeGroup>
                </FieldRow>

                {/* Quantity input row */}
                {st.mode === 'containers' ? (
                  <FieldRow>
                    <FieldLabel>Count:</FieldLabel>
                    <NumberInput
                      type="number"
                      min="0"
                      step="1"
                      value={st.containerCount}
                      $hasError={Boolean(itemError)}
                      onChange={(e) => updateItem(i, { containerCount: e.target.value })}
                      disabled={st.skip || isSubmitting}
                      aria-label="Container count"
                      placeholder="0"
                    />
                    <span style={{ fontSize: 13, color: '#4B4844' }}>×</span>
                    <NumberInput
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={st.containerSize}
                      onChange={(e) => updateItem(i, { containerSize: e.target.value })}
                      disabled={st.skip || isSubmitting}
                      aria-label="Container size (kg)"
                      placeholder="kg"
                    />
                    <span style={{ fontSize: 13, color: '#4B4844' }}>kg each</span>
                    <Divider />
                    <ReadonlyValue>
                      = {computedKg != null && computedKg > 0 ? fmtKg(computedKg) : '0 kg'}
                    </ReadonlyValue>
                  </FieldRow>
                ) : (
                  <FieldRow>
                    <FieldLabel>Quantity:</FieldLabel>
                    <NumberInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={st.quantityKg}
                      $hasError={Boolean(itemError)}
                      onChange={(e) => updateItem(i, { quantityKg: e.target.value })}
                      disabled={st.skip || isSubmitting}
                      aria-label="Return quantity in kg"
                      placeholder="0.00"
                    />
                    <span style={{ fontSize: 13, color: '#4B4844' }}>kg</span>
                  </FieldRow>
                )}

                {itemError && <ValidationError role="alert">{itemError}</ValidationError>}

                {/* Condition */}
                <FieldRow>
                  <FieldLabel>Condition:</FieldLabel>
                  <ModeGroup role="radiogroup" aria-label="Return condition">
                    <RadioLabel>
                      <input
                        type="radio"
                        value="sellable"
                        checked={st.condition === 'sellable'}
                        onChange={() => updateItem(i, { condition: 'sellable' })}
                        disabled={st.skip || isSubmitting}
                      />
                      Sellable
                    </RadioLabel>
                    <RadioLabel>
                      <input
                        type="radio"
                        value="spoiled"
                        checked={st.condition === 'spoiled'}
                        onChange={() => updateItem(i, { condition: 'spoiled' })}
                        disabled={st.skip || isSubmitting}
                      />
                      Spoiled
                    </RadioLabel>
                  </ModeGroup>

                  {st.condition === 'spoiled' && (
                    <>
                      <FieldLabel style={{ marginLeft: 8 }}>Disposal:</FieldLabel>
                      <SelectInput
                        value={st.disposalMethod}
                        onChange={(e) => updateItem(i, { disposalMethod: e.target.value as DisposalMethod })}
                        disabled={st.skip || isSubmitting}
                        aria-label="Disposal method"
                      >
                        <option value="pending">Pending</option>
                        <option value="compost">Compost</option>
                        <option value="animal_feed">Animal Feed</option>
                        <option value="discard">Discard</option>
                        <option value="sold_discount">Sold at Discount</option>
                        <option value="donated">Donated</option>
                      </SelectInput>
                    </>
                  )}
                </FieldRow>

                {/* Reason */}
                <FieldRow>
                  <FieldLabel>Reason:</FieldLabel>
                  <TextInput
                    type="text"
                    value={st.reason}
                    onChange={(e) => updateItem(i, { reason: e.target.value })}
                    disabled={st.skip || isSubmitting}
                    placeholder="Optional reason..."
                    aria-label="Return reason"
                  />
                </FieldRow>

                {/* Skip */}
                <SkipRow>
                  <SkipLabel>
                    <input
                      type="checkbox"
                      checked={st.skip}
                      onChange={(e) => updateItem(i, { skip: e.target.checked })}
                      disabled={isSubmitting}
                      aria-label={`Skip ${item.productName}`}
                    />
                    Skip this item
                  </SkipLabel>
                </SkipRow>
              </ItemBlock>
            );
          })}

          {/* Notes field */}
          <div>
            <NotesLabel htmlFor="return-notes">Notes (optional)</NotesLabel>
            <NotesArea
              id="return-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="Additional notes about this return..."
            />
          </div>
        </ModalBody>

        {submitError && (
          <ErrorBanner role="alert">{submitError}</ErrorBanner>
        )}

        <ModalFooter>
          <FooterSummary>
            {activeItemCount > 0
              ? `${activeItemCount} item${activeItemCount !== 1 ? 's' : ''} returned · ${fmtKg(totalKg)} total · ${formatCurrency(estimatedRefund)} estimated refund`
              : 'No items selected for return'}
          </FooterSummary>
          <FooterActions>
            <FooterButton
              $variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </FooterButton>
            <FooterButton
              onClick={handleConfirm}
              disabled={!canConfirm}
              aria-disabled={!canConfirm}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm Return'}
            </FooterButton>
          </FooterActions>
        </ModalFooter>
      </ModalBox>
    </Overlay>,
    document.body,
  );
}
