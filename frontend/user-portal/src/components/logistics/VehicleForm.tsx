/**
 * VehicleForm Component
 *
 * Form for creating and editing vehicles.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import type { VehicleCreate, VehicleUpdate, Vehicle } from '../../types/logistics';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const vehicleSchema = z.object({
  name: z.string().min(1, 'Vehicle name is required'),
  type: z.enum(['truck', 'van', 'pickup', 'refrigerated'], {
    errorMap: () => ({ message: 'Please select a vehicle type' }),
  }),
  ownership: z.enum(['owned', 'rented', 'leased'], {
    errorMap: () => ({ message: 'Please select ownership type' }),
  }),
  licensePlate: z.string().min(1, 'License plate is required'),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).optional(),
  capacityWeight: z.string().optional(),
  capacityVolume: z.string().optional(),
  capacityUnit: z.string().optional(),
  costPerKm: z.string().optional(),
  rentalCostPerDay: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.string().optional(),
  maintenanceSchedule: z.string().optional(),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VehicleFormProps {
  vehicle?: Vehicle;
  onSubmit: (data: VehicleCreate | VehicleUpdate) => Promise<void>;
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

export function VehicleForm({ vehicle, onSubmit, onCancel, isSubmitting = false }: VehicleFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: vehicle
      ? {
          name: vehicle.name,
          type: vehicle.type,
          ownership: vehicle.ownership,
          licensePlate: vehicle.licensePlate,
          status: vehicle.status,
          capacityWeight: vehicle.capacity?.weight?.toString() || '',
          capacityVolume: vehicle.capacity?.volume?.toString() || '',
          capacityUnit: vehicle.capacity?.unit || 'm³',
          costPerKm: vehicle.costPerKm?.toString() || '',
          rentalCostPerDay: vehicle.rentalCostPerDay?.toString() || '',
          purchaseDate: vehicle.purchaseDate || '',
          purchaseCost: vehicle.purchaseCost?.toString() || '',
          maintenanceSchedule: vehicle.maintenanceSchedule || '',
        }
      : {
          status: 'available',
          capacityUnit: 'm³',
        },
  });

  const onSubmitForm = async (data: VehicleFormData) => {
    const vehicleData: VehicleCreate | VehicleUpdate = {
      name: data.name,
      type: data.type,
      ownership: data.ownership,
      licensePlate: data.licensePlate,
      status: data.status,
      capacity: {
        weight: data.capacityWeight ? parseFloat(data.capacityWeight) : undefined,
        volume: data.capacityVolume ? parseFloat(data.capacityVolume) : undefined,
        unit: data.capacityUnit,
      },
      costPerKm: data.costPerKm ? parseFloat(data.costPerKm) : undefined,
      rentalCostPerDay: data.rentalCostPerDay ? parseFloat(data.rentalCostPerDay) : undefined,
      purchaseDate: data.purchaseDate || undefined,
      purchaseCost: data.purchaseCost ? parseFloat(data.purchaseCost) : undefined,
      maintenanceSchedule: data.maintenanceSchedule || undefined,
    };

    await onSubmit(vehicleData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormGroup>
        <Label>Vehicle Name *</Label>
        <Input
          type="text"
          placeholder="e.g., Delivery Truck 1"
          $hasError={!!errors.name}
          disabled={isSubmitting}
          {...register('name')}
        />
        {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
      </FormGroup>

      <FormRow>
        <FormGroup>
          <Label>Vehicle Type *</Label>
          <Select $hasError={!!errors.type} disabled={isSubmitting} {...register('type')}>
            <option value="">Select type</option>
            <option value="truck">Truck</option>
            <option value="van">Van</option>
            <option value="pickup">Pickup</option>
            <option value="refrigerated">Refrigerated</option>
          </Select>
          {errors.type && <ErrorText>{errors.type.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Ownership *</Label>
          <Select $hasError={!!errors.ownership} disabled={isSubmitting} {...register('ownership')}>
            <option value="">Select ownership</option>
            <option value="owned">Owned</option>
            <option value="rented">Rented</option>
            <option value="leased">Leased</option>
          </Select>
          {errors.ownership && <ErrorText>{errors.ownership.message}</ErrorText>}
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>License Plate *</Label>
          <Input
            type="text"
            placeholder="ABC-1234"
            $hasError={!!errors.licensePlate}
            disabled={isSubmitting}
            {...register('licensePlate')}
          />
          {errors.licensePlate && <ErrorText>{errors.licensePlate.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Status</Label>
          <Select disabled={isSubmitting} {...register('status')}>
            <option value="available">Available</option>
            <option value="in_use">In Use</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </Select>
        </FormGroup>
      </FormRow>

      <FormSection>
        <SectionTitle>Capacity</SectionTitle>
        <FormRow>
          <FormGroup>
            <Label>Weight (kg)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 5000"
              disabled={isSubmitting}
              {...register('capacityWeight')}
            />
          </FormGroup>

          <FormGroup>
            <Label>Volume</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 20"
              disabled={isSubmitting}
              {...register('capacityVolume')}
            />
          </FormGroup>

          <FormGroup>
            <Label>Unit</Label>
            <Input type="text" placeholder="m³" disabled={isSubmitting} {...register('capacityUnit')} />
          </FormGroup>
        </FormRow>
      </FormSection>

      <FormSection>
        <SectionTitle>Cost Information</SectionTitle>
        <FormRow>
          <FormGroup>
            <Label>Cost per Km ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 2.50"
              disabled={isSubmitting}
              {...register('costPerKm')}
            />
          </FormGroup>

          <FormGroup>
            <Label>Rental Cost per Day ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 150.00"
              disabled={isSubmitting}
              {...register('rentalCostPerDay')}
            />
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup>
            <Label>Purchase Date</Label>
            <Input type="date" disabled={isSubmitting} {...register('purchaseDate')} />
          </FormGroup>

          <FormGroup>
            <Label>Purchase Cost ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g., 50000"
              disabled={isSubmitting}
              {...register('purchaseCost')}
            />
          </FormGroup>
        </FormRow>
      </FormSection>

      <FormGroup>
        <Label>Maintenance Schedule</Label>
        <Input
          type="text"
          placeholder="e.g., Every 6 months"
          disabled={isSubmitting}
          {...register('maintenanceSchedule')}
        />
      </FormGroup>

      <Actions>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : vehicle ? 'Update Vehicle' : 'Create Vehicle'}
        </Button>
      </Actions>
    </Form>
  );
}
