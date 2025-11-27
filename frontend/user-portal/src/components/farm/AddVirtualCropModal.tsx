/**
 * AddVirtualCropModal Component
 *
 * Modal for adding virtual crops to a physical block with available area.
 * Shows area budget, plant selection, and preview of predicted outcomes.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { farmApi, calculatePlantCount } from '../../services/farmApi';
import { getActivePlants } from '../../services/plantDataEnhancedApi';
import type { Block, PlantDataEnhanced, AddVirtualCropRequest } from '../../types/farm';
import { SPACING_CATEGORY_LABELS } from '../../types/farm';

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
  allocatedArea: number;
  plantCount: number;
  plantingDate: string;
  // Calculated fields
  predictedYieldKg: number;
  predictedRevenue: number;
  harvestDate: string;
  totalCycleDays: number;
  areaPercentage: number;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
  pointer-events: auto;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 28px;
  color: #757575;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
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
  font-size: 16px;
  font-weight: 600;
  color: #424242;
  margin: 0 0 16px 0;
`;

const AreaBudgetSection = styled.div`
  background: #f5f9ff;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
`;

const AreaBudgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1976d2;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AreaBudgetBar = styled.div<{ $used: number; $total: number }>`
  width: 100%;
  height: 24px;
  background: #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${({ $used, $total }) => ($total > 0 ? ($used / $total) * 100 : 0)}%;
    background: linear-gradient(90deg, #3b82f6, #1976d2);
    transition: width 300ms ease-in-out;
  }
`;

const AreaBudgetText = styled.div`
  font-size: 14px;
  color: #616161;
  text-align: center;
  margin-bottom: 8px;
`;

const AreaBudgetWarning = styled.div`
  font-size: 12px;
  color: #f59e0b;
  text-align: center;
  font-weight: 500;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #616161;
  margin-bottom: 8px;
`;

const RequiredMark = styled.span`
  color: #f44336;
  margin-left: 4px;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #212121;
  background: white;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #212121;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const HelpText = styled.div`
  font-size: 12px;
  color: #757575;
  margin-top: 4px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: #f44336;
  margin-top: 4px;
`;

const PreviewSection = styled.div<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
  background: #f0fdf4;
  border: 1px solid #4caf50;
  border-radius: 8px;
  padding: 20px;
  margin-top: 24px;
`;

const PreviewTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #2e7d32;
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
  background: white;
  border-radius: 6px;
  padding: 16px;
`;

const PreviewLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
`;

const PreviewValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
`;

const PreviewSubtext = styled.div`
  font-size: 12px;
  color: #757575;
  margin-top: 4px;
`;

const ModalFooter = styled.div`
  padding: 20px 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  background: white;
  flex-shrink: 0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'success' }>`
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          &:hover:not(:disabled) {
            background: #2563eb;
          }
        `;
      case 'success':
        return `
          background: #4caf50;
          color: white;
          &:hover:not(:disabled) {
            background: #388e3c;
          }
        `;
      default:
        return `
          background: #f5f5f5;
          color: #616161;
          &:hover:not(:disabled) {
            background: #e0e0e0;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 40px;
  color: #757575;
`;

const VirtualBlockCodePreview = styled.div`
  background: white;
  border-radius: 6px;
  padding: 16px;
  margin-top: 16px;
  border: 2px dashed #3b82f6;
`;

const CodeLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #757575;
  margin-bottom: 4px;
`;

const CodeValue = styled.div`
  font-size: 20px;
  font-weight: 600;
  color: #3b82f6;
  font-family: 'JetBrains Mono', monospace;
`;

const AutoCalculationInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #e8f5e9;
  border: 1px solid #81c784;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 13px;
  color: #2e7d32;
`;

const AutoCalcIcon = styled.span`
  font-size: 16px;
`;

const ManualOverrideButton = styled.button`
  background: none;
  border: none;
  color: #1976d2;
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
  margin-left: auto;

  &:hover {
    color: #1565c0;
  }
`;

const NoSpacingWarning = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff3e0;
  border: 1px solid #ffb74d;
  border-radius: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: #e65100;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AddVirtualCropModal({ isOpen, onClose, block, onSuccess }: AddVirtualCropModalProps) {
  const [plants, setPlants] = useState<PlantDataEnhanced[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [allocatedArea, setAllocatedArea] = useState<string>('');
  const [plantCount, setPlantCount] = useState<string>('');
  const [plantingDate, setPlantingDate] = useState<string>('');

  // Auto-calculation state
  const [isAutoCalculated, setIsAutoCalculated] = useState(false);
  const [calculatedPlantCount, setCalculatedPlantCount] = useState<number | null>(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [calculationInfo, setCalculationInfo] = useState<string>('');

  // Preview state
  const [preview, setPreview] = useState<VirtualCropPreview | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load plant data on mount
  useEffect(() => {
    if (isOpen) {
      loadPlants();
      // Set default planting date to today
      setPlantingDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const loadPlants = async () => {
    try {
      setLoadingPlants(true);
      // Only load active plants for the dropdown
      const activePlants = await getActivePlants();
      setPlants(activePlants);
    } catch (error) {
      console.error('Error loading plants:', error);
      alert('Failed to load plant data. Please try again.');
    } finally {
      setLoadingPlants(false);
    }
  };

  // Auto-calculate plant count when plant or area changes
  const autoCalculatePlantCount = useCallback(async (plant: PlantDataEnhanced, areaSqm: number) => {
    if (!plant.spacingCategory || areaSqm <= 0) {
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
      return;
    }

    try {
      // Virtual blocks use square meters directly
      const result = await calculatePlantCount(areaSqm, 'sqm', plant.spacingCategory);

      setCalculatedPlantCount(result.plantCount);
      setIsAutoCalculated(true);

      setCalculationInfo(
        `${result.plantsPerHundredSqm} plants/100m² × ${areaSqm.toFixed(0)}m² = ${result.plantCount} plants`
      );

      // Only set if not manually overridden
      if (!isManualOverride) {
        setPlantCount(String(result.plantCount));
      }
    } catch (error) {
      console.error('Error calculating plant count:', error);
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
    }
  }, [isManualOverride]);

  // Effect to trigger auto-calculation when plant or area changes
  useEffect(() => {
    const area = parseFloat(allocatedArea);
    if (selectedPlantId && !isNaN(area) && area > 0) {
      const plant = plants.find((p) => p.plantDataId === selectedPlantId);
      if (plant) {
        autoCalculatePlantCount(plant, area);
      }
    } else if (!selectedPlantId) {
      // Reset when no plant selected
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
      setIsManualOverride(false);
    }
  }, [selectedPlantId, allocatedArea, plants, autoCalculatePlantCount]);

  // Handle plant selection
  const handlePlantChange = (plantId: string) => {
    setSelectedPlantId(plantId);
    setIsManualOverride(false);
  };

  // Handle area change
  const handleAreaChange = (value: string) => {
    setAllocatedArea(value);
    setIsManualOverride(false); // Reset override when area changes
  };

  // Handle manual plant count change
  const handlePlantCountChange = (value: string) => {
    setPlantCount(value);
    if (isAutoCalculated && calculatedPlantCount !== null) {
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue !== calculatedPlantCount) {
        setIsManualOverride(true);
      }
    }
  };

  // Reset to auto-calculated value
  const handleResetToAuto = () => {
    if (calculatedPlantCount !== null) {
      setPlantCount(String(calculatedPlantCount));
      setIsManualOverride(false);
    }
  };

  const calculatePreview = () => {
    const plant = plants.find((p) => p.plantDataId === selectedPlantId);
    if (!plant) return;

    const area = parseFloat(allocatedArea);
    const count = parseInt(plantCount);
    if (isNaN(area) || area <= 0 || isNaN(count) || count <= 0) return;

    const plantingDateObj = new Date(plantingDate);

    // Calculate predicted yield
    const wastePercent = plant.yieldInfo.expectedWastePercent || 0;
    const predictedYieldKg = plant.yieldInfo.yieldPerPlant * count * (1 - wastePercent / 100);

    // Calculate revenue if economic data exists
    const revenuePerKg = plant.economicsAndLabor?.averageMarketValuePerKg || 0;
    const predictedRevenue = predictedYieldKg * revenuePerKg;

    // Calculate timeline
    const totalCycleDays = plant.growthCycle.totalCycleDays;
    const harvestDate = new Date(plantingDateObj);
    harvestDate.setDate(harvestDate.getDate() + totalCycleDays);

    // Calculate area percentage
    const areaPercentage = (area / (block.area || 1)) * 100;

    setPreview({
      selectedPlant: plant,
      allocatedArea: area,
      plantCount: count,
      plantingDate,
      predictedYieldKg,
      predictedRevenue,
      harvestDate: harvestDate.toISOString().split('T')[0],
      totalCycleDays,
      areaPercentage,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedPlantId) {
      newErrors.plant = 'Please select a plant';
    }

    const area = parseFloat(allocatedArea);
    if (!allocatedArea || isNaN(area) || area <= 0) {
      newErrors.allocatedArea = 'Please enter a valid area';
    } else if (area > (block.availableArea || 0)) {
      newErrors.allocatedArea = `Cannot exceed available area of ${block.availableArea?.toFixed(0)} m²`;
    }

    const count = parseInt(plantCount);
    if (!plantCount || isNaN(count) || count <= 0) {
      newErrors.plantCount = 'Please enter a valid plant count';
    }

    if (!plantingDate) {
      newErrors.plantingDate = 'Please select a planting date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePreview = () => {
    if (validateForm()) {
      calculatePreview();
      setShowPreview(true);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm() || !preview) return;

    try {
      setSubmitting(true);

      // Convert date from YYYY-MM-DD to ISO format for backend
      const isoPlantingDate = plantingDate ? `${plantingDate}T00:00:00Z` : undefined;

      const requestData: AddVirtualCropRequest = {
        cropId: selectedPlantId,
        allocatedArea: parseFloat(allocatedArea),
        plantCount: parseInt(plantCount),
        plantingDate: isoPlantingDate,
      };

      const result = await farmApi.addVirtualCrop(block.farmId, block.blockId, requestData);

      // Show success message with virtual block code
      const blockCode = result?.blockCode || 'N/A';
      alert(`Virtual crop added successfully! Virtual block code: ${blockCode}`);

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error adding virtual crop:', error);
      // Handle different error formats properly
      let errorMsg = 'Failed to add virtual crop. Please try again.';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        // detail might be a string or an array of validation errors
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', ');
        } else if (typeof detail === 'object') {
          errorMsg = JSON.stringify(detail);
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPlantId('');
    setAllocatedArea('');
    setPlantCount('');
    setPlantingDate('');
    setErrors({});
    setPreview(null);
    setShowPreview(false);
    // Reset auto-calculation state
    setIsAutoCalculated(false);
    setCalculatedPlantCount(null);
    setIsManualOverride(false);
    setCalculationInfo('');
    onClose();
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const usedArea = (block.area || 0) - (block.availableArea || 0);
  const totalArea = block.area || 0;
  const nextVirtualCode = block.blockCode
    ? `${block.blockCode}/${String((block.virtualBlockCounter || 0) + 1).padStart(3, '0')}`
    : 'N/A';

  const modalContent = (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Additional Crop to Block</ModalTitle>
          <CloseButton onClick={handleClose}>×</CloseButton>
        </ModalHeader>

        <ModalBody>
          {loadingPlants ? (
            <LoadingText>Loading plants...</LoadingText>
          ) : (
            <>
              <AreaBudgetSection>
                <AreaBudgetTitle>
                  <span>📊</span>
                  <span>Area Budget</span>
                </AreaBudgetTitle>
                <AreaBudgetBar $used={usedArea} $total={totalArea} />
                <AreaBudgetText>
                  {block.availableArea?.toFixed(0)} m² available of {totalArea.toFixed(0)} m² total
                </AreaBudgetText>
                {(block.availableArea || 0) < totalArea * 0.2 && (
                  <AreaBudgetWarning>
                    ⚠️ Limited area remaining - consider block utilization
                  </AreaBudgetWarning>
                )}
              </AreaBudgetSection>

              <FormSection>
                <SectionTitle>Parent Block Information</SectionTitle>
                <div style={{ fontSize: '14px', color: '#616161', marginBottom: '16px' }}>
                  <div>
                    <strong>Block:</strong> {block.blockCode || block.name}
                  </div>
                  <div>
                    <strong>Total Area:</strong> {totalArea.toFixed(0)} m²
                  </div>
                  <div>
                    <strong>Current Crop:</strong> {block.targetCropName || 'None'}
                  </div>
                </div>

                <VirtualBlockCodePreview>
                  <CodeLabel>New Virtual Block Code (Preview)</CodeLabel>
                  <CodeValue>{nextVirtualCode}</CodeValue>
                </VirtualBlockCodePreview>
              </FormSection>

              <FormSection>
                <SectionTitle>Virtual Crop Details</SectionTitle>

                <FormGroup>
                  <Label>
                    Select Crop<RequiredMark>*</RequiredMark>
                  </Label>
                  <Select
                    value={selectedPlantId}
                    onChange={(e) => handlePlantChange(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- Choose a crop --</option>
                    {plants.map((plant) => (
                      <option key={plant.plantDataId} value={plant.plantDataId}>
                        {plant.plantName} ({plant.growthCycle.totalCycleDays} days cycle,{' '}
                        {plant.yieldInfo.yieldPerPlant}
                        {plant.yieldInfo.yieldUnit}/plant)
                        {plant.spacingCategory && ` - ${SPACING_CATEGORY_LABELS[plant.spacingCategory]}`}
                      </option>
                    ))}
                  </Select>
                  {errors.plant && <ErrorText>{errors.plant}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label>
                    Allocated Area (m²)<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    type="number"
                    value={allocatedArea}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    placeholder="Enter area in m²"
                    min="1"
                    max={block.availableArea || 0}
                    step="0.1"
                    disabled={submitting}
                  />
                  <HelpText>Maximum available: {block.availableArea?.toFixed(0)} m²</HelpText>
                  {errors.allocatedArea && <ErrorText>{errors.allocatedArea}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label>
                    Number of Plants<RequiredMark>*</RequiredMark>
                    {isAutoCalculated && !isManualOverride && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#4caf50', fontWeight: 400 }}>
                        (auto-calculated)
                      </span>
                    )}
                    {isManualOverride && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#ff9800', fontWeight: 400 }}>
                        (manual override)
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    value={plantCount}
                    onChange={(e) => handlePlantCountChange(e.target.value)}
                    placeholder={isAutoCalculated ? 'Auto-calculated from area' : 'Enter plant count'}
                    min="1"
                    disabled={submitting}
                  />
                  {errors.plantCount && <ErrorText>{errors.plantCount}</ErrorText>}

                  {/* Auto-calculation feedback */}
                  {isAutoCalculated && calculationInfo && (
                    <AutoCalculationInfo>
                      <AutoCalcIcon>📐</AutoCalcIcon>
                      <div>
                        <strong>Auto-calculated from spacing standards:</strong>
                        <div style={{ marginTop: '4px' }}>{calculationInfo}</div>
                      </div>
                      {isManualOverride && (
                        <ManualOverrideButton onClick={handleResetToAuto}>
                          Reset to auto
                        </ManualOverrideButton>
                      )}
                    </AutoCalculationInfo>
                  )}

                  {/* Warning if no spacing category */}
                  {selectedPlantId && allocatedArea && !isAutoCalculated && (
                    <NoSpacingWarning>
                      <span>⚠️</span>
                      <span>
                        This plant doesn't have a spacing category configured.
                        Enter plant count manually, or configure spacing in plant data settings.
                      </span>
                    </NoSpacingWarning>
                  )}
                </FormGroup>

                <FormGroup>
                  <Label>
                    Planting Date<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    type="date"
                    value={plantingDate}
                    onChange={(e) => setPlantingDate(e.target.value)}
                    disabled={submitting}
                  />
                  {errors.plantingDate && <ErrorText>{errors.plantingDate}</ErrorText>}
                </FormGroup>
              </FormSection>

              <PreviewSection $visible={showPreview && preview !== null}>
                {preview && (
                  <>
                    <PreviewTitle>
                      <span>📈</span>
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
                        <PreviewLabel>Area Allocation</PreviewLabel>
                        <PreviewValue>{preview.areaPercentage.toFixed(0)}%</PreviewValue>
                        <PreviewSubtext>
                          {preview.allocatedArea} m² of {block.area?.toFixed(0)} m²
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
            disabled={!selectedPlantId || !allocatedArea || !plantCount || !plantingDate || submitting}
          >
            📊 Preview
          </Button>

          {showPreview && (
            <Button type="button" $variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Adding...' : '✅ Confirm & Add Crop'}
            </Button>
          )}
        </ModalFooter>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
