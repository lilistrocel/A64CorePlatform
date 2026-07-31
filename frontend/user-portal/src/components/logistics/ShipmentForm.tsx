/**
 * ShipmentForm Component
 *
 * Form for creating and editing shipments with dynamic cargo items.
 *
 * Night Observatory (T-901 Phase 3): glassControl inputs/selects/textarea,
 * mono uppercase micro-labels, gold-hi focus ring, Primary gold submit
 * button. The "+ Add Item" cargo-row action is a repeated in-form action
 * (not the modal's single primary CTA), so it is restyled Secondary
 * (glass) rather than gold — see spec §3 gold discipline.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { Plus, X } from 'lucide-react';
import { Button, glassControl, monoLabel } from '@a64core/shared';
import type { ShipmentCreate, ShipmentUpdate, Shipment } from '../../types/logistics';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const cargoItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  weight: z.string().optional(),
});

const shipmentSchema = z.object({
  routeId: z.string().min(1, 'Route is required'),
  vehicleId: z.string().min(1, 'Vehicle is required'),
  driverId: z.string().optional(),
  scheduledDate: z.string().min(1, 'Scheduled date is required'),
  cargo: z.array(cargoItemSchema).min(1, 'At least one cargo item is required'),
  notes: z.string().optional(),
});

type ShipmentFormData = z.infer<typeof shipmentSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface ShipmentFormProps {
  shipment?: Shipment;
  onSubmit: (data: ShipmentCreate | ShipmentUpdate) => Promise<void>;
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
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TextArea = styled.textarea<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 12px 16px;
  font-size: 14px;
  font-family: inherit;
  min-height: 80px;
  resize: vertical;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.glass.border)};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.secondary[500])};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-top: 4px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const FormSection = styled.div`
  ${glassControl}
  border-radius: 14px;
  padding: 16px;
  margin-top: 8px;
`;

const SectionTitle = styled.h4`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 16px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CargoItem = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 12px;
  align-items: start;
  margin-bottom: 12px;
`;

const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: rgba(240, 138, 112, 0.12);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.35);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  align-self: center;

  &:hover {
    background: rgba(240, 138, 112, 0.2);
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function ShipmentForm({ shipment, onSubmit, onCancel, isSubmitting = false }: ShipmentFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ShipmentFormData>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: shipment
      ? {
          routeId: shipment.routeId,
          vehicleId: shipment.vehicleId,
          driverId: shipment.driverId || '',
          scheduledDate: shipment.scheduledDate.split('T')[0],
          cargo: shipment.cargo.map((item) => ({
            description: item.description,
            quantity: item.quantity.toString(),
            weight: item.weight?.toString() || '',
          })),
          notes: shipment.notes || '',
        }
      : {
          cargo: [{ description: '', quantity: '', weight: '' }],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'cargo',
  });

  const onSubmitForm = async (data: ShipmentFormData) => {
    const shipmentData: ShipmentCreate | ShipmentUpdate = {
      routeId: data.routeId,
      vehicleId: data.vehicleId,
      driverId: data.driverId || undefined,
      scheduledDate: data.scheduledDate,
      cargo: data.cargo.map((item) => ({
        description: item.description,
        quantity: parseInt(item.quantity),
        weight: item.weight ? parseFloat(item.weight) : undefined,
      })),
      notes: data.notes || undefined,
    };

    await onSubmit(shipmentData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormRow>
        <FormGroup>
          <Label>Route ID *</Label>
          <Input
            type="text"
            placeholder="Enter route ID"
            $hasError={!!errors.routeId}
            disabled={isSubmitting}
            {...register('routeId')}
          />
          {errors.routeId && <ErrorText>{errors.routeId.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Vehicle ID *</Label>
          <Input
            type="text"
            placeholder="Enter vehicle ID"
            $hasError={!!errors.vehicleId}
            disabled={isSubmitting}
            {...register('vehicleId')}
          />
          {errors.vehicleId && <ErrorText>{errors.vehicleId.message}</ErrorText>}
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Driver ID (optional)</Label>
          <Input type="text" placeholder="Enter driver ID" disabled={isSubmitting} {...register('driverId')} />
        </FormGroup>

        <FormGroup>
          <Label>Scheduled Date *</Label>
          <Input
            type="date"
            $hasError={!!errors.scheduledDate}
            disabled={isSubmitting}
            {...register('scheduledDate')}
          />
          {errors.scheduledDate && <ErrorText>{errors.scheduledDate.message}</ErrorText>}
        </FormGroup>
      </FormRow>

      <FormSection>
        <SectionTitle>
          <span>Cargo Items *</span>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => append({ description: '', quantity: '', weight: '' })}
            disabled={isSubmitting}
          >
            <Plus size={13} strokeWidth={1.8} /> Add Item
          </Button>
        </SectionTitle>

        {fields.map((field, index) => (
          <CargoItem key={field.id}>
            <FormGroup>
              <Input
                type="text"
                placeholder="Description"
                $hasError={!!errors.cargo?.[index]?.description}
                disabled={isSubmitting}
                {...register(`cargo.${index}.description`)}
              />
              {errors.cargo?.[index]?.description && (
                <ErrorText>{errors.cargo[index]?.description?.message}</ErrorText>
              )}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                placeholder="Quantity"
                $hasError={!!errors.cargo?.[index]?.quantity}
                disabled={isSubmitting}
                {...register(`cargo.${index}.quantity`)}
              />
              {errors.cargo?.[index]?.quantity && <ErrorText>{errors.cargo[index]?.quantity?.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                step="0.01"
                placeholder="Weight (kg)"
                disabled={isSubmitting}
                {...register(`cargo.${index}.weight`)}
              />
            </FormGroup>

            {fields.length > 1 && (
              <RemoveButton type="button" onClick={() => remove(index)} disabled={isSubmitting} aria-label="Remove cargo item">
                <X size={13} strokeWidth={1.8} />
              </RemoveButton>
            )}
          </CargoItem>
        ))}

        {errors.cargo && typeof errors.cargo.message === 'string' && <ErrorText>{errors.cargo.message}</ErrorText>}
      </FormSection>

      <FormGroup>
        <Label>Notes</Label>
        <TextArea placeholder="Additional notes..." disabled={isSubmitting} {...register('notes')} />
      </FormGroup>

      <Actions>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : shipment ? 'Update Shipment' : 'Create Shipment'}
        </Button>
      </Actions>
    </Form>
  );
}
