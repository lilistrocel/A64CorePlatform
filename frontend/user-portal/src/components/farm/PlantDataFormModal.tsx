/**
 * PlantDataFormModal Component
 *
 * Unified modal for creating and editing plant data entries.
 * Pass `plantData` to enter edit mode; omit it (or pass null) for create mode.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { X, ChevronDown } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { plantDataEnhancedApi } from '../../services/plantDataEnhancedApi';
import { createVarietyForMother } from '../../services/plantMotherApi';
import { getSpacingCategories } from '../../services/farmApi';
import { positiveIntegerInputProps } from '../../utils';
import type {
  PlantDataEnhanced,
  PlantDataEnhancedCreate,
  PlantDataEnhancedUpdate,
  PlantTypeEnum,
  FarmTypeCompatibility,
  SpacingCategory,
  SpacingCategoryInfo,
  VarietyCreateForMother,
} from '../../types/farm';
import { SPACING_CATEGORY_LABELS } from '../../types/farm';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createSchema = z.object({
  plantName: z.string().min(1, 'Plant name is required').max(100, 'Name too long'),
  scientificName: z.string().optional(),
  plantType: z.enum(['crop', 'tree', 'herb', 'fruit', 'vegetable', 'ornamental', 'medicinal']),
  // Variety mode only (see varietyCreateSchema below) — undeclared here means
  // "not applicable" for a standalone plant, but the field must still parse.
  varietyName: z.string().optional(),
  farmTypeCompatibility: z.array(z.string()).min(1, 'Select at least one farm type'),
  tags: z.string().optional(),
  spacingCategory: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(['xs', 's', 'm', 'l', 'xl', 'bush', 'large_bush', 'small_tree', 'medium_tree', 'large_tree']).optional(),
  ),

  germinationDays: z.number().nonnegative('Cannot be negative').optional(),
  vegetativeDays: z.number().nonnegative('Cannot be negative').optional(),
  floweringDays: z.number().nonnegative('Cannot be negative').optional(),
  fruitingDays: z.number().nonnegative('Cannot be negative').optional(),
  harvestDurationDays: z.number().nonnegative('Cannot be negative').optional(),
  totalCycleDays: z.number().min(1, 'Total cycle must be at least 1 day'),

  yieldPerPlant: z.number().min(0.01, 'Yield must be greater than 0'),
  yieldUnit: z.string().min(1, 'Yield unit is required'),
  expectedWastePercent: z.number().nonnegative('Cannot be negative').max(100, 'Cannot exceed 100%').optional(),
  seedsPerPlantingPoint: z.number().int('Must be a whole number').min(1, 'Must be at least 1').optional(),

  temperatureMin: z.number().optional(),
  temperatureOptimal: z.number().optional(),
  temperatureMax: z.number().optional(),
  humidityMin: z.number().nonnegative().max(100).optional(),
  humidityOptimal: z.number().nonnegative().max(100).optional(),
  humidityMax: z.number().nonnegative().max(100).optional(),

  wateringFrequencyDays: z.number().min(1, 'Must be at least 1 day').optional(),
  waterAmountPerPlant: z.number().nonnegative().optional(),
  waterAmountUnit: z.string().optional(),

  phMin: z.number().nonnegative('pH min must be 0-14').max(14, 'pH max is 14').optional(),
  phOptimal: z.number().nonnegative('pH optimal must be 0-14').max(14, 'pH max is 14').optional(),
  phMax: z.number().nonnegative('pH max must be 0-14').max(14, 'pH max is 14').optional(),

  dailyLightHoursMin: z.number().nonnegative().max(24).optional(),
  dailyLightHoursOptimal: z.number().nonnegative().max(24).optional(),
  dailyLightHoursMax: z.number().nonnegative().max(24).optional(),

  averageMarketValuePerKg: z.number().nonnegative().optional(),
  currency: z.string().optional(),

  customPlantsPer100m2: z.number().int('Must be a whole number').positive('Must be positive').optional(),
  notes: z.string().optional(),

  isActive: z.boolean().optional(),
});

// Variety-creation mode (POST /plant-mothers/{id}/varieties): basic info is
// inherited from the mother and hidden from the form, so it's optional here
// (the fields aren't sent); varietyName becomes the required identifier instead.
const varietyCreateSchema = createSchema.extend({
  plantName: z.string().optional(),
  scientificName: z.string().optional(),
  plantType: z.enum(['crop', 'tree', 'herb', 'fruit', 'vegetable', 'ornamental', 'medicinal']).optional(),
  varietyName: z.string().min(1, 'Variety name is required').max(200, 'Name too long'),
});

const updateSchema = z.object({
  plantName: z.string().min(1, 'Plant name is required').max(100, 'Name too long').optional(),
  scientificName: z.string().optional(),
  plantType: z.enum(['crop', 'tree', 'herb', 'fruit', 'vegetable', 'ornamental', 'medicinal']).optional(),
  // Variety's own display name — editable on a variety, ignored otherwise.
  varietyName: z.string().optional(),
  farmTypeCompatibility: z.array(z.string()).min(1, 'Select at least one farm type').optional(),
  tags: z.string().optional(),
  spacingCategory: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(['xs', 's', 'm', 'l', 'xl', 'bush', 'large_bush', 'small_tree', 'medium_tree', 'large_tree']).optional(),
  ),

  germinationDays: z.number().nonnegative('Cannot be negative').optional(),
  vegetativeDays: z.number().nonnegative('Cannot be negative').optional(),
  floweringDays: z.number().nonnegative('Cannot be negative').optional(),
  fruitingDays: z.number().nonnegative('Cannot be negative').optional(),
  harvestDurationDays: z.number().nonnegative('Cannot be negative').optional(),
  totalCycleDays: z.number().min(1, 'Total cycle must be at least 1 day').optional(),

  yieldPerPlant: z.number().min(0.01, 'Yield must be greater than 0').optional(),
  yieldUnit: z.string().min(1, 'Yield unit is required').optional(),
  expectedWastePercent: z.number().nonnegative('Cannot be negative').max(100, 'Cannot exceed 100%').optional(),
  seedsPerPlantingPoint: z.number().int('Must be a whole number').min(1, 'Must be at least 1').optional(),

  temperatureMin: z.number().optional(),
  temperatureOptimal: z.number().optional(),
  temperatureMax: z.number().optional(),
  humidityMin: z.number().nonnegative().max(100).optional(),
  humidityOptimal: z.number().nonnegative().max(100).optional(),
  humidityMax: z.number().nonnegative().max(100).optional(),

  wateringFrequencyDays: z.number().min(1, 'Must be at least 1 day').optional(),
  waterAmountPerPlant: z.number().nonnegative().optional(),
  waterAmountUnit: z.string().optional(),

  phMin: z.number().nonnegative('pH min must be 0-14').max(14, 'pH max is 14').optional(),
  phOptimal: z.number().nonnegative('pH optimal must be 0-14').max(14, 'pH max is 14').optional(),
  phMax: z.number().nonnegative('pH max must be 0-14').max(14, 'pH max is 14').optional(),

  dailyLightHoursMin: z.number().nonnegative().max(24).optional(),
  dailyLightHoursOptimal: z.number().nonnegative().max(24).optional(),
  dailyLightHoursMax: z.number().nonnegative().max(24).optional(),

  averageMarketValuePerKg: z.number().nonnegative().optional(),
  currency: z.string().optional(),

  customPlantsPer100m2: z.number().int('Must be a whole number').positive('Must be positive').optional(),
  notes: z.string().optional(),

  isActive: z.boolean().optional(),
});

type PlantDataFormData = z.infer<typeof updateSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/** Mother context passed when creating a new variety under a mother (Plant Library Phase 3). */
export interface PlantDataFormModalMotherContext {
  plantMotherId: string;
  plantName: string;
  scientificName?: string;
  plantType: PlantTypeEnum;
}

