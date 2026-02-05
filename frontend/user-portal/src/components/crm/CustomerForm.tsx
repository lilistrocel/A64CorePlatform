/**
 * CustomerForm Component
 *
 * Form for creating and editing customers with validation.
 */

import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import type { Customer, CustomerCreate, CustomerUpdate, CustomerType, CustomerStatus } from '../../types/crm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CustomerFormProps {
  customer?: Customer;
  onSubmit: (data: CustomerCreate | CustomerUpdate) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
`;

const CollapseIcon = styled.span<{ $collapsed: boolean }>`
  font-size: 12px;
  transition: transform 150ms ease-in-out;
  transform: ${({ $collapsed }) => ($collapsed ? 'rotate(-90deg)' : 'rotate(0)')};
`;

const CollapsibleContent = styled.div<{ $collapsed: boolean }>`
  display: ${({ $collapsed }) => ($collapsed ? 'none' : 'flex')};
  flex-direction: column;
  gap: 16px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Required = styled.span`
  color: #EF4444;
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 10px 12px;
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
  padding: 10px 12px;
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
  padding: 10px 12px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#EF4444' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ $hasError }) => ($hasError ? '#EF4444' : '#3B82F6')};
    box-shadow: 0 0 0 3px ${({ $hasError }) => ($hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')};
  }
`;

const TagsInput = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  min-height: 42px;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
`;

const RemoveTagButton = styled.button`
  background: none;
  border: none;
  color: #1976d2;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;

  &:hover {
    color: #1565c0;
  }
`;

const TagInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  min-width: 120px;
  padding: 4px;
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #EF4444;
`;

