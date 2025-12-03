/**
 * EditPlantDataModal Component
 *
 * Modal dialog for editing existing plant data entries.
 * Pre-populates form with existing data and shows current version.
 */

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { plantDataEnhancedApi } from '../../services/plantDataEnhancedApi';
import type {
  PlantDataEnhanced,
  PlantDataEnhancedUpdate,
  PlantTypeEnum,
  FarmTypeCompatibility,
  SpacingCategory,
} from '../../types/farm';
import { SPACING_CATEGORY_LABELS, SPACING_CATEGORY_EXAMPLES } from '../../types/farm';

// ============================================================================
// VALIDATION SCHEMA (Same as Add but all fields optional for PATCH)
// ============================================================================

const plantDataSchema = z.object({
  plantName: z.string().min(1, 'Plant name is required').max(100, 'Name too long').optional(),
  scientificName: z.string().optional(),
  plantType: z.enum(['crop', 'tree', 'herb', 'fruit', 'vegetable', 'ornamental', 'medicinal']).optional(),
  farmTypeCompatibility: z.array(z.string()).min(1, 'Select at least one farm type').optional(),
  tags: z.string().optional(),
  spacingCategory: z.enum(['xs', 's', 'm', 'l', 'xl', 'bush', 'large_bush', 'small_tree', 'medium_tree', 'large_tree']).optional(),

  // Growth Cycle - Using valueAsNumber in register() instead of preprocess
  germinationDays: z.number().nonnegative('Cannot be negative').optional(),
  vegetativeDays: z.number().nonnegative('Cannot be negative').optional(),
  floweringDays: z.number().nonnegative('Cannot be negative').optional(),
  fruitingDays: z.number().nonnegative('Cannot be negative').optional(),
  harvestDurationDays: z.number().nonnegative('Cannot be negative').optional(),
  totalCycleDays: z.number().min(1, 'Total cycle must be at least 1 day').optional(),

  // Yield Info
  yieldPerPlant: z.number().min(0.01, 'Yield must be greater than 0').optional(),
  yieldUnit: z.string().min(1, 'Yield unit is required').optional(),
  expectedWastePercent: z.number().nonnegative('Cannot be negative').max(100, 'Cannot exceed 100%').optional(),

  // Environmental Requirements
  temperatureMin: z.number().optional(),
  temperatureOptimal: z.number().optional(),
  temperatureMax: z.number().optional(),
  humidityMin: z.number().nonnegative().max(100).optional(),
  humidityOptimal: z.number().nonnegative().max(100).optional(),
  humidityMax: z.number().nonnegative().max(100).optional(),

  // Watering Requirements
  wateringFrequencyDays: z.number().min(1, 'Must be at least 1 day').optional(),
  waterAmountPerPlant: z.number().nonnegative().optional(),
  waterAmountUnit: z.string().optional(),

  // Soil Requirements
  phMin: z.number().nonnegative('pH min must be 0-14').max(14, 'pH max is 14').optional(),
  phOptimal: z.number().nonnegative('pH optimal must be 0-14').max(14, 'pH max is 14').optional(),
  phMax: z.number().nonnegative('pH max must be 0-14').max(14, 'pH max is 14').optional(),

  // Light Requirements
  dailyLightHoursMin: z.number().nonnegative().max(24).optional(),
  dailyLightHoursOptimal: z.number().nonnegative().max(24).optional(),
  dailyLightHoursMax: z.number().nonnegative().max(24).optional(),

  // Economics
  averageMarketValuePerKg: z.number().nonnegative().optional(),
  currency: z.string().optional(),

  // Additional Info
  spacingBetweenPlantsCm: z.number().nonnegative().optional(),
  spacingBetweenRowsCm: z.number().nonnegative().optional(),
  notes: z.string().optional(),

  isActive: z.boolean().optional(),
});

type PlantDataFormData = z.infer<typeof plantDataSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface EditPlantDataModalProps {
  isOpen: boolean;
  plantData: PlantDataEnhanced | null;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// STYLED COMPONENTS (Reuse from AddPlantDataModal)
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 16px;
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
`;

const ModalHeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const VersionBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  width: fit-content;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #616161;
  padding: 4px 8px;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #212121;
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
  border-bottom: 2px solid #e0e0e0;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const OptionalBadge = styled.span`
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 9999px;
  background: #9e9e9e;
  color: white;
  text-transform: uppercase;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const TextArea = styled.textarea<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #EF4444;
`;

const HelpText = styled.span`
  font-size: 12px;
  color: #9e9e9e;
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const CheckboxText = styled.span`
  font-size: 14px;
  color: #212121;
`;

const ExpandButton = styled.button<{ $expanded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  color: #3B82F6;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: #f5f5f5;
  }
`;

const StatusToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f5f5f5;
`;

const StatusLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

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
      background-color: #10B981;
    }

    &:checked + span:before {
      transform: translateX(24px);
    }
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e0e0e0;
    transition: 0.3s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: '';
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  position: sticky;
  bottom: 0;
  background: white;