export interface PlantDataFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  plantData?: PlantDataEnhanced | null;
  /**
   * Variety-creation mode: pass the mother this new variety belongs to.
   * Basic info (plantName/scientificName/plantType) is hidden and inherited
   * from the mother; a required varietyName field is shown instead. Ignored
   * when `plantData` is also passed (edit mode takes precedence).
   */
  motherContext?: PlantDataFormModalMotherContext | null;
  /**
   * Duplicate-variety mode: pass the source variety to clone. Only applied
   * when in variety-CREATE mode (motherContext set, plantData not). Seeds
   * every detailed cultivation field from the source (same fields edit mode
   * loads), except identity fields (plantDataId/motherPlantId — this creates
   * a NEW variety) and varietyName, which defaults to "Copy of {source}"
   * instead of being copied verbatim. Submit still goes through the CREATE
   * path (createVarietyForMother) — the source record is never touched.
   */
  duplicateFromVariety?: PlantDataEnhanced | null;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

// Night Observatory modal recipe (spec §4 "Modals/drawers"): glassPanel at
// blur 24px, 20px radius. Modal still closes only via the X button, never on
// backdrop click — unchanged behaviour.
const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

// Sticky header — glass.opaque (not the translucent glass tokens) so scrolled
// form content doesn't show through underneath it while it stays pinned.
const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: sticky;
  top: 0;
  background: ${({ theme }) => theme.colors.glass.opaque};
  z-index: 10;
`;

const ModalHeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const VersionBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  width: fit-content;
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

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ModalBody = styled.div`
  padding: 24px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

// Short gold underline on section headers — one of the spec's explicitly
// authorised gold uses (§3). "Short" = a fixed-width accent under the text,
// not a full-width fill.
const SectionTitle = styled.h3`
  position: relative;
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  padding-bottom: 8px;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    width: 28px;
    height: 2px;
    border-radius: 2px;
    background: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const RequiredBadge = styled.span`
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 9999px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid rgba(240, 138, 112, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const OptionalBadge = styled.span`
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 9999px;
  background: rgba(180, 200, 220, 0.12);
  color: ${({ theme }) => theme.colors.muted};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:read-only:not(:disabled) {
    opacity: 0.75;
    cursor: default;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TextArea = styled.textarea<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => $hasError && theme.colors.error};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

const HelpText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Read-only "inherited from mother" context banner shown in place of the
// plantName/scientificName/plantType inputs when this form is creating or
// editing a VARIETY (Plant Library Phase 3) rather than a standalone plant.
const MotherContextBanner = styled.div`
  ${glassControl}
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
`;

const MotherContextLabel = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const MotherContextName = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const MotherContextMeta = styled.span`
  font-size: 13px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
`;

const GridRow = styled.div<{ $columns?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns || 2}, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CheckboxGrid = styled.div`
  ${glassControl}
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 12px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

// Checkbox/radio pattern (spec §4): celeste border unchecked, gold-hi
// checked. Native checkboxes cannot have their unchecked border restyled
// without a full appearance:none rebuild, so unchecked state relies on the
// browser default; accent-color drives the checked fill/tick colour —
// the same technique already established in BackupCodesModal.tsx.
const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const CheckboxText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ExpandButton = styled.button<{ $expanded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ExpandChevron = styled.span<{ $expanded: boolean }>`
  display: flex;
  transition: transform 150ms ease;
  transform: rotate(${({ $expanded }) => ($expanded ? '180deg' : '0deg')});
`;

const StatusToggle = styled.div`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
`;

const StatusLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Toggle/switch pattern (spec §4): glass track, active fill = bright.emerald
// (already the "success" token — no change needed there). The knob sits on
// top of both track states and must stay legible against a dark glass track
// as well as the emerald fill, so it uses onDark (cream), not onAccent —
// onAccent now means "dark text for a gold fill" and this knob is neither.
const StatusSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + span {
      background-color: ${({ theme }) => theme.colors.success};
      border-color: ${({ theme }) => theme.colors.success};
    }

    &:checked + span:before {
      transform: translateX(24px);
    }
  }

  span {
    position: absolute;
    box-sizing: border-box;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({ theme }) => theme.colors.glass.base};
    border: 1px solid ${({ theme }) => theme.colors.glass.border};
    transition: 0.3s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: '';
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 2px;
      background-color: ${({ theme }) => theme.colors.onDark};
      transition: 0.3s;
      border-radius: 50%;
    }
  }
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  position: sticky;
  bottom: 0;
  background: ${({ theme }) => theme.colors.glass.opaque};
`;

const SuccessMessage = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.success};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 12px;
`;

