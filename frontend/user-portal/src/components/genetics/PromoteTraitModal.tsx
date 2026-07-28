/**
 * Genetics Repo - Promote Trait Modal
 *
 * Turns a flagged observation into its own genetic line.
 *
 * The new line is parented to the observed material's line, and a founding
 * accession is minted whose parent is the observed accession — so the isolate
 * gets its own identity and trait profile while the physical chain back to the
 * original dish stays walkable.
 */

import { useState } from 'react';
import { usePromoteTrait } from '../../hooks/genetics/useGenetics';
import type { DerivationType, Observation, PromotionResult } from '../../types/genetics';
import { DERIVATION_LABELS } from '../../types/genetics';
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

const DERIVATIONS: DerivationType[] = ['sector', 'mutation', 'selection', 'isolate', 'cross'];

interface PromoteTraitModalProps {
  observation: Observation;
  accessionCode: string;
  parentLineCode?: string;
  onClose: () => void;
  onDone?: (result: PromotionResult) => void;
}

export function PromoteTraitModal({
  observation,
  accessionCode,
  parentLineCode,
  onClose,
  onDone,
}: PromoteTraitModalProps) {
  const promote = usePromoteTrait();

  const [code, setCode] = useState(parentLineCode ? `${parentLineCode}-S1` : '');
  const [commonName, setCommonName] = useState(observation.traitName ?? '');
  const [derivation, setDerivation] = useState<DerivationType>('sector');
  const [description, setDescription] = useState(observation.text ?? '');
  const [createFounding, setCreateFounding] = useState(true);

  const canSubmit = code.trim() && commonName.trim() && !promote.isPending;

  const handleSubmit = async () => {
    const result = await promote.mutateAsync({
      observationId: observation.id,
      payload: {
        code: code.trim(),
        commonName: commonName.trim(),
        derivation,
        description: description.trim() || undefined,
        createFoundingAccession: createFounding,
      },
    });
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title="Promote to a new line"
      subtitle="Give this trait its own identity, without losing where it came from."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {promote.isPending ? 'Promoting…' : 'Promote'}
          </Button>
        </>
      }
    >
      {promote.isError && (
        <Banner $tone="error">
          {(promote.error as any)?.response?.data?.detail ?? promote.error.message}
        </Banner>
      )}

      <Banner>
        Observed on <strong>{accessionCode}</strong>
        {observation.traitName ? ` — “${observation.traitName}”` : ''}. The new line will be
        parented to <strong>{parentLineCode ?? 'its current line'}</strong>.
      </Banner>

      <FormRow $cols={2}>
        <Field>
          <Label>New line code *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PO-BLU-S1" />
        </Field>
        <Field>
          <Label>Derivation</Label>
          <Select
            value={derivation}
            onChange={(e) => setDerivation(e.target.value as DerivationType)}
          >
            {DERIVATIONS.map((d) => (
              <option key={d} value={d}>
                {DERIVATION_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      <Field>
        <Label>Common name *</Label>
        <Input
          value={commonName}
          onChange={(e) => setCommonName(e.target.value)}
          placeholder="Blue Oyster S1"
        />
      </Field>

      <Field>
        <Label>Description</Label>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Field>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={createFounding}
            onChange={(e) => setCreateFounding(e.target.checked)}
          />
          <span>
            <strong style={{ fontSize: 13 }}>Mint a founding accession</strong>
            <Hint style={{ display: 'block' }}>
              Creates a G0 on the new line whose parent is {accessionCode}, so the physical
              chain is unbroken. Turn this off only if you are registering the material
              yourself later.
            </Hint>
          </span>
        </label>
      </Field>
    </Modal>
  );
}
