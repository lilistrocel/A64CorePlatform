/**
 * QuickPlanModal Component
 *
 * Simple modal for planning a crop on an empty block or planting a planned block.
 * Collects crop selection and plant count for quick transitions.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { getPlantDataEnhancedList } from '../../../services/plantDataEnhancedApi';
import type { DashboardBlock, PlantDataEnhanced } from '../../../types/farm';

interface QuickPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  block: DashboardBlock;
  mode: 'plan' | 'plant'; // plan = EMPTY→PLANNED, plant = PLANNED→GROWING
  onConfirm: (cropId: string, plantCount: number) => void;
}

export function QuickPlanModal({ isOpen, onClose, block, mode, onConfirm }: QuickPlanModalProps) {
  const [plants, setPlants] = useState<PlantDataEnhanced[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [plantCount, setPlantCount] = useState<number>(block.actualPlantCount || 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPlants();

      // Pre-fill if block already has a targetCrop (for PLANNED blocks)
      if (mode === 'plant' && block.targetCrop) {
        setSelectedPlantId(block.targetCrop);
        setPlantCount(block.actualPlantCount || 0);
      } else {
        setSelectedPlantId('');
        setPlantCount(0);
      }
    }
  }, [isOpen, block, mode]);

  const loadPlants = async () => {
    try {
      const data = await getPlantDataEnhancedList({ page: 1, perPage: 100 });
      setPlants(data.items);
    } catch (error) {
      console.error('Failed to load plants:', error);
    }
  };

  const handleSubmit = () => {
    if (!selectedPlantId || plantCount <= 0) {
      alert('Please select a plant and enter a valid plant count');
      return;
    }

    if (plantCount > block.maxPlants) {
      alert(`Plant count cannot exceed block capacity of ${block.maxPlants}`);
      return;
    }

    onConfirm(selectedPlantId, plantCount);
  };

  if (!isOpen) return null;

  return createPortal(
    <Overlay onClick={onClose}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            {mode === 'plan' ? '📋 Plan Block' : '🌱 Plant Block'}
          </ModalTitle>
          <CloseButton onClick={onClose}>×</CloseButton>
        </ModalHeader>

        <ModalBody>
          <BlockInfo>
            <InfoLabel>Block:</InfoLabel>
            <InfoValue>{block.blockCode} - {block.name}</InfoValue>
          </BlockInfo>

          <BlockInfo>
            <InfoLabel>Capacity:</InfoLabel>
            <InfoValue>{block.maxPlants} plants</InfoValue>
          </BlockInfo>

          <FormGroup>
            <Label>Select Crop *</Label>
            <Select
              value={selectedPlantId}
              onChange={(e) => setSelectedPlantId(e.target.value)}
              disabled={mode === 'plant' && !!block.targetCrop}
            >
              <option value="">-- Choose a crop --</option>
              {plants.map((plant) => (
                <option key={plant.plantDataId} value={plant.plantDataId}>
                  {plant.plantName} ({plant.growthCycle.totalCycleDays} days, {plant.yieldInfo.yieldPerPlant}kg/plant)
                </option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Number of Plants *</Label>
            <Input
              type="number"
              min="1"
              max={block.maxPlants}
              value={plantCount}
              onChange={(e) => setPlantCount(parseInt(e.target.value) || 0)}
              placeholder="Enter plant count"
            />
            <Hint>Maximum: {block.maxPlants} plants</Hint>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <CancelButton onClick={onClose}>Cancel</CancelButton>
          <ConfirmButton onClick={handleSubmit} disabled={!selectedPlantId || plantCount <= 0}>
            {mode === 'plan' ? '📋 Confirm Plan' : '🌱 Confirm Plant'}
          </ConfirmButton>
        </ModalFooter>
      </ModalContainer>
    </Overlay>,
    document.body
  );
}

// Styled Components
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
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
`;

const ModalTitle = styled.h2`
  font-size: 20px;
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

const BlockInfo = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 4px;
`;

const InfoLabel = styled.span`
  font-weight: 600;
  color: #616161;
`;

const InfoValue = styled.span`
  color: #212121;
`;

const FormGroup = styled.div`
  margin-top: 20px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #212121;
  margin-bottom: 8px;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 14px;
  color: #212121;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3B82F6;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 14px;
  color: #212121;

  &:focus {
    outline: none;
    border-color: #3B82F6;
  }
`;

const Hint = styled.div`
  font-size: 12px;
  color: #757575;
  margin-top: 4px;
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: white;
  color: #616161;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const ConfirmButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  background: #3B82F6;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: #1976D2;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
