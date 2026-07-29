/**
 * Genetics Repo - Propagate Modal
 *
 * One form for both clones and crosses. The method drives everything else:
 * how many parent slots appear, and what happens to the generation counters.
 *
 * The preview line is the point of this screen — before committing, you can
 * see exactly what will be produced and why (G+1 for a transfer, F+1/G0 for a
 * spore print), so the numbering never feels like a black box.
 */

import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  useAccessions,
  useCreatePropagation,
  useGeneticLines,
  useMediumBatches,
  usePropagationMethods,
} from '../../hooks/genetics/useGenetics';
import type {
  Accession,
  ParentRole,
  PropagationMethodValue,
  VesselForm,
} from '../../types/genetics';
import {
  METHOD_LABELS,
  ROLE_LABELS,
  VESSEL_LABELS,
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
  ModeBadge,
  Select,
  TextArea,
} from './styled';

// Split to match the backend rule: advancing methods create a new clonal
// generation, expansion methods multiply the one you already have.
const ADVANCING_METHODS: PropagationMethodValue[] = [
  'agar_to_agar',
  'tissue_clone',
  'cutting',
  'node_culture',
  'division',
];

const EXPANSION_METHODS: PropagationMethodValue[] = [
  'lc_inoculation',
  'grain_transfer',
  'bulk_inoculation',
  'cryo_revival',
];

const SEXUAL_METHODS: PropagationMethodValue[] = [
  'spore_print',
  'multispore',
  'single_spore',
  'seed_from_cross',
  'self_pollination',
  'breeding',
  'artificial_insemination',
  'embryo_transfer',
];

const VESSEL_OPTIONS = Object.keys(VESSEL_LABELS) as VesselForm[];

const ROLE_OPTIONS: ParentRole[] = [
  'clone_source',
  'seed_parent',
  'pollen_parent',
  'dam',
  'sire',
  'spore_source',
  'unknown',
];

const Preview = styled.div`
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PreviewLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Mono = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 700;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
`;

const Toggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[700]};
  cursor: pointer;
  align-self: flex-start;

  &:hover {
    text-decoration: underline;
  }
