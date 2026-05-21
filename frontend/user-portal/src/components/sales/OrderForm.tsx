/**
 * OrderForm Component
 *
 * Create-only form for sales orders with dynamic order items.
 * Edit mode has been intentionally removed — orders cannot be edited after save.
 *
 * v1.13.0: Replaced manual customerId + customerName text inputs with
 * CustomerCombobox — a typeahead that searches CRM and autofills shipping
 * fields from the selected customer's address.
 * v1.13.x: Removed edit-mode (order prop) — form is now create-only.
 */

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { useState } from 'react';
import type { SalesOrderCreate, OrderItem } from '../../types/sales';
import type { Customer } from '../../types/crm';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { CustomerCombobox } from './CustomerCombobox';
import { AddOrderItemModal } from './AddOrderItemModal';

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const orderItemAllocationSchema = z.object({
  inventorySource: z.enum(['harvest', 'returned']),
  inventoryId: z.string(),
  farmId: z.string().nullable().optional(),
  farmName: z.string().nullable().optional(),
  quantity: z.number(),
});

const orderItemSchema = z.object({
  productId: z.string().optional(),
  productName: z.string().min(1, 'Product name is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity is required' })
    .refine((val) => val > 0, { message: 'Quantity must be greater than 0' }),
  unitPrice: z.coerce.number({ invalid_type_error: 'Unit price is required' })
    .refine((val) => val >= 0, { message: 'Unit price cannot be negative' }),
  qualityGrade: z.string().optional(),
  allocations: z.array(orderItemAllocationSchema).optional(),
  containerCount: z.number().nullable().optional(),
  containerSize: z.number().nullable().optional(),
});

const orderSchema = z.object({
  // customerId is selection-driven — set programmatically via CustomerCombobox.
  // The "Customer ID is required" message still applies when no customer is selected.
  customerId: z.string().min(1, 'Customer ID is required — please select a customer'),
  // customerName is derived from the selection and kept in sync automatically.
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
  /** Create-only — no order prop; edit mode is intentionally unsupported. */
  onSubmit: (data: SalesOrderCreate) => Promise<void>;
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
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#0F6E56')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#0F6E56')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
  }
`;

const TextArea = styled.textarea<{ $hasError?: boolean }>`
  padding: 12px 16px;
  border: 1px solid ${({ $hasError, theme }) => ($hasError ? '#9E2A2A' : theme.colors.border.subtle)};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  min-height: 80px;
  resize: vertical;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#9E2A2A' : '#0F6E56')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #9E2A2A;
  margin-top: 4px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const FormSection = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  margin-top: 8px;
`;

const SectionTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
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
  background: rgba(15, 110, 86, 0.05);
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
  color: ${({ theme }) => theme.colors.text.primary};

  &.total {
    font-size: 18px;
    font-weight: 600;
    border-top: 2px solid #CFC9BD;
    margin-top: 8px;
    padding-top: 12px;
  }
`;

const AddButton = styled.button`
  padding: 8px 16px;
  background: #0F6E56;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #0F6E56;
  }
`;

const RemoveButton = styled.button`
  padding: 8px;
  background: transparent;
  color: #9E2A2A;
  border: 1px solid #9E2A2A;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  align-self: center;

  &:hover {
    background: rgba(158,42,42,0.08);
  }
`;

/* Read-only line item row — each item is added via the AddOrderItemModal,
   so this just displays what was picked. Remove button is the only mutation
   from here. */
const ItemDisplayRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const ItemMain = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ItemTitleLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const ItemName = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const GradeChip = styled.span`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  color: ${({ theme }) => theme.colors.text.secondary};
  letter-spacing: 0.3px;
`;

const ItemMetaLine = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const AllocationBreakdown = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 2px;
`;

const AllocationPill = styled.span<{ $isReturned?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &::before {
    content: '${({ $isReturned }) => ($isReturned ? '↩' : '🏞')}';
    font-size: 10px;
  }
`;

const ItemTotal = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  white-space: nowrap;
  align-self: center;
`;

const EmptyItemsState = styled.div`
  padding: 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 13px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px dashed ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'reset' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: ${theme.colors.text.secondary};
        border: 1px solid ${theme.colors.border.subtle};
        &:hover {
          background: ${theme.colors.surface.raised};
        }
      `;
    }
    if ($variant === 'reset') {
      return `
        background: transparent;
        color: #B8842A;
        border: 1px solid #B8842A;
        &:hover:not(:disabled) {
          background: rgba(184,132,42,0.10);
        }
      `;
    }
    return `
      background: #0F6E56;
      color: white;
      &:hover:not(:disabled) {
        background: #0F6E56;
      }
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
  }}
