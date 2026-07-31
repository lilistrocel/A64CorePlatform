/**
 * Harvest Entry Modal
 *
 * Modal for adding harvest entries to daily_harvest tasks.
 * Allows farmers to record quantity, grade, and notes for each harvest entry.
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import { MapPin, Sprout, X } from 'lucide-react';
import { glassPanel, glassOpaque } from '@a64core/shared';
import { addHarvestEntry } from '../../services/tasksApi';
import { positiveNumberInputProps } from '../../utils';
import type { TaskWithDetails, HarvestGrade } from '../../types/tasks';
import { HARVEST_GRADE_LABELS } from '../../types/tasks';

interface HarvestEntryModalProps {
  isOpen: boolean;
  task: TaskWithDetails;
  onClose: () => void;
  onComplete: () => void;
}

const GRADE_OPTIONS: HarvestGrade[] = ['A', 'B', 'C', 'D', 'Waste'];

// Ordinal quality band, one bright hue per step — never gold (spec §3);
// replaces types/tasks.ts's HARVEST_GRADE_COLORS (out of scope, dead-theme
// derived, and its grade C lands on gold-b).
const GRADE_HUE: Record<HarvestGrade, string> = {
  A: 'emerald',
  B: 'lapis',
  C: 'terra',
  D: 'coral',
  Waste: 'coral',
};

export function HarvestEntryModal({ isOpen, task, onClose, onComplete }: HarvestEntryModalProps) {
  const [quantityKg, setQuantityKg] = useState('');
  const [grade, setGrade] = useState<HarvestGrade>('A');
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

      await addHarvestEntry(task.taskId, {
        quantity: quantity,
        grade,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setQuantityKg('');
      setGrade('A');
      setNotes('');

      onComplete();
    } catch (err) {
      console.error('Failed to add harvest entry:', err);
      setError('Failed to add harvest entry. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Record Harvest</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </CloseButton>
        </Header>

        <Content>
          <TaskInfo>
            <BlockLine>
              <LineIcon aria-hidden><MapPin size={14} strokeWidth={1.8} /></LineIcon>
              <BlockIdentity>
                {task.blockCode || `Block ${task.blockId.slice(0, 8)}`}
                {task.blockName && <BlockName> — {task.blockName}</BlockName>}
              </BlockIdentity>
            </BlockLine>

            {/* Prefer enriched fields from the backend join (fall back to
                metadata, kept for older tasks that snapshot this into metadata). */}
            {(task.targetCropName || task.metadata?.targetCropName) && (
              <CropLine>
                <LineIcon aria-hidden><Sprout size={14} strokeWidth={1.8} /></LineIcon>
                <CropName>{task.targetCropName || task.metadata?.targetCropName}</CropName>
              </CropLine>
            )}

            {((task.actualPlantCount ?? task.metadata?.plantCount) || (task.expectedYieldKg ?? task.metadata?.expectedYieldKg)) && (
              <ChipRow>
                {(task.actualPlantCount ?? task.metadata?.plantCount) && (
                  <Chip>{(task.actualPlantCount ?? task.metadata?.plantCount)!.toLocaleString('en-US')} plants</Chip>
                )}
                {(task.expectedYieldKg ?? task.metadata?.expectedYieldKg) && (
                  <Chip>Target: {(task.expectedYieldKg ?? task.metadata?.expectedYieldKg)!.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg</Chip>
                )}
              </ChipRow>
            )}

            {task.title && <TaskTitleLine>Task: {task.title}</TaskTitleLine>}
          </TaskInfo>

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
              />
            </FormGroup>

            <FormGroup>
              <Label>Grade *</Label>
              <GradeGrid>
                {GRADE_OPTIONS.map((gradeOption) => (
                  <GradeButton
                    key={gradeOption}
                    type="button"
                    $selected={grade === gradeOption}
                    $hue={GRADE_HUE[gradeOption]}
                    onClick={() => setGrade(gradeOption)}
                  >
                    <GradeIcon>{gradeOption}</GradeIcon>
                    <GradeLabel>{HARVEST_GRADE_LABELS[gradeOption]}</GradeLabel>
                  </GradeButton>
                ))}
              </GradeGrid>
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
                {submitting ? 'Adding...' : 'Add Harvest Entry'}
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
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Title = styled.h2`
  font-size: 1.3rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
`;

const TaskInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: 10px;
  border-left: 3px solid ${({ theme }) => theme.colors.success}; /* signals crop/harvest context */
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
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.celeste};
  flex-shrink: 0;
`;

const BlockIdentity = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'Courier New', monospace;
`;

const BlockName = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
  color: ${({ theme }) => theme.colors.muted};
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

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  border-radius: 6px;
`;

const TaskTitleLine = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin: 4px 0 0 0;
  font-style: italic;
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
  ${glassOpaque}
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;

// Ordinal quality band — bright.* hue per step, never gold (spec §3).
const GradeButton = styled.button<{ $selected: boolean; $hue: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
  border: 2px solid
    ${({ $selected, $hue, theme }) =>
      $selected ? (theme.colors.bright as Record<string, string>)[$hue] : theme.colors.glass.border};
  border-radius: 10px;
  background: ${({ $selected, $hue, theme }) =>
    $selected ? `${(theme.colors.bright as Record<string, string>)[$hue]}26` : 'transparent'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ $hue, theme }) => (theme.colors.bright as Record<string, string>)[$hue]};
    background: ${({ $hue, theme }) => `${(theme.colors.bright as Record<string, string>)[$hue]}1a`};
  }
`;

const GradeIcon = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const GradeLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.muted};
`;

const Textarea = styled.textarea`
  ${glassOpaque}
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 10px;
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
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// The modal's one primary CTA — gold gradient fill (spec §3/§4 "Buttons").
const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
