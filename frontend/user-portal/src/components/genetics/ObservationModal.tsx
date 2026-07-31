/**
 * Genetics Repo - Observation Modal
 *
 * Records a dated observation against an accession.
 *
 * The "novel trait" flag is the important control: flagging an observation is
 * what makes it promotable into its own genetic line later, so it is surfaced
 * prominently rather than buried among the metrics.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useCreateObservation } from '../../hooks/genetics/useGenetics';
import type { Accession, ObservationTypeValue } from '../../types/genetics';
import { OBSERVATION_LABELS } from '../../types/genetics';
import { Modal } from './Modal';
import {
  Banner,
  Button,
  Field,
  FormRow,
  Hint,
  Input,
  Label,
  Select,
  TextArea,
} from './styled';

const TYPES = Object.keys(OBSERVATION_LABELS) as ObservationTypeValue[];

/** Blank is always valid — a value must parse to an integer in `1..ceiling`. */
function isValidVesselNo(value: string, ceiling: number): boolean {
  if (value === '') return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= ceiling;
}

/**
 * Today's date as `YYYY-MM-DD`, built from local date parts (never
 * `toISOString()`, which reads UTC and can land on the wrong day for
 * negative-offset zones near midnight).
 */
function getToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// "Novel trait" is a promotion-candidate flag, not the Harvesting phase —
// bright.lavender (a decorative, non-gold accent) marks the toggled state
// instead of gold (spec §3).
const NovelBox = styled.label<{ $on: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid
    ${({ $on, theme }) => ($on ? theme.colors.bright.lavender : theme.colors.glass.border)};
  background: ${({ $on, theme }) => ($on ? `${theme.colors.bright.lavender}22` : 'transparent')};
`;

const NovelText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const NovelTitle = styled.strong`
  font-size: 13px;
`;

interface ObservationModalProps {
  accession: Accession;
  onClose: () => void;
  onDone?: () => void;
}

export function ObservationModal({ accession, onClose, onDone }: ObservationModalProps) {
  const createObservation = useCreateObservation();

  const [type, setType] = useState<ObservationTypeValue>('growth');
  const [observedAt, setObservedAt] = useState(getToday());
  const [text, setText] = useState('');
  const [growthRate, setGrowthRate] = useState('');
  const [colonization, setColonization] = useState('');
  const [vigor, setVigor] = useState('');
  const [isNovelTrait, setIsNovelTrait] = useState(false);
  const [traitName, setTraitName] = useState('');
  const [vesselNo, setVesselNo] = useState('');

  // Mirrors the server's max(labelledVesselCount, quantity) ceiling exactly.
  const ceiling = Math.max(accession.labelledVesselCount, accession.quantity);
  const vesselNoValid = isValidVesselNo(vesselNo, ceiling);

  const observedAtValid = !!observedAt && observedAt <= getToday();

  const canSubmit =
    !createObservation.isPending &&
    (text.trim() || growthRate || colonization) &&
    vesselNoValid &&
    observedAtValid;

  const handleSubmit = async () => {
    await createObservation.mutateAsync({
      accessionId: accession.id,
      type,
      // Sent as a bare YYYY-MM-DD string, never through `new Date(...)` — the
      // backend's Optional[datetime] parses a date-only string as a naive
      // midnight on that exact day, with no UTC shift either direction.
      observedAt,
      text: text.trim() || undefined,
      isNovelTrait,
      traitName: isNovelTrait ? traitName.trim() || undefined : undefined,
      vesselNo: vesselNo ? Number(vesselNo) : undefined,
      metrics: {
        growthRateMmPerDay: growthRate ? Number(growthRate) : undefined,
        colonizationPercent: colonization ? Number(colonization) : undefined,
        vigorScore: vigor ? Number(vigor) : undefined,
      },
    });
    onDone?.();
    onClose();
  };

  return (
    <Modal
      title={`Observe ${accession.accessionCode}`}
      subtitle="Dated note against this material."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {createObservation.isPending ? 'Saving…' : 'Record'}
          </Button>
        </>
      }
    >
      {createObservation.isError && (
        <Banner $tone="error">
          {(createObservation.error as any)?.response?.data?.detail ??
            createObservation.error.message}
        </Banner>
      )}

      <FormRow $cols={2}>
        <Field>
          <Label>Type</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as ObservationTypeValue)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {OBSERVATION_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Observed on</Label>
          <Input
            type="date"
            value={observedAt}
            max={getToday()}
            onChange={(e) => setObservedAt(e.target.value)}
          />
        </Field>
      </FormRow>

      {!observedAtValid && (
        <Banner $tone="warning">Observed on cannot be in the future.</Banner>
      )}

      <Field>
        <Label>What did you see?</Label>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Markedly faster radial growth than siblings"
        />
      </Field>

      <FormRow $cols={4}>
        <Field>
          <Label>Growth mm/day</Label>
          <Input
            type="number"
            step="0.1"
            min={0}
            value={growthRate}
            onChange={(e) => setGrowthRate(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Colonisation %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={colonization}
            onChange={(e) => setColonization(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Vigour 0–10</Label>
          <Input
            type="number"
            min={0}
            max={10}
            step="0.5"
            value={vigor}
            onChange={(e) => setVigor(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Vessel #</Label>
          <Input
            type="number"
            min={1}
            value={vesselNo}
            onChange={(e) => setVesselNo(e.target.value)}
            placeholder="optional"
          />
        </Field>
      </FormRow>
      <Hint>
        Which vessel of this batch this observation is about, e.g. plate #13 — the
        difference between “this batch is slow” and “plate 13 is slow”.
      </Hint>

      {!vesselNoValid && (
        <Banner $tone="warning">
          {ceiling > 0
            ? `Vessel # must be between 1 and ${ceiling}.`
            : 'This accession has no vessels recorded — leave the vessel # blank.'}
        </Banner>
      )}

      <NovelBox $on={isNovelTrait}>
        <input
          type="checkbox"
          checked={isNovelTrait}
          onChange={(e) => setIsNovelTrait(e.target.checked)}
        />
        <NovelText>
          <NovelTitle>Flag as a novel trait</NovelTitle>
          <Hint>
            Marks this as a promotion candidate — you can turn it into its own genetic line
            later, with ancestry back to this material intact.
          </Hint>
        </NovelText>
      </NovelBox>

      {isNovelTrait && (
        <Field>
          <Label>Trait name</Label>
          <Input
            value={traitName}
            onChange={(e) => setTraitName(e.target.value)}
            placeholder="fast rhizomorphic sector"
          />
        </Field>
      )}
    </Modal>
  );
}
