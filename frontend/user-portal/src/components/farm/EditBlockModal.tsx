/**
 * EditBlockModal Component
 *
 * Modal for editing an existing block's information.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import type { Block, BlockUpdate } from '../../types/farm';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const Header = styled.div`
  margin-bottom: 24px;
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #616161;
  margin: 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
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

const Input = styled.input`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
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

const Textarea = styled.textarea`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) =>
    $variant === 'primary'
      ? `
    background: #3B82F6;
    color: white;

    &:hover:not(:disabled) {
      background: #2563EB;
    }
  `
      : `
    background: transparent;
    color: #616161;
    border: 1px solid #e0e0e0;

    &:hover:not(:disabled) {
      background: #f5f5f5;
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  font-size: 14px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface EditBlockModalProps {
  block: Block;
  farmId: string;
  onClose: () => void;
  onUpdate: (blockId: string, data: BlockUpdate) => Promise<void>;
}

export function EditBlockModal({ block, farmId, onClose, onUpdate }: EditBlockModalProps) {
  // Convert area from sqm to hectares for display (if stored in sqm)
  const convertToHectares = (area: number | null | undefined, unit: string | null | undefined): number | undefined => {
    if (area === null || area === undefined) return undefined;
    if (unit === 'sqm') return area / 10000;
    if (unit === 'sqft') return area / 107639;
    return area; // Already in hectares or unknown
  };

  // Convert area from hectares to sqm for storage
  const convertToSqm = (areaInHectares: number | undefined): number | undefined => {
    if (areaInHectares === undefined) return undefined;
    return areaInHectares * 10000;
  };

  const [formData, setFormData] = useState<BlockUpdate>({
    name: block.name,
    area: convertToHectares(block.area, block.areaUnit), // Display in hectares
    maxPlants: block.maxPlants,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name?.trim()) {
      setError('Block name is required');
      return;
    }

    if (formData.area !== undefined && formData.area <= 0) {
      setError('Area must be greater than 0');
      return;
    }

    if (formData.maxPlants !== undefined && formData.maxPlants <= 0) {
      setError('Max plants must be greater than 0');
      return;
    }

    try {
      setLoading(true);
      // Convert hectares back to sqm for storage
      const dataToSubmit: BlockUpdate = {
        ...formData,
        area: convertToSqm(formData.area),
        areaUnit: 'sqm', // Always store in sqm
      };
      await onUpdate(block.blockId, dataToSubmit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update block');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick}>
      <Modal>
        <Header>
          <Title>Edit Block</Title>
          <Subtitle>Update block information</Subtitle>
        </Header>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="name">Block Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name ?? ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Greenhouse Block A"
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="area">Area (hectares) *</Label>
            <Input
              id="area"
              type="number"
              step="0.1"
              min="0.1"
              value={formData.area ?? ''}
              onChange={(e) => setFormData({ ...formData, area: parseFloat(e.target.value) })}
              placeholder="e.g., 2.5"
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="maxPlants">Maximum Plant Capacity *</Label>
            <Input
              id="maxPlants"
              type="number"
              min="1"
              value={formData.maxPlants ?? ''}
              onChange={(e) => setFormData({ ...formData, maxPlants: parseInt(e.target.value, 10) })}
              placeholder="e.g., 100"
              required
            />
          </FormGroup>

          <ButtonGroup>
            <Button type="button" $variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Block'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
