/**
 * FertigationScheduleEditorModal
 *
 * Full CRUD editor for a plant's fertigation schedule. Manages a local draft of
 * FertigationSchedule and saves via PATCH /api/v1/farm/plant-data-enhanced/{id}.
 *
 * Key behaviours:
 * - Modal never closes on backdrop click (X button only).
 * - totalFertilizationDays is auto-derived on save; not directly editable.
 * - Chemical name typeahead uses useChemicals(); unknown names show inline "Add" form.
 * - Switching rule type (interval <-> custom) clears non-applicable arrays with a warning.
 * - Save button disabled while any validation error exists.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { updatePlantDataEnhanced } from '../../services/plantDataEnhancedApi';
import { showSuccessToast } from '../../stores/toast.store';
import { useChemicals, useCreateChemical } from '../../hooks/queries/useTools';
import type {
  FertigationSchedule,
  FertigationCard,
  FertigationRule,
  FertigationIngredient,
  CustomApplication,
  IngredientCategory,
} from '../../types/farm';
import type { CreateChemicalRequest, ChemicalUnit } from '../../types/tools';

// ============================================================================
// TYPES
// ============================================================================

export interface FertigationScheduleEditorModalProps {
  plantDataId: string;
  plantName: string;
  initialSchedule: FertigationSchedule | null | undefined;
  onClose: () => void;
  /** Called after successful PATCH so the parent can refetch plant data. */
  onSaved: () => void;
}

// Validation errors keyed by a deterministic path string.
type ValidationErrors = Record<string, string>;

// Shape of the inline "new chemical" form state.
interface NewChemicalForm {
  name: string;
  category: string;
  defaultUnit: ChemicalUnit;
  notes: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const INGREDIENT_CATEGORIES: { value: IngredientCategory; label: string }[] = [
  { value: 'macro_npk', label: 'Macro NPK' },
  { value: 'potassium', label: 'Potassium' },
  { value: 'calcium', label: 'Calcium' },
  { value: 'micronutrient', label: 'Micronutrient' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'other', label: 'Other' },
];

const INGREDIENT_UNITS: { value: string; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'kg', label: 'kg' },
  { value: 'L', label: 'L' },
];

/** Returns a default ingredient unit from a chemical's default bulk unit. */
function defaultIngredientUnit(chemicalUnit: ChemicalUnit): string {
  return chemicalUnit === 'kg' ? 'g' : 'ml';
}

function emptyIngredient(): FertigationIngredient {
  return { name: '', category: 'other', dosagePerPoint: 0, unit: 'g' };
}

function emptyApplication(): CustomApplication {
  return { day: 0, ingredients: [emptyIngredient()], notes: '' };
}

function emptyRule(): FertigationRule {
  // Reason: start empty so switching type on a fresh rule doesn't trigger a
  // "discard existing item" warning for a placeholder the user didn't author.
  return { name: '', type: 'interval', frequencyDays: 1, ingredients: [] };
}

function emptyCard(): FertigationCard {
  return {
    cardName: '',
    growthStage: '',
    dayStart: 0,
    dayEnd: 0,
    isActive: true,
    rules: [emptyRule()],
    notes: '',
  };
}

function emptySchedule(): FertigationSchedule {
  return { cards: [], totalFertilizationDays: 0, source: '' };
}

/** Parses a string as a non-negative integer; returns undefined on failure. */
function parseNonNegInt(val: string): number | undefined {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? undefined : n;
}

/** Parses a string as a positive integer (>= 1); returns undefined on failure. */
function parsePosInt(val: string): number | undefined {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 1 ? undefined : n;
}