`;

const SuccessMessage = styled.div`
  padding: 12px 16px;
  background: #D1FAE5;
  color: #059669;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  background: #FEE2E2;
  color: #EF4444;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        &:hover:not(:disabled) {
          background: #1976d2;
        }
      `;
    }
    return `
      background: transparent;
      color: #616161;
      border: 1px solid #e0e0e0;
      &:hover:not(:disabled) {
        background: #f5f5f5;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// Schedule Editor Components
const ScheduleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ScheduleItem = styled.div`
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ScheduleItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ScheduleItemTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
`;

const RemoveButton = styled.button`
  padding: 6px 12px;
  background: #FEE2E2;
  color: #EF4444;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #FECACA;
  }
`;

const AddButton = styled.button`
  padding: 10px 16px;
  background: #E0F2FE;
  color: #0284C7;
  border: 1px dashed #0284C7;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  width: 100%;

  &:hover {
    background: #BAE6FD;
  }
`;

const ScheduleItemFields = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function EditPlantDataModal({ isOpen, plantData, onClose, onSuccess }: EditPlantDataModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    reset,
    control,
    watch,
    setValue,
  } = useForm<PlantDataFormData>({
    resolver: zodResolver(plantDataSchema),
  });

  const selectedFarmTypes = watch('farmTypeCompatibility') || [];

  // Pre-populate form when plantData changes
  useEffect(() => {
    if (plantData) {
      // Reset form with default values for ALL fields to prevent controlled/uncontrolled errors
      reset({
        plantName: plantData.plantName || '',
        scientificName: plantData.scientificName || '',
        plantType: plantData.plantType || 'vegetable',
        farmTypeCompatibility: plantData.farmTypeCompatibility || [],
        tags: plantData.tags?.join(', ') || '',
        spacingCategory: plantData.spacingCategory || undefined,

        germinationDays: plantData.growthCycle?.germinationDays ?? undefined,
        vegetativeDays: plantData.growthCycle?.vegetativeDays ?? undefined,
        floweringDays: plantData.growthCycle?.floweringDays ?? undefined,
        fruitingDays: plantData.growthCycle?.fruitingDays ?? undefined,
        harvestDurationDays: plantData.growthCycle?.harvestDurationDays ?? undefined,
        totalCycleDays: plantData.growthCycle?.totalCycleDays ?? undefined,

        yieldPerPlant: plantData.yieldInfo?.yieldPerPlant ?? undefined,
        yieldUnit: plantData.yieldInfo?.yieldUnit || '',
        expectedWastePercent: plantData.yieldInfo?.expectedWastePercentage ?? undefined,

        temperatureMin: plantData.environmentalRequirements?.temperatureMin ?? undefined,
        temperatureOptimal: plantData.environmentalRequirements?.temperatureOptimal ?? undefined,
        temperatureMax: plantData.environmentalRequirements?.temperatureMax ?? undefined,
        humidityMin: plantData.environmentalRequirements?.humidityMin ?? undefined,
        humidityOptimal: plantData.environmentalRequirements?.humidityOptimal ?? undefined,
        humidityMax: plantData.environmentalRequirements?.humidityMax ?? undefined,

        wateringFrequencyDays: plantData.wateringRequirements?.wateringFrequencyDays ?? undefined,
        waterAmountPerPlant: plantData.wateringRequirements?.waterAmountPerPlant ?? undefined,
        waterAmountUnit: plantData.wateringRequirements?.waterAmountUnit || '',

        phMin: plantData.soilRequirements?.phMin ?? undefined,
        phOptimal: plantData.soilRequirements?.phOptimal ?? undefined,
        phMax: plantData.soilRequirements?.phMax ?? undefined,

        dailyLightHoursMin: plantData.lightRequirements?.dailyLightHoursMin ?? undefined,
        dailyLightHoursOptimal: plantData.lightRequirements?.dailyLightHoursOptimal ?? undefined,
        dailyLightHoursMax: plantData.lightRequirements?.dailyLightHoursMax ?? undefined,

        averageMarketValuePerKg: plantData.economicsAndLabor?.averageMarketValuePerKg ?? undefined,
        currency: plantData.economicsAndLabor?.currency || '',

        spacingBetweenPlantsCm: plantData.additionalInfo?.spacingBetweenPlantsCm ?? undefined,
        spacingBetweenRowsCm: plantData.additionalInfo?.spacingBetweenRowsCm ?? undefined,
        notes: plantData.additionalInfo?.notes || '',

        isActive: plantData.isActive ?? true,
      });
    }
  }, [plantData, reset]);

  const onSubmit = async (data: PlantDataFormData) => {
    if (!plantData) {
      return;
    }

    try {
      setSubmitting(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      // Transform form data to API format (only send changed fields)
      // Note: plantType and isActive are not supported by backend update model
      const updateData: PlantDataEnhancedUpdate = {
        plantName: data.plantName,
        scientificName: data.scientificName,
        farmTypeCompatibility: data.farmTypeCompatibility as FarmTypeCompatibility[],
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        spacingCategory: data.spacingCategory as SpacingCategory,

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
          expectedWastePercentage: data.expectedWastePercent ?? 0,
        },

        // NOTE: Advanced fields (environmentalRequirements, wateringRequirements, soilRequirements,
        // lightRequirements, economicsAndLabor, additionalInfo) require complex nested structures
        // that don't match the simple form fields. These are preserved from original data during updates.
        // Only the basic fields above are updated via this form.
      };

      console.log('Sending update data:', JSON.stringify(updateData, null, 2));
      const updated = await plantDataEnhancedApi.updatePlantDataEnhanced(plantData.plantDataId, updateData);

      setSuccessMessage(`Plant "${updated.plantName}" updated to version ${updated.dataVersion}!`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Error updating plant data:', error);
      console.error('Error response data:', error.response?.data);
      const errorDetail = error.response?.data?.detail;
      const errorMsg = typeof errorDetail === 'string'
        ? errorDetail
        : Array.isArray(errorDetail)
          ? errorDetail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
          : error.response?.data?.message || 'Failed to update plant data. Please try again.';
      setErrorMessage(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setSuccessMessage(null);
      setErrorMessage(null);
      setShowAdvanced(false);
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const toggleFarmType = (farmType: string) => {
    const current = selectedFarmTypes;
    const updated = current.includes(farmType)
      ? current.filter(ft => ft !== farmType)
      : [...current, farmType];
    return updated;
  };

  if (!plantData) return null;

  return (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <Modal>
        <ModalHeader>
          <ModalHeaderContent>
            <ModalTitle>Edit Plant Data</ModalTitle>
            <VersionBadge>
              Current Version: v{plantData.dataVersion}
            </VersionBadge>
          </ModalHeaderContent>
          <CloseButton onClick={handleClose} disabled={submitting}>
            ✕
          </CloseButton>
        </ModalHeader>

        <Form onSubmit={handleSubmit(onSubmit)}>
        <ModalBody>
            {/* BASIC INFORMATION */}
            <Section>
              <SectionHeader>
                <SectionTitle>Basic Information</SectionTitle>
              </SectionHeader>

              <FormGroup>
                <Label htmlFor="plantName">Plant Name</Label>
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
                  <Label htmlFor="scientificName">Scientific Name</Label>
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
                  <Label htmlFor="plantType">Plant Type</Label>
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

                <FormGroup>
                  <Label htmlFor="spacingCategory">Spacing Category</Label>
                  <Select
                    id="spacingCategory"
                    $hasError={!!errors.spacingCategory}
                    disabled={submitting}
                    {...register('spacingCategory')}
                  >
                    <option value="">-- Select --</option>
                    {(Object.keys(SPACING_CATEGORY_LABELS) as SpacingCategory[]).map((key) => (
                      <option key={key} value={key}>
                        {SPACING_CATEGORY_LABELS[key]} ({SPACING_CATEGORY_EXAMPLES[key]})
                      </option>
                    ))}
                  </Select>
                  <HelpText>Determines plant density for auto-calculations</HelpText>
                  {errors.spacingCategory && <ErrorText>{errors.spacingCategory.message}</ErrorText>}
                </FormGroup>
              </GridRow>

              <FormGroup>
                <Label>Farm Type Compatibility</Label>
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
                {errors.farmTypeCompatibility && <ErrorText>{errors.farmTypeCompatibility.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  type="text"
                  placeholder="e.g., organic, heirloom, drought-resistant"
                  disabled={submitting}
                  {...register('tags')}
                />
              </FormGroup>

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
            </Section>

            {/* GROWTH CYCLE */}
            <Section>
              <SectionHeader>
                <SectionTitle>Growth Cycle</SectionTitle>
              </SectionHeader>

              <GridRow $columns={3}>
                <FormGroup>
                  <Label htmlFor="germinationDays">Germination (days)</Label>
                  <Input
                    id="germinationDays"
                    type="number"
                    min="0"
                    step="1"
                    disabled={submitting}
                    {...register('germinationDays', {
                      setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v)
                    })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="vegetativeDays">Vegetative (days)</Label>
                  <Input
                    id="vegetativeDays"
                    type="number"
                    min="0"
                    step="1"
                    disabled={submitting}
                    {...register('vegetativeDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="floweringDays">Flowering (days)</Label>
                  <Input
                    id="floweringDays"
                    type="number"
                    min="0"
                    step="1"
                    disabled={submitting}
                    {...register('floweringDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                </FormGroup>
              </GridRow>

              <GridRow>
                <FormGroup>
                  <Label htmlFor="fruitingDays">Fruiting (days)</Label>
                  <Input
                    id="fruitingDays"
                    type="number"
                    min="0"
                    step="1"
                    disabled={submitting}
                    {...register('fruitingDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="harvestDurationDays">Harvest Duration (days)</Label>
                  <Input
                    id="harvestDurationDays"
                    type="number"
                    min="0"
                    step="1"
                    disabled={submitting}
                    {...register('harvestDurationDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                </FormGroup>
              </GridRow>

              <FormGroup>
                <Label htmlFor="totalCycleDays">Total Cycle Days</Label>
                <Input
                  id="totalCycleDays"
                  type="number"
                  min="1"
                  step="1"
                  $hasError={!!errors.totalCycleDays}
                  disabled={submitting}
                  {...register('totalCycleDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                />
                {errors.totalCycleDays && <ErrorText>{errors.totalCycleDays.message}</ErrorText>}
              </FormGroup>
            </Section>

            {/* YIELD INFORMATION */}
            <Section>
              <SectionHeader>
                <SectionTitle>Yield Information</SectionTitle>
              </SectionHeader>

              <GridRow $columns={3}>
                <FormGroup>
                  <Label htmlFor="yieldPerPlant">Yield Per Plant</Label>
                  <Input
                    id="yieldPerPlant"
                    type="number"
                    min="0.01"
                    step="0.01"
                    $hasError={!!errors.yieldPerPlant}
                    disabled={submitting}
                    {...register('yieldPerPlant', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                  {errors.yieldPerPlant && <ErrorText>{errors.yieldPerPlant.message}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="yieldUnit">Yield Unit</Label>
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
                    disabled={submitting}
                    {...register('expectedWastePercent', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })}
                  />
                </FormGroup>
              </GridRow>
            </Section>

            {/* ADVANCED FIELDS TOGGLE */}
            <ExpandButton
              type="button"
              $expanded={showAdvanced}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▼' : '▶'} {showAdvanced ? 'Hide' : 'Show'} Advanced Fields
            </ExpandButton>

            {/* ADVANCED SECTIONS (same as AddPlantDataModal) */}
            {showAdvanced && (
              <>
                <Section>
                  <SectionHeader>
                    <SectionTitle>Environmental Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="temperatureMin">Min Temp (°C)</Label>
                      <Input id="temperatureMin" type="number" step="0.1" disabled={submitting} {...register('temperatureMin', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="temperatureOptimal">Optimal Temp (°C)</Label>
                      <Input id="temperatureOptimal" type="number" step="0.1" disabled={submitting} {...register('temperatureOptimal', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="temperatureMax">Max Temp (°C)</Label>
                      <Input id="temperatureMax" type="number" step="0.1" disabled={submitting} {...register('temperatureMax', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>
                  </GridRow>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="humidityMin">Min Humidity (%)</Label>
                      <Input id="humidityMin" type="number" min="0" max="100" step="1" disabled={submitting} {...register('humidityMin', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="humidityOptimal">Optimal Humidity (%)</Label>
                      <Input id="humidityOptimal" type="number" min="0" max="100" step="1" disabled={submitting} {...register('humidityOptimal', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="humidityMax">Max Humidity (%)</Label>
                      <Input id="humidityMax" type="number" min="0" max="100" step="1" disabled={submitting} {...register('humidityMax', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>
                  </GridRow>
                </Section>

                <Section>
                  <SectionHeader>
                    <SectionTitle>Watering Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="wateringFrequencyDays">Watering Frequency (days)</Label>
                      <Input id="wateringFrequencyDays" type="number" min="1" step="1" disabled={submitting} {...register('wateringFrequencyDays', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="waterAmountPerPlant">Water Amount Per Plant</Label>
                      <Input id="waterAmountPerPlant" type="number" min="0" step="0.1" disabled={submitting} {...register('waterAmountPerPlant', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="waterAmountUnit">Water Unit</Label>
                      <Input id="waterAmountUnit" type="text" placeholder="L, gal, ml" disabled={submitting} {...register('waterAmountUnit')} />
                    </FormGroup>
                  </GridRow>
                </Section>

                <Section>
                  <SectionHeader>
                    <SectionTitle>Soil Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="phMin">Min pH (0-14)</Label>
                      <Input id="phMin" type="number" min="0" max="14" step="0.1" $hasError={!!errors.phMin} disabled={submitting} {...register('phMin', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="phOptimal">Optimal pH (0-14)</Label>
                      <Input id="phOptimal" type="number" min="0" max="14" step="0.1" $hasError={!!errors.phOptimal} disabled={submitting} {...register('phOptimal', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="phMax">Max pH (0-14)</Label>
                      <Input id="phMax" type="number" min="0" max="14" step="0.1" $hasError={!!errors.phMax} disabled={submitting} {...register('phMax', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>
                  </GridRow>
                </Section>

                <Section>
                  <SectionHeader>
                    <SectionTitle>Light Requirements</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow $columns={3}>
                    <FormGroup>
                      <Label htmlFor="dailyLightHoursMin">Min Light Hours/Day</Label>
                      <Input id="dailyLightHoursMin" type="number" min="0" max="24" step="0.5" disabled={submitting} {...register('dailyLightHoursMin', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="dailyLightHoursOptimal">Optimal Light Hours/Day</Label>
                      <Input id="dailyLightHoursOptimal" type="number" min="0" max="24" step="0.5" disabled={submitting} {...register('dailyLightHoursOptimal', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="dailyLightHoursMax">Max Light Hours/Day</Label>
                      <Input id="dailyLightHoursMax" type="number" min="0" max="24" step="0.5" disabled={submitting} {...register('dailyLightHoursMax', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>
                  </GridRow>
                </Section>

                <Section>
                  <SectionHeader>
                    <SectionTitle>Economics & Market Value</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow>
                    <FormGroup>
                      <Label htmlFor="averageMarketValuePerKg">Market Value Per Kg</Label>
                      <Input id="averageMarketValuePerKg" type="number" min="0" step="0.01" disabled={submitting} {...register('averageMarketValuePerKg', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="currency">Currency</Label>
                      <Input id="currency" type="text" placeholder="USD, EUR, etc." disabled={submitting} {...register('currency')} />
                    </FormGroup>
                  </GridRow>
                </Section>

                <Section>
                  <SectionHeader>
                    <SectionTitle>Additional Information</SectionTitle>
                    <OptionalBadge>Optional</OptionalBadge>
                  </SectionHeader>

                  <GridRow>
                    <FormGroup>
                      <Label htmlFor="spacingBetweenPlantsCm">Plant Spacing (cm)</Label>
                      <Input id="spacingBetweenPlantsCm" type="number" min="0" step="1" disabled={submitting} {...register('spacingBetweenPlantsCm', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="spacingBetweenRowsCm">Row Spacing (cm)</Label>
                      <Input id="spacingBetweenRowsCm" type="number" min="0" step="1" disabled={submitting} {...register('spacingBetweenRowsCm', { setValueAs: v => v === '' || isNaN(v) ? undefined : Number(v) })} />
                    </FormGroup>
                  </GridRow>

                  <FormGroup>
                    <Label htmlFor="notes">Notes</Label>
                    <TextArea id="notes" placeholder="Any additional information about this plant..." disabled={submitting} {...register('notes')} />
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
              {submitting ? 'Updating...' : 'Update Plant Data'}
            </Button>
          </FooterActions>
        </ModalFooter>
          </Form>
      </Modal>
    </Overlay>
  );
}
