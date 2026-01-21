/**
 * EmployeeForm Component
 *
 * Form for creating and editing employees with validation.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus } from '../../types/hr';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface EmployeeFormProps {
  employee?: Employee;
  onSubmit: (data: EmployeeCreate | EmployeeUpdate) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
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

const ErrorText = styled.span`
  font-size: 12px;
  color: #EF4444;
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

export function EmployeeForm({ employee, onSubmit, onCancel, isEdit = false }: EmployeeFormProps) {
  const [formData, setFormData] = useState({
    firstName: employee?.firstName || '',
    lastName: employee?.lastName || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    department: employee?.department || '',
    position: employee?.position || '',
    hireDate: employee?.hireDate || '',
    status: employee?.status || ('active' as EmployeeStatus),
    emergencyContact: {
      name: employee?.emergencyContact?.name || '',
      phone: employee?.emergencyContact?.phone || '',
      relationship: employee?.emergencyContact?.relationship || '',
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emergencyContactCollapsed, setEmergencyContactCollapsed] = useState(true);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleEmergencyContactChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      emergencyContact: {
        ...prev.emergencyContact,
        [field]: value,
      },
    }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
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
      const submitData: EmployeeCreate | EmployeeUpdate = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        department: formData.department || undefined,
        position: formData.position || undefined,
        hireDate: formData.hireDate || undefined,
        status: formData.status,
        emergencyContact: {
          name: formData.emergencyContact.name || undefined,
          phone: formData.emergencyContact.phone || undefined,
          relationship: formData.emergencyContact.relationship || undefined,
        },
      };

      await onSubmit(submitData);
    } catch (error: any) {
      console.error('Form submission error:', error);
      setErrors({ submit: error.message || 'Failed to save employee' });
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
              First Name <Required>*</Required>
            </Label>
            <Input
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              $hasError={!!errors.firstName}
              placeholder="Enter first name"
            />
            {errors.firstName && <ErrorText>{errors.firstName}</ErrorText>}
          </FormField>

          <FormField>
            <Label>
              Last Name <Required>*</Required>
            </Label>
            <Input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              $hasError={!!errors.lastName}
              placeholder="Enter last name"
            />
            {errors.lastName && <ErrorText>{errors.lastName}</ErrorText>}
          </FormField>
        </Row>

        <Row>
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

          <FormField>
            <Label>Phone</Label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label>Department</Label>
            <Input
              type="text"
              value={formData.department}
              onChange={(e) => handleChange('department', e.target.value)}
              placeholder="Engineering, Sales, etc."
            />
          </FormField>

          <FormField>
            <Label>Position</Label>
            <Input
              type="text"
              value={formData.position}
              onChange={(e) => handleChange('position', e.target.value)}
              placeholder="Software Engineer, Manager, etc."
            />
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label>Hire Date</Label>
            <Input
              type="date"
              value={formData.hireDate}
              onChange={(e) => handleChange('hireDate', e.target.value)}
            />
          </FormField>

          <FormField>
            <Label>Status</Label>
            <Select value={formData.status} onChange={(e) => handleChange('status', e.target.value as EmployeeStatus)}>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="terminated">Terminated</option>
            </Select>
          </FormField>
        </Row>
      </Section>

      <Section>
        <SectionTitle onClick={() => setEmergencyContactCollapsed(!emergencyContactCollapsed)}>
          <CollapseIcon $collapsed={emergencyContactCollapsed}>▼</CollapseIcon>
          Emergency Contact (Optional)
        </SectionTitle>
        <CollapsibleContent $collapsed={emergencyContactCollapsed}>
          <FormField>
            <Label>Name</Label>
            <Input
              type="text"
              value={formData.emergencyContact.name}
              onChange={(e) => handleEmergencyContactChange('name', e.target.value)}
              placeholder="Emergency contact name"
            />
          </FormField>

          <Row>
            <FormField>
              <Label>Phone</Label>
              <Input
                type="tel"
                value={formData.emergencyContact.phone}
                onChange={(e) => handleEmergencyContactChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </FormField>

            <FormField>
              <Label>Relationship</Label>
              <Input
                type="text"
                value={formData.emergencyContact.relationship}
                onChange={(e) => handleEmergencyContactChange('relationship', e.target.value)}
                placeholder="Spouse, Parent, etc."
              />
            </FormField>
          </Row>
        </CollapsibleContent>
      </Section>

      {errors.submit && <ErrorText>{errors.submit}</ErrorText>}

      <Actions>
        <Button type="button" $variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" $variant="primary" disabled={isSubmitting}>
          {isSubmitting ? (isEdit ? 'Updating...' : 'Creating...') : isEdit ? 'Update Employee' : 'Create Employee'}
        </Button>
      </Actions>
    </Form>
  );
}
