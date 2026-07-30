/**
 * HarvestEntryModal Component
 *
 * Modal form to log a new harvest for a growing room.
 *
 * Includes a block selector: the fruiting blocks currently held in this room,
 * from the Genetics Repo. Naming the block is what lets yield be attributed to
 * a lineage rather than just a species — without it, "Yield by generation" on
 * the line page has nothing to group by. Optional, because a harvest with an
 * unknown block is still worth recording; it just cannot be attributed.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { HelpButton } from '../tutorials/HelpButton';
import type { GrowingRoom, HarvestQualityGrade, CreateHarvestPayload } from '../../types/mushroom';
import { QUALITY_GRADE_LABELS, QUALITY_GRADE_COLORS } from '../../types/mushroom';
import { useCreateHarvest } from '../../hooks/mushroom/useMushroomHarvests';
import { useAccessions } from '../../hooks/genetics/useGenetics';

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
  const [accessionId, setAccessionId] = useState('');
  const [substrateWeightKg, setSubstrateWeightKg] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const createHarvest = useCreateHarvest(facilityId, room.id);

  // Blocks physically in this room. Only fruiting blocks and bulk spawn can be
  // harvested, so the list is narrowed rather than offering every dish.
  const { data: heldPage } = useAccessions({ roomId: room.id, perPage: 100 });
  const blocks = (heldPage?.data ?? []).filter(
    (a) => a.form === 'fruiting_block' || a.form === 'bulk_spawn'
  );
  const selectedBlock = blocks.find((b) => b.id === accessionId);

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

    const substrate = parseFloat(substrateWeightKg);
    if (substrateWeightKg.trim() !== '' && (isNaN(substrate) || substrate <= 0)) {
      setValidationError('Substrate weight must be greater than 0 kg, or left blank.');
      return;
    }

    const payload: CreateHarvestPayload = {
      weightKg: weight,
      qualityGrade,
      flushNumber: flush,
      notes: notes.trim() || undefined,
      accessionId: accessionId || undefined,
      substrateWeightKg: substrateWeightKg.trim() !== '' ? substrate : undefined,
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
    setAccessionId('');
    setSubstrateWeightKg('');
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
            <LabelRow>
              <Label htmlFor="harvest-block">Fruiting block (optional)</Label>
              <HelpButton
                topic="mushroom.harvest"
                autoOpen={false}
                label="What makes a harvest number meaningful"
              />
            </LabelRow>
            <BlockSelect
              id="harvest-block"
              value={accessionId}
              onChange={(e) => setAccessionId(e.target.value)}
            >
              <option value="">
                {blocks.length
                  ? '— not attributed to a block —'
                  : 'no blocks recorded in this room'}
              </option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.accessionCode} · {b.generationLabel} · {b.quantity} {b.unit}
                </option>
              ))}
            </BlockSelect>
            <FieldNote>
              {selectedBlock
                ? `Yield will be attributed to ${selectedBlock.accessionCode} at ${selectedBlock.generationLabel}, so it appears in that line's yield-by-generation.`
                : 'Without a block, this harvest is recorded but cannot be attributed to a lineage.'}
            </FieldNote>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="harvest-substrate">Dry substrate weight (optional)</Label>
            <InputWithUnit>
              <Input
                id="harvest-substrate"
                type="number"
                step="0.1"
                min="0"
                value={substrateWeightKg}
                onChange={(e) => setSubstrateWeightKg(e.target.value)}
                placeholder="e.g. 10"
              />
              <UnitLabel>kg</UnitLabel>
            </InputWithUnit>
            <FieldNote>
              Overrides the room figure. Set this per block when a room holds blocks
              from several substrate batches — otherwise every block shares one
              denominator and the BE comparison between lineages is meaningless.
            </FieldNote>
          </FormGroup>

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

const BlockSelect = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.primary[500]}1a`};
  }
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const FieldNote = styled.p`
  margin: 6px 0 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

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
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.primary[700]};
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
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
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
  color: ${({ theme }) => theme.colors.error};
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
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.neutral[300])};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.primary[500]}1a`};
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
  color: ${({ $selected, $color, theme }) => ($selected ? theme.colors.onAccent : $color)};

  &:hover {
    background: ${({ $color }) => $color};
    color: ${({ theme }) => theme.colors.onAccent};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const TextArea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 3px ${theme.colors.primary[500]}1a`};
  }
`;

const ValidationError = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
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
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const SubmitButton = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;
