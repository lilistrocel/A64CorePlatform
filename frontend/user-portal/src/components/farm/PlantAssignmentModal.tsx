/**
 * PlantAssignmentModal Component
 *
 * Modal for assigning plants to a block with preview of predicted outcomes.
 * Shows predicted yield, revenue, harvest timeline, and cycle duration before confirming.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import { getPlantDataEnhancedList } from '../../services/plantDataEnhancedApi';
import type { Block, PlantDataEnhanced } from '../../types/farm';

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

  // Preview state
  const [preview, setPreview] = useState<PlantingPreview | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      // Note: PlantDataEnhanced uses deletedAt for soft deletes, not isActive
      // Backend automatically filters out deleted records
      const response = await getPlantDataEnhancedList({ page: 1, perPage: 100 });
      setPlants(response.items);
    } catch (error) {
      console.error('Error loading plants:', error);
      alert('Failed to load plant data. Please try again.');
    } finally {
      setLoadingPlants(false);
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

  const handleSubmit = async () => {
    if (!validateForm() || !preview) return;

    try {
      setSubmitting(true);

      // Determine status based on planting date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const plantingDate = new Date(plannedDate);
      plantingDate.setHours(0, 0, 0, 0);

      // If planting date is in the future, set to 'planned', otherwise 'planted'
      const newStatus = plantingDate > today ? 'planned' : 'planted';

      await farmApi.transitionBlockState(block.farmId, block.blockId, {
        newStatus,
        targetCrop: selectedPlantId,
        actualPlantCount: parseInt(plantCount),
        plannedPlantingDate: plantingDate.toISOString(), // Convert to ISO datetime string for backend
        notes: notes || `${newStatus === 'planned' ? 'Scheduled' : 'Planted'} ${preview.selectedPlant?.plantName} on ${plannedDate}`,
      });

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error assigning plant:', error);
      alert('Failed to assign plant. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPlantId('');
    setPlantCount('');
    setPlannedDate('');
    setNotes('');
    setErrors({});
    setPreview(null);
    setShowPreview(false);
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
                    <strong>Area:</strong> {(block.area ?? 0).toFixed(1)} ha
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
                    onChange={(e) => setSelectedPlantId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- Choose a plant --</option>
                    {plants.map((plant) => (
                      <option key={plant.plantDataId} value={plant.plantDataId}>
                        {plant.plantName} ({plant.growthCycle.totalCycleDays} days cycle, {plant.yieldInfo.yieldPerPlant}
                        {plant.yieldInfo.yieldUnit}/plant)
                      </option>
                    ))}
                  </Select>
                  {errors.plant && <ErrorText>{errors.plant}</ErrorText>}
                </FormGroup>

                <FormGroup>
                  <Label>
                    Number of Plants<RequiredMark>*</RequiredMark>
                  </Label>
                  <Input
                    type="number"
                    value={plantCount}
                    onChange={(e) => setPlantCount(e.target.value)}
                    placeholder="Enter plant count"
                    min="1"
                    max={block.maxPlants}
                    disabled={submitting}
                  />
                  <HelpText>Maximum capacity: {block.maxPlants} plants</HelpText>
                  {errors.plantCount && <ErrorText>{errors.plantCount}</ErrorText>}
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
            <Button type="button" $variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Assigning...' : '✅ Confirm & Plant'}
            </Button>
          )}
        </ModalFooter>
      </ModalContainer>
    </Overlay>
  );

  return createPortal(modalContent, document.body);
}
