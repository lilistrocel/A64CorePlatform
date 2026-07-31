/**
 * Genetics Repo - Batch Form Modal
 *
 * Records one actual pour or cook. The batch snapshots the recipe as it stands
 * at the moment of creation, so later recipe edits never rewrite what was
 * actually in the dish.
 */

import { useState } from 'react';
import { useCreateBatch, useMediumRecipes } from '../../hooks/genetics/useGenetics';
import type { MediumBatch } from '../../types/genetics';
import { Modal } from './Modal';
import { ProtocolPicker } from '../protocols/ProtocolPicker';
import { PROTOCOL_SCOPES } from '../../types/protocols';
import { Banner, Button, Field, FormRow, Hint, Input, Label, Select, TextArea } from './styled';

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

interface BatchFormModalProps {
  defaultRecipeId?: string;
  onClose: () => void;
  onDone?: (batch: MediumBatch) => void;
}

export function BatchFormModal({ defaultRecipeId, onClose, onDone }: BatchFormModalProps) {
  const createBatch = useCreateBatch();
  const { data: recipePage } = useMediumRecipes({ perPage: 100, activeOnly: true });
  const recipes = recipePage?.data ?? [];

  const [recipeId, setRecipeId] = useState(defaultRecipeId ?? '');
  const [vesselCount, setVesselCount] = useState('20');
  const [vesselType, setVesselType] = useState('90mm plates');
  const [sterilizerRun, setSterilizerRun] = useState('');
  const [preparedAt, setPreparedAt] = useState(getToday());
  const [protocolId, setProtocolId] = useState('');
  const [notes, setNotes] = useState('');

  const selected = recipes.find((r) => r.id === recipeId);
  const preparedAtValid = !!preparedAt && preparedAt <= getToday();
  const canSubmit =
    !!recipeId && Number(vesselCount) >= 0 && preparedAtValid && !createBatch.isPending;

  const handleSubmit = async () => {
    const result = await createBatch.mutateAsync({
      recipeId,
      vesselCount: Number(vesselCount),
      vesselType: vesselType.trim() || undefined,
      sterilizerRun: sterilizerRun.trim() || undefined,
      // Sent as a bare YYYY-MM-DD string, never through `new Date(...)` — the
      // backend's Optional[datetime] parses a date-only string as a naive
      // midnight on that exact day, with no UTC shift either direction.
      preparedAt,
      protocolId: protocolId || undefined,
      notes: notes.trim() || undefined,
    });
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title="Record a prepared batch"
      subtitle="One pour or cook. The formulation is frozen onto this batch as it stands now."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {createBatch.isPending ? 'Saving…' : 'Record batch'}
          </Button>
        </>
      }
    >
      {createBatch.isError && (
        <Banner $tone="error">
          {(createBatch.error as any)?.response?.data?.detail ?? createBatch.error.message}
        </Banner>
      )}

      <Field>
        <Label>Recipe *</Label>
        <Select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">— select a recipe —</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} v{r.version} · {r.name}
            </option>
          ))}
        </Select>
        <Hint>The batch code is generated from the recipe code and the month.</Hint>
      </Field>

      {selected && selected.additives.length > 0 && (
        <Banner>
          Snapshotting additives:{' '}
          <strong>{selected.additives.map((a) => a.name).join(', ')}</strong>
        </Banner>
      )}

      <FormRow $cols={3}>
        <Field>
          <Label>Vessels poured</Label>
          <Input
            type="number"
            min={0}
            value={vesselCount}
            onChange={(e) => setVesselCount(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Vessel type</Label>
          <Input value={vesselType} onChange={(e) => setVesselType(e.target.value)} />
        </Field>
        <Field>
          <Label>Prepared on</Label>
          <Input
            type="date"
            value={preparedAt}
            max={getToday()}
            onChange={(e) => setPreparedAt(e.target.value)}
          />
        </Field>
      </FormRow>

      {!preparedAtValid && (
        <Banner $tone="warning">Prepared on cannot be in the future.</Banner>
      )}

      <Field>
        <Label>Sterilizer run</Label>
        <Input
          value={sterilizerRun}
          onChange={(e) => setSterilizerRun(e.target.value)}
          placeholder="Autoclave run reference"
        />
      </Field>

      <ProtocolPicker
        scope={PROTOCOL_SCOPES.mediaPour}
        value={protocolId}
        onChange={setProtocolId}
        recordLabel="this batch"
      />

      <Field>
        <Label>Notes</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
