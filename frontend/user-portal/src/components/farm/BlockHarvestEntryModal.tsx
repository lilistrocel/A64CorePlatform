/**
 * Block Harvest Entry Modal
 *
 * Modal for recording block-level quick harvest entries.
 * Used for quick harvest actions from CompactBlockCard and BlockHarvestsTab.
 *
 * Grades A/B/C → writes to block_harvests (counted in KPI/yield).
 * Grade Waste   → writes to inventory_waste only (excluded from KPI/yield).
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import { recordBlockHarvest, recordBlockWaste } from '../../services/farmApi';
import { positiveNumberInputProps } from '../../utils';

interface BlockHarvestEntryModalProps {
  isOpen: boolean;
  farmId: string;
  blockId: string;
  blockCode: string;
  blockName?: string | null;
  /** Crop planted in this block (omit if unknown). */
  targetCropName?: string | null;
  /** Plant count currently on the block. */
  actualPlantCount?: number | null;
  /** Predicted total yield for this cycle (kg). */
  predictedYieldKg?: number | null;
  /** Actual yield already collected across prior harvests (kg). */
  actualYieldKg?: number | null;
  /** Number of harvest records already submitted in the current cycle. */
  totalHarvests?: number | null;
  onClose: () => void;
  onComplete: () => void;
}

// Local-only type — Waste intentionally excluded from the global QualityGrade
// used by block_harvests to avoid polluting KPI/yield metrics.
type QualityGrade = 'A' | 'B' | 'C' | 'Waste';

const GRADE_OPTIONS: QualityGrade[] = ['A', 'B', 'C', 'Waste'];

const GRADE_COLORS: Record<QualityGrade, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
  Waste: '#9CA3AF',
};

/** Accent used for the Waste chip border/dot — subtle red to signal rejected. */
const WASTE_ACCENT = '#EF4444';

const GRADE_LABELS: Record<QualityGrade, string> = {
  A: 'Premium',
  B: 'Good',
  C: 'Standard',
  Waste: 'Waste',
};

/** Build the one-time auto-fill text for the waste reason field. */
function buildWasteAutoFill(cropName: string | null | undefined, code: string, blockId: string): string {
  const crop = cropName ?? 'Unknown crop';
  const displayCode = code || blockId.slice(0, 6);
  return `Recorded as waste from harvest of ${crop} on ${displayCode}`;
}

