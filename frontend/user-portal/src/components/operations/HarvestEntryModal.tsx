/**
 * Harvest Entry Modal
 *
 * Modal for adding harvest entries to daily_harvest tasks.
 * Allows farmers to record quantity, grade, and notes for each harvest entry.
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import { addHarvestEntry } from '../../services/tasksApi';
import { positiveNumberInputProps } from '../../utils';
import type { TaskWithDetails, HarvestGrade } from '../../types/tasks';
import { HARVEST_GRADE_COLORS, HARVEST_GRADE_LABELS } from '../../types/tasks';

interface HarvestEntryModalProps {
  isOpen: boolean;
  task: TaskWithDetails;
  onClose: () => void;
  onComplete: () => void;
}

const GRADE_OPTIONS: HarvestGrade[] = ['A', 'B', 'C', 'D', 'Waste'];

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
          <CloseButton onClick={onClose}>×</CloseButton>
        </Header>

        <Content>
          <TaskInfo>
            <BlockLine>
              <LineIcon aria-hidden>📍</LineIcon>
              <BlockIdentity>
                {task.blockCode || `Block ${task.blockId.slice(0, 8)}`}
                {task.blockName && <BlockName> — {task.blockName}</BlockName>}
              </BlockIdentity>
            </BlockLine>

            {/* Prefer enriched fields from the backend join (fall back to
                metadata, kept for older tasks that snapshot this into metadata). */}
            {(task.targetCropName || task.metadata?.targetCropName) && (
              <CropLine>
                <LineIcon aria-hidden>🌱</LineIcon>
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
                    $color={HARVEST_GRADE_COLORS[gradeOption]}
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

const TaskInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
  margin-bottom: ${({ theme }) => theme.space['6']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: ${({ theme }) => theme.radii.md};
  border-left: 4px solid #0F6E56; /* grade-A green: signals crop/harvest context */
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

const BlockName = styled.span`
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

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px ${({ theme }) => theme.space['1']};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const TaskTitleLine = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 4px 0 0 0;
  font-style: italic;
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
  background: ${({ theme }) => theme.colors.surface.canvas};
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const GradeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: ${({ theme }) => theme.space['2']};
`;

const GradeButton = styled.button<{ $selected: boolean; $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['4']};
  border: 2px solid
    ${({ $selected, $color, theme }) => ($selected ? $color : theme.colors.border.subtle)};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $selected, $color }) => ($selected ? `${$color}15` : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color }) => `${$color}10`};
  }
`;

const GradeIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const GradeLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Textarea = styled.textarea`
  padding: ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.surface.canvas};
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

const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.status.warning};
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
