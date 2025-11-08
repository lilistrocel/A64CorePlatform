/**
 * CreateFarmModal Component
 *
 * Modal dialog for creating a new farm.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { CreateFarmFormData } from '../../types/farm';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const farmSchema = z.object({
  name: z.string().min(1, 'Farm name is required').max(100, 'Name too long'),
  owner: z.string().max(200, 'Owner name too long').optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  totalArea: z.number().min(0.1, 'Area must be greater than 0'),
  numberOfStaff: z.number().min(0, 'Number of staff must be 0 or greater').optional(),
  managerId: z.string().min(1, 'Manager ID is required'),
  isActive: z.boolean(),
});

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CreateFarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
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
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
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

const ErrorText = styled.span`
  font-size: 12px;
  color: #EF4444;
`;

const GridRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CheckboxContainer = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 12px;
  border-radius: 8px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const CheckboxLabel = styled.div`
  font-size: 14px;
  color: #212121;
`;

const ModalFooter = styled.div`
  padding: 24px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
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

// ============================================================================
// COMPONENT
// ============================================================================

export function CreateFarmModal({ isOpen, onClose, onSuccess }: CreateFarmModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateFarmFormData>({
    resolver: zodResolver(farmSchema),
    defaultValues: {
      isActive: true,
    },
  });

  const onSubmit = async (data: CreateFarmFormData) => {
    try {
      setSubmitting(true);

      await farmApi.createFarm({
        name: data.name,
        owner: data.owner,
        location: {
          city: data.city,
          state: data.state,
          country: data.country,
        },
        totalArea: data.totalArea,
        numberOfStaff: data.numberOfStaff,
        managerId: data.managerId,
        isActive: data.isActive,
      });

      reset();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error creating farm:', error);
      alert('Failed to create farm. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      reset();
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <Overlay $isOpen={isOpen} onClick={handleOverlayClick}>
      <Modal>
        <ModalHeader>
          <ModalTitle>Create New Farm</ModalTitle>
          <CloseButton onClick={handleClose} disabled={submitting}>
            ✕
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <Form onSubmit={handleSubmit(onSubmit)}>
            <FormGroup>
              <Label htmlFor="name">Farm Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter farm name"
                $hasError={!!errors.name}
                disabled={submitting}
                {...register('name')}
              />
              {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                type="text"
                placeholder="Farm owner name"
                $hasError={!!errors.owner}
                disabled={submitting}
                {...register('owner')}
              />
              {errors.owner && <ErrorText>{errors.owner.message}</ErrorText>}
            </FormGroup>

            <GridRow>
              <FormGroup>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  type="text"
                  placeholder="City"
                  $hasError={!!errors.city}
                  disabled={submitting}
                  {...register('city')}
                />
                {errors.city && <ErrorText>{errors.city.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="state">State/Province *</Label>
                <Input
                  id="state"
                  type="text"
                  placeholder="State"
                  $hasError={!!errors.state}
                  disabled={submitting}
                  {...register('state')}
                />
                {errors.state && <ErrorText>{errors.state.message}</ErrorText>}
              </FormGroup>
            </GridRow>

            <FormGroup>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                type="text"
                placeholder="Country"
                $hasError={!!errors.country}
                disabled={submitting}
                {...register('country')}
              />
              {errors.country && <ErrorText>{errors.country.message}</ErrorText>}
            </FormGroup>

            <GridRow>
              <FormGroup>
                <Label htmlFor="totalArea">Total Area (hectares) *</Label>
                <Input
                  id="totalArea"
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  $hasError={!!errors.totalArea}
                  disabled={submitting}
                  {...register('totalArea', { valueAsNumber: true })}
                />
                {errors.totalArea && <ErrorText>{errors.totalArea.message}</ErrorText>}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="numberOfStaff">Number of Staff</Label>
                <Input
                  id="numberOfStaff"
                  type="number"
                  step="1"
                  placeholder="0"
                  $hasError={!!errors.numberOfStaff}
                  disabled={submitting}
                  {...register('numberOfStaff', { valueAsNumber: true })}
                />
                {errors.numberOfStaff && <ErrorText>{errors.numberOfStaff.message}</ErrorText>}
              </FormGroup>
            </GridRow>

            <FormGroup>
              <Label htmlFor="managerId">Manager ID *</Label>
              <Input
                id="managerId"
                type="text"
                placeholder="Manager user ID"
                $hasError={!!errors.managerId}
                disabled={submitting}
                {...register('managerId')}
              />
              {errors.managerId && <ErrorText>{errors.managerId.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <CheckboxContainer>
                <Checkbox
                  type="checkbox"
                  id="isActive"
                  disabled={submitting}
                  {...register('isActive')}
                />
                <CheckboxLabel>Mark farm as active</CheckboxLabel>
              </CheckboxContainer>
            </FormGroup>
          </Form>
        </ModalBody>

        <ModalFooter>
          <Button type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            $variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Farm'}
          </Button>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}