export function BlockHarvestEntryModal({
  isOpen,
  farmId,
  blockId,
  blockCode,
  blockName,
  targetCropName,
  actualPlantCount,
  predictedYieldKg,
  actualYieldKg,
  totalHarvests,
  onClose,
  onComplete,
}: BlockHarvestEntryModalProps) {
  const [quantityKg, setQuantityKg] = useState('');
  const [qualityGrade, setQualityGrade] = useState<QualityGrade>('A');
  const [notes, setNotes] = useState('');
  const [wasteReason, setWasteReason] = useState('');
  // Track whether we have already auto-filled the waste reason this session,
  // so we don't clobber a user-typed value if they toggle away and back.
  const wasteAutoFilledRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isWaste = qualityGrade === 'Waste';

  const handleGradeChange = (grade: QualityGrade) => {
    setQualityGrade(grade);
    setError(null);

    // Auto-fill waste reason on first selection of Waste.
    // Never overwrite if the user has already typed something.
    if (grade === 'Waste' && !wasteAutoFilledRef.current) {
      const autoText = buildWasteAutoFill(targetCropName, blockCode, blockId);
      setWasteReason(autoText);
      wasteAutoFilledRef.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Quantity validation — applies to both sellable grades and waste.
    const quantity = parseFloat(quantityKg);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Please enter a valid quantity (kg)');
      return;
    }

    // Waste reason is required when grade is Waste.
    if (isWaste && !wasteReason.trim()) {
      setError('Please enter a reason for the waste');
      return;
    }

    // Synchronous ref guard prevents concurrent submissions (double-click protection).
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);
      setError(null);

      if (isWaste) {
        // Waste path: writes to inventory_waste only — does not affect KPI/yield.
        await recordBlockWaste(farmId, blockId, {
          quantityKg: quantity,
          wasteReason: wasteReason.trim(),
          wasteDate: new Date().toISOString(),
          plantName: targetCropName ?? 'Unknown crop',
        });
      } else {
        // Sellable path: writes to block_harvests and auto-aggregates into inventory_harvest.
        await recordBlockHarvest(farmId, blockId, {
          blockId: blockId,
          harvestDate: new Date().toISOString(),
          quantityKg: quantity,
          qualityGrade: qualityGrade,
          notes: notes.trim() || undefined,
        });
      }

      // Reset form state.
      setQuantityKg('');
      setQualityGrade('A');
      setNotes('');
      setWasteReason('');
      wasteAutoFilledRef.current = false;

      onComplete();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      const errorMessage =
        axiosErr?.response?.data?.message ||
        axiosErr?.response?.data?.detail ||
        (isWaste ? 'Failed to record waste. Please try again.' : 'Failed to record harvest. Please try again.');
      setError(errorMessage);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Submit is disabled if quantity is invalid OR if waste grade and reason is empty.
  const parsedQty = parseFloat(quantityKg);
  const quantityInvalid = isNaN(parsedQty) || parsedQty <= 0 || quantityKg === '';
  const isSubmitDisabled = submitting || quantityInvalid || (isWaste && !wasteReason.trim());

  return (
    // Overlay intentionally has NO onClick — data-entry modal must close only
    // via the X button or Cancel button (standing project UX rule).
    <Overlay
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      <Modal
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <Header>
          <Title>Quick Harvest Entry</Title>
          <CloseButton type="button" onClick={onClose} aria-label="Close modal">×</CloseButton>
        </Header>

        <Content>
          {/* Block/crop identity card — always visible */}
          <BlockInfo>
            <BlockLine>
              <LineIcon aria-hidden="true">📍</LineIcon>
              <BlockIdentity>
                {blockCode}
                {blockName && <BlockNameInline> — {blockName}</BlockNameInline>}
              </BlockIdentity>
            </BlockLine>

            {targetCropName && (
              <CropLine>
                <LineIcon aria-hidden="true">🌱</LineIcon>
                <CropName>{targetCropName}</CropName>
              </CropLine>
            )}

            {(actualPlantCount || predictedYieldKg) && (
              <ChipRow>
                {actualPlantCount ? (
                  <Chip>{actualPlantCount.toLocaleString('en-US')} plants</Chip>
                ) : null}
                {predictedYieldKg ? (
                  <Chip>Target: {predictedYieldKg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg</Chip>
                ) : null}
              </ChipRow>
            )}

            {/* Yield progress chips — hidden when grade is Waste (they'd be misleading) */}
            {!isWaste && !!totalHarvests && totalHarvests > 0 && (
              <ChipRow>
                <Chip $variant="progress">
                  {totalHarvests.toLocaleString('en-US')} harvest{totalHarvests === 1 ? '' : 's'} so far
                </Chip>
                {actualYieldKg ? (
                  <Chip $variant="progress">
                    {actualYieldKg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg collected
                  </Chip>
                ) : null}
              </ChipRow>
            )}
          </BlockInfo>

          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <Label htmlFor="harvest-quantity">Quantity (kg) *</Label>
              <Input
                id="harvest-quantity"
                {...positiveNumberInputProps}
                step="0.01"
                min="0.01"
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                placeholder="Enter quantity in kg"
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>Quality Grade *</Label>
              <GradeGrid>
                {GRADE_OPTIONS.map((grade) => (
                  <GradeButton
                    key={grade}
                    type="button"
                    $selected={qualityGrade === grade}
                    $color={grade === 'Waste' ? WASTE_ACCENT : GRADE_COLORS[grade]}
                    $isWaste={grade === 'Waste'}
                    onClick={() => handleGradeChange(grade)}
                    aria-pressed={qualityGrade === grade}
                  >
                    <GradeIcon $color={grade === 'Waste' && qualityGrade !== 'Waste' ? GRADE_COLORS.Waste : undefined}>
                      {grade}
                    </GradeIcon>
                    <GradeLabel>{GRADE_LABELS[grade]}</GradeLabel>
                  </GradeButton>
                ))}
              </GradeGrid>
              {/* Note only shown when A/B/C is selected — Waste has its own indicator below */}
              {!isWaste && (
                <GradeNote>A, B, C grades are recorded to block harvest history</GradeNote>
              )}
              {isWaste && (
                <GradeNote $warn>Waste is excluded from yield KPIs and harvest history</GradeNote>
              )}
            </FormGroup>

            {/* Waste reason — conditional, required when grade=Waste */}
            {isWaste && (
              <FormGroup>
                <Label htmlFor="waste-reason">Reason *</Label>
                <Textarea
                  id="waste-reason"
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  placeholder="Enter reason for waste..."
                  rows={3}
                  maxLength={500}
                  required
                />
                <CharCount $over={wasteReason.length > 450}>
                  {wasteReason.length} / 500
                </CharCount>
              </FormGroup>
            )}

            {/* Notes — only for sellable grades */}
            {!isWaste && (
              <FormGroup>
                <Label htmlFor="harvest-notes">Notes (Optional)</Label>
                <Textarea
                  id="harvest-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this harvest..."
                  rows={3}
                />
              </FormGroup>
            )}

            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

            <ButtonGroup>
              <CancelButton type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </CancelButton>
              <SubmitButton type="submit" disabled={isSubmitDisabled} $isWaste={isWaste}>
                {submitting
                  ? isWaste ? 'Recording waste...' : 'Recording...'
                  : isWaste ? 'Record Waste' : 'Record Harvest'}
              </SubmitButton>
            </ButtonGroup>
          </Form>
        </Content>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndices.modal};
  padding: ${({ theme }) => theme.space['6']};
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.xl};
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.fontSizes.h1};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.md};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.space['6']};
  overflow-y: auto;