/** Parses a float dosage string. Returns undefined on failure. */
function parseDosage(val: string): number | undefined {
  const n = parseFloat(val);
  return isNaN(n) || n < 0 ? undefined : n;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateSchedule(schedule: FertigationSchedule): ValidationErrors {
  const errors: ValidationErrors = {};
  const trimOrEmpty = (s: string) => s.trim();

  schedule.cards.forEach((card, ci) => {
    const cp = `cards[${ci}]`;

    if (!trimOrEmpty(card.cardName)) {
      errors[`${cp}.cardName`] = 'Card name is required (1–100 chars).';
    } else if (card.cardName.trim().length > 100) {
      errors[`${cp}.cardName`] = 'Card name must be ≤ 100 characters.';
    }

    if (!trimOrEmpty(card.growthStage)) {
      errors[`${cp}.growthStage`] = 'Growth stage is required.';
    }

    if (!Number.isInteger(card.dayStart) || card.dayStart < 0) {
      errors[`${cp}.dayStart`] = 'Day start must be a non-negative integer.';
    }

    if (!Number.isInteger(card.dayEnd) || card.dayEnd < 0) {
      errors[`${cp}.dayEnd`] = 'Day end must be a non-negative integer.';
    } else if (card.dayEnd < card.dayStart) {
      errors[`${cp}.dayEnd`] = 'Day end must be ≥ day start.';
    }

    card.rules.forEach((rule, ri) => {
      const rp = `${cp}.rules[${ri}]`;

      if (!trimOrEmpty(rule.name)) {
        errors[`${rp}.name`] = 'Rule name is required (1–100 chars).';
      } else if (rule.name.trim().length > 100) {
        errors[`${rp}.name`] = 'Rule name must be ≤ 100 characters.';
      }

      if (rule.type === 'interval') {
        if (!rule.frequencyDays || !Number.isInteger(rule.frequencyDays) || rule.frequencyDays < 1) {
          errors[`${rp}.frequencyDays`] = 'Frequency must be an integer ≥ 1.';
        }

        if (rule.activeDayStart != null && rule.activeDayEnd != null) {
          if (rule.activeDayEnd < rule.activeDayStart) {
            errors[`${rp}.activeDayEnd`] = 'Active day end must be ≥ active day start.';
          }
        }

        (rule.ingredients ?? []).forEach((ing, ii) => {
          const ip = `${rp}.ingredients[${ii}]`;
          validateIngredient(ing, ip, errors);
        });
      }

      if (rule.type === 'custom') {
        (rule.applications ?? []).forEach((app, ai) => {
          const ap = `${rp}.applications[${ai}]`;
          if (!Number.isInteger(app.day) || app.day < 0) {
            errors[`${ap}.day`] = 'Application day must be a non-negative integer.';
          }
          app.ingredients.forEach((ing, ii) => {
            validateIngredient(ing, `${ap}.ingredients[${ii}]`, errors);
          });
        });
      }
    });
  });

  return errors;
}

function validateIngredient(ing: FertigationIngredient, path: string, errors: ValidationErrors): void {
  if (!ing.name.trim()) {
    errors[`${path}.name`] = 'Ingredient name is required.';
  } else if (ing.name.trim().length > 100) {
    errors[`${path}.name`] = 'Ingredient name must be ≤ 100 characters.';
  }

  if (ing.dosagePerPoint < 0) {
    errors[`${path}.dosagePerPoint`] = 'Dosage must be ≥ 0.';
  }

  // Check max 6 decimal places
  const dosageStr = ing.dosagePerPoint.toString();
  const decimalPart = dosageStr.split('.')[1];
  if (decimalPart && decimalPart.length > 6) {
    errors[`${path}.dosagePerPoint`] = 'Dosage can have at most 6 decimal places.';
  }
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 860px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const ModalHeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const ModalSubtitle = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const CycleLengthDisplay = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-style: italic;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  transition: all 150ms ease-in-out;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const FooterActions = styled.div`
  display: flex;
  gap: 10px;
  margin-left: auto;
`;

// Generic form primitives ─────────────────────────────────────────────────────

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const FieldInput = styled.input<{ $hasError?: boolean }>`
  padding: 8px 12px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  width: 100%;
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#0F6E56')};
    box-shadow: 0 0 0 2px ${({ $hasError }) => ($hasError ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)')};
  }

  &:read-only {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.secondary};
    cursor: default;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FieldSelect = styled.select<{ $hasError?: boolean }>`
  padding: 8px 12px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 6px;
  font-size: 13px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.12);
  }
`;

const FieldTextArea = styled.textarea<{ $hasError?: boolean }>`
  padding: 8px 12px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 60px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  width: 100%;
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.12);
  }
`;

const ErrorText = styled.span`
  font-size: 11px;
  color: #9E2A2A;
  line-height: 1.3;
`;

const FieldRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

// Buttons ─────────────────────────────────────────────────────────────────────

const PrimaryButton = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: #0F6E56;
  border: 1px dashed #0F6E56;

  &:hover:not(:disabled) {
    background: rgba(15,110,86,0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: #9E2A2A;
  border: 1px solid #9E2A2A;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: #fef2f2;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const MoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 7px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const TextLinkButton = styled.button`
  background: none;
  border: none;
  color: #0F6E56;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
  text-align: left;

  &:hover {
    color: #0B5644;
  }
`;

// Layout blocks ───────────────────────────────────────────────────────────────

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
`;

const SectionLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CardBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
`;

const CardBlockHeader = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const CardBlockHeaderLeft = styled.div`
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardBlockBody = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const RuleBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const RuleBlockHeader = styled.div`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const RuleBlockHeaderLeft = styled.div`
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RuleBlockBody = styled.div`
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const IngredientsTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const IngredientRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ApplicationBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 6px;
  overflow: hidden;
  background: white;
  margin-bottom: 8px;
`;

const ApplicationHeader = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ApplicationBody = styled.div`
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// Type-switch warning ─────────────────────────────────────────────────────────

const TypeSwitchWarning = styled.div`
  padding: 8px 12px;
  background: #fffbeb;
  border: 1px solid #B8842A;
  border-radius: 6px;
  font-size: 12px;
  color: #B8842A;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const WarnConfirmButton = styled.button`
  background: #B8842A;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #d97706;
  }
`;

// Inline "add chemical" form ──────────────────────────────────────────────────

const InlineChemForm = styled.div`
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
`;

const InlineChemFormTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #166534;
`;

// Source field ────────────────────────────────────────────────────────────────

const SourceRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
`;

// Typeahead wrapper ───────────────────────────────────────────────────────────

const TypeaheadWrapper = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;

const TypeaheadDropdown = styled.ul`
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 100;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  max-height: 180px;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
`;

const TypeaheadItem = styled.li`
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.primary};

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
`;

const LockedNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 32px 16px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  border: 2px dashed ${({ theme }) => theme.colors.border.subtle};
  border-radius: 10px;
  margin-bottom: 12px;
`;

// ============================================================================
// SUB-COMPONENT: IngredientEditor
// ============================================================================

