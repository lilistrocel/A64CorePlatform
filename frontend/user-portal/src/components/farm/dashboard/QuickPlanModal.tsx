/**
 * QuickPlanModal Component
 *
 * Simple modal for planning a crop on an empty block or planting a planned block.
 * Collects crop selection and plant count for quick transitions.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { ClipboardList, Sprout, X } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { getActivePlants } from '../../../services/plantDataEnhancedApi';
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
    // Depend on block.blockId rather than the whole block object: the parent
    // Block Monitor auto-refreshes every 30s, producing a new `block` object
    // reference each tick. If we depended on the whole object, this effect
    // would fire every refresh and wipe whatever the user was typing.
  }, [isOpen, block.blockId, mode]);

  const loadPlants = async () => {
    try {
      // Only load active plants for the dropdown
      const activePlants = await getActivePlants();
      setPlants(activePlants);
    } catch (error) {
      console.error('Failed to load plants:', error);
    }
  };

  const handleSubmit = () => {
    if (!selectedPlantId || plantCount <= 0) {
      alert('Please select a plant and enter a valid plant count');
      return;
    }

    onConfirm(selectedPlantId, plantCount);
  };

  if (!isOpen) return null;

  return createPortal(
    <Overlay>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            {mode === 'plan' ? (
              <><ClipboardList size={18} strokeWidth={1.8} /> Plan Block</>
            ) : (
              <><Sprout size={18} strokeWidth={1.8} /> Plant Block</>
            )}
          </ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <BlockInfo>
            <InfoLabel>Block:</InfoLabel>
            <InfoValue>{block.blockCode} - {block.name}</InfoValue>
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
              value={plantCount}
              onChange={(e) => setPlantCount(parseInt(e.target.value) || 0)}
              placeholder="Enter plant count"
            />
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <CancelButton onClick={onClose}>Cancel</CancelButton>
          <ConfirmButton onClick={handleSubmit} disabled={!selectedPlantId || plantCount <= 0}>
            {mode === 'plan' ? (
              <><ClipboardList size={14} strokeWidth={1.8} /> Confirm Plan</>
            ) : (
              <><Sprout size={14} strokeWidth={1.8} /> Confirm Plant</>
            )}
          </ConfirmButton>
        </ModalFooter>
      </ModalContainer>
    </Overlay>,
    document.body
  );
}

// Styled Components — Night Observatory modal recipe (spec §4 "Modals/drawers"):
// glassPanel at blur 24px over a rgba(10,14,36,.6) scrim, 20px radius. Modal
// still closes only via the X button, never on backdrop click — unchanged.
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: 20px;
`;

const ModalContainer = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 500px;
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
`;

const ModalTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
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
  transition: background 150ms ease-in-out, color 150ms ease-in-out;

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

const BlockInfo = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(180, 200, 220, 0.05);
  border-radius: 8px;
`;

const InfoLabel = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.span`
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FormGroup = styled.div`
  margin-top: 20px;
`;

const Label = styled.label`
  ${monoLabel}
  display: block;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const Select = styled.select`
  ${glassControl}
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

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

const Input = styled.input`
  ${glassControl}
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ModalFooter = styled.div`
  padding: 16px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Modal's single primary CTA — the one gold budget item on this view (spec §3).
const ConfirmButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;