`;

const BlockInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
  margin-bottom: ${({ theme }) => theme.space['6']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: ${({ theme }) => theme.radii.md};
  border-left: 4px solid #10B981; /* grade-A green: consistent with Operations harvest modal */
`;

const BlockLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
`;

const CropLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
`;

const LineIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  line-height: 1;
`;

const BlockIdentity = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: 'Courier New', monospace;
`;

const BlockNameInline = styled.span`
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.regular};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const CropName = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space['1']};
  margin-top: 2px;
`;

const Chip = styled.span<{ $variant?: 'progress' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px ${({ theme }) => theme.space['1']};
  background: ${({ theme, $variant }) =>
    $variant === 'progress' ? 'rgba(16, 185, 129, 0.1)' : theme.colors.surface.raised};
  color: ${({ theme, $variant }) =>
    $variant === 'progress' ? '#047857' : theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['6']};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['2']};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.primary};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

/** 4-column grid to accommodate A / B / C / Waste chips in a single row. */
const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.space['2']};
`;

const GradeButton = styled.button<{ $selected: boolean; $color: string; $isWaste: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['4']};
  border: 2px solid
    ${({ $selected, $color, $isWaste, theme }) =>
      $selected
        ? $isWaste
          ? $color /* solid red border when Waste selected */
          : $color
        : $isWaste
        ? theme.colors.border.subtle /* muted when not selected */
        : theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $selected, $color, $isWaste }) =>
    $selected
      ? $isWaste
        ? 'rgba(239, 68, 68, 0.08)' /* subtle rose tint for Waste */
        : `${$color}15`
      : 'transparent'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color, $isWaste }) =>
      $isWaste ? 'rgba(239, 68, 68, 0.06)' : `${$color}10`};
  }
`;

const GradeIcon = styled.div<{ $color?: string }>`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.space['1']};
  color: ${({ $color, theme }) => $color ?? theme.colors.text.primary};
`;

const GradeLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const GradeNote = styled.div<{ $warn?: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ $warn, theme }) => ($warn ? '#B91C1C' : theme.colors.text.secondary)};
  font-style: italic;
  text-align: center;
`;

const Textarea = styled.textarea`
  padding: ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.primary};
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const CharCount = styled.div<{ $over: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ $over, theme }) => ($over ? theme.colors.status.danger : theme.colors.text.secondary)};
  text-align: right;
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.status.danger}15`};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  text-align: center;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button<{ $isWaste: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ $isWaste, theme }) => ($isWaste ? '#9CA3AF' : theme.colors.status.warning)};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
