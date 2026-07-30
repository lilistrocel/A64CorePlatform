/**
 * ProtocolFormModal
 *
 * Write or revise a standard operating procedure.
 *
 * The form warns before it lets you revise an approved protocol, because that
 * action has a consequence people do not expect: the procedure returns to draft
 * and stops being offered at the bench until someone re-approves it. That is
 * correct — a changed procedure is not the one that was signed off — but it
 * should not be a surprise.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useCreateProtocol, useUpdateProtocol } from '../../hooks/protocols/useProtocols';
import type {
  Consumable,
  Protocol,
  ProtocolCategory,
  ProtocolStep,
} from '../../types/protocols';
import {
  PROTOCOL_CATEGORY_ICONS,
  PROTOCOL_CATEGORY_LABELS,
  PROTOCOL_SCOPES,
} from '../../types/protocols';
import { Modal } from '../genetics/Modal';
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
} from '../genetics/styled';

const StepRow = styled.div`
  display: grid;
  grid-template-columns: 28px 1fr 70px auto auto;
  gap: 8px;
  align-items: start;
`;

const StepNum = styled.span`
  padding-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: right;
`;

const CriticalToggle = styled.button<{ $on: boolean }>`
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid
    ${({ $on, theme }) => ($on ? theme.colors.warning : theme.colors.neutral[300])};
  background: ${({ $on, theme }) => ($on ? theme.colors.warningBg : 'transparent')};
  color: ${({ $on, theme }) => ($on ? '#92400e' : theme.colors.textSecondary)};
`;

const RemoveBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 15px;
  padding: 7px 9px;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
    color: #b91c1c;
  }
`;

const AddBtn = styled.button`
  background: none;
  border: 1px dashed ${({ theme }) => theme.colors.neutral[400]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 8px;
  width: 100%;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const ScopeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px;
`;

const ScopeCheck = styled.label<{ $on: boolean }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 11.5px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  cursor: pointer;
  border: 1px solid
    ${({ $on, theme }) => ($on ? theme.colors.primary[400] : theme.colors.neutral[300])};
  background: ${({ $on, theme }) => ($on ? theme.colors.primary[50] : 'transparent')};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const emptyStep = (order: number): ProtocolStep => ({
  order,
  text: '',
  durationMinutes: null,
  isCritical: false,
  notes: null,
});

const emptyConsumable = (): Consumable => ({ name: '', quantity: '' });

interface ProtocolFormModalProps {
  protocol?: Protocol;
  onClose: () => void;
}

export function ProtocolFormModal({ protocol, onClose }: ProtocolFormModalProps) {
  const isEdit = !!protocol;
  const create = useCreateProtocol();
  const update = useUpdateProtocol(protocol?.id ?? '');

  const [code, setCode] = useState(protocol?.code ?? '');
  const [title, setTitle] = useState(protocol?.title ?? '');
  const [category, setCategory] = useState<ProtocolCategory>(protocol?.category ?? 'lab');
  const [purpose, setPurpose] = useState(protocol?.purpose ?? '');
  const [ppe, setPpe] = useState((protocol?.ppe ?? []).join(', '));
  const [safetyNotes, setSafetyNotes] = useState(protocol?.safetyNotes ?? '');
  const [materials, setMaterials] = useState<Consumable[]>(
    protocol?.materials?.length ? protocol.materials : [emptyConsumable()]
  );
  const [steps, setSteps] = useState<ProtocolStep[]>(
    protocol?.steps?.length ? protocol.steps : [emptyStep(1)]
  );
  const [appliesTo, setAppliesTo] = useState<string[]>(protocol?.appliesTo ?? []);

  const mutation = isEdit ? update : create;
  const canSubmit = code.trim() && title.trim() && !mutation.isPending;

  const patchStep = (i: number, patch: Partial<ProtocolStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const toggleScope = (scope: string) =>
    setAppliesTo((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );

  const handleSubmit = async () => {
    const payload = {
      code: code.trim(),
      title: title.trim(),
      category,
      purpose: purpose.trim() || undefined,
      ppe: ppe.split(',').map((p) => p.trim()).filter(Boolean),
      safetyNotes: safetyNotes.trim() || undefined,
      materials: materials.filter((m) => m.name.trim()),
      steps: steps
        .filter((s) => s.text.trim())
        .map((s, i) => ({ ...s, order: i + 1, text: s.text.trim() })),
      appliesTo,
    };
    if (isEdit) await update.mutateAsync(payload);
    else await create.mutateAsync(payload);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Edit ${protocol?.code}` : 'New protocol'}
      subtitle="A written procedure. Tag where it applies so it appears at the point of work."
      width="760px"
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create draft'}
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <Banner $tone="error">
          {(mutation.error as any)?.response?.data?.detail ?? mutation.error?.message}
        </Banner>
      )}

      {isEdit && protocol?.status === 'active' && (
        <Banner $tone="warning">
          This protocol is <strong>active</strong>. Changing the steps, materials, PPE or
          purpose bumps it to v{protocol.version + 1} and returns it to{' '}
          <strong>draft</strong> — it will stop being offered at the bench until it is
          re-approved. Renaming or re-tagging does neither.
        </Banner>
      )}

      <FormRow $cols={3}>
        <Field>
          <Label>Code *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SOP-LAB-004" />
        </Field>
        <Field>
          <Label>Category</Label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as ProtocolCategory)}
          >
            {(Object.keys(PROTOCOL_CATEGORY_LABELS) as ProtocolCategory[]).map((c) => (
              <option key={c} value={c}>
                {PROTOCOL_CATEGORY_ICONS[c]} {PROTOCOL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>PPE</Label>
          <Input
            value={ppe}
            onChange={(e) => setPpe(e.target.value)}
            placeholder="gloves, mask"
          />
        </Field>
      </FormRow>

      <Field>
        <Label>Title *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pouring MEA plates"
        />
      </Field>

      <Field>
        <Label>Purpose</Label>
        <TextArea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What this achieves and when to use it"
        />
      </Field>

      <Field>
        <Label>Steps</Label>
        <Hint>
          Mark the ones that get skipped under time pressure and cause the failure
          later — they are highlighted wherever this protocol appears.
        </Hint>
        {steps.map((s, i) => (
          <StepRow key={i}>
            <StepNum>{i + 1}.</StepNum>
            <TextArea
              style={{ minHeight: 44 }}
              value={s.text}
              onChange={(e) => patchStep(i, { text: e.target.value })}
              placeholder="What to do"
            />
            <Input
              type="number"
              min={0}
              value={s.durationMinutes ?? ''}
              placeholder="min"
              onChange={(e) =>
                patchStep(i, {
                  durationMinutes: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
            <CriticalToggle
              type="button"
              $on={s.isCritical}
              onClick={() => patchStep(i, { isCritical: !s.isCritical })}
              title="Mark as a critical step"
            >
              {s.isCritical ? '★ critical' : '☆ critical'}
            </CriticalToggle>
            <RemoveBtn
              type="button"
              onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove step"
            >
              ×
            </RemoveBtn>
          </StepRow>
        ))}
        <AddBtn type="button" onClick={() => setSteps((p) => [...p, emptyStep(p.length + 1)])}>
          + Add step
        </AddBtn>
      </Field>

      <Field>
        <Label>Materials &amp; equipment</Label>
        {materials.map((m, i) => (
          <FormRow key={i} $cols={2}>
            <Input
              value={m.name}
              placeholder="Malt extract agar"
              onChange={(e) =>
                setMaterials((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x))
                )
              }
            />
            <Input
              value={m.quantity ?? ''}
              placeholder="1 L / as needed"
              onChange={(e) =>
                setMaterials((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x))
                )
              }
            />
          </FormRow>
        ))}
        <AddBtn type="button" onClick={() => setMaterials((p) => [...p, emptyConsumable()])}>
          + Add material
        </AddBtn>
      </Field>

      <Field>
        <Label>Appears at</Label>
        <Hint>
          Where this procedure shows up in the app. Untagged protocols still live in the
          library, but nobody meets them while doing the work.
        </Hint>
        <ScopeGrid>
          {Object.values(PROTOCOL_SCOPES).map((scope) => (
            <ScopeCheck key={scope} $on={appliesTo.includes(scope)}>
              <input
                type="checkbox"
                checked={appliesTo.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              {scope}
            </ScopeCheck>
          ))}
        </ScopeGrid>
      </Field>

      <Field>
        <Label>Safety notes</Label>
        <TextArea value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
