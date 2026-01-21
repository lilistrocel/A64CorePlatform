/**
 * RouteForm Component
 *
 * Form for creating and editing routes.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import type { RouteCreate, RouteUpdate, Route } from '../../types/logistics';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const locationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  address: z.string().min(1, 'Address is required'),
  lat: z.string().optional(),
  lng: z.string().optional(),
});

const routeSchema = z.object({
  name: z.string().min(1, 'Route name is required'),
  originName: z.string().min(1, 'Origin name is required'),
  originAddress: z.string().min(1, 'Origin address is required'),
  originLat: z.string().optional(),
  originLng: z.string().optional(),
  destinationName: z.string().min(1, 'Destination name is required'),
  destinationAddress: z.string().min(1, 'Destination address is required'),
  destinationLat: z.string().optional(),
  destinationLng: z.string().optional(),
  distance: z.string().optional(),
  estimatedDuration: z.string().optional(),
  estimatedCost: z.string().optional(),
  isActive: z.boolean().optional(),
});

type RouteFormData = z.infer<typeof routeSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface RouteFormProps {
  route?: Route;
  onSubmit: (data: RouteCreate | RouteUpdate) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

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
  margin-top: 4px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const FormSection = styled.div`
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-top: 8px;
`;

const SectionTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 16px 0;
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Checkbox = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  color: #212121;
  cursor: pointer;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
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
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: #616161;
        border: 1px solid #e0e0e0;
        &:hover {
          background: #f5f5f5;
        }
      `;
    }
    return `
      background: #3B82F6;
      color: white;
      &:hover {
        background: #1976d2;
      }
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
  }}
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function RouteForm({ route, onSubmit, onCancel, isSubmitting = false }: RouteFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RouteFormData>({
    resolver: zodResolver(routeSchema),
    defaultValues: route
      ? {
          name: route.name,
          originName: route.origin.name,
          originAddress: route.origin.address,
          originLat: route.origin.coordinates?.lat.toString() || '',
          originLng: route.origin.coordinates?.lng.toString() || '',
          destinationName: route.destination.name,
          destinationAddress: route.destination.address,
          destinationLat: route.destination.coordinates?.lat.toString() || '',
          destinationLng: route.destination.coordinates?.lng.toString() || '',
          distance: route.distance?.toString() || '',
          estimatedDuration: route.estimatedDuration?.toString() || '',
          estimatedCost: route.estimatedCost?.toString() || '',
          isActive: route.isActive,
        }
      : {
          isActive: true,
        },
  });

  const onSubmitForm = async (data: RouteFormData) => {
    const routeData: RouteCreate | RouteUpdate = {
      name: data.name,
      origin: {
        name: data.originName,
        address: data.originAddress,
        coordinates:
          data.originLat && data.originLng
            ? {
                lat: parseFloat(data.originLat),
                lng: parseFloat(data.originLng),
              }
            : undefined,
      },
      destination: {
        name: data.destinationName,
        address: data.destinationAddress,
        coordinates:
          data.destinationLat && data.destinationLng
            ? {
                lat: parseFloat(data.destinationLat),
                lng: parseFloat(data.destinationLng),
              }
            : undefined,
      },
      distance: data.distance ? parseFloat(data.distance) : undefined,
      estimatedDuration: data.estimatedDuration ? parseFloat(data.estimatedDuration) : undefined,
      estimatedCost: data.estimatedCost ? parseFloat(data.estimatedCost) : undefined,
      isActive: data.isActive,
    };

    await onSubmit(routeData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormGroup>
        <Label>Route Name *</Label>
        <Input
          type="text"
          placeholder="e.g., Warehouse to Distribution Center"
          $hasError={!!errors.name}
          disabled={isSubmitting}
          {...register('name')}
        />
        {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
      </FormGroup>

      <FormSection>
        <SectionTitle>Origin</SectionTitle>
        <FormGroup>
          <Label>Location Name *</Label>
          <Input
            type="text"
            placeholder="e.g., Main Warehouse"
            $hasError={!!errors.originName}
            disabled={isSubmitting}
            {...register('originName')}
          />
          {errors.originName && <ErrorText>{errors.originName.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Address *</Label>
          <Input
            type="text"
            placeholder="e.g., 123 Industrial Ave, City"
            $hasError={!!errors.originAddress}
            disabled={isSubmitting}
            {...register('originAddress')}
          />
          {errors.originAddress && <ErrorText>{errors.originAddress.message}</ErrorText>}
        </FormGroup>

        <FormRow>
          <FormGroup>
            <Label>Latitude (optional)</Label>
            <Input type="text" placeholder="e.g., 40.7128" disabled={isSubmitting} {...register('originLat')} />
          </FormGroup>

          <FormGroup>
            <Label>Longitude (optional)</Label>
            <Input type="text" placeholder="e.g., -74.0060" disabled={isSubmitting} {...register('originLng')} />
          </FormGroup>
        </FormRow>
      </FormSection>

      <FormSection>
        <SectionTitle>Destination</SectionTitle>
        <FormGroup>
          <Label>Location Name *</Label>
          <Input
            type="text"
            placeholder="e.g., Distribution Center"
            $hasError={!!errors.destinationName}
            disabled={isSubmitting}
            {...register('destinationName')}
          />
          {errors.destinationName && <ErrorText>{errors.destinationName.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Address *</Label>
          <Input
            type="text"
            placeholder="e.g., 456 Commerce Blvd, City"
            $hasError={!!errors.destinationAddress}
            disabled={isSubmitting}
            {...register('destinationAddress')}
          />
          {errors.destinationAddress && <ErrorText>{errors.destinationAddress.message}</ErrorText>}
        </FormGroup>

        <FormRow>
          <FormGroup>
            <Label>Latitude (optional)</Label>
            <Input type="text" placeholder="e.g., 40.7128" disabled={isSubmitting} {...register('destinationLat')} />
          </FormGroup>

          <FormGroup>
            <Label>Longitude (optional)</Label>
            <Input type="text" placeholder="e.g., -74.0060" disabled={isSubmitting} {...register('destinationLng')} />
          </FormGroup>
        </FormRow>
      </FormSection>

      <FormSection>
        <SectionTitle>Route Details</SectionTitle>
        <FormRow>
          <FormGroup>
            <Label>Distance (km)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="e.g., 50.5"
              disabled={isSubmitting}
              {...register('distance')}
            />
          </FormGroup>

          <FormGroup>
            <Label>Estimated Duration (hours)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="e.g., 1.5"
              disabled={isSubmitting}
              {...register('estimatedDuration')}
            />
          </FormGroup>

          <FormGroup>
            <Label>Estimated Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 125.00"
              disabled={isSubmitting}
              {...register('estimatedCost')}
            />
          </FormGroup>
        </FormRow>
      </FormSection>

      <CheckboxGroup>
        <Checkbox type="checkbox" id="isActive" disabled={isSubmitting} {...register('isActive')} />
        <CheckboxLabel htmlFor="isActive">Route is active</CheckboxLabel>
      </CheckboxGroup>

      <Actions>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : route ? 'Update Route' : 'Create Route'}
        </Button>
      </Actions>
    </Form>
  );
}