const HelpText = styled.span`
  font-size: 12px;
  color: #9e9e9e;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

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

export function CustomerForm({ customer, onSubmit, onCancel, isEdit = false, onDirtyChange }: CustomerFormProps) {
  const initialFormData = useRef({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    company: customer?.company || '',
    type: customer?.type || ('individual' as CustomerType),
    status: customer?.status || ('lead' as CustomerStatus),
    notes: customer?.notes || '',
    address: {
      street: customer?.address?.street || '',
      city: customer?.address?.city || '',
      state: customer?.address?.state || '',
      country: customer?.address?.country || '',
      postalCode: customer?.address?.postalCode || '',
    },
  });

  const [formData, setFormData] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    company: customer?.company || '',
    type: customer?.type || ('individual' as CustomerType),
    status: customer?.status || ('lead' as CustomerStatus),
    notes: customer?.notes || '',
    address: {
      street: customer?.address?.street || '',
      city: customer?.address?.city || '',
      state: customer?.address?.state || '',
      country: customer?.address?.country || '',
      postalCode: customer?.address?.postalCode || '',
    },
  });

  const [tags, setTags] = useState<string[]>(customer?.tags || []);
  const initialTags = useRef<string[]>(customer?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addressCollapsed, setAddressCollapsed] = useState(true);

  // Track dirty state by comparing current form data with initial values
  useEffect(() => {
    if (!onDirtyChange) return;

    const initial = initialFormData.current;
    const isDirty =
      formData.name !== initial.name ||
      formData.email !== initial.email ||
      formData.phone !== initial.phone ||
      formData.company !== initial.company ||
      formData.type !== initial.type ||
      formData.status !== initial.status ||
      formData.notes !== initial.notes ||
      formData.address.street !== initial.address.street ||
      formData.address.city !== initial.address.city ||
      formData.address.state !== initial.address.state ||
      formData.address.country !== initial.address.country ||
      formData.address.postalCode !== initial.address.postalCode ||
      JSON.stringify(tags) !== JSON.stringify(initialTags.current);

    onDirtyChange(isDirty);
  }, [formData, tags, onDirtyChange]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleAddressChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value,
      },
    }));
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const submitData: CustomerCreate | CustomerUpdate = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        company: formData.company || undefined,
        type: formData.type,
        status: formData.status,
        notes: formData.notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
        address: {
          street: formData.address.street || undefined,
          city: formData.address.city || undefined,
          state: formData.address.state || undefined,
          country: formData.address.country || undefined,
          postalCode: formData.address.postalCode || undefined,
        },
      };

      await onSubmit(submitData);
    } catch (error: any) {
      console.error('Form submission error:', error);
      setErrors({ submit: error.message || 'Failed to save customer' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Section>
        <SectionTitle>Basic Information</SectionTitle>
        <Row>
          <FormField>
            <Label>
              Name <Required>*</Required>
            </Label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              $hasError={!!errors.name}
              placeholder="Enter customer name"
            />
            {errors.name && <ErrorText>{errors.name}</ErrorText>}
          </FormField>

          <FormField>
            <Label>
              Email <Required>*</Required>
            </Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              $hasError={!!errors.email}
              placeholder="email@example.com"
            />
            {errors.email && <ErrorText>{errors.email}</ErrorText>}
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label>Phone</Label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </FormField>

          <FormField>
            <Label>Company</Label>
            <Input
              type="text"
              value={formData.company}
              onChange={(e) => handleChange('company', e.target.value)}
              placeholder="Company name"
            />
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label>Type</Label>
            <Select value={formData.type} onChange={(e) => handleChange('type', e.target.value as CustomerType)}>
              <option value="individual">Individual</option>
              <option value="business">Business</option>
            </Select>
          </FormField>

          <FormField>
            <Label>Status</Label>
            <Select value={formData.status} onChange={(e) => handleChange('status', e.target.value as CustomerStatus)}>
              <option value="lead">Lead</option>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </FormField>
        </Row>
      </Section>

      <Section>
        <SectionTitle onClick={() => setAddressCollapsed(!addressCollapsed)}>
          <CollapseIcon $collapsed={addressCollapsed}>▼</CollapseIcon>
          Address (Optional)
        </SectionTitle>
        <CollapsibleContent $collapsed={addressCollapsed}>
          <FormField>
            <Label>Street</Label>
            <Input
              type="text"
              value={formData.address.street}
              onChange={(e) => handleAddressChange('street', e.target.value)}
              placeholder="123 Main Street"
            />
          </FormField>

          <Row>
            <FormField>
              <Label>City</Label>
              <Input
                type="text"
                value={formData.address.city}
                onChange={(e) => handleAddressChange('city', e.target.value)}
                placeholder="City"
              />
            </FormField>

            <FormField>
              <Label>State/Province</Label>
              <Input
                type="text"
                value={formData.address.state}
                onChange={(e) => handleAddressChange('state', e.target.value)}
                placeholder="State"
              />
            </FormField>
          </Row>

          <Row>
            <FormField>
              <Label>Country</Label>
              <Input
                type="text"
                value={formData.address.country}
                onChange={(e) => handleAddressChange('country', e.target.value)}
                placeholder="Country"
              />
            </FormField>

            <FormField>
              <Label>Postal Code</Label>
              <Input
                type="text"
                value={formData.address.postalCode}
                onChange={(e) => handleAddressChange('postalCode', e.target.value)}
                placeholder="12345"
              />
            </FormField>
          </Row>
        </CollapsibleContent>
      </Section>

      <Section>
        <FormField>
          <Label>Tags</Label>
          <TagsInput>
            {tags.map((tag) => (
              <Tag key={tag}>
                {tag}
                <RemoveTagButton type="button" onClick={() => handleRemoveTag(tag)}>
                  ×
                </RemoveTagButton>
              </Tag>
            ))}
            <TagInput
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={handleAddTag}
              placeholder="Add tags..."
            />
          </TagsInput>
          <HelpText>Press Enter to add a tag</HelpText>
        </FormField>

        <FormField>
          <Label>Notes</Label>
          <TextArea
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Additional notes about this customer..."
          />
        </FormField>
      </Section>

      {errors.submit && <ErrorText>{errors.submit}</ErrorText>}

      <Actions>
        <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? (isEdit ? 'Updating...' : 'Creating...') : isEdit ? 'Update Customer' : 'Create Customer'}
        </Button>
      </Actions>
    </Form>
  );
}
