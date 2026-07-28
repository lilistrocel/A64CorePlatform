/**
 * Genetics Repo - Split Accession Modal
 *
 * Moves N vessels out of a batch record into their own accession, for when one
 * plate in a batch diverges — it sectors, or it contaminates.
 *
 * This is not a propagation: no new generation, no new genetics. Generations
 * and parents are copied verbatim, so the lineage stays unbroken.
 */

import { useState } from 'react';
import { useSplitAccession } from '../../hooks/genetics/useGenetics';
import type { Accession, AccessionStatus } from '../../types/genetics';
import { STATUS_LABELS } from '../../types/genetics';
import { Modal } from './Modal';
import { Banner, Button, Field, FormRow, Hint, Input, Label, Select, TextArea } from './styled';

const STATUSES = Object.keys(STATUS_LABELS) as AccessionStatus[];

interface SplitAccessionModalProps {
  accession: Accession;
  onClose: () => void;
  onDone?: (splitId: string) => void;
}

export function SplitAccessionModal({ accession, onClose, onDone }: SplitAccessionModalProps) {
  const split = useSplitAccession(accession.id);

  const [quantity, setQuantity] = useState('1');
  const [status, setStatus] = useState<AccessionStatus>(accession.status);
  const [reason, setReason] = useState('');
  const [label, setLabel] = useState('');

  const qty = Number(quantity);
  // Splitting the whole batch would leave an empty record, so the server
  // rejects it — mirror that here rather than round-tripping a 400.
  const valid = qty >= 1 && qty < accession.quantity;

  const handleSubmit = async () => {
    const result = await split.mutateAsync({
      quantity: qty,
      status,
      reason: reason.trim() || undefined,
      label: label.trim() || undefined,
    });
    onDone?.(result.split.id);
    onClose();
  };

  return (
    <Modal
      title={`Split ${accession.accessionCode}`}
      subtitle="Track some of this batch separately — same genetics, same generation, own record."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!valid || split.isPending}>
            {split.isPending ? 'Splitting…' : 'Split out'}
          </Button>
        </>
      }
    >
      {split.isError && (
        <Banner $tone="error">
          {(split.error as any)?.response?.data?.detail ?? split.error.message}
        </Banner>
      )}

      <Banner>
        This record holds <strong>{accession.quantity} {accession.unit}</strong> at{' '}
        <strong>{accession.generationLabel}</strong>. The split keeps the same generation and
        parents.
      </Banner>

      <FormRow $cols={2}>
        <Field>
          <Label>Quantity to split out</Label>
          <Input
            type="number"
            min={1}
            max={Math.max(1, accession.quantity - 1)}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Hint>
            Leaves {Math.max(0, accession.quantity - (qty || 0))} {accession.unit} on the
            original record.
          </Hint>
        </Field>
        <Field>
          <Label>Status of the split-off record</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AccessionStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      {!valid && qty >= accession.quantity && (
        <Banner $tone="warning">
          You cannot split the entire batch — that would leave an empty record. Edit the
          accession directly instead.
        </Banner>
      )}

      <Field>
        <Label>Label</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="sector"
        />
      </Field>

      <Field>
        <Label>Reason</Label>
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Fast rhizomorphic sector on one plate"
        />
      </Field>
    </Modal>
  );
}
