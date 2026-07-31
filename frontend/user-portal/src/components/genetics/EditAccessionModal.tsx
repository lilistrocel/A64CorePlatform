/**
 * Genetics Repo - Edit Accession Modal
 *
 * Everything about an accession except status and generation is otherwise
 * permanent once recorded — a mistyped acquired date or the wrong plate
 * location had no way back. This exposes the rest of `AccessionUpdate`.
 *
 * Deliberately NOT exposed:
 *  - `status` — already has a live control on the detail page; this modal
 *    would just be a second place writing the same field.
 *  - `cloneGeneration` / `filialGeneration` — auto-derived from the
 *    propagation method (spec §3, `advances_generation`) and already
 *    overridable at propagation time. Hand-editing G/F after the fact here
 *    would silently desync a vessel from its own lineage and from the
 *    generation printed on its label.
 */

import { useState } from 'react';
import { useMediumBatches, useUpdateAccession } from '../../hooks/genetics/useGenetics';
import type { Accession, ProvenanceType, VesselForm } from '../../types/genetics';
import { PROVENANCE_LABELS, VESSEL_LABELS } from '../../types/genetics';
import { LocationPicker } from './LocationPicker';
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

const VESSEL_OPTIONS = Object.keys(VESSEL_LABELS) as VesselForm[];
const PROVENANCES = Object.keys(PROVENANCE_LABELS) as ProvenanceType[];

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

/** `Accession.acquiredAt` etc. come back as ISO datetimes; the date input wants YYYY-MM-DD. */
function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

interface EditAccessionModalProps {
  accession: Accession;
  onClose: () => void;
  onDone?: (accession: Accession) => void;
}