interface IngredientEditorProps {
  ingredient: FertigationIngredient;
  path: string;
  errors: ValidationErrors;
  onChange: (updated: FertigationIngredient) => void;
  onDelete: () => void;
}

// Reason: type=number inputs prevent backspacing the seed 0 and append digits
// instead of replacing them. Buffer the raw string locally; show empty (with
// placeholder "0") when the numeric value is 0 so typing replaces cleanly.
interface DosageInputProps {
  value: number;
  hasError: boolean;
  onChange: (next: number) => void;
}

function DosageInput({ value, hasError, onChange }: DosageInputProps) {
  const [raw, setRaw] = useState<string>(value === 0 ? '' : String(value));

  // Sync when external value changes (e.g., chemical selection resets dosage)
  useEffect(() => {
    const expected = value === 0 ? '' : String(value);
    // Only resync when the numeric model diverges from the string buffer's parsed value
    const parsed = parseFloat(raw);
    if ((isNaN(parsed) ? 0 : parsed) !== value) {
      setRaw(expected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <FieldInput
      type="text"
      inputMode="decimal"
      placeholder="0"
      $hasError={hasError}
      value={raw}
      onChange={(e) => {
        // Strip non-digits except a single dot; collapse extra dots
        const cleaned = e.target.value.replace(/[^0-9.]/g, '');
        const parts = cleaned.split('.');
        const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
        // Drop a leading zero unless it precedes a decimal point ("0." stays)
        const noLeadingZero = sanitized.replace(/^0+(?=\d)/, '');
        setRaw(noLeadingZero);
        const n = parseFloat(noLeadingZero);
        onChange(isNaN(n) || n < 0 ? 0 : n);
      }}
      onBlur={() => {
        // Normalize trailing dot / empty / negative on blur
        if (raw === '' || raw === '.' || isNaN(parseFloat(raw)) || parseFloat(raw) < 0) {
          setRaw('');
          onChange(0);
        }
      }}
    />
  );
}

function IngredientEditor({ ingredient, path, errors, onChange, onDelete }: IngredientEditorProps) {
  const { data: chemicals = [] } = useChemicals(false);
  const createChemical = useCreateChemical();

  const [typeaheadQuery, setTypeaheadQuery] = useState('');
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);
  const [nameLocked, setNameLocked] = useState(!!ingredient.name);
  const [showNewChemForm, setShowNewChemForm] = useState(false);
  const [newChemForm, setNewChemForm] = useState<NewChemicalForm>({
    name: ingredient.name,
    category: 'other',
    defaultUnit: 'kg',
    notes: '',
  });

  // Filtered suggestions
  const suggestions = useMemo(() => {
    const q = typeaheadQuery.toLowerCase().trim();
    if (!q) return chemicals.slice(0, 20);
    return chemicals.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [chemicals, typeaheadQuery]);

  const handleTypeaheadChange = (val: string) => {
    setTypeaheadQuery(val);
    setTypeaheadOpen(true);
    setShowNewChemForm(false);
    // Propagate the name change so it's saved as-is if not locked
    onChange({ ...ingredient, name: val });
  };

  const handleSelectChemical = (name: string, category: string, unit: ChemicalUnit) => {
    const ingUnit = defaultIngredientUnit(unit);
    onChange({ ...ingredient, name, category: category as IngredientCategory, unit: ingUnit });
    setNameLocked(true);
    setTypeaheadOpen(false);
    setTypeaheadQuery(name);
    setShowNewChemForm(false);
  };

  const handleUnlock = () => {
    setNameLocked(false);
    setTypeaheadQuery(ingredient.name);
    setTypeaheadOpen(true);
    onChange({ ...ingredient, name: '' });
  };

  const handleCreateChemical = async () => {
    if (!newChemForm.name.trim()) return;
    const payload: CreateChemicalRequest = {
      name: newChemForm.name.trim(),
      aliases: [],
      category: newChemForm.category,
      defaultUnit: newChemForm.defaultUnit,
      notes: newChemForm.notes || undefined,
    };
    try {
      const created = await createChemical.mutateAsync(payload);
      handleSelectChemical(created.name, created.category, created.defaultUnit);
      setShowNewChemForm(false);
    } catch {
      // Global interceptor shows error toast.
    }
  };

  const showAddToLibraryLink =
    !nameLocked &&
    typeaheadQuery.trim().length > 0 &&
    !suggestions.some((c) => c.name.toLowerCase() === typeaheadQuery.trim().toLowerCase());

  return (
    <IngredientRow>
      {/* Name (typeahead or locked) */}
      <FormGroup style={{ flex: 2, minWidth: 130 }}>
        <Label>Name</Label>
        {nameLocked ? (
          <LockedNameRow>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ingredient.name}
            </span>
            <TextLinkButton type="button" onClick={handleUnlock}>change</TextLinkButton>
          </LockedNameRow>
        ) : (
          <TypeaheadWrapper>
            <FieldInput
              type="text"
              $hasError={!!errors[`${path}.name`]}
              value={typeaheadQuery}
              onChange={(e) => handleTypeaheadChange(e.target.value)}
              onFocus={() => setTypeaheadOpen(true)}
              onBlur={() => setTimeout(() => setTypeaheadOpen(false), 150)}
              placeholder="Search chemical..."
            />
            {typeaheadOpen && suggestions.length > 0 && (
              <TypeaheadDropdown>
                {suggestions.map((c) => (
                  <TypeaheadItem
                    key={c.chemicalId}
                    onMouseDown={() => handleSelectChemical(c.name, c.category, c.defaultUnit)}
                  >
                    {c.name}
                    {c.aliases.length > 0 && (
                      <span style={{ fontSize: 11, color: '#4B4844', marginLeft: 6 }}>
                        ({c.aliases.join(', ')})
                      </span>
                    )}
                  </TypeaheadItem>
                ))}
              </TypeaheadDropdown>
            )}
          </TypeaheadWrapper>
        )}
        {errors[`${path}.name`] && <ErrorText>{errors[`${path}.name`]}</ErrorText>}
        {showAddToLibraryLink && !showNewChemForm && (
          <TextLinkButton
            type="button"
            onClick={() => {
              setShowNewChemForm(true);
              setNewChemForm((f) => ({ ...f, name: typeaheadQuery.trim() }));
            }}
          >
            + Add "{typeaheadQuery.trim()}" to Chemicals Catalog
          </TextLinkButton>
        )}
        {showNewChemForm && (
          <InlineChemForm>
            <InlineChemFormTitle>Add to Chemicals Catalog</InlineChemFormTitle>
            <FieldRow>
              <FormGroup>
                <Label>Name</Label>
                <FieldInput
                  type="text"
                  value={newChemForm.name}
                  onChange={(e) => setNewChemForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormGroup>
            </FieldRow>
            <FieldRow>
              <FormGroup>
                <Label>Category</Label>
                <FieldSelect
                  value={newChemForm.category}
                  onChange={(e) => setNewChemForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {INGREDIENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </FieldSelect>
              </FormGroup>
              <FormGroup>
                <Label>Default Unit</Label>
                <FieldSelect
                  value={newChemForm.defaultUnit}
                  onChange={(e) =>
                    setNewChemForm((f) => ({ ...f, defaultUnit: e.target.value as ChemicalUnit }))
                  }
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                </FieldSelect>
              </FormGroup>
            </FieldRow>
            <FieldRow>
              <FormGroup>
                <Label>Notes (optional)</Label>
                <FieldInput
                  type="text"
                  value={newChemForm.notes}
                  onChange={(e) => setNewChemForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </FormGroup>
            </FieldRow>
            <FieldRow>
              <PrimaryButton
                type="button"
                disabled={createChemical.isPending || !newChemForm.name.trim()}
                style={{ fontSize: 12, padding: '6px 14px' }}
                onClick={handleCreateChemical}
              >
                {createChemical.isPending ? 'Adding...' : 'Add Chemical'}
              </PrimaryButton>
              <SecondaryButton
                type="button"
                style={{ fontSize: 12, padding: '6px 14px' }}
                onClick={() => setShowNewChemForm(false)}
              >
                Cancel
              </SecondaryButton>
            </FieldRow>
          </InlineChemForm>
        )}
      </FormGroup>

      {/* Category */}
      <FormGroup style={{ flex: 1, minWidth: 110 }}>
        <Label>Category</Label>
        <FieldSelect
          value={ingredient.category}
          onChange={(e) => onChange({ ...ingredient, category: e.target.value as IngredientCategory })}
        >
          {INGREDIENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </FieldSelect>
      </FormGroup>

      {/* Dosage */}
      <FormGroup style={{ minWidth: 80, maxWidth: 110 }}>
        <Label>Dosage/pt</Label>
        <DosageInput
          value={ingredient.dosagePerPoint}
          hasError={!!errors[`${path}.dosagePerPoint`]}
          onChange={(v) => onChange({ ...ingredient, dosagePerPoint: v })}
        />
        {errors[`${path}.dosagePerPoint`] && <ErrorText>{errors[`${path}.dosagePerPoint`]}</ErrorText>}
      </FormGroup>

      {/* Unit */}
      <FormGroup style={{ minWidth: 64, maxWidth: 80 }}>
        <Label>Unit</Label>
        <FieldSelect
          value={ingredient.unit}
          onChange={(e) => onChange({ ...ingredient, unit: e.target.value })}
        >
          {INGREDIENT_UNITS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </FieldSelect>
      </FormGroup>

      {/* Delete */}
      <div style={{ paddingTop: 20 }}>
        <DeleteButton type="button" onClick={onDelete} title="Remove ingredient">
          ✕
        </DeleteButton>
      </div>
    </IngredientRow>
  );
}

// ============================================================================
// SUB-COMPONENT: RuleEditor
// ============================================================================

interface RuleEditorProps {
  rule: FertigationRule;
  ruleIndex: number;
  cardIndex: number;
  errors: ValidationErrors;
  onChange: (updated: FertigationRule) => void;
  onDelete: () => void;
}

function RuleEditor({ rule, ruleIndex, cardIndex, errors, onChange, onDelete }: RuleEditorProps) {
  const rp = `cards[${cardIndex}].rules[${ruleIndex}]`;
  // Pending type switch: null = no pending switch
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<'interval' | 'custom' | null>(null);

  const dataToLoseCount = (): number => {
    if (!pendingTypeSwitch) return 0;
    if (pendingTypeSwitch === 'custom') {
      return (rule.ingredients ?? []).length;
    }
    // switching to interval: lose applications
    return (rule.applications ?? []).reduce((acc, app) => acc + app.ingredients.length, 0);
  };

  const handleTypeSelect = (newType: 'interval' | 'custom') => {
    if (newType === rule.type) return;
    // Check if switching would discard data
    const hasIntervalData = (rule.ingredients ?? []).length > 0;
    const hasCustomData = (rule.applications ?? []).length > 0;
    const wouldLoseData =
      (newType === 'custom' && hasIntervalData) ||
      (newType === 'interval' && hasCustomData);

    if (wouldLoseData) {
      setPendingTypeSwitch(newType);
    } else {
      applyTypeSwitch(newType);
    }
  };

  const applyTypeSwitch = (newType: 'interval' | 'custom') => {
    setPendingTypeSwitch(null);
    if (newType === 'interval') {
      onChange({
        ...rule,
        type: 'interval',
        frequencyDays: rule.frequencyDays ?? 1,
        ingredients: [emptyIngredient()],
        applications: undefined,
      });
    } else {
      onChange({
        ...rule,
        type: 'custom',
        applications: [emptyApplication()],
        ingredients: undefined,
        frequencyDays: undefined,
        activeDayStart: undefined,
        activeDayEnd: undefined,
      });
    }
  };

  const updateIngredient = (ii: number, updated: FertigationIngredient) => {
    const ingredients = [...(rule.ingredients ?? [])];
    ingredients[ii] = updated;
    onChange({ ...rule, ingredients });
  };

  const addIngredient = () => {
    onChange({ ...rule, ingredients: [...(rule.ingredients ?? []), emptyIngredient()] });
  };

  const removeIngredient = (ii: number) => {
    const ingredients = (rule.ingredients ?? []).filter((_, i) => i !== ii);
    onChange({ ...rule, ingredients });
  };

  const updateApplication = (ai: number, updated: CustomApplication) => {
    const applications = [...(rule.applications ?? [])];
    applications[ai] = updated;
    onChange({ ...rule, applications });
  };

  const addApplication = () => {
    onChange({ ...rule, applications: [...(rule.applications ?? []), emptyApplication()] });
  };

  const removeApplication = (ai: number) => {
    const applications = (rule.applications ?? []).filter((_, i) => i !== ai);
    onChange({ ...rule, applications });
  };

  const updateAppIngredient = (ai: number, ii: number, updated: FertigationIngredient) => {
    const applications = [...(rule.applications ?? [])];
    const app = { ...applications[ai] };
    const ings = [...app.ingredients];
    ings[ii] = updated;
    app.ingredients = ings;
    applications[ai] = app;
    onChange({ ...rule, applications });
  };

  const addAppIngredient = (ai: number) => {
    const applications = [...(rule.applications ?? [])];
    applications[ai] = { ...applications[ai], ingredients: [...applications[ai].ingredients, emptyIngredient()] };
    onChange({ ...rule, applications });
  };

  const removeAppIngredient = (ai: number, ii: number) => {
    const applications = [...(rule.applications ?? [])];
    applications[ai] = { ...applications[ai], ingredients: applications[ai].ingredients.filter((_, i) => i !== ii) };
    onChange({ ...rule, applications });
  };

  const loseCount = dataToLoseCount();

  return (
    <RuleBlock>
      <RuleBlockHeader>
        <RuleBlockHeaderLeft>
          Rule {ruleIndex + 1}: {rule.name || <em style={{ opacity: 0.5 }}>unnamed</em>}
        </RuleBlockHeaderLeft>
        <DeleteButton type="button" onClick={onDelete}>Remove rule</DeleteButton>
      </RuleBlockHeader>

      <RuleBlockBody>
        {/* Name + Type row */}
        <FieldRow>
          <FormGroup style={{ flex: 2 }}>
            <Label htmlFor={`${rp}.name`}>Rule Name *</Label>
            <FieldInput
              id={`${rp}.name`}
              type="text"
              $hasError={!!errors[`${rp}.name`]}
              value={rule.name}
              onChange={(e) => onChange({ ...rule, name: e.target.value })}
              placeholder="e.g., NPK Fertigation"
              maxLength={100}
            />
            {errors[`${rp}.name`] && <ErrorText>{errors[`${rp}.name`]}</ErrorText>}
          </FormGroup>

          <FormGroup style={{ flex: 1, minWidth: 130 }}>
            <Label>Type *</Label>
            <FieldSelect
              value={rule.type}
              onChange={(e) => handleTypeSelect(e.target.value as 'interval' | 'custom')}
            >
              <option value="interval">Interval</option>
              <option value="custom">Custom</option>
            </FieldSelect>
          </FormGroup>
        </FieldRow>

        {/* Type-switch warning */}
        {pendingTypeSwitch && (
          <TypeSwitchWarning>
            <span>
              Switching this rule to <strong>{pendingTypeSwitch}</strong> will discard{' '}
              {loseCount} {pendingTypeSwitch === 'custom' ? 'interval ingredient' : 'application'}
              {loseCount === 1 ? '' : 's'} on this rule. Other rules in this card are not affected.
              Continue?
            </span>
            <WarnConfirmButton type="button" onClick={() => applyTypeSwitch(pendingTypeSwitch)}>
              Yes, switch
            </WarnConfirmButton>
            <TextLinkButton type="button" style={{ color: '#B8842A', fontSize: 12, textDecoration: 'none' }} onClick={() => setPendingTypeSwitch(null)}>
              Cancel
            </TextLinkButton>
          </TypeSwitchWarning>
        )}

        {/* Interval-specific fields */}
        {rule.type === 'interval' && (
          <>
            <FieldRow>
              <FormGroup style={{ minWidth: 110, maxWidth: 160 }}>
                <Label htmlFor={`${rp}.frequencyDays`}>Frequency (days) *</Label>
                <FieldInput
                  id={`${rp}.frequencyDays`}
                  type="number"
                  min="1"
                  step="1"
                  $hasError={!!errors[`${rp}.frequencyDays`]}
                  value={rule.frequencyDays ?? ''}
                  onChange={(e) => onChange({ ...rule, frequencyDays: parsePosInt(e.target.value) ?? 1 })}
                />
                {errors[`${rp}.frequencyDays`] && <ErrorText>{errors[`${rp}.frequencyDays`]}</ErrorText>}
              </FormGroup>

              <FormGroup style={{ minWidth: 100, maxWidth: 150 }}>
                <Label htmlFor={`${rp}.activeDayStart`}>Active from (day)</Label>
                <FieldInput
                  id={`${rp}.activeDayStart`}
                  type="number"
                  min="0"
                  step="1"
                  value={rule.activeDayStart ?? ''}
                  onChange={(e) => {
                    const v = parseNonNegInt(e.target.value);
                    onChange({ ...rule, activeDayStart: v });
                  }}
                  placeholder="optional"
                />
              </FormGroup>

              <FormGroup style={{ minWidth: 100, maxWidth: 150 }}>
                <Label htmlFor={`${rp}.activeDayEnd`}>Active to (day)</Label>
                <FieldInput
                  id={`${rp}.activeDayEnd`}
                  type="number"
                  min="0"
                  step="1"
                  $hasError={!!errors[`${rp}.activeDayEnd`]}
                  value={rule.activeDayEnd ?? ''}
                  onChange={(e) => {
                    const v = parseNonNegInt(e.target.value);
                    onChange({ ...rule, activeDayEnd: v });
                  }}
                  placeholder="optional"
                />
                {errors[`${rp}.activeDayEnd`] && <ErrorText>{errors[`${rp}.activeDayEnd`]}</ErrorText>}
              </FormGroup>
            </FieldRow>

            {/* Ingredients for interval */}
            <div>
              <Label>Ingredients</Label>
              <IngredientsTable style={{ marginTop: 6 }}>
                {(rule.ingredients ?? []).map((ing, ii) => (
                  <IngredientEditor
                    key={ii}
                    ingredient={ing}
                    path={`${rp}.ingredients[${ii}]`}
                    errors={errors}
                    onChange={(updated) => updateIngredient(ii, updated)}
                    onDelete={() => removeIngredient(ii)}
                  />
                ))}
              </IngredientsTable>
              <AddButton type="button" onClick={addIngredient} style={{ marginTop: 6 }}>
                + Add Ingredient
              </AddButton>
            </div>
          </>
        )}

        {/* Custom-specific fields: applications */}
        {rule.type === 'custom' && (
          <div>
            <Label>Applications</Label>
            <div style={{ marginTop: 6 }}>
              {(rule.applications ?? []).map((app, ai) => {
                const ap = `${rp}.applications[${ai}]`;
                return (
                  <ApplicationBlock key={ai}>
                    <ApplicationHeader>
                      <span style={{ flex: 1 }}>Application {ai + 1} — Day</span>
                      <FieldInput
                        type="number"
                        min="0"
                        step="1"
                        $hasError={!!errors[`${ap}.day`]}
                        value={app.day}
                        onChange={(e) => updateApplication(ai, { ...app, day: parseNonNegInt(e.target.value) ?? 0 })}
                        style={{ width: 70, marginLeft: 4 }}
                      />
                      <DeleteButton type="button" onClick={() => removeApplication(ai)}>
                        Remove
                      </DeleteButton>
                    </ApplicationHeader>
                    {errors[`${ap}.day`] && (
                      <div style={{ padding: '2px 12px' }}>
                        <ErrorText>{errors[`${ap}.day`]}</ErrorText>
                      </div>
                    )}
                    <ApplicationBody>
                      <IngredientsTable>
                        {app.ingredients.map((ing, ii) => (
                          <IngredientEditor
                            key={ii}
                            ingredient={ing}
                            path={`${ap}.ingredients[${ii}]`}
                            errors={errors}
                            onChange={(updated) => updateAppIngredient(ai, ii, updated)}
                            onDelete={() => removeAppIngredient(ai, ii)}
                          />
                        ))}
                      </IngredientsTable>
                      <AddButton type="button" onClick={() => addAppIngredient(ai)}>
                        + Add Ingredient
                      </AddButton>
                      {/* Application notes */}
                      <FormGroup>
                        <Label>Notes (optional)</Label>
                        <FieldInput
                          type="text"
                          value={app.notes ?? ''}
                          onChange={(e) => updateApplication(ai, { ...app, notes: e.target.value })}
                          placeholder="Optional application notes"
                        />
                      </FormGroup>
                    </ApplicationBody>
                  </ApplicationBlock>
                );
              })}
            </div>
            <AddButton type="button" onClick={addApplication}>
              + Add Application
            </AddButton>
          </div>
        )}
      </RuleBlockBody>
    </RuleBlock>
  );
}

// ============================================================================
// SUB-COMPONENT: CardEditor
// ============================================================================

interface CardEditorProps {
  card: FertigationCard;
  cardIndex: number;
  totalCards: number;
  errors: ValidationErrors;
  onChange: (updated: FertigationCard) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function CardEditor({
  card,
  cardIndex,
  totalCards,
  errors,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: CardEditorProps) {
  const cp = `cards[${cardIndex}]`;

  const updateRule = (ri: number, updated: FertigationRule) => {
    const rules = [...card.rules];
    rules[ri] = updated;
    onChange({ ...card, rules });
  };

  const addRule = () => {
    onChange({ ...card, rules: [...card.rules, emptyRule()] });
  };

  const removeRule = (ri: number) => {
    onChange({ ...card, rules: card.rules.filter((_, i) => i !== ri) });
  };

  const cardLabel = card.cardName.trim() || `Card ${cardIndex + 1}`;
  const dayRangeLabel =
    card.dayStart != null && card.dayEnd != null ? `Day ${card.dayStart}–${card.dayEnd}` : '';

  return (
    <CardBlock>
      <CardBlockHeader>
        <CardBlockHeaderLeft>
          {cardLabel}
          {dayRangeLabel && (
            <span style={{ fontSize: 12, fontWeight: 400, color: '#4B4844', marginLeft: 8 }}>
              {dayRangeLabel}
            </span>
          )}
          {!card.isActive && (
            <span
              style={{
                fontSize: 11,
                background: 'rgba(158,42,42,0.08)',
                color: '#9E2A2A',
                borderRadius: 4,
                padding: '2px 6px',
                marginLeft: 8,
              }}
            >
              Inactive
            </span>
          )}
        </CardBlockHeaderLeft>
        {/* Move up / down */}
        <MoveButton type="button" onClick={onMoveUp} disabled={cardIndex === 0} title="Move up">
          ↑
        </MoveButton>
        <MoveButton type="button" onClick={onMoveDown} disabled={cardIndex === totalCards - 1} title="Move down">
          ↓
        </MoveButton>
        <DeleteButton type="button" onClick={onDelete}>
          Delete card
        </DeleteButton>
      </CardBlockHeader>

      <CardBlockBody>
        {/* Card name + growth stage */}
        <FieldRow>
          <FormGroup style={{ flex: 2 }}>
            <Label htmlFor={`${cp}.cardName`}>Card Name *</Label>
            <FieldInput
              id={`${cp}.cardName`}
              type="text"
              $hasError={!!errors[`${cp}.cardName`]}
              value={card.cardName}
              onChange={(e) => onChange({ ...card, cardName: e.target.value })}
              placeholder="e.g., Vegetative Stage"
              maxLength={100}
            />
            {errors[`${cp}.cardName`] && <ErrorText>{errors[`${cp}.cardName`]}</ErrorText>}
          </FormGroup>

          <FormGroup style={{ flex: 1, minWidth: 130 }}>
            <Label htmlFor={`${cp}.growthStage`}>Growth Stage *</Label>
            <FieldInput
              id={`${cp}.growthStage`}
              type="text"
              $hasError={!!errors[`${cp}.growthStage`]}
              value={card.growthStage}
              onChange={(e) => onChange({ ...card, growthStage: e.target.value })}
              placeholder="e.g., vegetative"
            />
            {errors[`${cp}.growthStage`] && <ErrorText>{errors[`${cp}.growthStage`]}</ErrorText>}
          </FormGroup>
        </FieldRow>

        {/* Day range + isActive */}
        <FieldRow>
          <FormGroup style={{ minWidth: 90, maxWidth: 130 }}>
            <Label htmlFor={`${cp}.dayStart`}>Day Start *</Label>
            <FieldInput
              id={`${cp}.dayStart`}
              type="number"
              min="0"
              step="1"
              $hasError={!!errors[`${cp}.dayStart`]}
              value={card.dayStart}
              onChange={(e) => onChange({ ...card, dayStart: parseNonNegInt(e.target.value) ?? 0 })}
            />
            {errors[`${cp}.dayStart`] && <ErrorText>{errors[`${cp}.dayStart`]}</ErrorText>}
          </FormGroup>

          <FormGroup style={{ minWidth: 90, maxWidth: 130 }}>
            <Label htmlFor={`${cp}.dayEnd`}>Day End *</Label>
            <FieldInput
              id={`${cp}.dayEnd`}
              type="number"
              min="0"
              step="1"
              $hasError={!!errors[`${cp}.dayEnd`]}
              value={card.dayEnd}
              onChange={(e) => onChange({ ...card, dayEnd: parseNonNegInt(e.target.value) ?? 0 })}
            />
            {errors[`${cp}.dayEnd`] && <ErrorText>{errors[`${cp}.dayEnd`]}</ErrorText>}
          </FormGroup>

          <FormGroup style={{ minWidth: 90 }}>
            <Label>Active</Label>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 8 }}
            >
              <input
                type="checkbox"
                checked={card.isActive}
                onChange={(e) => onChange({ ...card, isActive: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13 }}>{card.isActive ? 'Yes' : 'No'}</span>
            </label>
          </FormGroup>
        </FieldRow>

        {/* Card notes */}
        <FormGroup>
          <Label htmlFor={`${cp}.notes`}>Notes (optional)</Label>
          <FieldTextArea
            id={`${cp}.notes`}
            value={card.notes ?? ''}
            onChange={(e) => onChange({ ...card, notes: e.target.value })}
            placeholder="Optional notes about this growth stage..."
          />
        </FormGroup>

        {/* Rules */}
        <Section>
          <SectionLabel>Rules ({card.rules.length})</SectionLabel>
          {card.rules.map((rule, ri) => (
            <RuleEditor
              key={ri}
              rule={rule}
              ruleIndex={ri}
              cardIndex={cardIndex}
              errors={errors}
              onChange={(updated) => updateRule(ri, updated)}
              onDelete={() => removeRule(ri)}
            />
          ))}
          <AddButton type="button" onClick={addRule}>
            + Add Rule
          </AddButton>
        </Section>
      </CardBlockBody>
    </CardBlock>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FertigationScheduleEditorModal({
  plantDataId,
  plantName,
  initialSchedule,
  onClose,
  onSaved,
}: FertigationScheduleEditorModalProps) {
  const [draft, setDraft] = useState<FertigationSchedule>(() =>
    initialSchedule ? structuredClone(initialSchedule) : emptySchedule()
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Compute validation errors live — memoized so only re-runs when draft changes.
  const errors = useMemo(() => validateSchedule(draft), [draft]);
  const isValid = Object.keys(errors).length === 0;

  // Auto-derived cycle length
  const cycleDays = useMemo(
    () => (draft.cards.length > 0 ? Math.max(0, ...draft.cards.map((c) => c.dayEnd)) : 0),
    [draft.cards]
  );

  const updateCard = useCallback((ci: number, updated: FertigationCard) => {
    setDraft((d) => {
      const cards = [...d.cards];
      cards[ci] = updated;
      return { ...d, cards };
    });
  }, []);

  const addCard = useCallback(() => {
    setDraft((d) => ({ ...d, cards: [...d.cards, emptyCard()] }));
  }, []);

  const removeCard = useCallback((ci: number) => {
    setDraft((d) => ({ ...d, cards: d.cards.filter((_, i) => i !== ci) }));
  }, []);

  const moveCard = useCallback((ci: number, direction: 'up' | 'down') => {
    setDraft((d) => {
      const cards = [...d.cards];
      const targetIndex = direction === 'up' ? ci - 1 : ci + 1;
      if (targetIndex < 0 || targetIndex >= cards.length) return d;
      [cards[ci], cards[targetIndex]] = [cards[targetIndex], cards[ci]];
      return { ...d, cards };
    });
  }, []);

  const handleSave = async () => {
    if (!isValid || saving) return;

    const finalSchedule: FertigationSchedule = {
      ...draft,
      totalFertilizationDays: cycleDays,
    };

    setSaving(true);
    setSaveError(null);

    try {
      await updatePlantDataEnhanced(plantDataId, { fertigationSchedule: finalSchedule });
      showSuccessToast('Fertigation schedule saved successfully.');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string; message?: string } } };
      const msg =
        axiosErr.response?.data?.detail ||
        axiosErr.response?.data?.message ||
        'Failed to save fertigation schedule. Please try again.';
      setSaveError(typeof msg === 'string' ? msg : 'Failed to save fertigation schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay>
      {/* Overlay click intentionally NOT wired to onClose — per UX memory rule */}
      <ModalBox role="dialog" aria-modal="true" aria-label={`Edit fertigation schedule for ${plantName}`}>
        <ModalHeader>
          <ModalHeaderContent>
            <ModalTitle>Edit Fertigation Schedule</ModalTitle>
            <ModalSubtitle>{plantName}</ModalSubtitle>
            <CycleLengthDisplay>
              Cycle length: {cycleDays} day{cycleDays !== 1 ? 's' : ''} (auto-derived)
            </CycleLengthDisplay>
          </ModalHeaderContent>
          <CloseButton
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close editor"
          >
            ✕
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          {/* Source field */}
          <SourceRow>
            <FormGroup style={{ maxWidth: 480 }}>
              <Label htmlFor="fertigation-source">Source / Provenance (optional)</Label>
              <FieldInput
                id="fertigation-source"
                type="text"
                value={draft.source}
                onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                placeholder="e.g., Agronomist Tayeb — UAE trials 2025"
              />
            </FormGroup>
          </SourceRow>

          {/* Cards */}
          {draft.cards.length === 0 && (
            <EmptyState>
              No fertigation cards yet. Add your first card below.
            </EmptyState>
          )}

          {draft.cards.map((card, ci) => (
            <CardEditor
              key={ci}
              card={card}
              cardIndex={ci}
              totalCards={draft.cards.length}
              errors={errors}
              onChange={(updated) => updateCard(ci, updated)}
              onDelete={() => removeCard(ci)}
              onMoveUp={() => moveCard(ci, 'up')}
              onMoveDown={() => moveCard(ci, 'down')}
            />
          ))}

          <AddButton type="button" onClick={addCard}>
            + Add Card
          </AddButton>
        </ModalBody>

        <ModalFooter>
          <div>
            {saveError && (
              <span style={{ fontSize: 13, color: '#9E2A2A' }}>{saveError}</span>
            )}
            {!isValid && (
              <span style={{ fontSize: 12, color: '#4B4844' }}>
                Fix validation errors above before saving.
              </span>
            )}
          </div>
          <FooterActions>
            <SecondaryButton type="button" onClick={onClose} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={handleSave}
              disabled={!isValid || saving}
            >
              {saving ? 'Saving...' : 'Save Schedule'}
            </PrimaryButton>
          </FooterActions>
        </ModalFooter>
      </ModalBox>
    </Overlay>
  );
}
