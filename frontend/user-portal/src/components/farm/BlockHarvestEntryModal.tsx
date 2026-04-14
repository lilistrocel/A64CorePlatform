/**
 * Block Harvest Entry Modal
 *
 * Simplified modal for recording block-level quick harvest entries.
 * Used for quick harvest actions from CompactBlockCard.
 * Only supports quality grades A, B, C (no D or Waste).
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import { recordBlockHarvest } from '../../services/farmApi';
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

type QualityGrade = 'A' | 'B' | 'C';

const GRADE_OPTIONS: QualityGrade[] = ['A', 'B', 'C'];

const GRADE_COLORS: Record<QualityGrade, string> = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
};

const GRADE_LABELS: Record<QualityGrade, string> = {
  A: 'Premium',
  B: 'Good',
  C: 'Standard',
};

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
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const quantity = parseFloat(quantityKg);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Please enter a valid quantity (kg)');
      return;
    }

    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);
      setError(null);

      await recordBlockHarvest(farmId, blockId, {
        blockId: blockId,
        harvestDate: new Date().toISOString(),
        quantityKg: quantity,
        qualityGrade: qualityGrade,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setQuantityKg('');
      setQualityGrade('A');
      setNotes('');

      onComplete();
    } catch (err: any) {
      console.error('Failed to record harvest:', err);
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        'Failed to record harvest. Please try again.';
      setError(errorMessage);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay
      onClick={onClose}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      <Modal
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        <Header>
          <Title>Quick Harvest Entry</Title>
          <CloseButton onClick={onClose}>×</CloseButton>
        </Header>

        <Content>
          <BlockInfo>
            <BlockLine>
              <LineIcon aria-hidden>📍</LineIcon>
              <BlockIdentity>
                {blockCode}
                {blockName && <BlockNameInline> — {blockName}</BlockNameInline>}
              </BlockIdentity>
            </BlockLine>

            {targetCropName && (
              <CropLine>
                <LineIcon aria-hidden>🌱</LineIcon>
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

            {!!totalHarvests && totalHarvests > 0 && (
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
              <Label>Quantity (kg) *</Label>
              <Input
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
                    $color={GRADE_COLORS[grade]}
                    onClick={() => setQualityGrade(grade)}
                  >
                    <GradeIcon>{grade}</GradeIcon>
                    <GradeLabel>{GRADE_LABELS[grade]}</GradeLabel>
                  </GradeButton>
                ))}
              </GradeGrid>
              <GradeNote>Only A, B, C grades for quick harvest</GradeNote>
            </FormGroup>

            <FormGroup>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this harvest..."
                rows={3}
              />
            </FormGroup>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <ButtonGroup>
              <CancelButton type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </CancelButton>
              <SubmitButton type="submit" disabled={submitting}>
                {submitting ? 'Recording...' : 'Record Harvest'}
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
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl};
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.xl};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
`;

const BlockInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border-left: 4px solid #10B981; /* grade-A green: consistent with Operations harvest modal */
`;

const BlockLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const CropLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const LineIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  line-height: 1;
`;

const BlockIdentity = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Courier New', monospace;
`;

const BlockNameInline = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.body};
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CropName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-top: 2px;
`;

const Chip = styled.span<{ $variant?: 'progress' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ theme, $variant }) =>
    $variant === 'progress' ? 'rgba(16, 185, 129, 0.1)' : theme.colors.neutral[100]};
  color: ${({ theme, $variant }) =>
    $variant === 'progress' ? '#047857' : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input`
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[500]};
  }
`;

const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${({ theme }) => theme.spacing.sm};
`;

const GradeButton = styled.button<{ $selected: boolean; $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
  border: 2px solid
    ${({ $selected, $color, theme }) => ($selected ? $color : theme.colors.neutral[300])};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $selected, $color }) => ($selected ? `${$color}15` : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color }) => `${$color}10`};
  }
`;

const GradeIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const GradeLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const GradeNote = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
  text-align: center;
`;

const Textarea = styled.textarea`
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[500]};
  }
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => `${theme.colors.error}15`};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  text-align: center;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[200]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warning};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
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
