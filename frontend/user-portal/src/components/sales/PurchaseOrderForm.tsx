/**
 * PurchaseOrderForm Component
 *
 * Form for creating and editing purchase orders with dynamic item lists.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import type { PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrder } from '../../types/sales';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const poItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  unitPrice: z.string().optional(),
});

const purchaseOrderSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required'),
  supplierId: z.string().optional(),
  orderDate: z.string().min(1, 'Order date is required'),
  expectedDeliveryDate: z.string().optional(),
  items: z.array(poItemSchema).min(1, 'At least one item is required'),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PurchaseOrderFormProps {
  purchaseOrder?: PurchaseOrder;
  onSubmit: (data: PurchaseOrderCreate | PurchaseOrderUpdate) => Promise<void>;
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

const TextArea = styled.textarea<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  min-height: 80px;
  resize: vertical;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const POItem = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 12px;
  align-items: start;
  margin-bottom: 12px;
`;

const TotalDisplay = styled.div`
  background: #e3f2fd;
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #212121;
`;

const AddButton = styled.button`
  padding: 8px 16px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const RemoveButton = styled.button`
  padding: 8px;
  background: transparent;
  color: #EF4444;
  border: 1px solid #EF4444;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  align-self: center;

  &:hover {
    background: #FEE2E2;
  }
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

export function PurchaseOrderForm({ purchaseOrder, onSubmit, onCancel, isSubmitting = false }: PurchaseOrderFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: purchaseOrder
      ? {
          supplierName: purchaseOrder.supplierName || '',
          supplierId: purchaseOrder.supplierId || '',
          orderDate: purchaseOrder.orderDate.split('T')[0],
          expectedDeliveryDate: purchaseOrder.expectedDeliveryDate?.split('T')[0] || '',
          items: purchaseOrder.items.map((item) => ({
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice?.toString() || '',
          })),
          paymentTerms: purchaseOrder.paymentTerms || '',
          notes: purchaseOrder.notes || '',
        }
      : {
          items: [{ description: '', quantity: '', unitPrice: '' }],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  // Watch for changes to calculate total
  const watchedItems = watch('items');

  const calculateTotal = () => {
    return watchedItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice || '0') || 0;
      return sum + qty * price;
    }, 0);
  };

  const total = calculateTotal();

  const onSubmitForm = async (data: PurchaseOrderFormData) => {
    const poData: PurchaseOrderCreate | PurchaseOrderUpdate = {
      supplierName: data.supplierName || undefined,
      supplierId: data.supplierId || undefined,
      orderDate: data.orderDate,
      expectedDeliveryDate: data.expectedDeliveryDate || undefined,
      items: data.items.map((item) => ({
        description: item.description,
        quantity: parseInt(item.quantity),
        unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
        totalPrice: item.unitPrice ? parseInt(item.quantity) * parseFloat(item.unitPrice) : undefined,
      })),
      total: total > 0 ? total : undefined,
      paymentTerms: data.paymentTerms || undefined,
      notes: data.notes || undefined,
    };

    await onSubmit(poData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormRow>
        <FormGroup>
          <Label>Supplier Name *</Label>
          <Input
            type="text"
            placeholder="Enter supplier name"
            $hasError={!!errors.supplierName}
            disabled={isSubmitting}
            {...register('supplierName')}
          />
          {errors.supplierName && <ErrorText>{errors.supplierName.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Supplier ID (optional)</Label>
          <Input
            type="text"
            placeholder="Supplier ID"
            disabled={isSubmitting}
            {...register('supplierId')}
          />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Order Date *</Label>
          <Input
            type="date"
            $hasError={!!errors.orderDate}
            disabled={isSubmitting}
            {...register('orderDate')}
          />
          {errors.orderDate && <ErrorText>{errors.orderDate.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Expected Delivery Date</Label>
          <Input
            type="date"
            disabled={isSubmitting}
            {...register('expectedDeliveryDate')}
          />
        </FormGroup>
      </FormRow>

      <FormSection>
        <SectionTitle>
          <span>Items *</span>
          <AddButton
            type="button"
            onClick={() => append({ description: '', quantity: '', unitPrice: '' })}
            disabled={isSubmitting}
          >
            + Add Item
          </AddButton>
        </SectionTitle>

        {fields.map((field, index) => (
          <POItem key={field.id}>
            <FormGroup>
              <Input
                type="text"
                placeholder="Item Description"
                $hasError={!!errors.items?.[index]?.description}
                disabled={isSubmitting}
                {...register(`items.${index}.description`)}
              />
              {errors.items?.[index]?.description && (
                <ErrorText>{errors.items[index]?.description?.message}</ErrorText>
              )}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                placeholder="Quantity"
                $hasError={!!errors.items?.[index]?.quantity}
                disabled={isSubmitting}
                {...register(`items.${index}.quantity`)}
              />
              {errors.items?.[index]?.quantity && <ErrorText>{errors.items[index]?.quantity?.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                step="0.01"
                placeholder="Unit Price"
                disabled={isSubmitting}
                {...register(`items.${index}.unitPrice`)}
              />
            </FormGroup>

            {fields.length > 1 && (
              <RemoveButton type="button" onClick={() => remove(index)} disabled={isSubmitting}>
                Remove
              </RemoveButton>
            )}
          </POItem>
        ))}

        {errors.items && typeof errors.items.message === 'string' && <ErrorText>{errors.items.message}</ErrorText>}

        {total > 0 && (
          <TotalDisplay>
            <TotalRow>
              <span>Estimated Total:</span>
              <span>${total.toFixed(2)}</span>
            </TotalRow>
          </TotalDisplay>
        )}
      </FormSection>

      <FormGroup>
        <Label>Payment Terms</Label>
        <Input
          type="text"
          placeholder="e.g., Net 30, Due on delivery"
          disabled={isSubmitting}
          {...register('paymentTerms')}
        />
      </FormGroup>

      <FormGroup>
        <Label>Notes</Label>
        <TextArea
          placeholder="Additional notes or instructions..."
          disabled={isSubmitting}
          {...register('notes')}
        />
      </FormGroup>

      <Actions>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : purchaseOrder ? 'Update Purchase Order' : 'Create Purchase Order'}
        </Button>
      </Actions>
    </Form>
  );
}
