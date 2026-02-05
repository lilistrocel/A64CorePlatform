/**
 * OrderForm Component
 *
 * Form for creating and editing sales orders with dynamic order items.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import type { SalesOrderCreate, SalesOrderUpdate, SalesOrder } from '../../types/sales';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const orderItemSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' }).gt(0, 'Quantity must be greater than 0'),
  unitPrice: z.coerce.number({ invalid_type_error: 'Unit price is required' }).min(0, 'Unit price cannot be negative'),
});

const orderSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  orderDate: z.string().min(1, 'Order date is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  tax: z.string().optional(),
  discount: z.string().optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid']).optional(),
  shippingStreet: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingCountry: z.string().optional(),
  shippingPostalCode: z.string().optional(),
  notes: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface OrderFormProps {
  order?: SalesOrder;
  onSubmit: (data: SalesOrderCreate | SalesOrderUpdate) => Promise<void>;
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

const OrderItem = styled.div`
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
  font-size: 14px;
  color: #212121;

  &.total {
    font-size: 18px;
    font-weight: 600;
    border-top: 2px solid #90caf9;
    margin-top: 8px;
    padding-top: 12px;
  }
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

export function OrderForm({ order, onSubmit, onCancel, isSubmitting = false }: OrderFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: order
      ? {
          customerId: order.customerId,
          customerName: order.customerName || '',
          orderDate: order.orderDate.split('T')[0],
          items: order.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          tax: order.tax?.toString() || '',
          discount: order.discount?.toString() || '',
          paymentStatus: order.paymentStatus,
          shippingStreet: order.shippingAddress?.street || '',
          shippingCity: order.shippingAddress?.city || '',
          shippingState: order.shippingAddress?.state || '',
          shippingCountry: order.shippingAddress?.country || '',
          shippingPostalCode: order.shippingAddress?.postalCode || '',
          notes: order.notes || '',
        }
      : {
          items: [{ productName: '', quantity: '' as any, unitPrice: '' as any }],
          paymentStatus: 'pending',
        },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  // Watch for changes to calculate totals
  const watchedItems = watch('items');
  const watchedTax = watch('tax');
  const watchedDiscount = watch('discount');

  const calculateTotals = () => {
    const subtotal = watchedItems.reduce((sum, item) => {
      const rawQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity));
      const rawPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(String(item.unitPrice));
      const qty = isNaN(rawQty) ? 0 : rawQty;
      const price = isNaN(rawPrice) ? 0 : rawPrice;
      return sum + qty * price;
    }, 0);

    const tax = parseFloat(watchedTax || '0') || 0;
    const discount = parseFloat(watchedDiscount || '0') || 0;
    const total = subtotal + tax - discount;

    return { subtotal, tax, discount, total };
  };

  const { subtotal, tax, discount, total } = calculateTotals();

  const onSubmitForm = async (data: OrderFormData) => {
    const orderData: SalesOrderCreate | SalesOrderUpdate = {
      customerId: data.customerId,
      customerName: data.customerName,
      orderDate: data.orderDate,
      items: data.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      })),
      subtotal,
      tax: data.tax ? parseFloat(data.tax) : undefined,
      discount: data.discount ? parseFloat(data.discount) : undefined,
      total,
      paymentStatus: data.paymentStatus,
      shippingAddress: {
        street: data.shippingStreet || undefined,
        city: data.shippingCity || undefined,
        state: data.shippingState || undefined,
        country: data.shippingCountry || undefined,
        postalCode: data.shippingPostalCode || undefined,
      },
      notes: data.notes || undefined,
    };

    await onSubmit(orderData);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmitForm)}>
      <FormRow>
        <FormGroup>
          <Label>Customer ID *</Label>
          <Input
            type="text"
            placeholder="Enter customer ID"
            $hasError={!!errors.customerId}
            disabled={isSubmitting}
            {...register('customerId')}
          />
          {errors.customerId && <ErrorText>{errors.customerId.message}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>Customer Name *</Label>
          <Input
            type="text"
            placeholder="Enter customer name"
            $hasError={!!errors.customerName}
            disabled={isSubmitting}
            {...register('customerName')}
          />
          {errors.customerName && <ErrorText>{errors.customerName.message}</ErrorText>}
        </FormGroup>

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
          <Label>Payment Status</Label>
          <Select disabled={isSubmitting} {...register('paymentStatus')}>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </Select>
        </FormGroup>
      </FormRow>

      <FormSection>
        <SectionTitle>
          <span>Order Items *</span>
          <AddButton
            type="button"
            onClick={() => append({ productName: '', quantity: '', unitPrice: '' })}
            disabled={isSubmitting}
          >
            + Add Item
          </AddButton>
        </SectionTitle>

        {fields.map((field, index) => (
          <OrderItem key={field.id}>
            <FormGroup>
              <Input
                type="text"
                placeholder="Product Name"
                $hasError={!!errors.items?.[index]?.productName}
                disabled={isSubmitting}
                {...register(`items.${index}.productName`)}
              />
              {errors.items?.[index]?.productName && (
                <ErrorText>{errors.items[index]?.productName?.message}</ErrorText>
              )}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Quantity"
                $hasError={!!errors.items?.[index]?.quantity}
                disabled={isSubmitting}
                {...register(`items.${index}.quantity`, { valueAsNumber: true })}
              />
              {errors.items?.[index]?.quantity && <ErrorText>{errors.items[index]?.quantity?.message}</ErrorText>}
            </FormGroup>

            <FormGroup>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit Price"
                $hasError={!!errors.items?.[index]?.unitPrice}
                disabled={isSubmitting}
                {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
              />
              {errors.items?.[index]?.unitPrice && <ErrorText>{errors.items[index]?.unitPrice?.message}</ErrorText>}
            </FormGroup>

            {fields.length > 1 && (
              <RemoveButton type="button" onClick={() => remove(index)} disabled={isSubmitting}>
                Remove
              </RemoveButton>
            )}
          </OrderItem>
        ))}

        {errors.items && typeof errors.items.message === 'string' && <ErrorText>{errors.items.message}</ErrorText>}

        <TotalDisplay>
          <TotalRow>
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </TotalRow>
          <TotalRow>
            <span>Tax:</span>
            <span>${tax.toFixed(2)}</span>
          </TotalRow>
          <TotalRow>
            <span>Discount:</span>
            <span>-${discount.toFixed(2)}</span>
          </TotalRow>
          <TotalRow className="total">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </TotalRow>
        </TotalDisplay>
      </FormSection>

      <FormRow>
        <FormGroup>
          <Label>Tax Amount</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            disabled={isSubmitting}
            {...register('tax')}
          />
        </FormGroup>

        <FormGroup>
          <Label>Discount Amount</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            disabled={isSubmitting}
            {...register('discount')}
          />
        </FormGroup>
      </FormRow>

      <FormSection>
        <SectionTitle>Shipping Address (Optional)</SectionTitle>
        <FormGroup>
          <Label>Street</Label>
          <Input type="text" placeholder="Street address" disabled={isSubmitting} {...register('shippingStreet')} />
        </FormGroup>
        <FormRow>
          <FormGroup>
            <Label>City</Label>
            <Input type="text" placeholder="City" disabled={isSubmitting} {...register('shippingCity')} />
          </FormGroup>
          <FormGroup>
            <Label>State</Label>
            <Input type="text" placeholder="State" disabled={isSubmitting} {...register('shippingState')} />
          </FormGroup>
        </FormRow>
        <FormRow>
          <FormGroup>
            <Label>Country</Label>
            <Input type="text" placeholder="Country" disabled={isSubmitting} {...register('shippingCountry')} />
          </FormGroup>
          <FormGroup>
            <Label>Postal Code</Label>
            <Input type="text" placeholder="Postal code" disabled={isSubmitting} {...register('shippingPostalCode')} />
          </FormGroup>
        </FormRow>
      </FormSection>

      <FormGroup>
        <Label>Notes</Label>
        <TextArea placeholder="Additional notes..." disabled={isSubmitting} {...register('notes')} />
      </FormGroup>

      <Actions>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : order ? 'Update Order' : 'Create Order'}
        </Button>
      </Actions>
    </Form>
  );
}