export function EditAccessionModal({ accession, onClose, onDone }: EditAccessionModalProps) {
  const updateAccession = useUpdateAccession(accession.id);
  const { data: batchPage } = useMediumBatches({ perPage: 100 });

  const [form, setForm] = useState<VesselForm>(accession.form);
  const [quantity, setQuantity] = useState(String(accession.quantity));
  const [unit, setUnit] = useState(accession.unit);
  const [mediumBatchId, setMediumBatchId] = useState(accession.mediumBatchId ?? '');
  const [provenanceType, setProvenanceType] = useState<ProvenanceType>(
    accession.provenance?.type ?? 'unknown'
  );
  const [sourceNote, setSourceNote] = useState(accession.provenance?.sourceNote ?? '');
  const [acquiredAt, setAcquiredAt] = useState(toDateInputValue(accession.acquiredAt));
  const [colonizedAt, setColonizedAt] = useState(toDateInputValue(accession.colonizedAt));
  const [facilityId, setFacilityId] = useState(accession.location.facilityId ?? '');
  const [roomId, setRoomId] = useState(accession.location.roomId ?? '');
  const [unitLocation, setUnitLocation] = useState(accession.location.unit ?? '');
  const [position, setPosition] = useState(accession.location.position ?? '');
  const [label, setLabel] = useState(accession.label ?? '');
  const [notes, setNotes] = useState(accession.notes ?? '');
  const [tags, setTags] = useState(accession.tags.join(', '));

  const today = getToday();
  const acquiredAtValid = acquiredAt === '' || acquiredAt <= today;
  const colonizedAtValid = colonizedAt === '' || colonizedAt <= today;

  const canSubmit =
    Number(quantity) >= 0 &&
    acquiredAtValid &&
    colonizedAtValid &&
    !updateAccession.isPending;

  const handleSubmit = async () => {
    const result = await updateAccession.mutateAsync({
      form,
      quantity: Number(quantity),
      unit: unit.trim() || 'vessels',
      mediumBatchId: mediumBatchId || undefined,
      // Sent as bare YYYY-MM-DD strings, never through `new Date(...)` — the
      // backend's Optional[datetime] parses a date-only string as a naive
      // midnight on that exact day, with no UTC shift either direction.
      acquiredAt: acquiredAt || undefined,
      colonizedAt: colonizedAt || undefined,
      // The update is a full `$set` of `location`, not a merge — spread the
      // existing document first so free-text `facility`/`room`/`temperatureC`
      // (which LocationPicker doesn't manage) survive an edit untouched.
      location: {
        ...accession.location,
        facilityId: facilityId || undefined,
        roomId: roomId || undefined,
        unit: unitLocation.trim() || undefined,
        position: position.trim() || undefined,
      },
      // Same full-replace reasoning: keep any sub-fields this form doesn't
      // surface (e.g. provenance.acquiredAt) rather than dropping them.
      provenance: {
        ...(accession.provenance ?? {}),
        type: provenanceType,
        sourceNote: sourceNote.trim() || undefined,
      },
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title={`Edit ${accession.accessionCode}`}
      subtitle="Corrects the record — status is changed from the detail page, not here."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {updateAccession.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      {updateAccession.isError && (
        <Banner $tone="error">
          {(updateAccession.error as any)?.response?.data?.detail ??
            updateAccession.error.message}
        </Banner>
      )}

      <FormRow $cols={3}>
        <Field>
          <Label>Form</Label>
          <Select value={form} onChange={(e) => setForm(e.target.value as VesselForm)}>
            {VESSEL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {VESSEL_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Quantity</Label>
          <Input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Hint>Vessel or head count currently held under this record.</Hint>
        </Field>
        <Field>
          <Label>Unit</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
      </FormRow>

      <Field>
        <Label>Medium batch</Label>
        <Select value={mediumBatchId} onChange={(e) => setMediumBatchId(e.target.value)}>
          <option value="">— none —</option>
          {(batchPage?.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchCode} · {b.recipeName ?? ''}
            </option>
          ))}
        </Select>
      </Field>

      <FormRow $cols={2}>
        <Field>
          <Label>Origin</Label>
          <Select
            value={provenanceType}
            onChange={(e) => setProvenanceType(e.target.value as ProvenanceType)}
          >
            {PROVENANCES.map((p) => (
              <option key={p} value={p}>
                {PROVENANCE_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Source note</Label>
          <Input
            value={sourceNote}
            onChange={(e) => setSourceNote(e.target.value)}
            placeholder="Vendor, collector, donor"
          />
        </Field>
      </FormRow>
      <Hint>
        Mainly meaningful for founding material — propagated accessions carry their origin
        through their parents instead.
      </Hint>

      <FormRow $cols={2}>
        <Field>
          <Label>Acquired on</Label>
          <Input
            type="date"
            value={acquiredAt}
            max={today}
            onChange={(e) => setAcquiredAt(e.target.value)}
          />
          <Hint>Inoculation, sowing, or birth date.</Hint>
        </Field>
        <Field>
          <Label>Colonised on</Label>
          <Input
            type="date"
            value={colonizedAt}
            max={today}
            onChange={(e) => setColonizedAt(e.target.value)}
            placeholder="optional"
          />
          <Hint>Leave blank if not yet fully colonised.</Hint>
        </Field>
      </FormRow>

      {(!acquiredAtValid || !colonizedAtValid) && (
        <Banner $tone="warning">
          {!acquiredAtValid && 'Acquired on cannot be in the future. '}
          {!colonizedAtValid && 'Colonised on cannot be in the future.'}
        </Banner>
      )}

      <LocationPicker
        facilityId={facilityId}
        roomId={roomId}
        form={form}
        unit={unitLocation}
        position={position}
        onChange={(patch) => {
          if (patch.facilityId !== undefined) setFacilityId(patch.facilityId);
          if (patch.roomId !== undefined) setRoomId(patch.roomId);
          if (patch.unit !== undefined) setUnitLocation(patch.unit);
          if (patch.position !== undefined) setPosition(patch.position);
        }}
      />

      <Field>
        <Label>Vessel label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>

      <Field>
        <Label>Notes</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <Field>
        <Label>Tags</Label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="fast-colonising, sector-watch"
        />
        <Hint>Comma-separated.</Hint>
      </Field>
    </Modal>
  );
}
