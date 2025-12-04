/**
 * PlantAssignmentModal Component
 *
 * Modal for assigning plants to a block with preview of predicted outcomes.
 * Shows predicted yield, revenue, harvest timeline, and cycle duration before confirming.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { farmApi, calculatePlantCount } from '../../services/farmApi';
import { getActivePlants } from '../../services/plantDataEnhancedApi';
import type { Block, PlantDataEnhanced, SpacingCategory } from '../../types/farm';
import { SPACING_CATEGORY_LABELS } from '../../types/farm';
import { PendingTasksWarningModal } from './PendingTasksWarningModal';

// ============================================================================
// TYPES
// ============================================================================

interface PlantAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: Block;
  onSuccess: () => void;
}

interface PlantingPreview {
  selectedPlant: PlantDataEnhanced | null;
  plantCount: number;
  plannedDate: string;
  // Calculated fields
  predictedYieldKg: number;
  predictedRevenue: number;
  harvestDate: string;
  cleaningDate: string;
  totalCycleDays: number;
  utilizationPercent: number;
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
  background: #f5f9ff;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 20px;
  margin-top: 24px;
`;

const PreviewTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1976d2;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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

const TimelineSection = styled.div`
  background: white;
  border-radius: 6px;
  padding: 16px;
  margin-top: 16px;
`;

const TimelineTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #424242;
  margin-bottom: 12px;
`;

const TimelineItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
`;

const TimelineLabel = styled.div`
  font-size: 13px;
  color: #616161;
`;

const TimelineDate = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #212121;
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

export function PlantAssignmentModal({ isOpen, onClose, block, onSuccess }: PlantAssignmentModalProps) {
  const [plants, setPlants] = useState<PlantDataEnhanced[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [plantCount, setPlantCount] = useState<string>('');
  const [plannedDate, setPlannedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Auto-calculation state
  const [isAutoCalculated, setIsAutoCalculated] = useState(false);
  const [calculatedPlantCount, setCalculatedPlantCount] = useState<number | null>(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [calculationInfo, setCalculationInfo] = useState<string>('');

  // Preview state
  const [preview, setPreview] = useState<PlantingPreview | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Phase 3: Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [targetStatus, setTargetStatus] = useState<string>('');

  // Load plant data on mount
  useEffect(() => {
    if (isOpen) {
      loadPlants();
      // Set default planned date to today
      setPlannedDate(new Date().toISOString().split('T')[0]);
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

  // Auto-calculate plant count when plant is selected
  const autoCalculatePlantCount = useCallback(async (plant: PlantDataEnhanced) => {
    if (!plant.spacingCategory || !block.area) {
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
      return;
    }

    try {
      // Block area is stored in square meters
      const result = await calculatePlantCount(block.area, 'sqm', plant.spacingCategory);

      // Cap at block maxPlants
      const cappedCount = Math.min(result.plantCount, block.maxPlants);

      setCalculatedPlantCount(cappedCount);
      setIsAutoCalculated(true);

      const categoryLabel = SPACING_CATEGORY_LABELS[plant.spacingCategory] || plant.spacingCategory;
      setCalculationInfo(
        `${result.plantsPerHundredSqm} plants/100m² × ${result.areaSqm.toFixed(0)}m² = ${result.plantCount} plants` +
        (cappedCount < result.plantCount ? ` (capped at ${cappedCount} max capacity)` : '')
      );

      // Only set if not manually overridden
      if (!isManualOverride) {
        setPlantCount(String(cappedCount));
      }
    } catch (error) {
      console.error('Error calculating plant count:', error);
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
    }
  }, [block.area, block.maxPlants, isManualOverride]);

  // Effect to trigger auto-calculation when plant selection changes
  useEffect(() => {
    if (selectedPlantId) {
      const plant = plants.find((p) => p.plantDataId === selectedPlantId);
      if (plant) {
        autoCalculatePlantCount(plant);
      }
    } else {
      setIsAutoCalculated(false);
      setCalculatedPlantCount(null);
      setCalculationInfo('');
      setIsManualOverride(false);
    }
  }, [selectedPlantId, plants, autoCalculatePlantCount]);

  // Handle plant selection
  const handlePlantChange = (plantId: string) => {
    setSelectedPlantId(plantId);
    setIsManualOverride(false); // Reset manual override when plant changes
    setPlantCount(''); // Clear plant count to trigger auto-calculation
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

    const count = parseInt(plantCount);
    if (isNaN(count) || count <= 0) return;

    const plannedDateObj = new Date(plannedDate);

    // Calculate predicted yield (yieldPerPlant * plantCount * (1 - wastePercent))
    const wastePercent = plant.yieldInfo.expectedWastePercent || 0;
    const predictedYieldKg = plant.yieldInfo.yieldPerPlant * count * (1 - wastePercent / 100);

    // Calculate revenue if economic data exists
    const revenuePerKg = plant.economicsAndLabor?.revenuePerKg || 0;
    const predictedRevenue = predictedYieldKg * revenuePerKg;

    // Calculate timeline
    const totalCycleDays = plant.growthCycle.totalCycleDays;
    const harvestDurationDays = plant.growthCycle.harvestDurationDays || 7; // Default 7 days if not specified

    const harvestDate = new Date(plannedDateObj);
    harvestDate.setDate(harvestDate.getDate() + totalCycleDays);

    const cleaningDate = new Date(harvestDate);
    cleaningDate.setDate(cleaningDate.getDate() + harvestDurationDays);

    // Calculate utilization
    const utilizationPercent = (count / block.maxPlants) * 100;

    setPreview({
      selectedPlant: plant,
      plantCount: count,
      plannedDate,
      predictedYieldKg,
      predictedRevenue,
      harvestDate: harvestDate.toISOString().split('T')[0],
      cleaningDate: cleaningDate.toISOString().split('T')[0],
      totalCycleDays,
      utilizationPercent,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedPlantId) {
      newErrors.plant = 'Please select a plant';
    }

    const count = parseInt(plantCount);
    if (!plantCount || isNaN(count) || count <= 0) {
      newErrors.plantCount = 'Please enter a valid plant count';
    } else if (count > block.maxPlants) {
      newErrors.plantCount = `Cannot exceed block capacity of ${block.maxPlants} plants`;
    }

    if (!plannedDate) {
      newErrors.plannedDate = 'Please select a planting date';
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

  const handleSubmit = async (force: boolean = false) => {
    if (!validateForm() || !preview) return;

    try {
      setSubmitting(true);

      // Always transition to 'planned' state first
      // Users will later transition from 'planned' to 'growing' when ready to plant
      const plantingDate = new Date(plannedDate);
      plantingDate.setHours(0, 0, 0, 0);
      const newStatus = 'planned';

      await farmApi.transitionBlockState(block.farmId, block.blockId, {
        newStatus,
        targetCrop: selectedPlantId,
        actualPlantCount: parseInt(plantCount),
        plannedPlantingDate: plantingDate.toISOString(), // Convert to ISO datetime string for backend
        notes: notes || `Scheduled ${preview.selectedPlant?.plantName} for ${plannedDate}`,
        force, // Phase 3: Pass force parameter
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error assigning plant:', error);

      // Phase 3: Check for HTTP 409 Conflict (pending tasks warning)
      if (error.response?.status === 409 && error.response?.data?.detail?.error === 'pending_tasks_exist') {
        const detail = error.response.data.detail;
        setPendingTasks(detail.pendingTasks || []);
        setTargetStatus(detail.targetStatus || '');
        setShowWarningModal(true);
      } else {
        alert('Failed to assign plant. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceSubmit = () => {
    setShowWarningModal(false);
    handleSubmit(true);
  };

  const handleCancelWarning = () => {
    setShowWarningModal(false);
  };

  const handleClose = () => {
    setSelectedPlantId('');
    setPlantCount('');
    setPlannedDate('');
    setNotes('');
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

  const modalContent = (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>🌱 Assign Plant to Block</ModalTitle>
          <CloseButton onClick={handleClose}>×</CloseButton>
        </ModalHeader>

        <ModalBody>
          {loadingPlants ? (
            <LoadingText>Loading plants...</LoadingText>
          ) : (
            <>
              <FormSection>
                <SectionTitle>Block Information</SectionTitle>
                <div style={{ fontSize: '14px', color: '#616161', marginBottom: '16px' }}>
                  <div>
                    <strong>Block:</strong> {block.name}
                  </div>
                  <div>
                    <strong>Capacity:</strong> {block.maxPlants} plants
                  </div>
                  <div>
                    <strong>Area:</strong> {((block.area ?? 0) / 10000).toFixed(2)} ha
                  </div>
                </div>
              </FormSection>

              <FormSection>
                <SectionTitle>Planting Details</SectionTitle>

                <FormGroup>
                  <Label>
                    Select Plant<RequiredMark>*</RequiredMark>
                  </Label>
                  <Select
                    value={selectedPlantId}
                    onChange={(e) => handlePlantChange(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- Choose a plant --</option>
                    {plants.map((plant) => (
                      <option key={plant.plantDataId} value={plant.plantDataId}>
                        {plant.plantName} ({plant.growthCycle.totalCycleDays} days cycle, {plant.yieldInfo.yieldPerPlant}
                        {plant.yieldInfo.yieldUnit}/plant)
                        {plant.spacingCategory && ` - ${SPACING_CATEGORY_LABELS[plant.spacingCategory]}`}
                      </option>
                    ))}
                  </Select>
                  {errors.plant && <ErrorText>{errors.plant}</ErrorText>}
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
                    max={block.maxPlants}
                    disabled={submitting}
                  />
                  <HelpText>Maximum capacity: {block.maxPlants} plants</HelpText>
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
                  {selectedPlantId && !isAutoCalculated && (
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
                    Planned Planting Date<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    disabled={submitting}
                  />
                  {errors.plannedDate && <ErrorText>{errors.plannedDate}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label>Notes (Optional)</Label>
                  <Input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    disabled={submitting}
                  />
                </FormGroup>
              </FormSection>

              <PreviewSection $visible={showPreview && preview !== null}>
                {preview && (
                  <>
                    <PreviewTitle>
                      <span>📊</span>
                      <span>Planting Preview</span>
                    </PreviewTitle>

                    <PreviewGrid>
                      <PreviewItem>
                        <PreviewLabel>Predicted Yield</PreviewLabel>
                        <PreviewValue>{preview.predictedYieldKg.toFixed(1)} kg</PreviewValue>
                        <PreviewSubtext>
                          {preview.selectedPlant?.yieldInfo.yieldPerPlant} {preview.selectedPlant?.yieldInfo.yieldUnit}
                          /plant
                        </PreviewSubtext>
                      </PreviewItem>

                      {preview.predictedRevenue > 0 && (
                        <PreviewItem>
                          <PreviewLabel>Predicted Revenue</PreviewLabel>
                          <PreviewValue>AED {preview.predictedRevenue.toFixed(0)}</PreviewValue>
                          <PreviewSubtext>
                            @ AED {preview.selectedPlant?.economicsAndLabor?.revenuePerKg}/kg
                          </PreviewSubtext>
                        </PreviewItem>
                      )}

                      <PreviewItem>
                        <PreviewLabel>Cycle Duration</PreviewLabel>
                        <PreviewValue>{preview.totalCycleDays} days</PreviewValue>
                        <PreviewSubtext>From planting to harvest</PreviewSubtext>
                      </PreviewItem>

                      <PreviewItem>
                        <PreviewLabel>Block Utilization</PreviewLabel>
                        <PreviewValue>{preview.utilizationPercent.toFixed(0)}%</PreviewValue>
                        <PreviewSubtext>
                          {preview.plantCount} of {block.maxPlants} plants
                        </PreviewSubtext>
                      </PreviewItem>
                    </PreviewGrid>

                    <TimelineSection>
                      <TimelineTitle>📅 Expected Timeline</TimelineTitle>
                      <TimelineItem>
                        <TimelineLabel>Planting Date</TimelineLabel>
                        <TimelineDate>{farmApi.formatDateForDisplay(preview.plannedDate)}</TimelineDate>
                      </TimelineItem>
                      <TimelineItem>
                        <TimelineLabel>Harvest Start</TimelineLabel>
                        <TimelineDate>{farmApi.formatDateForDisplay(preview.harvestDate)}</TimelineDate>
                      </TimelineItem>
                      <TimelineItem>
                        <TimelineLabel>Cleaning Complete</TimelineLabel>
                        <TimelineDate>{farmApi.formatDateForDisplay(preview.cleaningDate)}</TimelineDate>
                      </TimelineItem>
                    </TimelineSection>
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
            disabled={!selectedPlantId || !plantCount || !plannedDate || submitting}
          >
            📊 Preview
          </Button>

          {showPreview && (
            <Button type="button" $variant="success" onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? 'Assigning...' : '✅ Confirm & Plant'}
            </Button>
          )}
        </ModalFooter>
      </ModalContainer>

      {/* Phase 3: Warning Modal */}
      <PendingTasksWarningModal
        isOpen={showWarningModal}
        targetStatus={targetStatus}
        pendingTasks={pendingTasks}
        onCancel={handleCancelWarning}
        onForce={handleForceSubmit}
      />
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
