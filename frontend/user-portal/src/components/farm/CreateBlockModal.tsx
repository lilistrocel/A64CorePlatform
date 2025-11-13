/**
 * CreateBlockModal Component
 *
 * Modal for creating a new block in a farm.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { BlockCreate } from '../../types/farm';

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

const HelpText = styled.p`
  font-size: 12px;
  color: #9e9e9e;
  margin: 0;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface CreateBlockModalProps {
  farmId: string;
  onClose: () => void;
  onCreate: (data: Omit<BlockCreate, 'farmId'>) => Promise<void>;
}

export function CreateBlockModal({ farmId, onClose, onCreate }: CreateBlockModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    blockType: 'greenhouse' as const,
    area: '',
    maxPlants: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Block name is required');
      return;
    }

    const area = parseFloat(formData.area);
    if (isNaN(area) || area <= 0) {
      setError('Area must be a valid number greater than 0');
      return;
    }

    const maxPlants = parseInt(formData.maxPlants, 10);
    if (isNaN(maxPlants) || maxPlants <= 0) {
      setError('Max plants must be a valid number greater than 0');
      return;
    }

    try {
      setLoading(true);
      await onCreate({
        name: formData.name.trim(),
        blockType: formData.blockType,
        area,
        maxPlants,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create block');
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
          <Title>Add New Block</Title>
          <Subtitle>Create a new block in your farm</Subtitle>
        </Header>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="name">Block Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Greenhouse Block A"
              required
            />
            <HelpText>Choose a unique name for easy identification</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="blockType">Block Type *</Label>
            <Input
              as="select"
              id="blockType"
              value={formData.blockType}
              onChange={(e) => setFormData({ ...formData, blockType: e.target.value as any })}
              required
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="openfield">Open Field</option>
              <option value="hydroponic">Hydroponic</option>
              <option value="nethouse">Net House</option>
              <option value="aeroponic">Aeroponic</option>
              <option value="containerfarm">Container Farm</option>
              <option value="hybrid">Hybrid</option>
              <option value="special">Special</option>
            </Input>
            <HelpText>Type of cultivation system</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="area">Area (hectares) *</Label>
            <Input
              id="area"
              type="number"
              step="0.1"
              min="0.1"
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              placeholder="e.g., 2.5"
              required
            />
            <HelpText>Total area of the block in hectares</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="maxPlants">Maximum Plant Capacity *</Label>
            <Input
              id="maxPlants"
              type="number"
              min="1"
              value={formData.maxPlants}
              onChange={(e) => setFormData({ ...formData, maxPlants: e.target.value })}
              placeholder="e.g., 100"
              required
            />
            <HelpText>Maximum number of plants this block can accommodate</HelpText>
          </FormGroup>

          <ButtonGroup>
            <Button type="button" $variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Block'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
