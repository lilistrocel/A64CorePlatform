/**
 * Genetics Repo - Register Accession Modal
 *
 * Registers founding material by hand — a G0, or something acquired from
 * outside. Anything produced by a clone or cross goes through the propagate
 * flow instead, which derives generations and parentage automatically.
 */

import { useState } from 'react';
import { useCreateAccession, useMediumBatches } from '../../hooks/genetics/useGenetics';
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

interface RegisterAccessionModalProps {
  lineId: string;
  lineCode?: string;
  onClose: () => void;
  onDone?: (accession: Accession) => void;
}

export function RegisterAccessionModal({
  lineId,
  lineCode,
  onClose,
  onDone,
}: RegisterAccessionModalProps) {
  const createAccession = useCreateAccession();
  const { data: batchPage } = useMediumBatches({ perPage: 100 });

  const [form, setForm] = useState<VesselForm>('petri_dish');
  const [quantity, setQuantity] = useState('4');
  const [unit, setUnit] = useState('plates');
  const [cloneGeneration, setCloneGeneration] = useState('0');
  const [filialGeneration, setFilialGeneration] = useState('0');
  const [mediumBatchId, setMediumBatchId] = useState('');
  const [provenanceType, setProvenanceType] = useState<ProvenanceType>('purchased');
  const [sourceNote, setSourceNote] = useState('');
  const [unitLocation, setUnitLocation] = useState('');
  const [position, setPosition] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = Number(quantity) >= 0 && !createAccession.isPending;

  const previewCode = `${(lineCode ?? 'LINE').toUpperCase()}-${
    Number(filialGeneration) > 0 ? `F${filialGeneration}-` : ''
  }G${cloneGeneration || 0}-…`;

  const handleSubmit = async () => {
    const result = await createAccession.mutateAsync({
      lineId,
      form,
      quantity: Number(quantity),
      unit: unit || 'vessels',
      cloneGeneration: Number(cloneGeneration) || 0,
      filialGeneration: Number(filialGeneration) || 0,
      mediumBatchId: mediumBatchId || undefined,
      provenance: {
        type: provenanceType,
        sourceNote: sourceNote.trim() || undefined,
      },
      location: {
        facilityId: facilityId || undefined,
        roomId: roomId || undefined,
        unit: unitLocation.trim() || undefined,
        position: position.trim() || undefined,
      },
      label: label.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title="Register material"
      subtitle="Founding material entered by hand. Clones and crosses go through Propagate instead."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {createAccession.isPending ? 'Saving…' : 'Register'}
          </Button>
        </>
      }
    >
      {createAccession.isError && (
        <Banner $tone="error">
          {(createAccession.error as any)?.response?.data?.detail ??
            createAccession.error.message}
        </Banner>
      )}

      <Banner>
        Will be created as <strong>{previewCode}</strong>
      </Banner>

      {/* The one ordering trap in the flow: a medium batch cannot be attached
          retroactively, so material registered now will permanently have no
          record of what it grew on. */}
      {(batchPage?.data ?? []).length === 0 && (
        <Banner $tone="warning">
          No medium batches exist yet. You can register this material without one, but
          it will have no record of what it grew on — and that cannot be added later.
          Consider pouring a batch under <strong>Media &amp; recipes</strong> first.
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
        </Field>
        <Field>
          <Label>Unit</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
      </FormRow>

      <FormRow $cols={2}>
        <Field>
          <Label>Clone generation (G)</Label>
          <Input
            type="number"
            min={0}
            value={cloneGeneration}
            onChange={(e) => setCloneGeneration(e.target.value)}
          />
          <Hint>0 for fresh founding material.</Hint>
        </Field>
        <Field>
          <Label>Filial generation (F)</Label>
          <Input
            type="number"
            min={0}
            value={filialGeneration}
            onChange={(e) => setFilialGeneration(e.target.value)}
          />
          <Hint>Leave at 0 unless this arrived as a known F-generation cross.</Hint>
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
    </Modal>
  );
}
