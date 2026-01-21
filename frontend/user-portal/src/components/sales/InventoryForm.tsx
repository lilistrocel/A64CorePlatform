/**
 * InventoryForm Component
 *
 * Form for creating and editing harvest inventory items.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import type { HarvestInventoryCreate, HarvestInventoryUpdate, HarvestInventory } from '../../types/sales';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const inventorySchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  category: z.string().optional(),
  farmId: z.string().optional(),
  blockId: z.string().optional(),
  harvestDate: z.string().optional(),
  quantity: z.string().min(1, 'Quantity is required'),
  unit: z.enum(['kg', 'pieces', 'bunches']),
  quality: z.enum(['A', 'B', 'C']).optional(),
  status: z.enum(['available', 'reserved', 'sold', 'expired']).optional(),
  expiryDate: z.string().optional(),
  storageLocation: z.string().optional(),
});

type InventoryFormData = z.infer<typeof inventorySchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface InventoryFormProps {
  inventory?: HarvestInventory;
  onSubmit: (data: HarvestInventoryCreate | HarvestInventoryUpdate) => Promise<void>;
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

export function InventoryForm({ inventory, onSubmit, onCancel, isSubmitting = false }: InventoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InventoryFormData>({
    resolver: zodResolver(inventorySchema),
    defaultValues: inventory
      ? {
          productName: inventory.productName,
          category: inventory.category || '',
          farmId: inventory.farmId || '',
          blockId: inventory.blockId || '',
          harvestDate: inventory.harvestDate?.split('T')[0] || '',
          quantity: inventory.quantity.toString(),
          unit: inventory.unit,
          quality: inventory.quality || undefined,
          status: inventory.status,
          expiryDate: inventory.expiryDate?.split('T')[0] || '',
          storageLocation: inventory.storageLocation || '',
        }
      : {
          unit: 'kg',
          status: 'available',
        },
  });

  const onSubmitForm = async (data: InventoryFormData) => {
    const inventoryData: HarvestInventoryCreate | HarvestInventoryUpdate = {
      productName: data.productName,
      category: data.category || undefined,
      farmId: data.farmId || undefined,
      blockId: data.blockId || undefined,
      harvestDate: data.harvestDate || undefined,
      quantity: parseFloat(data.quantity),
      unit: data.unit,
      quality: data.quality,
      status: data.status,
      expiryDate: data.expiryDate || undefined,
      storageLocation: data.storageLocation || undefined,
    };

    await onSubmit(inventoryData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormRow>
        <FormGroup>
          <Label>Product Name *</Label>
          <Input
            type="text"
            placeholder="Enter product name"
            $hasError={!!errors.productName}
            disabled={isSubmitting}
            {...register('productName')}
          />
          {errors.productName && <ErrorText>{errors.productName.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Category</Label>
          <Input
            type="text"
            placeholder="e.g., Vegetables, Fruits"
            disabled={isSubmitting}
            {...register('category')}
          />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Quantity *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="Enter quantity"
            $hasError={!!errors.quantity}
            disabled={isSubmitting}
            {...register('quantity')}
          />
          {errors.quantity && <ErrorText>{errors.quantity.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Unit *</Label>
          <Select $hasError={!!errors.unit} disabled={isSubmitting} {...register('unit')}>
            <option value="kg">Kilograms (kg)</option>
            <option value="pieces">Pieces</option>
            <option value="bunches">Bunches</option>
          </Select>
          {errors.unit && <ErrorText>{errors.unit.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Quality Grade</Label>
          <Select disabled={isSubmitting} {...register('quality')}>
            <option value="">Select Grade</option>
            <option value="A">Grade A</option>
            <option value="B">Grade B</option>
            <option value="C">Grade C</option>
          </Select>
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Status</Label>
          <Select disabled={isSubmitting} {...register('status')}>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
            <option value="expired">Expired</option>
          </Select>
        </FormGroup>

        <FormGroup>
          <Label>Harvest Date</Label>
          <Input type="date" disabled={isSubmitting} {...register('harvestDate')} />
        </FormGroup>

        <FormGroup>
          <Label>Expiry Date</Label>
          <Input type="date" disabled={isSubmitting} {...register('expiryDate')} />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Farm ID</Label>
          <Input type="text" placeholder="Farm ID (optional)" disabled={isSubmitting} {...register('farmId')} />
        </FormGroup>

        <FormGroup>
          <Label>Block ID</Label>
          <Input type="text" placeholder="Block ID (optional)" disabled={isSubmitting} {...register('blockId')} />
        </FormGroup>

        <FormGroup>
          <Label>Storage Location</Label>
          <Input
            type="text"
            placeholder="e.g., Warehouse A, Section 3"
            disabled={isSubmitting}
            {...register('storageLocation')}
          />
        </FormGroup>
      </FormRow>

      <Actions>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : inventory ? 'Update Inventory' : 'Add Inventory'}
        </Button>
      </Actions>
    </Form>
  );
}