`;

interface PropagateModalProps {
  /** Pre-selected primary parent. */
  sourceAccession?: Accession;
  /** Restrict the parent pickers to one line; omit to search everything. */
  lineId?: string;
  onClose: () => void;
  onDone?: (createdIds: string[]) => void;
}

export function PropagateModal({
  sourceAccession,
  lineId,
  onClose,
  onDone,
}: PropagateModalProps) {
  const { data: methods } = usePropagationMethods();
  const { data: accessionPage } = useAccessions({ perPage: 100, lineId, activeOnly: true });
  const { data: batchPage } = useMediumBatches({ perPage: 100 });
  const { data: linePage } = useGeneticLines({ perPage: 100, withStats: false });
  const propagate = useCreatePropagation();

  const [method, setMethod] = useState<PropagationMethodValue>('agar_to_agar');
  const [parentAId, setParentAId] = useState(sourceAccession?.id ?? '');
  const [parentARole, setParentARole] = useState<ParentRole>('clone_source');
  const [parentBId, setParentBId] = useState('');
  const [parentBRole, setParentBRole] = useState<ParentRole>('sire');
  const [parentBUnknown, setParentBUnknown] = useState(false);

  const [form, setForm] = useState<VesselForm>(sourceAccession?.form ?? 'petri_dish');
  const [quantity, setQuantity] = useState('8');
  const [unit, setUnit] = useState('plates');
  const [mediumBatchId, setMediumBatchId] = useState('');
  const [targetLineId, setTargetLineId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [notes, setNotes] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cloneOverride, setCloneOverride] = useState('');
  const [filialOverride, setFilialOverride] = useState('');

  const accessions = accessionPage?.data ?? [];
  const batches = batchPage?.data ?? [];
  const lines = linePage?.data ?? [];

  const methodInfo = useMemo(
    () => methods?.find((m) => m.value === method),
    [methods, method]
  );
  const isSexual = methodInfo?.reproductionMode === 'sexual';
  const allowsTwoParents = (methodInfo?.maxParents ?? 1) >= 2;

  // Roles follow the method: a clone has a clone source, a cross has a
  // sire/dam or seed/pollen pair. Keeps the common path zero-click.
  useEffect(() => {
    if (!isSexual) {
      setParentARole('clone_source');
    } else if (method === 'spore_print' || method === 'multispore' || method === 'single_spore') {
      setParentARole('spore_source');
    } else if (method === 'breeding' || method === 'artificial_insemination' || method === 'embryo_transfer') {
      setParentARole('dam');
      setParentBRole('sire');
    } else {
      setParentARole('seed_parent');
      setParentBRole('pollen_parent');
    }
    if (!allowsTwoParents) {
      setParentBId('');
      setParentBUnknown(false);
    }
  }, [method, isSexual, allowsTwoParents]);

  const parentA = accessions.find((a) => a.id === parentAId) ?? sourceAccession;
  const parentB = accessions.find((a) => a.id === parentBId);

  // Mirrors PropagationService.derive_generations so the preview matches what
  // the server will actually do.
  const isExpansion = !!methodInfo && !methodInfo.advancesCloneGeneration && !isSexual;

  const derived = useMemo(() => {
    const involved = [parentA, parentB].filter(Boolean) as Accession[];
    const maxClone = involved.length ? Math.max(...involved.map((p) => p.cloneGeneration)) : 0;
    const maxFilial = involved.length ? Math.max(...involved.map((p) => p.filialGeneration)) : 0;
    if (isSexual) return { clone: 0, filial: maxFilial + 1 };
    // Expansion multiplies a generation rather than advancing it.
    if (isExpansion) return { clone: maxClone, filial: maxFilial };
    return { clone: maxClone + 1, filial: maxFilial };
  }, [parentA, parentB, isSexual, isExpansion]);

  const effectiveClone = cloneOverride !== '' ? Number(cloneOverride) : derived.clone;
  const effectiveFilial = filialOverride !== '' ? Number(filialOverride) : derived.filial;
  const previewLabel =
    effectiveFilial > 0 ? `F${effectiveFilial}-G${effectiveClone}` : `G${effectiveClone}`;

  const previewLineCode = useMemo(() => {
    const id = targetLineId || parentA?.lineId;
    return lines.find((l) => l.id === id)?.code ?? '—';
  }, [targetLineId, parentA, lines]);

  const canSubmit =
    !!(parentAId || parentBId || targetLineId) && Number(quantity) >= 1 && !propagate.isPending;

  const handleSubmit = async () => {
    const parents = [];
    if (parentAId) {
      parents.push({ accessionId: parentAId, role: parentARole });
    }
    if (allowsTwoParents) {
      if (parentBUnknown) {
        // A recorded-but-unidentified parent keeps the half of the cross that
        // is known, rather than forcing the whole thing to be anonymous.
        parents.push({ accessionId: null, role: parentBRole, note: 'Parent not identified' });
      } else if (parentBId) {
        parents.push({ accessionId: parentBId, role: parentBRole });
      }
    }

    const result = await propagate.mutateAsync({
      method,
      parents,
      operatorName: operatorName || undefined,
      mediumBatchId: mediumBatchId || undefined,
      notes: notes || undefined,
      targets: [
        {
          form,
          quantity: Number(quantity),
          unit: unit || 'vessels',
          mediumBatchId: mediumBatchId || undefined,
          targetLineId: targetLineId || undefined,
          cloneGenerationOverride: cloneOverride !== '' ? Number(cloneOverride) : undefined,
          filialGenerationOverride: filialOverride !== '' ? Number(filialOverride) : undefined,
        },
      ],
    });

    onDone?.(result.accessions.map((a) => a.id));
    onClose();
  };

  return (
    <Modal
      title="Propagate"
      subtitle="Clone or cross material. Generations are derived from the method you pick."
      width="700px"
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {propagate.isPending ? 'Working…' : 'Propagate'}
          </Button>
        </>
      }
    >
      {propagate.isError && (
        <Banner $tone="error">
          {(propagate.error as any)?.response?.data?.detail ?? propagate.error.message}
        </Banner>
      )}

      <Field>
        <Label>Method</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as PropagationMethodValue)}>
          <optgroup label="Clone — new generation, G advances">
            {ADVANCING_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Expansion — same generation, G unchanged">
            {EXPANSION_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Sexual — new individual, F advances and G resets">
            {SEXUAL_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </optgroup>
        </Select>
        <Hint>
          {isSexual
            ? 'Recombines the genome — the result is a fresh genetic individual, so the clone counter restarts at G0 and the filial counter advances.'
            : isExpansion
            ? 'Scales up the same generation. Senescence tracks agar transfers, not production volume, so G is left alone.'
            : 'Preserves the genome but counts as a transfer — the clone counter advances, which is what tracks senescence in a serially transferred line.'}
        </Hint>
      </Field>

      <Divider />

      <Field>
        <Label>{allowsTwoParents ? 'Parent A' : 'Source'}</Label>
        <FormRow $cols={2}>
          <Select value={parentAId} onChange={(e) => setParentAId(e.target.value)}>
            <option value="">— none / not recorded —</option>
            {accessions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accessionCode} · {a.generationLabel} · {a.quantity} {a.unit}
              </option>
            ))}
          </Select>
          <Select
            value={parentARole}
            onChange={(e) => setParentARole(e.target.value as ParentRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </FormRow>
      </Field>

      {allowsTwoParents && (
        <Field>
          <Label>Parent B</Label>
          <FormRow $cols={2}>
            <Select
              value={parentBUnknown ? '__unknown__' : parentBId}
              onChange={(e) => {
                if (e.target.value === '__unknown__') {
                  setParentBUnknown(true);
                  setParentBId('');
                } else {
                  setParentBUnknown(false);
                  setParentBId(e.target.value);
                }
              }}
            >
              <option value="">— none —</option>
              <option value="__unknown__">Exists but unidentified</option>
              {accessions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accessionCode} · {a.generationLabel}
                </option>
              ))}
            </Select>
            <Select
              value={parentBRole}
              onChange={(e) => setParentBRole(e.target.value as ParentRole)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </FormRow>
          <Hint>
            Pick “exists but unidentified” when one side of the cross is not on file — the
            known half is still recorded.
          </Hint>
        </Field>
      )}

      <Preview>
        <PreviewLine>
          <ModeBadge $mode={isSexual ? 'sexual' : 'asexual'}>
            {isSexual ? 'sexual' : isExpansion ? 'expansion' : 'clone'}
          </ModeBadge>
          <span>will create</span>
          <Mono>
            {previewLineCode}-{previewLabel}-…
          </Mono>
          <span>
            × {quantity || 0} {unit}
          </span>
        </PreviewLine>
        <Hint>
          {isSexual
            ? `Filial generation advances to F${effectiveFilial}; clone generation restarts at G0.`
            : isExpansion
            ? `Expansion — this multiplies the culture rather than advancing it, so it stays at G${effectiveClone}. A full production run (LC → grain → block) does not age the strain.`
            : `Clone generation advances to G${effectiveClone}${
                effectiveFilial > 0 ? `, filial generation stays at F${effectiveFilial}` : ''
              }.`}
        </Hint>
      </Preview>

      <Divider />

      <FormRow $cols={3}>
        <Field>
          <Label>Result form</Label>
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
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Unit</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="plates" />
        </Field>
      </FormRow>

      <FormRow $cols={2}>
        <Field>
          <Label>Medium batch</Label>
          <Select value={mediumBatchId} onChange={(e) => setMediumBatchId(e.target.value)}>
            <option value="">— none —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchCode} · {b.recipeName ?? ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Performed by</Label>
          <Input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Technician name"
          />
        </Field>
      </FormRow>

      <Field>
        <Label>Notes</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <Toggle type="button" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '− Hide' : '+ Show'} advanced (new line, generation overrides)
      </Toggle>

      {showAdvanced && (
        <>
          <Field>
            <Label>Assign result to a different line</Label>
            <Select value={targetLineId} onChange={(e) => setTargetLineId(e.target.value)}>
              <option value="">— inherit from parent —</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.commonName}
                </option>
              ))}
            </Select>
            <Hint>Use this when a cross should found a new named line, such as an F1 hybrid.</Hint>
          </Field>
          <FormRow $cols={2}>
            <Field>
              <Label>Override G</Label>
              <Input
                type="number"
                min={0}
                value={cloneOverride}
                placeholder={String(derived.clone)}
                onChange={(e) => setCloneOverride(e.target.value)}
              />
            </Field>
            <Field>
              <Label>Override F</Label>
              <Input
                type="number"
                min={0}
                value={filialOverride}
                placeholder={String(derived.filial)}
                onChange={(e) => setFilialOverride(e.target.value)}
              />
            </Field>
          </FormRow>
          <Hint>Leave blank to accept the derived values. Lab convention wins over ours.</Hint>
        </>
      )}
    </Modal>
  );
}
