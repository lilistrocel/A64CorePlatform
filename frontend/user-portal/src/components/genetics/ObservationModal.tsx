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

const NovelBox = styled.label<{ $on: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  border: 1px solid
    ${({ $on, theme }) => ($on ? theme.colors.warning : theme.colors.neutral[300])};
  background: ${({ $on, theme }) => ($on ? theme.colors.warningBg : 'transparent')};
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
  const [text, setText] = useState('');
  const [growthRate, setGrowthRate] = useState('');
  const [colonization, setColonization] = useState('');
  const [vigor, setVigor] = useState('');
  const [isNovelTrait, setIsNovelTrait] = useState(false);
  const [traitName, setTraitName] = useState('');

  const canSubmit = !createObservation.isPending && (text.trim() || growthRate || colonization);

  const handleSubmit = async () => {
    await createObservation.mutateAsync({
      accessionId: accession.id,
      type,
      text: text.trim() || undefined,
      isNovelTrait,
      traitName: isNovelTrait ? traitName.trim() || undefined : undefined,
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
        <Label>What did you see?</Label>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Markedly faster radial growth than siblings"
        />
      </Field>

      <FormRow $cols={3}>
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
      </FormRow>

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
