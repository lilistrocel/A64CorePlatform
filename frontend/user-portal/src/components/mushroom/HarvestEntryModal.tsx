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
 *
 * Night Observatory (T-901 Phase 3): glass modal shell per spec §4. Quality
 * grade is an ordinal data encoding (A best -> rejected worst) — walked
 * across distinct `bright.*` hues rather than the out-of-scope
 * QUALITY_GRADE_COLORS (dead-lightTheme-derived, and its grade C lands on
 * `warning`/gold-b, which spec §3 reserves for the Harvesting phase).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { glassPanel, glassOpaque, monoLabel } from '@a64core/shared';
import { HelpButton } from '../tutorials/HelpButton';
import type { GrowingRoom, HarvestQualityGrade, CreateHarvestPayload } from '../../types/mushroom';
import { QUALITY_GRADE_LABELS } from '../../types/mushroom';
import { QUALITY_GRADE_HUE } from './phaseTheme';
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
            <X size={16} strokeWidth={2} />
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
                  $hue={QUALITY_GRADE_HUE[grade]}
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
  ${glassOpaque}
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
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
  color: ${({ theme }) => theme.colors.muted};
`;

// Modal scrim + glass shell — spec §4 "Modals/drawers".
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const ModalBox = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
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
  font-size: 1.3rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  flex: 1;
`;

const RoomBadge = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 99px;
  padding: 4px 10px;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  transition: background 150ms, color 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const StrainInfo = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 16px;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: 10px;
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
  font-size: 13px;
  font-weight: 600;
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
  ${glassOpaque}
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  outline: none;
  transition: border-color 150ms;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const UnitLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  min-width: 24px;
`;

const GradeGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

interface GradeOptionProps {
  $selected: boolean;
  $hue: string;
}

const GradeOption = styled.button<GradeOptionProps>`
  padding: 6px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms;
  border: 1px solid ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]};
  background: ${({ $selected, theme, $hue }) =>
    $selected ? (theme.colors.bright as Record<string, string>)[$hue] : 'transparent'};
  color: ${({ $selected, theme, $hue }) =>
    $selected ? theme.colors.onDark : (theme.colors.bright as Record<string, string>)[$hue]};

  &:hover {
    background: ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]};
    color: ${({ theme }) => theme.colors.onDark};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const TextArea = styled.textarea`
  ${glassOpaque}
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ValidationError = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: 10px;
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
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const SubmitButton = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.bright.lapis};
  color: ${({ theme }) => theme.colors.onDark};
  font-size: 14px;
  font-weight: 700;
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
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;
