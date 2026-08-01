/**
 * Genetics Repo - Amend Propagation Modal
 *
 * Corrects a propagation event's `performedAt` after the fact — the only
 * field the endpoint accepts. The correction cascades to every child
 * accession's `acquiredAt`, but only where it still equals the event's OLD
 * `performedAt`: accessions someone already hand-corrected are left alone.
 * That partial-cascade outcome is the whole point of this screen, so a
 * successful amend does NOT auto-close like every other create-modal in this
 * module — it swaps to a result view showing exactly what moved and what was
 * skipped, and only "Done" closes it.
 */

import { useState } from 'react';
import { useAmendPropagation } from '../../hooks/genetics/useGenetics';
import type { PropagationAmendResult, PropagationEvent } from '../../types/genetics';
import { METHOD_LABELS } from '../../types/genetics';
import { Modal } from './Modal';
import { Banner, Button, Field, Hint, Input, Label } from './styled';

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

interface AmendPropagationModalProps {
  event: PropagationEvent;
  onClose: () => void;
}

export function AmendPropagationModal({ event, onClose }: AmendPropagationModalProps) {
  const amend = useAmendPropagation(event.id);
  // Seeded from the event's ISO datetime by slicing to the date portion —
  // never round-tripped through `new Date(...)`, which parses as UTC and can
  // shift the day in negative-offset zones.
  const [performedAt, setPerformedAt] = useState(event.performedAt.slice(0, 10));
  const [result, setResult] = useState<PropagationAmendResult | null>(null);

  const today = getToday();
  const performedAtValid = !!performedAt && performedAt <= today;
  const canSubmit = performedAtValid && !amend.isPending;

  const handleSubmit = async () => {
    const outcome = await amend.mutateAsync({ performedAt });
    setResult(outcome);
  };

  if (result) {
    return (
      <Modal
        title="Date corrected"
        subtitle={METHOD_LABELS[result.event.method]}
        onClose={onClose}
        footer={
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        }
      >
        <Banner>
          Cascaded to <strong>{result.accessionsUpdated}</strong> accession(s).
          {result.accessionsSkipped > 0 && (
            <>
              {' '}
              <strong>{result.accessionsSkipped}</strong> skipped — already corrected by hand.
            </>
          )}
        </Banner>
      </Modal>
    );
  }

  return (
    <Modal
      title="Correct performed-on date"
      subtitle={METHOD_LABELS[event.method]}
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {amend.isPending ? 'Saving…' : 'Save correction'}
          </Button>
        </>
      }
    >
      {amend.isError && (
        <Banner $tone="error">
          {(amend.error as any)?.response?.data?.detail ?? amend.error.message}
        </Banner>
      )}

      <Hint>
        Recorded by: {event.operatorName ?? event.performedBy ?? 'unrecorded'} — not editable
        here.
      </Hint>

      <Field>
        <Label>Performed on</Label>
        <Input
          type="date"
          value={performedAt}
          max={today}
          onChange={(e) => setPerformedAt(e.target.value)}
        />
        <Hint>
          Corrects a mis-entered date after the fact. Cascades to any child accession whose
          acquired-on date still matches the old value — one already hand-corrected is left
          alone.
        </Hint>
      </Field>

      {!performedAtValid && (
        <Banner $tone="warning">Performed on cannot be in the future.</Banner>
      )}
    </Modal>
  );
}
