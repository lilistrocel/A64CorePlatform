/**
 * AddVirtualCropModal Component
 *
 * Modal for adding virtual crops to a physical block.
 * Area is DERIVED from plant count × density — no manual area input.
 * Supports over-budget planting with explicit user approval.
 *
 * Phase 3 redesign: density-first workflow.
 *   - Crop → plant count → density chooser → derived area → budget bar → submit
 *   - Soft budget: 409 from backend surfaces approval prompt; approval checkbox gates submit.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled, { useTheme } from 'styled-components';
import { BarChart3, AlertTriangle, Ruler, TrendingUp, X, Check } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { farmApi, getSpacingCategories } from '../../services/farmApi';
import { getActivePlants } from '../../services/plantDataEnhancedApi';
import type {
  Block,
  PlantDataEnhanced,
  AddVirtualCropRequest,
  SpacingCategory,
  SpacingCategoryInfo,
} from '../../types/farm';
import { SPACING_CATEGORY_LABELS } from '../../types/farm';
import { PlantCombobox } from './PlantCombobox';
import { AreaBudgetBar } from './AreaBudgetBar';

// ============================================================================
// TYPES
// ============================================================================

interface AddVirtualCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: Block;
  onSuccess: () => void;
}

interface VirtualCropPreview {
  selectedPlant: PlantDataEnhanced | null;
  derivedAreaM2: number;
  plantCount: number;
  plantingDate: string;
  // Calculated fields
  predictedYieldKg: number;
  expectedWastePercent: number;
  predictedRevenue: number;
  harvestDate: string;
  totalCycleDays: number;
  areaPercentage: number;
}

/** Structured payload from a 409 OVER_AREA_BUDGET backend response */
interface OverAreaBudgetDetail {
  code: 'OVER_AREA_BUDGET';
  requiredAreaM2: number;
  availableAreaM2: number;
  overByM2: number;
}

type DensityMode = 'none' | 'category' | 'custom';
type DensityUnit = 'per100m2' | 'perm2';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  justify-content: center;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const FormSection = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 16px 0;
`;

/* ---- Area Budget Bar ---- */

const AreaBudgetSection = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.35);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 24px;
`;

const AreaBudgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AreaBudgetText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.onDark};
  text-align: center;
  margin-bottom: 8px;
`;

const AreaBudgetWarning = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.terra};
  text-align: center;
  font-weight: 700;
`;

const AreaBudgetError = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.coral};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 8px;
  padding: 10px 14px;
  margin-top: 8px;
  font-weight: 600;
`;

/* ---- Over-budget approval ---- */

const ApprovalCheckboxRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  cursor: pointer;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
  user-select: none;
`;

const ApprovalCheckbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 1px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: ${({ theme }) => theme.colors.bright.coral};
`;

/* ---- Derived area preview ---- */

const DerivedAreaPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid rgba(84, 211, 155, 0.4);
  border-radius: 8px;
  margin: 12px 0 20px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

/* ---- Form primitives ---- */

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  ${monoLabel}
  display: block;
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-left: 4px;
`;

const Input = styled.input`
  ${glassControl}
  width: 100%;
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  ${glassControl}
  width: 100%;
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const HelpText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-top: 4px;
`;

/* ---- Density custom input row ---- */

const DensityCustomRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const DensityUnitToggle = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
`;

const DensityUnitButton = styled.button<{ $active: boolean }>`
  padding: 12px 14px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;
  background: ${({ $active, theme }) =>
    $active ? 'rgba(180, 200, 220, 0.14)' : 'transparent'};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};

  &:hover:not([disabled]) {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

/* ---- Preview section ---- */

const PreviewSection = styled.div<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid rgba(84, 211, 155, 0.4);
  border-radius: 10px;
  padding: 20px;
  margin-top: 24px;
`;

const PreviewTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onDark};
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
`;

const PreviewItem = styled.div`
  background: rgba(23, 29, 64, 0.5);
  border-radius: 10px;
  padding: 16px;
`;

const PreviewLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 6px;
`;

const PreviewValue = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PreviewSubtext = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

/* ---- Footer ---- */

const ModalFooter = styled.div`
  padding: 20px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;
`;

// "success" (the final "Confirm & Add Crop" action) carries this view's one
// gold-gradient CTA (spec §3); "primary" (the intermediate Preview step)
// uses lapis instead so only one gold element shows at a time.
const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'success' }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  border: 1px solid transparent;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: rgba(107, 138, 224, 0.18);
          border-color: rgba(107, 138, 224, 0.4);
          color: ${theme.colors.bright.lapis};
          &:hover:not(:disabled) {
            background: rgba(107, 138, 224, 0.3);
          }
        `;
      case 'success':
        return `
          background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
          color: ${theme.colors.onAccent};
          box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
          &:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
          }
        `;
      default:
        return `
          background: transparent;
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.glass.border};
          &:hover:not(:disabled) {
            background: rgba(180, 200, 220, 0.07);
            color: ${theme.colors.textPrimary};
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.muted};
`;

const VirtualBlockCodePreview = styled.div`
  background: rgba(180, 200, 220, 0.05);
  border-radius: 10px;
  padding: 16px;
  margin-top: 16px;
  border: 2px dashed ${({ theme }) => theme.colors.bright.lapis};
`;

const CodeLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const CodeValue = styled.div`
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const NoSpacingWarning = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(232, 147, 95, 0.12);
  border: 1px solid rgba(232, 147, 95, 0.4);
  border-radius: 8px;
  margin: 8px 0 20px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.onDark};
`;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a spacing category's density for the <option> label, mirroring
 * the pattern in PlantDataFormModal.
 */
function formatCategoryDensityLabel(cat: SpacingCategoryInfo): string {
  const perM2 = cat.currentDensity / 100;
  if (perM2 >= 1) {
    return `${cat.name} — ${Math.round(perM2)} plants/m²`;
  }
  return `${cat.name} — ${cat.currentDensity} plants/100 m²`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AddVirtualCropModal({ isOpen, onClose, block, onSuccess }: AddVirtualCropModalProps) {
  const theme = useTheme();
  const [plants, setPlants] = useState<PlantDataEnhanced[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [plantCount, setPlantCount] = useState<string>('');
  const [plantingDate, setPlantingDate] = useState<string>('');

  // Density chooser state (mirrors PlantDataFormModal)
  const [spacingCategories, setSpacingCategories] = useState<SpacingCategoryInfo[]>([]);
  const [densityMode, setDensityMode] = useState<DensityMode>('none');
  const [densityUnit, setDensityUnit] = useState<DensityUnit>('per100m2');
  /** The raw string shown in the custom density input; kept separate to avoid NaN on empty. */
  const [customDensityInput, setCustomDensityInput] = useState<string>('');
  /** The canonical integer plants/100 m² resolved from chooser; undefined when unset. */
  const [plantsPer100m2, setPlantsPer100m2] = useState<number | undefined>(undefined);

  // Over-budget approval state
  const [overBudgetApproved, setOverBudgetApproved] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<VirtualCropPreview | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load plant data and spacing categories on mount
  useEffect(() => {
    if (isOpen) {
      loadPlants();
      loadSpacingCategories();
      setPlantingDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const loadPlants = async () => {
    try {
      setLoadingPlants(true);
      const activePlants = await getActivePlants();
      setPlants(activePlants);
    } catch (error) {
      // Non-fatal — combobox will be empty
      setPlants([]);
    } finally {
      setLoadingPlants(false);
    }
  };

  const loadSpacingCategories = async () => {
    try {
      const res = await getSpacingCategories();
      setSpacingCategories(res.categories);
    } catch {
      // Non-fatal: fall back to static labels
    }
  };

  // ---- Density chooser handlers ----

  const handleDensitySelectChange = useCallback((value: string) => {
    if (value === '') {
      setDensityMode('none');
      setPlantsPer100m2(undefined);
      setCustomDensityInput('');
    } else if (value === 'custom') {
      setDensityMode('custom');
      setPlantsPer100m2(undefined);
      setCustomDensityInput('');
    } else {
      // Preset category: look up currentDensity
      setDensityMode('category');
      setCustomDensityInput('');
      const cat = spacingCategories.find((c) => c.value === value);
      if (cat) {
        setPlantsPer100m2(cat.currentDensity);
      }
    }
  }, [spacingCategories]);

  const handleCustomDensityInputChange = useCallback((raw: string) => {
    setCustomDensityInput(raw);
    const num = parseFloat(raw);
    if (!isNaN(num) && num > 0) {
      const canonical = Math.round(densityUnit === 'perm2' ? num * 100 : num);
      setPlantsPer100m2(canonical > 0 ? canonical : undefined);
    } else {
      setPlantsPer100m2(undefined);
    }
  }, [densityUnit]);

  const handleDensityUnitToggle = useCallback((unit: DensityUnit) => {
    setDensityUnit(unit);
    // Re-express the current canonical value in the new unit
    if (plantsPer100m2 != null && plantsPer100m2 > 0) {
      if (unit === 'perm2') {
        setCustomDensityInput(String(Math.round((plantsPer100m2 / 100) * 10) / 10));
      } else {
        setCustomDensityInput(String(plantsPer100m2));
      }
    }
  }, [plantsPer100m2]);

  /** Controlled value for the density <select> */
  const densitySelectValue =
    densityMode === 'none' ? '' :
    densityMode === 'custom' ? 'custom' :
    // category: find matching category value from plantsPer100m2
    (spacingCategories.find((c) => c.currentDensity === plantsPer100m2)?.value ?? '');

  // ---- Prefill density from selected plant ----

  const prefillDensityFromPlant = useCallback((plant: PlantDataEnhanced | undefined) => {
    if (!plant) return;

    if (plant.customPlantsPer100m2 != null && plant.customPlantsPer100m2 > 0) {
      // Custom density on the plant record
      const raw = plant.customPlantsPer100m2;
      setDensityMode('custom');
      if (raw % 100 === 0) {
        setDensityUnit('perm2');
        setCustomDensityInput(String(raw / 100));
      } else {
        setDensityUnit('per100m2');
        setCustomDensityInput(String(raw));
      }
      setPlantsPer100m2(raw);
    } else if (plant.spacingCategory) {
      // Use the preset category
      const cat = spacingCategories.find((c) => c.value === plant.spacingCategory);
      setDensityMode('category');
      setCustomDensityInput('');
      setPlantsPer100m2(cat?.currentDensity);
    }
    // else: leave density unset — user must pick
  }, [spacingCategories]);

  // ---- Plant selection handler ----

  const handlePlantChange = useCallback((plantId: string) => {
    setSelectedPlantId(plantId);
    const plant = plants.find((p) => p.plantDataId === plantId);
    if (plant) {
      prefillDensityFromPlant(plant);
    } else {
      // Reset density when no plant
      setDensityMode('none');
      setPlantsPer100m2(undefined);
      setCustomDensityInput('');
    }
    // Reset over-budget approval on plant change
    setOverBudgetApproved(false);
  }, [plants, prefillDensityFromPlant]);

  // Re-prefill when spacingCategories loads after a plant is already selected
  useEffect(() => {
    if (spacingCategories.length > 0 && selectedPlantId) {
      const plant = plants.find((p) => p.plantDataId === selectedPlantId);
      if (plant && densityMode === 'none') {
        prefillDensityFromPlant(plant);
      }
    }
    // Only run when spacingCategories become available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacingCategories]);

  // ---- Derived area calculation ----

  /** Returns derived area in m², or null if inputs are incomplete/invalid. */
  const derivedAreaM2: number | null = (() => {
    const count = parseInt(plantCount, 10);
    if (isNaN(count) || count <= 0) return null;
    if (!plantsPer100m2 || plantsPer100m2 <= 0) return null;
    return (count * 100) / plantsPer100m2;
  })();

  // ---- Budget computations ----

  const totalArea = block.area ?? 0;
  const usedArea = totalArea - (block.availableArea ?? 0);
  const availableArea = block.availableArea ?? 0;

  const overBudget: boolean = derivedAreaM2 != null && derivedAreaM2 > availableArea;
  const overByM2: number = overBudget && derivedAreaM2 != null ? derivedAreaM2 - availableArea : 0;

  // Overflow percentage — shown textually when used + new exceeds total bar width
  const overflowPct = totalArea > 0 && derivedAreaM2 != null
    ? Math.max(0, ((usedArea + derivedAreaM2) / totalArea) * 100 - 100)
    : 0;

  // ---- Preview calculation ----

  const calculatePreview = () => {
    const plant = plants.find((p) => p.plantDataId === selectedPlantId);
    if (!plant || derivedAreaM2 === null) return;

    const count = parseInt(plantCount, 10);
    if (isNaN(count) || count <= 0) return;

    const plantingDateObj = new Date(plantingDate);
    const wastePercent = plant.yieldInfo.expectedWastePercentage || 0;
    const predictedYieldKg = plant.yieldInfo.yieldPerPlant * count * (1 - wastePercent / 100);
    const revenuePerKg = plant.economicsAndLabor?.averageMarketValuePerKg || 0;
    const predictedRevenue = predictedYieldKg * revenuePerKg;
    const totalCycleDays = plant.growthCycle.totalCycleDays;
    const harvestDate = new Date(plantingDateObj);
    harvestDate.setDate(harvestDate.getDate() + totalCycleDays);
    const areaPercentage = totalArea > 0 ? (derivedAreaM2 / totalArea) * 100 : 0;

    setPreview({
      selectedPlant: plant,
      derivedAreaM2,
      plantCount: count,
      plantingDate,
      predictedYieldKg,
      expectedWastePercent: wastePercent,
      predictedRevenue,
      harvestDate: harvestDate.toISOString().split('T')[0],
      totalCycleDays,
      areaPercentage,
    });
  };

  // ---- Validation ----

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedPlantId) {
      newErrors.plant = 'Please select a plant';
    }

    const count = parseInt(plantCount, 10);
    if (!plantCount || isNaN(count) || count <= 0 || !Number.isInteger(count)) {
      newErrors.plantCount = 'Please enter a valid whole number of plants (> 0)';
    }

    if (!plantsPer100m2 || plantsPer100m2 <= 0) {
      newErrors.density = 'Please select or enter a plant density';
    }

    if (!plantingDate) {
      newErrors.plantingDate = 'Please select a planting date';
    }

    // Over-budget is allowed — no hard error here; approval checkbox gates submit.

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePreview = () => {
    if (validateForm()) {
      calculatePreview();
      setShowPreview(true);
    }
  };

  // ---- Submit ----

  const handleSubmit = async () => {
    if (!validateForm() || !preview) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);

      const isoPlantingDate = plantingDate ? `${plantingDate}T00:00:00Z` : undefined;
      const count = parseInt(plantCount, 10);

      const requestData: AddVirtualCropRequest = {
        cropId: selectedPlantId,
        plantCount: count,
        plantsPer100m2: plantsPer100m2,
        plantingDate: isoPlantingDate,
        allowOverArea: overBudget && overBudgetApproved ? true : false,
      };

      const result = await farmApi.addVirtualCrop(block.farmId, block.blockId, requestData);

      const blockCode = result?.blockCode || 'N/A';
      alert(`Virtual crop added successfully! Virtual block code: ${blockCode}`);

      onSuccess();
      handleClose();
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          data?: {
            detail?: string | OverAreaBudgetDetail | unknown;
          };
        };
        message?: string;
      };

      // Safety net: backend returned 409 OVER_AREA_BUDGET after client-side approval check
      if (axiosError.response?.status === 409) {
        const detail = axiosError.response.data?.detail;
        if (
          detail &&
          typeof detail === 'object' &&
          (detail as OverAreaBudgetDetail).code === 'OVER_AREA_BUDGET'
        ) {
          const d = detail as OverAreaBudgetDetail;
          setErrors((prev) => ({
            ...prev,
            overBudget:
              `Required: ${d.requiredAreaM2.toFixed(1)} m² — Available: ${d.availableAreaM2.toFixed(1)} m² ` +
              `— Over by: ${d.overByM2.toFixed(1)} m². Check the approval box to proceed.`,
          }));
          setOverBudgetApproved(false);
          return;
        }
      }

      // Generic error handling
      let errorMsg = 'Failed to add virtual crop. Please try again.';
      if (axiosError.response?.data?.detail) {
        const detail = axiosError.response.data.detail;
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = (detail as Array<{ msg?: string; message?: string }>)
            .map((e) => e.msg || e.message || JSON.stringify(e))
            .join(', ');
        } else if (typeof detail === 'object') {
          errorMsg = JSON.stringify(detail);
        }
      } else if (axiosError.message) {
        errorMsg = axiosError.message;
      }
      alert(errorMsg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPlantId('');
    setPlantCount('');
    setPlantingDate('');
    setErrors({});
    setPreview(null);
    setShowPreview(false);
    setDensityMode('none');
    setDensityUnit('per100m2');
    setCustomDensityInput('');
    setPlantsPer100m2(undefined);
    setOverBudgetApproved(false);
    onClose();
  };

  if (!isOpen) return null;

  const nextVirtualCode = block.blockCode
    ? `${block.blockCode}/${String((block.virtualBlockCounter || 0) + 1).padStart(3, '0')}`
    : 'N/A';

  // Submit button: enabled when not over budget, OR over budget with approval checked
  const submitEnabled = !overBudget || (overBudget && overBudgetApproved);

  const modalContent = (
    <Overlay $isOpen={isOpen}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            {block.state === 'empty' ? 'Add Planting to Block' : 'Add Additional Crop to Block'}
          </ModalTitle>
          <CloseButton onClick={handleClose} aria-label="Close modal">
            <X size={20} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          {loadingPlants ? (
            <LoadingText>Loading plants...</LoadingText>
          ) : (
            <>
              {/* ---- Area Budget Bar ---- */}
              <AreaBudgetSection>
                <AreaBudgetTitle>
                  <BarChart3 size={16} strokeWidth={1.8} />
                  <span>Area Budget (Current)</span>
                </AreaBudgetTitle>

                {/* Green only: committed used area. The projected impact of the new planting
                    is shown in the preview box below. Summary text is rendered by the bar. */}
                <AreaBudgetBar
                  usedAreaM2={usedArea}
                  totalAreaM2={totalArea}
                  displayUnit="m2"
                />

                {/* Low-area nudge */}
                {availableArea < totalArea * 0.2 && totalArea > 0 && (
                  <AreaBudgetWarning>
                    <AlertTriangle size={13} strokeWidth={1.8} /> Limited area remaining — consider block utilization
                  </AreaBudgetWarning>
                )}
              </AreaBudgetSection>

              {/* ---- Parent Block Info ---- */}
              <FormSection>
                <SectionTitle>Parent Block Information</SectionTitle>
                <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                  <div><strong>Block:</strong> {block.blockCode || block.name}</div>
                  <div><strong>Total Area:</strong> {totalArea.toFixed(1)} m²</div>
                  <div><strong>Current Crop:</strong> {block.targetCropName || 'None'}</div>
                </div>

                <VirtualBlockCodePreview>
                  <CodeLabel>New Virtual Block Code (Preview)</CodeLabel>
                  <CodeValue>{nextVirtualCode}</CodeValue>
                </VirtualBlockCodePreview>
              </FormSection>

              {/* ---- Virtual Crop Details ---- */}
              <FormSection>
                <SectionTitle>Virtual Crop Details</SectionTitle>

                {/* Crop selector */}
                <FormGroup>
                  <Label htmlFor="cropSelect">
                    Select Crop<RequiredMark>*</RequiredMark>
                  </Label>
                  <PlantCombobox
                    plants={plants}
                    value={selectedPlantId}
                    onChange={handlePlantChange}
                    hasError={!!errors.plant}
                    disabled={submitting}
                  />
                  {errors.plant && <ErrorText>{errors.plant}</ErrorText>}
                </FormGroup>

                {/* Plant count */}
                <FormGroup>
                  <Label htmlFor="plantCountInput">
                    Number of Plants<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    id="plantCountInput"
                    type="number"
                    value={plantCount}
                    onChange={(e) => {
                      setPlantCount(e.target.value);
                      setOverBudgetApproved(false);
                    }}
                    placeholder="Enter whole number of plants"
                    min="1"
                    step="1"
                    disabled={submitting}
                    aria-describedby="plantCountHelp"
                  />
                  <HelpText id="plantCountHelp">Whole integer plants only.</HelpText>
                  {errors.plantCount && <ErrorText>{errors.plantCount}</ErrorText>}
                </FormGroup>

                {/* Density chooser */}
                <FormGroup>
                  <Label htmlFor="densityChooser">
                    Plant Density<RequiredMark>*</RequiredMark>
                  </Label>
                  <Select
                    id="densityChooser"
                    value={densitySelectValue}
                    onChange={(e) => {
                      handleDensitySelectChange(e.target.value);
                      setOverBudgetApproved(false);
                    }}
                    disabled={submitting}
                    aria-describedby="densityHelp"
                  >
                    <option value="">— Select density —</option>
                    {spacingCategories.length > 0
                      ? spacingCategories.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {formatCategoryDensityLabel(cat)}
                          </option>
                        ))
                      : (Object.keys(SPACING_CATEGORY_LABELS) as SpacingCategory[]).map((key) => (
                          <option key={key} value={key}>
                            {SPACING_CATEGORY_LABELS[key]}
                          </option>
                        ))}
                    <option value="custom">Custom…</option>
                  </Select>
                  <HelpText id="densityHelp">
                    {densityMode === 'none' && 'Select a preset category or enter a custom density.'}
                    {densityMode === 'category' && `Preset density: ${plantsPer100m2 ?? '—'} plants/100 m².`}
                    {densityMode === 'custom' && 'Enter a custom density; stored as integer plants/100 m².'}
                  </HelpText>
                  {errors.density && <ErrorText>{errors.density}</ErrorText>}
                </FormGroup>

                {/* Custom density input row — only shown in custom mode */}
                {densityMode === 'custom' && (
                  <FormGroup>
                    <Label htmlFor="customDensityInput">Custom Density Value</Label>
                    <DensityCustomRow>
                      <Input
                        id="customDensityInput"
                        type="number"
                        min="1"
                        step="1"
                        placeholder={densityUnit === 'perm2' ? 'e.g., 4' : 'e.g., 400'}
                        value={customDensityInput}
                        onChange={(e) => {
                          handleCustomDensityInputChange(e.target.value);
                          setOverBudgetApproved(false);
                        }}
                        disabled={submitting}
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
                    <HelpText>
                      Canonical value:{' '}
                      {plantsPer100m2 != null ? `${plantsPer100m2} plants/100 m²` : '—'}
                    </HelpText>
                  </FormGroup>
                )}

                {/* Warning if no density was prefilled from plant */}
                {selectedPlantId && densityMode === 'none' && (
                  <NoSpacingWarning>
                    <AlertTriangle size={14} strokeWidth={1.8} />
                    <span>
                      This plant has no default density configured. Select a preset category or enter
                      a custom value above.
                    </span>
                  </NoSpacingWarning>
                )}

                {/* Live derived area display */}
                {derivedAreaM2 !== null && (
                  <DerivedAreaPreview>
                    <Ruler size={15} strokeWidth={1.8} />
                    <span>
                      <strong>Derived area:</strong> {derivedAreaM2.toFixed(2)} m²
                      {' '}({plantCount} plants ÷ {plantsPer100m2} plants/100 m² × 100)
                    </span>
                  </DerivedAreaPreview>
                )}

                {/* Planting date */}
                <FormGroup>
                  <Label htmlFor="plantingDateInput">
                    Planting Date<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    id="plantingDateInput"
                    type="date"
                    value={plantingDate}
                    onChange={(e) => setPlantingDate(e.target.value)}
                    disabled={submitting}
                  />
                  {errors.plantingDate && <ErrorText>{errors.plantingDate}</ErrorText>}
                </FormGroup>
              </FormSection>

              {/* ---- Predicted yield / waste preview ---- */}
              <PreviewSection $visible={showPreview && preview !== null}>
                {preview && (
                  <>
                    <PreviewTitle>
                      <TrendingUp size={17} strokeWidth={1.8} />
                      <span>Virtual Crop Preview</span>
                    </PreviewTitle>

                    <PreviewGrid>
                      <PreviewItem>
                        <PreviewLabel>Predicted Yield</PreviewLabel>
                        <PreviewValue>{preview.predictedYieldKg.toFixed(1)} kg</PreviewValue>
                        <PreviewSubtext>
                          {preview.selectedPlant?.yieldInfo.yieldPerPlant}{' '}
                          {preview.selectedPlant?.yieldInfo.yieldUnit}/plant
                        </PreviewSubtext>
                        {preview.expectedWastePercent > 0 && (
                          <PreviewSubtext>
                            after {preview.expectedWastePercent}% expected waste
                          </PreviewSubtext>
                        )}
                      </PreviewItem>

                      {preview.predictedRevenue > 0 && (
                        <PreviewItem>
                          <PreviewLabel>Predicted Revenue</PreviewLabel>
                          <PreviewValue>AED {preview.predictedRevenue.toFixed(0)}</PreviewValue>
                          <PreviewSubtext>
                            @ AED {preview.selectedPlant?.economicsAndLabor?.averageMarketValuePerKg}/kg
                          </PreviewSubtext>
                        </PreviewItem>
                      )}

                      <PreviewItem>
                        <PreviewLabel>Cycle Duration</PreviewLabel>
                        <PreviewValue>{preview.totalCycleDays} days</PreviewValue>
                        <PreviewSubtext>From planting to harvest</PreviewSubtext>
                      </PreviewItem>

                      <PreviewItem>
                        <PreviewLabel>Derived Area</PreviewLabel>
                        <PreviewValue style={{ fontSize: '18px' }}>
                          {preview.derivedAreaM2.toFixed(2)} m²
                        </PreviewValue>
                        <PreviewSubtext>
                          {preview.areaPercentage.toFixed(0)}% of {block.area?.toFixed(0)} m² total
                        </PreviewSubtext>
                      </PreviewItem>

                      <PreviewItem>
                        <PreviewLabel>Expected Harvest</PreviewLabel>
                        <PreviewValue style={{ fontSize: '16px' }}>
                          {farmApi.formatDateForDisplay(preview.harvestDate)}
                        </PreviewValue>
                        <PreviewSubtext>Based on growth cycle</PreviewSubtext>
                      </PreviewItem>
                    </PreviewGrid>

                    {/* Projected area budget — LIVE impact of THIS planting (green used +
                        red new + overflow). The top widget shows current/committed only. */}
                    <AreaBudgetSection style={{ marginTop: '20px', marginBottom: 0 }}>
                      <AreaBudgetTitle>
                        <BarChart3 size={16} strokeWidth={1.8} />
                        <span>Projected Area Budget</span>
                      </AreaBudgetTitle>

                      <AreaBudgetBar
                        usedAreaM2={usedArea}
                        totalAreaM2={totalArea}
                        newAreaM2={preview.derivedAreaM2}
                        displayUnit="m2"
                        showSummary={false}
                      />

                      <AreaBudgetText>
                        {availableArea.toFixed(1)} m² available · {usedArea.toFixed(1)} m² used ·{' '}
                        {totalArea.toFixed(1)} m² total
                        <span style={{ color: overBudget ? theme.colors.bright.coral : theme.colors.bright.emerald }}>
                          {' '}— new crop needs {preview.derivedAreaM2.toFixed(1)} m²
                        </span>
                      </AreaBudgetText>

                      {overBudget && (
                        <>
                          <AreaBudgetError>
                            <AlertTriangle size={13} strokeWidth={1.8} style={{ verticalAlign: '-2px' }} /> Over budget by {overByM2.toFixed(1)} m² — required{' '}
                            {preview.derivedAreaM2.toFixed(1)} m², only {availableArea.toFixed(1)} m² available.
                            {overflowPct > 0 && ` (${overflowPct.toFixed(0)}% overflow)`}
                          </AreaBudgetError>
                          <ApprovalCheckboxRow>
                            <ApprovalCheckbox
                              type="checkbox"
                              checked={overBudgetApproved}
                              onChange={(e) => setOverBudgetApproved(e.target.checked)}
                              id="overBudgetApproval"
                            />
                            <span>
                              I understand this exceeds the available area and approve the over-budget allocation
                            </span>
                          </ApprovalCheckboxRow>
                        </>
                      )}

                      {errors.overBudget && (
                        <AreaBudgetError>
                          {errors.overBudget}
                          <ApprovalCheckboxRow style={{ marginTop: 8 }}>
                            <ApprovalCheckbox
                              type="checkbox"
                              checked={overBudgetApproved}
                              onChange={(e) => setOverBudgetApproved(e.target.checked)}
                              id="overBudgetApprovalBackend"
                            />
                            <span>Allow exceeding the available area</span>
                          </ApprovalCheckboxRow>
                        </AreaBudgetError>
                      )}
                    </AreaBudgetSection>
                  </>
                )}
              </PreviewSection>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>

          <Button
            type="button"
            $variant="primary"
            onClick={handlePreview}
            disabled={
              !selectedPlantId ||
              !plantCount ||
              !plantsPer100m2 ||
              !plantingDate ||
              submitting
            }
          >
            <BarChart3 size={14} strokeWidth={1.8} /> Preview
          </Button>

          {showPreview && (
            <Button
              type="button"
              $variant="success"
              onClick={handleSubmit}
              disabled={submitting || !submitEnabled}
              title={
                overBudget && !overBudgetApproved
                  ? 'Check the over-budget approval box to confirm'
                  : undefined
              }
            >
              {submitting ? 'Adding...' : (<><Check size={14} strokeWidth={2} /> Confirm & Add Crop</>)}
            </Button>
          )}
        </ModalFooter>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