// Buttons (spec §4): Primary = gold gradient + onAccent (cosmos) text, 700
// weight — this is the modal's ONE primary CTA (Update/Create Plant Data).
// Secondary = glass + glass.border + cream text.
const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[300]}, ${theme.colors.secondary[500]});
        color: ${theme.colors.onAccent};
        font-weight: 700;
        &:hover:not(:disabled) {
          filter: brightness(1.05);
        }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover:not(:disabled) {
        background: ${theme.colors.glass.hi};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

// ============================================================================
// DENSITY CHOOSER TYPES
// ============================================================================

type DensityMode = 'none' | 'category' | 'custom';
type DensityUnit = 'per100m2' | 'perm2';

// ============================================================================
// DENSITY CHOOSER STYLED COMPONENTS
// ============================================================================

const DensityCustomRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

// Tab pattern (spec §4/§5): this is a two-way segmented toggle, styled like
// the app's tab bars — glass container, active tab marked with a short gold
// underline rather than a filled gold background, inactive = muted text,
// hover = cream text. Keeps gold off a filled control surface.
const DensityUnitToggle = styled.div`
  ${glassControl}
  display: flex;
  overflow: hidden;
  flex-shrink: 0;
`;

const DensityUnitButton = styled.button<{ $active: boolean }>`
  padding: 12px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  border-bottom-color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : 'transparent')};

  &:hover:not([disabled]) {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(180, 200, 220, 0.07);
  }
`;

// ============================================================================
// SHARED PREFILL HELPERS (edit mode + duplicate-variety mode both load a
// source PlantDataEnhanced's detailed cultivation fields into the form —
// kept as one mapping so the two modes can never drift apart)
// ============================================================================

/**
 * Every detailed cultivation field the form manages, read off a source
 * record. Deliberately excludes identity/basic-info fields (plantName,
 * scientificName, plantType, varietyName, isActive) — callers decide those
 * per mode (edit copies them verbatim; duplicate derives a new varietyName
 * and never touches identity).
 */
function detailFieldsFromSource(
  source: PlantDataEnhanced,
): Omit<PlantDataFormData, 'plantName' | 'scientificName' | 'plantType' | 'varietyName' | 'isActive'> {
  return {
    farmTypeCompatibility: source.farmTypeCompatibility || [],
    tags: source.tags?.join(', ') || '',
    spacingCategory: source.spacingCategory || undefined,

    germinationDays: source.growthCycle?.germinationDays ?? undefined,
    vegetativeDays: source.growthCycle?.vegetativeDays ?? undefined,
    floweringDays: source.growthCycle?.floweringDays ?? undefined,
    fruitingDays: source.growthCycle?.fruitingDays ?? undefined,
    harvestDurationDays: source.growthCycle?.harvestDurationDays ?? undefined,
    totalCycleDays: source.growthCycle?.totalCycleDays ?? undefined,

    yieldPerPlant: source.yieldInfo?.yieldPerPlant ?? undefined,
    yieldUnit: source.yieldInfo?.yieldUnit || '',
    expectedWastePercent: source.yieldInfo?.expectedWastePercentage ?? undefined,
    seedsPerPlantingPoint: source.yieldInfo?.seedsPerPlantingPoint ?? undefined,

    temperatureMin: source.environmentalRequirements?.temperatureMin ?? undefined,
    temperatureOptimal: source.environmentalRequirements?.temperatureOptimal ?? undefined,
    temperatureMax: source.environmentalRequirements?.temperatureMax ?? undefined,
    humidityMin: source.environmentalRequirements?.humidityMin ?? undefined,
    humidityOptimal: source.environmentalRequirements?.humidityOptimal ?? undefined,
    humidityMax: source.environmentalRequirements?.humidityMax ?? undefined,

    wateringFrequencyDays: source.wateringRequirements?.wateringFrequencyDays ?? undefined,
    waterAmountPerPlant: source.wateringRequirements?.waterAmountPerPlant ?? undefined,
    waterAmountUnit: source.wateringRequirements?.waterAmountUnit || '',

    phMin: source.soilRequirements?.phMin ?? undefined,
    phOptimal: source.soilRequirements?.phOptimal ?? undefined,
    phMax: source.soilRequirements?.phMax ?? undefined,

    dailyLightHoursMin: source.lightRequirements?.dailyLightHoursMin ?? undefined,
    dailyLightHoursOptimal: source.lightRequirements?.dailyLightHoursOptimal ?? undefined,
    dailyLightHoursMax: source.lightRequirements?.dailyLightHoursMax ?? undefined,

    averageMarketValuePerKg: source.economicsAndLabor?.averageMarketValuePerKg ?? undefined,
    currency: source.economicsAndLabor?.currency || '',

    customPlantsPer100m2: source.customPlantsPer100m2 ?? undefined,
    notes: source.additionalInfo?.notes || '',
  };
}

/** Derives the density-chooser's local (non-RHF) UI state from a source record. */
function deriveDensityState(source: PlantDataEnhanced): { mode: DensityMode; unit: DensityUnit; input: string } {
  if (source.customPlantsPer100m2 != null) {
    const raw = source.customPlantsPer100m2;
    // Show in plants/m² if it's divisible by 100 for a clean whole number, otherwise use per100m²
    if (raw % 100 === 0) {
      return { mode: 'custom', unit: 'perm2', input: String(raw / 100) };
    }
    return { mode: 'custom', unit: 'per100m2', input: String(raw) };
  }
  if (source.spacingCategory) {
    return { mode: 'category', unit: 'per100m2', input: '' };
  }
  return { mode: 'none', unit: 'per100m2', input: '' };
}

export function PlantDataFormModal({
  isOpen,
  onClose,
  onSuccess,
  plantData,
  motherContext,
  duplicateFromVariety,
}: PlantDataFormModalProps) {
  const isEdit = !!plantData;

  // Plant Library Phase 3 — variety mode. Creating: motherContext is passed
  // and there's no existing plantData. Editing: the variety being edited
  // already carries motherPlantId (basic info inherited, read-only).
  const isVarietyCreate = !isEdit && !!motherContext;
  const isVarietyOfMother = isEdit && !!plantData?.motherPlantId;
  const isVarietyMode = isVarietyCreate || isVarietyOfMother;
  const showBasicInfoInputs = !isVarietyMode;
  const contextPlantName = motherContext?.plantName ?? plantData?.plantName;
  const contextScientificName = motherContext?.scientificName ?? plantData?.scientificName;
  const contextPlantType = motherContext?.plantType ?? plantData?.plantType;

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Density chooser local state — not in RHF because unit toggle is display-only
  const [spacingCategories, setSpacingCategories] = useState<SpacingCategoryInfo[]>([]);
  const [densityMode, setDensityMode] = useState<DensityMode>('none');
  const [densityUnit, setDensityUnit] = useState<DensityUnit>('per100m2');
  // Raw display value typed by the user in the custom input (string to avoid NaN on empty)
  const [customDensityInput, setCustomDensityInput] = useState<string>('');

  const createDefaultValues = useMemo((): PlantDataFormData => ({
    plantType: 'vegetable',
    farmTypeCompatibility: [],
    currency: 'AED',
    yieldUnit: 'kg',
    waterAmountUnit: 'L',
  }), []);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    reset,
    control,
    watch,
    setValue,
  } = useForm<PlantDataFormData>({
    resolver: zodResolver(isEdit ? updateSchema : isVarietyCreate ? varietyCreateSchema : createSchema),
    defaultValues: isEdit ? undefined : createDefaultValues,
  });

  const selectedFarmTypes = watch('farmTypeCompatibility') || [];

  // Total Cycle Days is auto-computed as the sum of the five growth-stage
  // durations. Watch each stage field and keep totalCycleDays in sync. Saved
  // value is always the computed sum — the field is read-only in the UI.
  const germinationDays = watch('germinationDays');
  const vegetativeDays = watch('vegetativeDays');
  const floweringDays = watch('floweringDays');
  const fruitingDays = watch('fruitingDays');
  const harvestDurationDays = watch('harvestDurationDays');
  useEffect(() => {
    const sum =
      (germinationDays || 0) +
      (vegetativeDays || 0) +
      (floweringDays || 0) +
      (fruitingDays || 0) +
      (harvestDurationDays || 0);
    setValue('totalCycleDays', sum, { shouldValidate: true, shouldDirty: true });
  }, [germinationDays, vegetativeDays, floweringDays, fruitingDays, harvestDurationDays, setValue]);

  // Fetch spacing category options once on mount
  useEffect(() => {
    getSpacingCategories()
      .then((res) => setSpacingCategories(res.categories))
      .catch(() => {
        // Non-fatal: chooser falls back to static labels if fetch fails
      });
  }, []);

  useEffect(() => {
    if (plantData) {
      reset({
        plantName: plantData.plantName || '',
        scientificName: plantData.scientificName || '',
        plantType: plantData.plantType || 'vegetable',
        varietyName: plantData.varietyName || '',
        isActive: plantData.isActive ?? true,
        ...detailFieldsFromSource(plantData),
      });

      const density = deriveDensityState(plantData);
      setDensityMode(density.mode);
      setDensityUnit(density.unit);
      setCustomDensityInput(density.input);
    }
    // Depend on plantData.plantDataId rather than the whole object: if any
    // upstream auto-refresh produces a new plantData reference with the same
    // identity, this effect would fire and overwrite whatever the user was
    // editing. We only want the reset when the user picks a genuinely
    // different plant record to edit.
  }, [plantData?.plantDataId, reset]);

  // Duplicate-variety mode: seed the create form from a source variety's
  // detailed fields, same mapping edit mode uses above, minus identity
  // (plantDataId/motherPlantId — this is a NEW variety) and with varietyName
  // defaulted to "Copy of {source}" instead of copied verbatim. Only applies
  // in variety-create mode; a plain "Add Variety" (no duplicateFromVariety)
  // keeps using createDefaultValues from useForm's initial state untouched.
  useEffect(() => {
    if (!isEdit && isVarietyCreate && duplicateFromVariety) {
      reset({
        ...createDefaultValues,
        varietyName: `Copy of ${duplicateFromVariety.varietyName || duplicateFromVariety.plantName}`,
        ...detailFieldsFromSource(duplicateFromVariety),
      });

      const density = deriveDensityState(duplicateFromVariety);
      setDensityMode(density.mode);
      setDensityUnit(density.unit);
      setCustomDensityInput(density.input);
    }
    // The parent conditionally-renders (mounts fresh) this modal per open, so
    // this effectively fires once per Duplicate click; keyed on the source's
    // identity in case that ever changes.
  }, [duplicateFromVariety?.plantDataId, isEdit, isVarietyCreate, reset, createDefaultValues]);

  const onSubmit = async (data: PlantDataFormData) => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      if (isEdit && plantData) {
        const updateData: PlantDataEnhancedUpdate = {
          // A variety's plantName/scientificName are inherited from its
          // mother — the backend REJECTS (422) a client-supplied change to
          // either for a variety, so they're omitted here; varietyName (the
          // variety's own field) is sent instead. A standalone (non-variety)
          // plant keeps renaming plantName/scientificName as before.
          ...(isVarietyOfMother
            ? { varietyName: data.varietyName }
            : { plantName: data.plantName, scientificName: data.scientificName }),
          farmTypeCompatibility: data.farmTypeCompatibility as FarmTypeCompatibility[],
          tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          spacingCategory: data.spacingCategory as SpacingCategory | undefined,
          customPlantsPer100m2: data.customPlantsPer100m2 ?? null,

          growthCycle: {
            germinationDays: data.germinationDays ?? 0,
            vegetativeDays: data.vegetativeDays ?? 0,
            floweringDays: data.floweringDays ?? 0,
            fruitingDays: data.fruitingDays ?? 0,
            harvestDurationDays: data.harvestDurationDays ?? 0,
            totalCycleDays: data.totalCycleDays!,
          },

          yieldInfo: {
            yieldPerPlant: data.yieldPerPlant!,
            yieldUnit: data.yieldUnit!,
            seedsPerPlantingPoint: data.seedsPerPlantingPoint,
            expectedWastePercentage: data.expectedWastePercent ?? 0,
          },
        };

        const updated = await plantDataEnhancedApi.updatePlantDataEnhanced(plantData.plantDataId, updateData);
        setSuccessMessage(
          isVarietyOfMother
            ? `Variety "${updated.varietyName || updated.plantName}" updated to version ${updated.dataVersion}!`
            : `Plant "${updated.plantName}" updated to version ${updated.dataVersion}!`
        );
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
      } else {
        // Shared detailed-field payload — identical for a standalone plant
        // and a variety-under-a-mother; only the basic-info wrapper differs
        // (plantName/scientificName/plantType vs. varietyName).
        const detailFields = {
          farmTypeCompatibility: data.farmTypeCompatibility as FarmTypeCompatibility[],
          tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          spacingCategory: data.spacingCategory as SpacingCategory | undefined,
          customPlantsPer100m2: data.customPlantsPer100m2 ?? undefined,

          growthCycle: {
            germinationDays: data.germinationDays ?? 0,
            vegetativeDays: data.vegetativeDays ?? 0,
            floweringDays: data.floweringDays ?? 0,
            fruitingDays: data.fruitingDays ?? 0,
            harvestDurationDays: data.harvestDurationDays ?? 0,
            totalCycleDays: data.totalCycleDays!,
          },

          yieldInfo: {
            yieldPerPlant: data.yieldPerPlant!,
            yieldUnit: data.yieldUnit!,
            seedsPerPlantingPoint: data.seedsPerPlantingPoint,
            expectedWastePercentage: data.expectedWastePercent,
          },

          environmentalRequirements: (
            data.temperatureMin !== undefined || data.temperatureOptimal !== undefined ||
            data.temperatureMax !== undefined || data.humidityMin !== undefined ||
            data.humidityOptimal !== undefined || data.humidityMax !== undefined
          ) ? {
            temperatureMin: data.temperatureMin,
            temperatureOptimal: data.temperatureOptimal,
            temperatureMax: data.temperatureMax,
            humidityMin: data.humidityMin,
            humidityOptimal: data.humidityOptimal,
            humidityMax: data.humidityMax,
          } : undefined,

          wateringRequirements: data.wateringFrequencyDays ? {
            wateringFrequencyDays: data.wateringFrequencyDays,
            waterAmountPerPlant: data.waterAmountPerPlant,
            waterAmountUnit: data.waterAmountUnit,
          } : undefined,

          soilRequirements: (
            data.phMin !== undefined || data.phOptimal !== undefined || data.phMax !== undefined
          ) ? {
            phMin: data.phMin,
            phOptimal: data.phOptimal,
            phMax: data.phMax,
          } : undefined,

          lightRequirements: (
            data.dailyLightHoursMin !== undefined || data.dailyLightHoursOptimal !== undefined ||
            data.dailyLightHoursMax !== undefined
          ) ? {
            dailyLightHoursMin: data.dailyLightHoursMin,
            dailyLightHoursOptimal: data.dailyLightHoursOptimal,
            dailyLightHoursMax: data.dailyLightHoursMax,
          } : undefined,

          economicsAndLabor: data.averageMarketValuePerKg ? {
            averageMarketValuePerKg: data.averageMarketValuePerKg,
            currency: data.currency,
          } : undefined,

          additionalInfo: data.notes ? {
            notes: data.notes,
          } : undefined,
        };

        if (isVarietyCreate && motherContext) {
          const varietyData: VarietyCreateForMother = {
            varietyName: data.varietyName!,
            ...detailFields,
          };
          const created = await createVarietyForMother(motherContext.plantMotherId, varietyData);
          setSuccessMessage(`Variety "${created.varietyName}" created for ${motherContext.plantName}!`);
        } else {
          const createData: PlantDataEnhancedCreate = {
            plantName: data.plantName!,
            scientificName: data.scientificName,
            plantType: data.plantType as PlantTypeEnum,
            ...detailFields,
          };
          await plantDataEnhancedApi.createPlantDataEnhanced(createData);
          setSuccessMessage(`Plant "${data.plantName}" created successfully!`);
        }
        setTimeout(() => {
          reset();
          onSuccess?.();
          onClose();
        }, 1500);
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: unknown; message?: string } } };
      if (isEdit) {
        const errorDetail = axiosError.response?.data?.detail;
        const errorMsg = typeof errorDetail === 'string'
          ? errorDetail
          : Array.isArray(errorDetail)
            ? errorDetail.map((e: { loc?: string[]; msg?: string }) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
            : axiosError.response?.data?.message || 'Failed to update plant data. Please try again.';
        setErrorMessage(errorMsg);
      } else {
        setErrorMessage(
          axiosError.response?.data?.message || 'Failed to create plant data. Please try again.',
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      if (!isEdit) {
        reset();
        setDensityMode('none');
        setDensityUnit('per100m2');
        setCustomDensityInput('');
      }
      setSuccessMessage(null);
      setErrorMessage(null);
      setShowAdvanced(false);
      onClose();
    }
  };

  /**
   * Handle density chooser select change.
   * value = '' → None, 'custom' → Custom, any SpacingCategory key → preset
   */
  const handleDensitySelectChange = (value: string) => {
    if (value === '') {
      setDensityMode('none');
      setValue('spacingCategory', undefined);
      setValue('customPlantsPer100m2', undefined);
      setCustomDensityInput('');
    } else if (value === 'custom') {
      setDensityMode('custom');
      setValue('spacingCategory', undefined);
      setValue('customPlantsPer100m2', undefined);
      setCustomDensityInput('');
    } else {
      setDensityMode('category');
      setValue('spacingCategory', value as SpacingCategory);
      setValue('customPlantsPer100m2', undefined);
      setCustomDensityInput('');
    }
  };

  /**
   * Handle the custom density number input change.
   * Converts the entered value to the canonical plants/100 m² integer
   * and stores it in the form field.
   */
  const handleCustomDensityInputChange = (raw: string) => {
    setCustomDensityInput(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num > 0) {
      const canonical = Math.round(densityUnit === 'perm2' ? num * 100 : num);
      setValue('customPlantsPer100m2', canonical > 0 ? canonical : undefined, {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      setValue('customPlantsPer100m2', undefined);
    }
  };

  /**
   * Switch unit display mode for the custom density input.
   * Re-interprets the existing input value in the new unit
   * so the canonical stored value stays consistent.
   */
  const handleDensityUnitToggle = (unit: DensityUnit) => {
    setDensityUnit(unit);
    // Convert the displayed value when switching units
    const currentCanonical = watch('customPlantsPer100m2');
    if (currentCanonical != null && currentCanonical > 0) {
      if (unit === 'perm2') {
        setCustomDensityInput(String(Math.round((currentCanonical / 100) * 10) / 10));
      } else {
        setCustomDensityInput(String(currentCanonical));
      }
    }
  };

  /**
   * Build the density select value from current form state for controlled rendering.
   */
  const densitySelectValue =
    densityMode === 'none' ? '' :
    densityMode === 'custom' ? 'custom' :
    (watch('spacingCategory') ?? '');

  /**
   * Format a category's density for the <option> label.
   * If currentDensity/100 >= 1, show rounded plants/m²; otherwise plants/100m².
   */
  const formatCategoryDensity = (cat: SpacingCategoryInfo): string => {
    const perM2 = cat.currentDensity / 100;
    if (perM2 >= 1) {
      return `${Math.round(perM2)} plants/m²`;
    }
    return `${cat.currentDensity} plants/100 m²`;
  };

  const toggleFarmType = (farmType: string) => {
    const current = selectedFarmTypes;
    const updated = current.includes(farmType)
      ? current.filter(ft => ft !== farmType)
      : [...current, farmType];
    return updated;
  };

  // Shared across the standalone-plant and variety-mode layouts of the Basic
  // Information section (both need it, just in a different grid slot).
  const densityChooserField = (
    <FormGroup>
      <Label htmlFor="densityChooser">Default Plant Density</Label>
      {/*
        Density chooser — mutually exclusive: None / preconfigured category / Custom.
        Selecting None means density is chosen at planting time.
        spacingCategory and customPlantsPer100m2 are kept mutually exclusive.
      */}
      <Select
        id="densityChooser"
        value={densitySelectValue}
        onChange={(e) => handleDensitySelectChange(e.target.value)}
        disabled={submitting}
      >
        <option value="">— None (choose at planting) —</option>
        {spacingCategories.length > 0
          ? spacingCategories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.name} — {formatCategoryDensity(cat)}
              </option>
            ))
          : (Object.keys(SPACING_CATEGORY_LABELS) as SpacingCategory[]).map((key) => (
              <option key={key} value={key}>
                {SPACING_CATEGORY_LABELS[key]}
              </option>
            ))}
        <option value="custom">Custom…</option>
      </Select>
      <HelpText>
        {densityMode === 'none' && 'Density will be chosen at planting time.'}
        {densityMode === 'category' && 'Uses the preconfigured density for this size category.'}
        {densityMode === 'custom' && 'Enter a custom density; stored as integer plants/100 m².'}
      </HelpText>
      {errors.spacingCategory && <ErrorText>{errors.spacingCategory.message}</ErrorText>}
    </FormGroup>
  );

  return (
    <Overlay $isOpen={isOpen}>
      <Modal>
        <ModalHeader>
          <ModalHeaderContent>
            <ModalTitle>
              {isEdit
                ? isVarietyOfMother
                  ? `Edit Variety: ${plantData!.varietyName || plantData!.plantName}`
                  : `Edit Plant: ${plantData!.plantName}`
                : isVarietyCreate
                  ? `Add Variety to ${motherContext!.plantName}`
                  : 'Add New Plant Data'}
            </ModalTitle>
            {isEdit && (
              <VersionBadge>
                Current Version: v{plantData!.dataVersion}
              </VersionBadge>
            )}
          </ModalHeaderContent>
          <CloseButton onClick={handleClose} disabled={submitting} aria-label="Close">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <Form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            {/* BASIC INFORMATION */}
            <Section>
              <SectionHeader>
                <SectionTitle>Basic Information</SectionTitle>
                {(!isEdit || isVarietyCreate) && <RequiredBadge>Required</RequiredBadge>}
              </SectionHeader>

              {isVarietyMode && (
                <MotherContextBanner>
                  <MotherContextLabel>{isVarietyCreate ? 'New variety of' : 'Variety of'}</MotherContextLabel>
                  <MotherContextName>{contextPlantName}</MotherContextName>
                  {(contextScientificName || contextPlantType) && (
                    <MotherContextMeta>
                      {[contextScientificName, contextPlantType].filter(Boolean).join(' · ')}
                    </MotherContextMeta>
                  )}
                </MotherContextBanner>
              )}

              {showBasicInfoInputs && (
                <>
                  <FormGroup>
                    <Label htmlFor="plantName">Plant Name {!isEdit && '*'}</Label>
                    <Input
                      id="plantName"
                      type="text"
                      placeholder="e.g., Tomato, Lettuce"
                      $hasError={!!errors.plantName}
                      disabled={submitting}
                      {...register('plantName')}
                    />
                    {errors.plantName && <ErrorText>{errors.plantName.message}</ErrorText>}
                  </FormGroup>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="scientificName">Scientific Name {!isEdit && '(Optional)'}</Label>
                      <Input
                        id="scientificName"
                        type="text"
                        placeholder="e.g., Solanum lycopersicum"
                        $hasError={!!errors.scientificName}
                        disabled={submitting}
                        {...register('scientificName')}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="plantType">Plant Type {!isEdit && '*'}</Label>
                      <Select
                        id="plantType"
                        $hasError={!!errors.plantType}
                        disabled={submitting}
                        {...register('plantType')}
                      >
                        <option value="vegetable">Vegetable</option>
                        <option value="fruit">Fruit</option>
                        <option value="herb">Herb</option>
                        <option value="crop">Crop</option>
                        <option value="tree">Tree</option>
                        <option value="ornamental">Ornamental</option>
                        <option value="medicinal">Medicinal</option>
                      </Select>
                      {errors.plantType && <ErrorText>{errors.plantType.message}</ErrorText>}
                    </FormGroup>

                    {densityChooserField}
                  </GridRow>
                </>
              )}

              {isVarietyMode && (
                <GridRow $columns={2}>
                  <FormGroup>
                    <Label htmlFor="varietyName">Variety Name *</Label>
                    <Input
                      id="varietyName"
                      type="text"
                      placeholder="e.g., Cherry, Roma"
                      $hasError={!!errors.varietyName}
                      disabled={submitting}
                      {...register('varietyName')}
                    />
                    {errors.varietyName && <ErrorText>{errors.varietyName.message}</ErrorText>}
                  </FormGroup>

                  {densityChooserField}
                </GridRow>
              )}

              {/* Custom density input — only shown when Custom is selected */}
              {densityMode === 'custom' && (
                <FormGroup>
                  <Label htmlFor="customDensityInput">Custom Density</Label>
                  <DensityCustomRow>
                    <Input
                      id="customDensityInput"
                      type="number"
                      min="1"
                      step="1"
                      placeholder={densityUnit === 'perm2' ? 'e.g., 4' : 'e.g., 400'}
                      value={customDensityInput}
                      onChange={(e) => handleCustomDensityInputChange(e.target.value)}
                      disabled={submitting}
                      $hasError={!!errors.customPlantsPer100m2}
                      style={{ flex: 1, minWidth: '120px' }}
                    />
                    <DensityUnitToggle>
                      <DensityUnitButton
                        type="button"
                        $active={densityUnit === 'per100m2'}
                        onClick={() => handleDensityUnitToggle('per100m2')}
                        disabled={submitting}
                        title="Plants per 100 m²"
                      >
                        /100 m²
                      </DensityUnitButton>
                      <DensityUnitButton
                        type="button"
                        $active={densityUnit === 'perm2'}
                        onClick={() => handleDensityUnitToggle('perm2')}
                        disabled={submitting}
                        title="Plants per m²"
                      >
                        /m²
                      </DensityUnitButton>
                    </DensityUnitToggle>
                  </DensityCustomRow>
                  {errors.customPlantsPer100m2 && (
                    <ErrorText>{errors.customPlantsPer100m2.message}</ErrorText>
                  )}
                  <HelpText>
                    Stored canonically as integer plants/100 m². Current value:{' '}
                    {watch('customPlantsPer100m2') != null
                      ? `${watch('customPlantsPer100m2')} plants/100 m²`
                      : '—'}
                  </HelpText>
                </FormGroup>
              )}

              <FormGroup>
                <Label>Farm Type Compatibility {!isEdit && '* (Select all that apply)'}</Label>
                <Controller
                  name="farmTypeCompatibility"
                  control={control}
                  render={({ field }) => (
                    <CheckboxGrid>
                      {[
                        { value: 'open_field', label: 'Open Field' },
                        { value: 'greenhouse', label: 'Greenhouse' },
                        { value: 'hydroponic', label: 'Hydroponic' },
                        { value: 'vertical_farm', label: 'Vertical Farm' },
                        { value: 'aquaponic', label: 'Aquaponic' },
                        { value: 'indoor_farm', label: 'Indoor Farm' },
                        { value: 'polytunnel', label: 'Polytunnel' },
                      ].map((ft) => (
                        <CheckboxLabel key={ft.value}>
                          <Checkbox
                            type="checkbox"
                            checked={field.value?.includes(ft.value) || false}
                            onChange={() => field.onChange(toggleFarmType(ft.value))}
                            disabled={submitting}
                          />
                          <CheckboxText>{ft.label}</CheckboxText>
                        </CheckboxLabel>
                      ))}
                    </CheckboxGrid>
                  )}
                />
                {errors.farmTypeCompatibility && (
                  <ErrorText>{errors.farmTypeCompatibility.message}</ErrorText>
                )}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="tags">Tags ({isEdit ? 'comma-separated' : 'Optional, comma-separated'})</Label>
                <Input
                  id="tags"
                  type="text"
                  placeholder="e.g., organic, heirloom, drought-resistant"
                  disabled={submitting}
                  {...register('tags')}
                />
                {!isEdit && <HelpText>Separate multiple tags with commas</HelpText>}
              </FormGroup>

              {isEdit && (
                <FormGroup>
                  <StatusToggle>
                    <StatusLabel>Status:</StatusLabel>
                    <Controller
                      name="isActive"
                      control={control}
                      render={({ field }) => (
                        <StatusSwitch>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            disabled={submitting}
                          />
                          <span></span>
                        </StatusSwitch>
                      )}
                    />
                    <StatusLabel>{watch('isActive') ? 'Active' : 'Inactive'}</StatusLabel>
                  </StatusToggle>
                </FormGroup>
              )}
            </Section>

            {/* GROWTH CYCLE */}
            <Section>
              <SectionHeader>
                <SectionTitle>Growth Cycle</SectionTitle>
                {!isEdit && <RequiredBadge>Required</RequiredBadge>}
              </SectionHeader>

              <GridRow $columns={3}>
                <FormGroup>
                  <Label htmlFor="germinationDays">Germination (days)</Label>
                  <Input
                    id="germinationDays"
                    {...positiveIntegerInputProps}
                    min="0"
                    step="1"
                    placeholder="0"
                    $hasError={!!errors.germinationDays}
                    disabled={submitting}
                    {...register('germinationDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="vegetativeDays">Vegetative (days)</Label>
                  <Input
                    id="vegetativeDays"
                    {...positiveIntegerInputProps}
                    min="0"
                    step="1"
                    placeholder="0"
                    $hasError={!!errors.vegetativeDays}
                    disabled={submitting}
                    {...register('vegetativeDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="floweringDays">Flowering (days)</Label>
                  <Input
                    id="floweringDays"
                    {...positiveIntegerInputProps}
                    min="0"
                    step="1"
                    placeholder="0"
                    $hasError={!!errors.floweringDays}
                    disabled={submitting}
                    {...register('floweringDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>
              </GridRow>

              <GridRow>
                <FormGroup>
                  <Label htmlFor="fruitingDays">Fruiting (days)</Label>
                  <Input
                    id="fruitingDays"
                    {...positiveIntegerInputProps}
                    min="0"
                    step="1"
                    placeholder="0"
                    $hasError={!!errors.fruitingDays}
                    disabled={submitting}
                    {...register('fruitingDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="harvestDurationDays">Harvest Duration (days)</Label>
                  <Input
                    id="harvestDurationDays"
                    {...positiveIntegerInputProps}
                    min="0"
                    step="1"
                    placeholder="0"
                    $hasError={!!errors.harvestDurationDays}
                    disabled={submitting}
                    {...register('harvestDurationDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>
              </GridRow>

              <FormGroup>
                <Label htmlFor="totalCycleDays">Total Cycle Days {!isEdit && '*'}</Label>
                <Input
                  id="totalCycleDays"
                  {...positiveIntegerInputProps}
                  min="1"
                  step="1"
                  readOnly
                  $hasError={!!errors.totalCycleDays}
                  disabled={submitting}
                  {...register('totalCycleDays', {
                    setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                  })}
                />
                {errors.totalCycleDays && <ErrorText>{errors.totalCycleDays.message}</ErrorText>}
                <HelpText>Auto-calculated from the five stage durations above.</HelpText>
              </FormGroup>
            </Section>

            {/* YIELD INFORMATION */}
            <Section>
              <SectionHeader>
                <SectionTitle>Yield Information</SectionTitle>
                {!isEdit && <RequiredBadge>Required</RequiredBadge>}
              </SectionHeader>

              <GridRow $columns={4}>
                <FormGroup>
                  <Label htmlFor="yieldPerPlant">Yield Per Plant {!isEdit && '*'}</Label>
                  <Input
                    id="yieldPerPlant"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g., 2.5"
                    $hasError={!!errors.yieldPerPlant}
                    disabled={submitting}
                    {...register('yieldPerPlant', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                  {errors.yieldPerPlant && <ErrorText>{errors.yieldPerPlant.message}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="yieldUnit">Yield Unit {!isEdit && '*'}</Label>
                  <Input
                    id="yieldUnit"
                    type="text"
                    placeholder="kg, lb, units"
                    $hasError={!!errors.yieldUnit}
                    disabled={submitting}
                    {...register('yieldUnit')}
                  />
                  {errors.yieldUnit && <ErrorText>{errors.yieldUnit.message}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="expectedWastePercent">Expected Waste %</Label>
                  <Input
                    id="expectedWastePercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0-100"
                    $hasError={!!errors.expectedWastePercent}
                    disabled={submitting}
                    {...register('expectedWastePercent', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="seedsPerPlantingPoint">Seeds / Point</Label>
                  <Input
                    id="seedsPerPlantingPoint"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="1"
                    $hasError={!!errors.seedsPerPlantingPoint}
                    disabled={submitting}
                    {...register('seedsPerPlantingPoint', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                    })}
                  />
                  <HelpText>Seeds per drip/planting point</HelpText>
                </FormGroup>
              </GridRow>
            </Section>

            {/* ADVANCED FIELDS TOGGLE */}
            <ExpandButton
              type="button"
              $expanded={showAdvanced}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Fields
              <ExpandChevron $expanded={showAdvanced}>
                <ChevronDown size={15} strokeWidth={1.8} />
              </ExpandChevron>
            </ExpandButton>

            {/* ADVANCED FIELDS */}
            {showAdvanced && (
              <>
                {/* ENVIRONMENTAL REQUIREMENTS */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Environmental Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="temperatureMin">Min Temp (°C)</Label>
                      <Input
                        id="temperatureMin"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 15"
                        disabled={submitting}
                        {...register('temperatureMin', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="temperatureOptimal">Optimal Temp (°C)</Label>
                      <Input
                        id="temperatureOptimal"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 25"
                        disabled={submitting}
                        {...register('temperatureOptimal', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="temperatureMax">Max Temp (°C)</Label>
                      <Input
                        id="temperatureMax"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 35"
                        disabled={submitting}
                        {...register('temperatureMax', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>
                  </GridRow>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="humidityMin">Min Humidity (%)</Label>
                      <Input
                        id="humidityMin"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="0-100"
                        disabled={submitting}
                        {...register('humidityMin', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="humidityOptimal">Optimal Humidity (%)</Label>
                      <Input
                        id="humidityOptimal"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="0-100"
                        disabled={submitting}
                        {...register('humidityOptimal', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="humidityMax">Max Humidity (%)</Label>
                      <Input
                        id="humidityMax"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="0-100"
                        disabled={submitting}
                        {...register('humidityMax', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>
                  </GridRow>
                </Section>

                {/* WATERING REQUIREMENTS */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Watering Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="wateringFrequencyDays">Watering Frequency (days)</Label>
                      <Input
                        id="wateringFrequencyDays"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g., 3"
                        disabled={submitting}
                        {...register('wateringFrequencyDays', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="waterAmountPerPlant">Water Amount Per Plant</Label>
                      <Input
                        id="waterAmountPerPlant"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="e.g., 1.5"
                        disabled={submitting}
                        {...register('waterAmountPerPlant', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="waterAmountUnit">Water Unit</Label>
                      <Input
                        id="waterAmountUnit"
                        type="text"
                        placeholder="L, gal, ml"
                        disabled={submitting}
                        {...register('waterAmountUnit')}
                      />
                    </FormGroup>
                  </GridRow>
                </Section>

                {/* SOIL REQUIREMENTS */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Soil Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="phMin">Min pH (0-14)</Label>
                      <Input
                        id="phMin"
                        type="number"
                        min="0"
                        max="14"
                        step="0.1"
                        placeholder="e.g., 6.0"
                        $hasError={!!errors.phMin}
                        disabled={submitting}
                        {...register('phMin', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="phOptimal">Optimal pH (0-14)</Label>
                      <Input
                        id="phOptimal"
                        type="number"
                        min="0"
                        max="14"
                        step="0.1"
                        placeholder="e.g., 6.5"
                        $hasError={!!errors.phOptimal}
                        disabled={submitting}
                        {...register('phOptimal', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="phMax">Max pH (0-14)</Label>
                      <Input
                        id="phMax"
                        type="number"
                        min="0"
                        max="14"
                        step="0.1"
                        placeholder="e.g., 7.0"
                        $hasError={!!errors.phMax}
                        disabled={submitting}
                        {...register('phMax', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>
                  </GridRow>
                </Section>

                {/* LIGHT REQUIREMENTS */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Light Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="dailyLightHoursMin">Min Light Hours/Day</Label>
                      <Input
                        id="dailyLightHoursMin"
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        placeholder="0-24"
                        disabled={submitting}
                        {...register('dailyLightHoursMin', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="dailyLightHoursOptimal">Optimal Light Hours/Day</Label>
                      <Input
                        id="dailyLightHoursOptimal"
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        placeholder="0-24"
                        disabled={submitting}
                        {...register('dailyLightHoursOptimal', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="dailyLightHoursMax">Max Light Hours/Day</Label>
                      <Input
                        id="dailyLightHoursMax"
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        placeholder="0-24"
                        disabled={submitting}
                        {...register('dailyLightHoursMax', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>
                  </GridRow>
                </Section>

                {/* ECONOMICS */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Economics & Market Value</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow>
                    <FormGroup>
                      <Label htmlFor="averageMarketValuePerKg">Market Value Per Kg</Label>
                      <Input
                        id="averageMarketValuePerKg"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g., 5.50"
                        disabled={submitting}
                        {...register('averageMarketValuePerKg', {
                          setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v),
                        })}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        type="text"
                        placeholder="AED, USD, etc."
                        disabled={submitting}
                        {...register('currency')}
                      />
                    </FormGroup>
                  </GridRow>
                </Section>

                {/* ADDITIONAL INFORMATION */}
                <Section>
                  <SectionHeader>
                    <SectionTitle>Additional Information</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <FormGroup>
                    <Label htmlFor="notes">Notes</Label>
                    <TextArea
                      id="notes"
                      placeholder="Any additional information about this plant..."
                      disabled={submitting}
                      {...register('notes')}
                    />
                  </FormGroup>
                </Section>
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <div>
              {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
              {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
            </div>

            <FooterActions>
              <Button type="button" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                $variant="primary"
                disabled={submitting}
              >
                {isEdit
                  ? (submitting ? 'Updating...' : 'Update Plant Data')
                  : (submitting ? 'Creating...' : 'Create Plant Data')}
              </Button>
            </FooterActions>
          </ModalFooter>
        </Form>
      </Modal>
    </Overlay>
  );
}
