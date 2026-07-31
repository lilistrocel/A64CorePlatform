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
import styled, { useTheme } from 'styled-components';
import { X } from 'lucide-react';
import { glassPanel, glassControl, glassOpaque, monoLabel } from '@a64core/shared';
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
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
`;

// Night Observatory modal recipe (spec §4 "Modals/drawers"): glassPanel at
// blur 24px, 20px radius. Modal still closes only via the X button, never on
// backdrop click — unchanged behaviour.
const ModalBox = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 860px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

// Sticky-feeling header sits inside the glass shell — glass.opaque so it
// reads cleanly against the modal body's own translucency without stacking a
// second blurred glass layer.
const ModalHeader = styled.div`
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-shrink: 0;
`;

const ModalHeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ModalSubtitle = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
`;

// Numeric readout (spec §4 "Space Mono... numeric readouts") — the
// auto-derived cycle length.
const CycleLengthDisplay = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  transition: all 150ms ease-in-out;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(180, 200, 220, 0.07);
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const FieldInput = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  width: 100%;
  box-sizing: border-box;
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:read-only {
    opacity: 0.75;
    cursor: default;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FieldSelect = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const FieldTextArea = styled.textarea<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 60px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  width: 100%;
  box-sizing: border-box;
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }
`;

const ErrorText = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.error};
  line-height: 1.3;
`;

const FieldRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

// Buttons ─────────────────────────────────────────────────────────────────────

// Buttons (spec §4): Primary = gold gradient + onAccent (cosmos) text, 700
// weight — this is the modal's ONE primary CTA (Save Schedule). The inline
// "Add Chemical" action uses a separate emerald-tinted InlineConfirmButton
// (see below) so it doesn't compete with Save Schedule for the gold budget.
const PrimaryButton = styled.button`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Ghost variant (ubiquitous "+ Add X" repeat actions) — never gold, celeste
// emphasis per spec §3.
const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px dashed ${({ theme }) => theme.colors.glass.border};

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.celeste};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Destructive variant — coral-tinted glass, never solid red (spec §4).
const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: rgba(240, 138, 112, 0.1);
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid rgba(240, 138, 112, 0.35);
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.errorBg};
    border-color: ${({ theme }) => theme.colors.error};
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
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const TextLinkButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
  text-align: left;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[300]};
  }
`;

// Emerald-tinted confirm action for the inline "add to catalog" flow —
// deliberately not gold (see PrimaryButton note above).
const InlineConfirmButton = styled.button`
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: rgba(84, 211, 155, 0.14);
  color: ${({ theme }) => theme.colors.bright.emerald};
  border: 1px solid rgba(84, 211, 155, 0.4);

  &:hover:not(:disabled) {
    background: rgba(84, 211, 155, 0.22);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
  ${monoLabel}
  font-size: 0.72rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
`;

// Nested card/rule/application/ingredient blocks stay one glass layer deep
// (the modal shell is layer 1) — per spec §2's two-layer limit, they use a
// plain line border with no blurred fill rather than another glassPanel.
const CardBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 12px;
`;

const CardBlockHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const CardBlockHeaderLeft = styled.div`
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
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
`;

const RuleBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  overflow: hidden;
  background: rgba(180, 200, 220, 0.03);
`;

const RuleBlockHeader = styled.div`
  padding: 10px 14px;
  background: rgba(180, 200, 220, 0.05);
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const RuleBlockHeaderLeft = styled.div`
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  background: rgba(180, 200, 220, 0.03);
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const ApplicationBlock = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
`;

const ApplicationHeader = styled.div`
  padding: 8px 12px;
  background: rgba(180, 200, 220, 0.05);
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.warning};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const WarnConfirmButton = styled.button`
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.gold[600]};
  }
`;

// Inline "add chemical" form ──────────────────────────────────────────────────

const InlineChemForm = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid rgba(84, 211, 155, 0.4);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
`;

const InlineChemFormTitle = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.emerald};
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

// Combobox popup (spec §4/§9): glassOpaque, not another glassPanel.
const TypeaheadDropdown = styled.ul`
  ${glassOpaque}
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 100;
  border-radius: 10px;
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
  color: ${({ theme }) => theme.colors.textPrimary};

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const LockedNameRow = styled.div`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  padding: 8px 12px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 32px 16px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  border: 2px dashed ${({ theme }) => theme.colors.glass.border};
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
  const theme = useTheme();
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
                      <span style={{ fontSize: 11, color: theme.colors.textDisabled, marginLeft: 6 }}>
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
              <InlineConfirmButton
                type="button"
                disabled={createChemical.isPending || !newChemForm.name.trim()}
                onClick={handleCreateChemical}
              >
                {createChemical.isPending ? 'Adding...' : 'Add Chemical'}
              </InlineConfirmButton>
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
          <X size={13} strokeWidth={1.8} />
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
  const theme = useTheme();
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
            <TextLinkButton type="button" style={{ color: theme.colors.warning, fontSize: 12, textDecoration: 'none' }} onClick={() => setPendingTypeSwitch(null)}>
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
  const theme = useTheme();
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
            <span style={{ fontSize: 12, fontWeight: 400, color: theme.colors.textSecondary, marginLeft: 8 }}>
              {dayRangeLabel}
            </span>
          )}
          {!card.isActive && (
            <span
              style={{
                fontSize: 11,
                background: theme.colors.errorBg,
                color: theme.colors.error,
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
                style={{ width: 16, height: 16, accentColor: theme.colors.secondary[500] }}
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
  const theme = useTheme();
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
            <X size={18} strokeWidth={1.8} />
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
              <span style={{ fontSize: 13, color: theme.colors.error }}>{saveError}</span>
            )}
            {!isValid && (
              <span style={{ fontSize: 12, color: theme.colors.textDisabled }}>
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
