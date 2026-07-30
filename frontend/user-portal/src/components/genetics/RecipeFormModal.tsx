/**
 * Genetics Repo - Recipe Form Modal
 *
 * Create or edit a medium recipe.
 *
 * Base ingredients and additives are kept in separate lists on purpose: the
 * additives are the things under test, and keeping them apart is what makes
 * "show me everything grown on a medium containing X" a direct query instead
 * of a text search. Editing a formulation bumps the recipe version server-side;
 * batches already poured keep their own snapshot.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useCreateRecipe, useUpdateRecipe } from '../../hooks/genetics/useGenetics';
import type {
  Additive,
  Ingredient,
  IngredientUnit,
  MediumRecipe,
  MediumTypeValue,
  SterilizationMethod,
} from '../../types/genetics';
import {
  MEDIUM_TYPE_LABELS,
  INGREDIENT_UNIT_GROUPS,
  INGREDIENT_UNIT_LABELS,
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

const TYPES = Object.keys(MEDIUM_TYPE_LABELS) as MediumTypeValue[];
const STERILIZATION: SterilizationMethod[] = [
  'autoclave',
  'pressure_cooker',
  'pasteurization',
  'steam',
  'chemical',
  'none',
];

const Row = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
`;

const AdditiveRow = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 2fr auto;
  gap: 8px;
  align-items: center;
`;

const UnitSelect = styled.select`
  width: 100%;
  padding: 9px 8px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const RemoveBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 6px 9px;

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

const emptyIngredient = (): Ingredient => ({ name: '', amount: null, unit: 'g/L' });
const emptyAdditive = (): Additive => ({
  name: '',
  amount: null,
  unit: 'g/L',
  purpose: '',
  isExperimental: true,
});

interface RecipeFormModalProps {
  recipe?: MediumRecipe;
  onClose: () => void;
  onDone?: (recipe: MediumRecipe) => void;
}

export function RecipeFormModal({ recipe, onClose, onDone }: RecipeFormModalProps) {
  const isEdit = !!recipe;
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe(recipe?.id ?? '');

  const [name, setName] = useState(recipe?.name ?? '');
  const [code, setCode] = useState(recipe?.code ?? '');
  const [type, setType] = useState<MediumTypeValue>(recipe?.type ?? 'agar');
  const [targetPh, setTargetPh] = useState(recipe?.targetPh != null ? String(recipe.targetPh) : '');
  const [sterMethod, setSterMethod] = useState<SterilizationMethod>(
    recipe?.sterilization?.method ?? 'autoclave'
  );
  const [sterTemp, setSterTemp] = useState(
    recipe?.sterilization?.temperatureC != null ? String(recipe.sterilization.temperatureC) : '121'
  );
  const [sterMinutes, setSterMinutes] = useState(
    recipe?.sterilization?.minutes != null ? String(recipe.sterilization.minutes) : '15'
  );
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients?.length ? recipe.ingredients : [emptyIngredient()]
  );
  const [additives, setAdditives] = useState<Additive[]>(recipe?.additives ?? []);
  const [notes, setNotes] = useState(recipe?.notes ?? '');

  const mutation = isEdit ? updateRecipe : createRecipe;
  const canSubmit = name.trim() && code.trim() && !mutation.isPending;

  const patchIngredient = (i: number, patch: Partial<Ingredient>) =>
    setIngredients((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const patchAdditive = (i: number, patch: Partial<Additive>) =>
    setAdditives((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const handleSubmit = async () => {
    const payload = {
      name: name.trim(),
      code: code.trim(),
      type,
      targetPh: targetPh ? Number(targetPh) : undefined,
      sterilization: {
        method: sterMethod,
        temperatureC: sterTemp ? Number(sterTemp) : undefined,
        minutes: sterMinutes ? Number(sterMinutes) : undefined,
      },
      ingredients: ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({
          name: i.name.trim(),
          amount: i.amount != null && i.amount !== ('' as any) ? Number(i.amount) : undefined,
          unit: i.unit || undefined,
        })),
      additives: additives
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          amount: a.amount != null && a.amount !== ('' as any) ? Number(a.amount) : undefined,
          unit: a.unit || undefined,
          purpose: a.purpose || undefined,
          isExperimental: a.isExperimental,
        })),
      notes: notes.trim() || undefined,
    };

    const result = isEdit
      ? await updateRecipe.mutateAsync(payload)
      : await createRecipe.mutateAsync(payload);
    onDone?.(result);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? `Edit ${recipe?.code}` : 'New medium recipe'}
      subtitle="Base formulation plus the additives you are testing, kept separate."
      width="760px"
      onClose={onClose}
      footer={
        <>
          <Button type="button" $variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create recipe'}
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <Banner $tone="error">
          {(mutation.error as any)?.response?.data?.detail ?? mutation.error?.message}
        </Banner>
      )}

      {isEdit && (
        <Banner $tone="warning">
          Changing the formulation bumps this recipe to v{(recipe?.version ?? 1) + 1}. Batches
          already poured keep the snapshot they were made with.
        </Banner>
      )}

      <FormRow $cols={3}>
        <Field>
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MEA + carbon" />
        </Field>
        <Field>
          <Label>Code *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MEA-AC" />
        </Field>
        <Field>
          <Label>Type</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as MediumTypeValue)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {MEDIUM_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>

      <Field>
        <Label>Base ingredients</Label>
        {ingredients.map((ing, i) => (
          <Row key={i}>
            <Input
              value={ing.name}
              placeholder="Malt extract"
              onChange={(e) => patchIngredient(i, { name: e.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              value={ing.amount ?? ''}
              placeholder="20"
              onChange={(e) => patchIngredient(i, { amount: e.target.value as any })}
            />
            <UnitSelect
              value={ing.unit ?? ''}
              onChange={(e) =>
                patchIngredient(i, { unit: (e.target.value || null) as IngredientUnit | null })
              }
            >
              <option value="">unit…</option>
              {INGREDIENT_UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.units.map((u) => (
                    <option key={u} value={u} title={INGREDIENT_UNIT_LABELS[u]}>
                      {u}
                    </option>
                  ))}
                </optgroup>
              ))}
            </UnitSelect>
            <RemoveBtn
              type="button"
              onClick={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove ingredient"
            >
              ×
            </RemoveBtn>
          </Row>
        ))}
        <AddBtn type="button" onClick={() => setIngredients((p) => [...p, emptyIngredient()])}>
          + Add ingredient
        </AddBtn>
      </Field>

      <Field>
        <Label>Additives under test</Label>
        <Hint>
          Anything listed here becomes searchable — you can ask later which material was ever
          grown on a medium containing it.
        </Hint>
        {additives.map((add, i) => (
          <AdditiveRow key={i}>
            <Input
              value={add.name}
              placeholder="Activated carbon"
              onChange={(e) => patchAdditive(i, { name: e.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              value={add.amount ?? ''}
              placeholder="1"
              onChange={(e) => patchAdditive(i, { amount: e.target.value as any })}
            />
            <UnitSelect
              value={add.unit ?? ''}
              onChange={(e) =>
                patchAdditive(i, { unit: (e.target.value || null) as IngredientUnit | null })
              }
            >
              <option value="">unit…</option>
              {INGREDIENT_UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.units.map((u) => (
                    <option key={u} value={u} title={INGREDIENT_UNIT_LABELS[u]}>
                      {u}
                    </option>
                  ))}
                </optgroup>
              ))}
            </UnitSelect>
            <Input
              value={add.purpose ?? ''}
              placeholder="testing growth response"
              onChange={(e) => patchAdditive(i, { purpose: e.target.value })}
            />
            <RemoveBtn
              type="button"
              onClick={() => setAdditives((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove additive"
            >
              ×
            </RemoveBtn>
          </AdditiveRow>
        ))}
        <AddBtn type="button" onClick={() => setAdditives((p) => [...p, emptyAdditive()])}>
          + Add additive
        </AddBtn>
      </Field>

      <FormRow $cols={4}>
        <Field>
          <Label>Target pH</Label>
          <Input
            type="number"
            step="0.1"
            value={targetPh}
            onChange={(e) => setTargetPh(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Sterilisation</Label>
          <Select
            value={sterMethod}
            onChange={(e) => setSterMethod(e.target.value as SterilizationMethod)}
          >
            {STERILIZATION.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Temp °C</Label>
          <Input value={sterTemp} onChange={(e) => setSterTemp(e.target.value)} />
        </Field>
        <Field>
          <Label>Minutes</Label>
          <Input value={sterMinutes} onChange={(e) => setSterMinutes(e.target.value)} />
        </Field>
      </FormRow>

      <Field>
        <Label>Notes</Label>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
