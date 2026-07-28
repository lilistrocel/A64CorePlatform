/**
 * Genetics Repo - Line Form Modal
 *
 * Create or edit a genetic line — the named identity behind the material.
 * Works for plants, fungi and animals alike; the kind field is what the rest
 * of the UI keys off.
 */

import { useState } from 'react';
import { useCreateLine, useGeneticLines, useUpdateLine } from '../../hooks/genetics/useGenetics';
import {
  PROFILE_SOURCE_LABEL,
  profileSourceForKind,
  useProfileOptions,
} from '../../hooks/genetics/useGrowingProfiles';
import type {
  DerivationType,
  GeneticLine,
  OrganismKind,
  ProvenanceType,
} from '../../types/genetics';
import {
  DERIVATION_LABELS,
  KIND_LABELS,
  PROVENANCE_LABELS,
} from '../../types/genetics';
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

const KINDS = Object.keys(KIND_LABELS) as OrganismKind[];
const DERIVATIONS = Object.keys(DERIVATION_LABELS) as DerivationType[];
const PROVENANCES = Object.keys(PROVENANCE_LABELS) as ProvenanceType[];

interface LineFormModalProps {
  line?: GeneticLine;
  onClose: () => void;
  onDone?: (line: GeneticLine) => void;
}

export function LineFormModal({ line, onClose, onDone }: LineFormModalProps) {
  const isEdit = !!line;
  const createLine = useCreateLine();
  const updateLine = useUpdateLine(line?.id ?? '');
  const { data: linePage } = useGeneticLines({ perPage: 100, withStats: false });

  const [code, setCode] = useState(line?.code ?? '');
  const [commonName, setCommonName] = useState(line?.commonName ?? '');
  const [kind, setKind] = useState<OrganismKind>(line?.kind ?? 'fungus');
  const [scientificName, setScientificName] = useState(line?.scientificName ?? '');
  const [species, setSpecies] = useState(line?.species ?? '');
  const [parentLineId, setParentLineId] = useState(line?.parentLineId ?? '');
  const [derivation, setDerivation] = useState<DerivationType>(line?.derivation ?? 'original');
  const [provenanceType, setProvenanceType] = useState<ProvenanceType>(
    line?.provenance?.type ?? 'unknown'
  );
  const [sourceNote, setSourceNote] = useState(line?.provenance?.sourceNote ?? '');
  const [description, setDescription] = useState(line?.description ?? '');
  const [tags, setTags] = useState((line?.tags ?? []).join(', '));
  const [linkedStrainId, setLinkedStrainId] = useState(line?.linkedStrainId ?? '');
  const [linkedPlantDataId, setLinkedPlantDataId] = useState(line?.linkedPlantDataId ?? '');

  // The growing-profile library depends on the kind: fungi link to the Strain
  // Library, plants to the Plant Library. Animals have no such library yet.
  const profileSource = profileSourceForKind(kind);
  const { data: profileOptions } = useProfileOptions(kind);

  const linkedProfileId = profileSource === 'strain' ? linkedStrainId : linkedPlantDataId;

  /**
   * Selecting a profile prefills the taxonomy fields when they are still blank.
   * Existing values are left alone — the line's own naming wins over the
   * library's, and silently overwriting typed input would be hostile.
   */
  const handleProfileSelect = (id: string) => {
    if (profileSource === 'strain') {
      setLinkedStrainId(id);
      setLinkedPlantDataId('');
    } else if (profileSource === 'plant') {
      setLinkedPlantDataId(id);
      setLinkedStrainId('');
    }

    const picked = (profileOptions ?? []).find((o) => o.id === id);
    if (!picked) return;
    if (!scientificName.trim() && picked.scientificName) {
      setScientificName(picked.scientificName);
    }
    if (!species.trim() && picked.species) {
      setSpecies(picked.species);
    }
    if (!commonName.trim()) {
      setCommonName(picked.label);
    }
  };

  const mutation = isEdit ? updateLine : createLine;
  const canSubmit = code.trim() && commonName.trim() && !mutation.isPending;

  const otherLines = (linePage?.data ?? []).filter((l) => l.id !== line?.id);

  const handleSubmit = async () => {
    const payload = {
      code: code.trim(),
      commonName: commonName.trim(),
      kind,
      scientificName: scientificName.trim() || undefined,
      species: species.trim() || undefined,
      parentLineId: parentLineId || undefined,
      derivation,
      provenance: {
        type: provenanceType,
        sourceNote: sourceNote.trim() || undefined,
      },
      description: description.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      linkedStrainId: linkedStrainId || undefined,
      linkedPlantDataId: linkedPlantDataId || undefined,
    };

    const result = isEdit
      ? await updateLine.mutateAsync(payload)
      : await createLine.mutateAsync(payload);
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? 'Edit genetic line' : 'New genetic line'}
      subtitle="The named identity — physical material is registered against it separately."
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create line'}
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <Banner $tone="error">
          {(mutation.error as any)?.response?.data?.detail ?? mutation.error?.message}
        </Banner>
      )}

      <FormRow $cols={2}>
        <Field>
          <Label>Code *</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PO-BLU"
          />
          <Hint>Used to build accession codes, e.g. PO-BLU-G2-014.</Hint>
        </Field>
        <Field>
          <Label>Kind *</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as OrganismKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
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
          placeholder="Blue Oyster"
        />
      </Field>

      <FormRow $cols={2}>
        <Field>
          <Label>Scientific name</Label>
          <Input
            value={scientificName}
            onChange={(e) => setScientificName(e.target.value)}
            placeholder="Pleurotus ostreatus"
          />
        </Field>
        <Field>
          <Label>Species</Label>
          <Input value={species} onChange={(e) => setSpecies(e.target.value)} />
        </Field>
      </FormRow>

      {profileSource ? (
        <Field>
          <Label>Growing profile ({PROFILE_SOURCE_LABEL[profileSource]})</Label>
          <Select
            value={linkedProfileId}
            onChange={(e) => handleProfileSelect(e.target.value)}
          >
            <option value="">— not linked —</option>
            {(profileOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.scientificName ? ` · ${o.scientificName}` : ''}
              </option>
            ))}
          </Select>
          <Hint>
            Links this line to its cultivation parameters — temperature, humidity and
            duration targets live there, ancestry lives here. Picking one fills in any
            taxonomy fields you have left blank.
          </Hint>
        </Field>
      ) : (
        <Hint>
          No growing-profile library exists for {KIND_LABELS[kind].toLowerCase()} records
          yet, so this line carries its own husbandry notes.
        </Hint>
      )}

      <FormRow $cols={2}>
        <Field>
          <Label>Derived from line</Label>
          <Select value={parentLineId} onChange={(e) => setParentLineId(e.target.value)}>
            <option value="">— none, this is an original —</option>
            {otherLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.commonName}
              </option>
            ))}
          </Select>
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
            placeholder="Vendor, collector, location, donor"
          />
        </Field>
      </FormRow>
      <Hint>
        Unknown origin is a valid answer — recording it as “Unknown” with whatever partial
        detail you have beats leaving it blank.
      </Hint>

      <Field>
        <Label>Description</Label>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Field>
        <Label>Tags</Label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="gourmet, fast-colonising"
        />
        <Hint>Comma-separated.</Hint>
      </Field>
    </Modal>
  );
}