`;

/**
 * Read-only monospace display of the resolved Customer ID.
 * Shown below the CustomerCombobox so the user can verify the UUID.
 */
const CustomerIdDisplay = styled.div`
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 6px;
  padding: 6px 10px;
  word-break: break-all;
`;

const CustomerIdPlaceholder = styled(CustomerIdDisplay)`
  font-family: inherit;
  font-style: italic;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function OrderForm({ onSubmit, onCancel, isSubmitting = false }: OrderFormProps) {
  /** Controls visibility of the AddOrderItemModal. */
  const [showAddItemModal, setShowAddItemModal] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      // Items are added exclusively via AddOrderItemModal; start with an empty
      // array. The schema's `min(1)` rule will surface a "at least one item is
      // required" error on submit if the user tries to save with no items.
      items: [],
      paymentStatus: 'pending',
      // Sensible defaults: tax 5 (typical UAE VAT), discount 0.
      // User can override either before submitting.
      tax: '5',
      discount: '0',
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'items',
  });

  // Warn user on page refresh if form has unsaved changes.
  useUnsavedChanges(isDirty);

  // Watch for changes to calculate totals.
  const watchedItems = watch('items');
  const watchedTax = watch('tax');
  const watchedDiscount = watch('discount');
  // Watch customerId to derive disabled state of the submit button.
  const watchedCustomerId = watch('customerId');

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

  // -------------------------------------------------------------------------
  // Customer selection handler — called by CustomerCombobox on selection.
  // Updates customerId + customerName form values, then prefills shipping
  // fields if the selected customer has at least one non-empty address field.
  // -------------------------------------------------------------------------
  const handleCustomerSelect = (customer: Customer) => {
    setValue('customerId', customer.customerId, { shouldValidate: true, shouldDirty: true });
    setValue('customerName', customer.name, { shouldValidate: true, shouldDirty: true });

    // Prefill shipping address only when at least one field is present.
    // Uses optional chaining throughout to guard against null/undefined address.
    const addr = customer.address;
    const hasAnyAddressField = Boolean(
      addr?.street || addr?.city || addr?.state || addr?.country || addr?.postalCode,
    );

    if (hasAnyAddressField) {
      setValue('shippingStreet', addr?.street || '', { shouldDirty: true });
      setValue('shippingCity', addr?.city || '', { shouldDirty: true });
      setValue('shippingState', addr?.state || '', { shouldDirty: true });
      setValue('shippingCountry', addr?.country || '', { shouldDirty: true });
      setValue('shippingPostalCode', addr?.postalCode || '', { shouldDirty: true });
    }
    // When address is null/empty: shipping fields are left untouched per spec.
  };

  // Called when the user clears the selected customer via the X button on
  // the chip. Wipes both customerId and customerName so the read-only ID
  // display below the combobox returns to its placeholder state. Shipping
  // fields are intentionally left as-is — the user may have manually edited
  // them and we don't want to discard that on customer change.
  const handleCustomerClear = () => {
    setValue('customerId', '', { shouldValidate: true, shouldDirty: true });
    setValue('customerName', '', { shouldValidate: true, shouldDirty: true });
  };

  // -------------------------------------------------------------------------
  // AddOrderItemModal handler — appends or merges the item into the field array.
  // When onAdd is called from the modal with an item whose productName+qualityGrade
  // already exists (the merge path), we replace that item at the correct index;
  // otherwise we append a new line.
  // -------------------------------------------------------------------------
  const handleItemAdd = (item: OrderItem) => {
    // Check if this is a merge (same productName + qualityGrade already present).
    const existingIndex = fields.findIndex(
      (f) =>
        f.productName === item.productName &&
        (f as any).qualityGrade === item.qualityGrade,
    );

    if (existingIndex !== -1) {
      // Replace at the existing position so merged item keeps its original
      // place in the list (vs remove+append which moves it to the end).
      update(existingIndex, {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        qualityGrade: item.qualityGrade,
        allocations: item.allocations,
        containerCount: item.containerCount ?? undefined,
        containerSize: item.containerSize ?? undefined,
      });
    } else {
      append({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        qualityGrade: item.qualityGrade,
        allocations: item.allocations,
        containerCount: item.containerCount ?? undefined,
        containerSize: item.containerSize ?? undefined,
      });
    }
  };

  const onSubmitForm = async (data: OrderFormData) => {
    const orderData: SalesOrderCreate = {
      customerId: data.customerId,
      customerName: data.customerName,
      orderDate: data.orderDate,
      items: data.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        qualityGrade: item.qualityGrade,
        allocations: item.allocations,
        containerCount: item.containerCount,
        containerSize: item.containerSize,
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
        {/* ----------------------------------------------------------------
            Customer selection — replaces the old customerId + customerName
            text inputs with a single typeahead combobox.
        ---------------------------------------------------------------- */}
        <FormGroup style={{ gridColumn: 'span 2' }}>
          <Label htmlFor="customer-combobox-input">Customer *</Label>
          <CustomerCombobox
            valueCustomerId={watchedCustomerId || null}
            valueCustomerName={watch('customerName')}
            onCustomerSelect={handleCustomerSelect}
            onClear={handleCustomerClear}
            error={errors.customerId?.message ?? errors.customerName?.message}
            disabled={isSubmitting}
          />
          {/* Read-only Customer ID display below the combobox */}
          {watchedCustomerId ? (
            <CustomerIdDisplay aria-label="Resolved customer ID">
              {watchedCustomerId}
            </CustomerIdDisplay>
          ) : (
            <CustomerIdPlaceholder aria-label="Customer ID not yet set">
              Will be set after selecting a customer
            </CustomerIdPlaceholder>
          )}
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
            onClick={() => setShowAddItemModal(true)}
            disabled={isSubmitting}
          >
            + Add Item
          </AddButton>
        </SectionTitle>

        {/* Read-only display of items added via the AddOrderItemModal. */}
        {fields.length === 0 ? (
          <EmptyItemsState>
            No items yet. Click <strong>+ Add Item</strong> to pick crops from
            available farm and returned stock.
          </EmptyItemsState>
        ) : (
          fields.map((field, index) => {
            const itemData = watchedItems[index] as OrderItem | undefined;
            const qty = itemData?.quantity ?? 0;
            const price = itemData?.unitPrice ?? 0;
            const lineTotal = Number(qty) * Number(price);
            const allocations = itemData?.allocations ?? [];
            const grade = itemData?.qualityGrade;
            const containerCount = itemData?.containerCount;
            const containerSize = itemData?.containerSize;

            return (
              <ItemDisplayRow key={field.id}>
                <ItemMain>
                  <ItemTitleLine>
                    <ItemName>{itemData?.productName || 'Unnamed item'}</ItemName>
                    {grade && <GradeChip>Grade {grade}</GradeChip>}
                  </ItemTitleLine>

                  <ItemMetaLine>
                    {Number(qty).toLocaleString()} kg × {Number(price).toFixed(2)} AED/kg
                    {containerCount && containerSize ? (
                      <>{' · '}{containerCount} containers × {containerSize} kg</>
                    ) : null}
                  </ItemMetaLine>

                  {allocations.length > 0 && (
                    <AllocationBreakdown>
                      {allocations.map((alloc, i) => (
                        <AllocationPill
                          key={`${alloc.inventoryId}-${i}`}
                          $isReturned={alloc.inventorySource === 'returned'}
                        >
                          {Number(alloc.quantity).toLocaleString()} kg{' '}
                          {alloc.inventorySource === 'returned'
                            ? 'returned stock'
                            : `from ${alloc.farmName ?? 'farm'}`}
                        </AllocationPill>
                      ))}
                    </AllocationBreakdown>
                  )}
                </ItemMain>

                <ItemTotal>{lineTotal.toFixed(2)} AED</ItemTotal>

                <RemoveButton
                  type="button"
                  onClick={() => remove(index)}
                  disabled={isSubmitting}
                  aria-label={`Remove ${itemData?.productName ?? 'item'}`}
                >
                  Remove
                </RemoveButton>
              </ItemDisplayRow>
            );
          })
        )}

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
        <Button type="button" $variant="reset" onClick={() => reset()} disabled={isSubmitting}>
          Reset
        </Button>
        {onCancel && (
          <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        {/*
          Submit is disabled when no customer is selected (customerId is empty/null)
          or when the form is actively submitting.
        */}
        <Button
          type="submit"
          $variant="primary"
          disabled={isSubmitting || !watchedCustomerId}
        >
          {isSubmitting ? 'Saving...' : 'Create Order'}
        </Button>
      </Actions>

      {/* ---------------------------------------------------------------
          Add Item modal — rendered outside the form flow so it doesn't
          interfere with form submit events.
      --------------------------------------------------------------- */}
      <AddOrderItemModal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        onAdd={handleItemAdd}
        existingItems={watchedItems as OrderItem[]}
      />
    </Form>
  );
}
