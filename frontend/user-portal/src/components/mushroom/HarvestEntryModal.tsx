/**
 * HarvestEntryModal Component
 *
 * Modal form to log a new harvest for a growing room.
 * Form includes: weight (kg), quality grade selector, notes, flush number (auto-filled).
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { GrowingRoom, HarvestQualityGrade, CreateHarvestPayload } from '../../types/mushroom';
import { QUALITY_GRADE_LABELS, QUALITY_GRADE_COLORS } from '../../types/mushroom';
import { useCreateHarvest } from '../../hooks/mushroom/useMushroomHarvests';

interface HarvestEntryModalProps {
  isOpen: boolean;
  room: GrowingRoom;
  facilityId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const GRADE_OPTIONS: HarvestQualityGrade[] = ['A', 'B', 'C', 'D', 'rejected'];

export function HarvestEntryModal({
  isOpen,
  room,
  facilityId,
  onClose,
  onSuccess,
}: HarvestEntryModalProps) {
  const [weightKg, setWeightKg] = useState('');
  const [qualityGrade, setQualityGrade] = useState<HarvestQualityGrade>('A');
  const [notes, setNotes] = useState('');
  const [flushNumber, setFlushNumber] = useState(
    String(room.currentFlush > 0 ? room.currentFlush : 1)
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const createHarvest = useCreateHarvest(facilityId, room.id);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);

    const weight = parseFloat(weightKg);
    if (isNaN(weight) || weight <= 0) {
      setValidationError('Please enter a valid weight greater than 0 kg.');
      return;
    }

    const flush = parseInt(flushNumber, 10);
    if (isNaN(flush) || flush < 1) {
      setValidationError('Flush number must be at least 1.');
      return;
    }

    const payload: CreateHarvestPayload = {
      weightKg: weight,
      qualityGrade,
      flushNumber: flush,
      notes: notes.trim() || undefined,
    };

    try {
      await createHarvest.mutateAsync(payload);
      onSuccess?.();
      handleClose();
    } catch {
      // Error toast is shown by the global apiClient interceptor
    }
  };

  const handleClose = () => {
    setWeightKg('');
    setQualityGrade('A');
    setNotes('');
    setFlushNumber(String(room.currentFlush > 0 ? room.currentFlush : 1));
    setValidationError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Backdrop role="dialog" aria-modal="true" aria-label="Log Harvest">
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Log Harvest</ModalTitle>
          <RoomBadge>Room: {room.roomCode}</RoomBadge>
          <CloseButton onClick={handleClose} aria-label="Close harvest modal">
            &#10005;
          </CloseButton>
        </ModalHeader>

        {room.strainName && (
          <StrainInfo>
            Strain: <strong>{room.strainName}</strong>
          </StrainInfo>
        )}

        <Form onSubmit={handleSubmit} noValidate>
          {/* Flush Number */}
          <FormGroup>
            <Label htmlFor="harvest-flush">Flush Number</Label>
            <Input
              id="harvest-flush"
              type="number"
              min={1}
              value={flushNumber}
              onChange={(e) => setFlushNumber(e.target.value)}
              required
            />
          </FormGroup>

          {/* Weight */}
          <FormGroup>
            <Label htmlFor="harvest-weight">
              Weight (kg) <Required>*</Required>
            </Label>
            <InputWithUnit>
              <Input
                id="harvest-weight"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="e.g. 2.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required
                $hasError={!!validationError && !weightKg}
              />
              <UnitLabel>kg</UnitLabel>
            </InputWithUnit>
          </FormGroup>

          {/* Quality Grade */}
          <FormGroup>
            <Label>Quality Grade</Label>
            <GradeGrid>
              {GRADE_OPTIONS.map((grade) => (
                <GradeOption
                  key={grade}
                  type="button"
                  $selected={qualityGrade === grade}
                  $color={QUALITY_GRADE_COLORS[grade]}
                  onClick={() => setQualityGrade(grade)}
                  aria-pressed={qualityGrade === grade}
                >
                  {QUALITY_GRADE_LABELS[grade]}
                </GradeOption>
              ))}
            </GradeGrid>
          </FormGroup>

          {/* Notes */}
          <FormGroup>
            <Label htmlFor="harvest-notes">Notes (optional)</Label>
            <TextArea
              id="harvest-notes"
              rows={3}
              placeholder="Any observations about this harvest..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormGroup>

          {validationError && (
            <ValidationError role="alert">{validationError}</ValidationError>
          )}

          <ActionRow>
            <CancelButton type="button" onClick={handleClose}>
              Cancel
            </CancelButton>
            <SubmitButton type="submit" disabled={createHarvest.isPending}>
              {createHarvest.isPending ? 'Saving...' : 'Log Harvest'}
            </SubmitButton>
          </ActionRow>
        </Form>
      </ModalBox>
    </Backdrop>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  flex: 1;
`;

const RoomBadge = styled.span`
  font-size: 13px;
  font-weight: 600;
  background: #e3f2fd;
  color: #1565c0;
  border-radius: 20px;
  padding: 4px 10px;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 150ms;
  line-height: 1;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
  }
`;

const StrainInfo = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 16px;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 8px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Required = styled.span`
  color: #ef5350;
  margin-left: 2px;
`;

const InputWithUnit = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

interface InputProps {
  $hasError?: boolean;
}

const Input = styled.input<InputProps>`
  flex: 1;
  padding: 10px 12px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#ef5350' : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const UnitLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 24px;
`;

const GradeGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

interface GradeOptionProps {
  $selected: boolean;
  $color: string;
}

const GradeOption = styled.button<GradeOptionProps>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;
  border: 2px solid ${({ $color }) => $color};
  background: ${({ $selected, $color, theme }) => ($selected ? $color : theme.colors.background)};
  color: ${({ $selected, $color }) => ($selected ? 'white' : $color)};

  &:hover {
    background: ${({ $color }) => $color};
    color: white;
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const TextArea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const ValidationError = styled.div`
  font-size: 13px;
  color: #ef5350;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 4px;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const SubmitButton = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #10B981;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: #059669;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #10B981;
    outline-offset: 2px;
  }
`;
