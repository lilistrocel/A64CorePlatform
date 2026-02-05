/**
 * EmployeeForm Component
 *
 * Form for creating and editing employees with validation.
 */

import { useState, useRef, useMemo } from 'react';
import styled from 'styled-components';
import type { Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus } from '../../types/hr';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

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

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'reset' }>`
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
    if ($variant === 'reset') {
      return `
        background: transparent;
        color: #F59E0B;
        border: 1px solid #F59E0B;
        &:hover:not(:disabled) {
          background: #FEF3C7;
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

  // Track initial form values for dirty state detection
  const initialFormData = useRef(formData);
  const isDirty = useMemo(() => {
    const initial = initialFormData.current;
    return (
      formData.firstName !== initial.firstName ||
      formData.lastName !== initial.lastName ||
      formData.email !== initial.email ||
      formData.phone !== initial.phone ||
      formData.department !== initial.department ||
      formData.position !== initial.position ||
      formData.hireDate !== initial.hireDate ||
      formData.status !== initial.status
    );
  }, [formData]);

  // Warn user on page refresh if form has unsaved changes
  useUnsavedChanges(isDirty);

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

    if (!formData.department.trim()) {
      newErrors.department = 'Department is required';
    }

    if (!formData.position.trim()) {
      newErrors.position = 'Position is required';
    }

    if (!formData.hireDate) {
      newErrors.hireDate = 'Hire date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // Only include emergencyContact if at least one field is filled
      const hasEmergencyContact =
        formData.emergencyContact.name.trim() ||
        formData.emergencyContact.phone.trim() ||
        formData.emergencyContact.relationship.trim();

      const submitData: EmployeeCreate | EmployeeUpdate = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        department: formData.department,
        position: formData.position,
        hireDate: formData.hireDate,
        status: formData.status,
        emergencyContact: hasEmergencyContact
          ? {
              name: formData.emergencyContact.name,
              phone: formData.emergencyContact.phone,
              relationship: formData.emergencyContact.relationship,
            }
          : undefined,
      };

      await onSubmit(submitData);
    } catch (error: any) {
      console.error('Form submission error:', error);
      setErrors({ submit: error.message || 'Failed to save employee' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    // Reset form to initial values
    setFormData(initialFormData.current);
    setErrors({});
    // Reset collapsed sections
    setEmergencyContactCollapsed(true);
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Section>
        <SectionTitle>Basic Information</SectionTitle>
        <Row>
          <FormField>
            <Label htmlFor="emp-firstName">
              First Name <Required>*</Required>
            </Label>
            <Input
              id="emp-firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              $hasError={!!errors.firstName}
              placeholder="Enter first name"
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && <ErrorText>{errors.firstName}</ErrorText>}
          </FormField>

          <FormField>
            <Label htmlFor="emp-lastName">
              Last Name <Required>*</Required>
            </Label>
            <Input
              id="emp-lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              $hasError={!!errors.lastName}
              placeholder="Enter last name"
              aria-invalid={!!errors.lastName}
            />
            {errors.lastName && <ErrorText>{errors.lastName}</ErrorText>}
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label htmlFor="emp-email">
              Email <Required>*</Required>
            </Label>
            <Input
              id="emp-email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              $hasError={!!errors.email}
              placeholder="email@example.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && <ErrorText>{errors.email}</ErrorText>}
          </FormField>

          <FormField>
            <Label htmlFor="emp-phone">Phone</Label>
            <Input
              id="emp-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label htmlFor="emp-department">
              Department <Required>*</Required>
            </Label>
            <Input
              id="emp-department"
              type="text"
              value={formData.department}
              onChange={(e) => handleChange('department', e.target.value)}
              $hasError={!!errors.department}
              placeholder="Engineering, Sales, etc."
              aria-invalid={!!errors.department}
            />
            {errors.department && <ErrorText>{errors.department}</ErrorText>}
          </FormField>

          <FormField>
            <Label htmlFor="emp-position">
              Position <Required>*</Required>
            </Label>
            <Input
              id="emp-position"
              type="text"
              value={formData.position}
              onChange={(e) => handleChange('position', e.target.value)}
              $hasError={!!errors.position}
              placeholder="Software Engineer, Manager, etc."
              aria-invalid={!!errors.position}
            />
            {errors.position && <ErrorText>{errors.position}</ErrorText>}
          </FormField>
        </Row>

        <Row>
          <FormField>
            <Label htmlFor="emp-hireDate">
              Hire Date <Required>*</Required>
            </Label>
            <Input
              id="emp-hireDate"
              type="date"
              value={formData.hireDate}
              onChange={(e) => handleChange('hireDate', e.target.value)}
              $hasError={!!errors.hireDate}
              aria-invalid={!!errors.hireDate}
            />
            {errors.hireDate && <ErrorText>{errors.hireDate}</ErrorText>}
          </FormField>

          <FormField>
            <Label htmlFor="emp-status">Status</Label>
            <Select id="emp-status" value={formData.status} onChange={(e) => handleChange('status', e.target.value as EmployeeStatus)}>
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
            <Label htmlFor="emp-ec-name">Name</Label>
            <Input
              id="emp-ec-name"
              type="text"
              value={formData.emergencyContact.name}
              onChange={(e) => handleEmergencyContactChange('name', e.target.value)}
              placeholder="Emergency contact name"
            />
          </FormField>

          <Row>
            <FormField>
              <Label htmlFor="emp-ec-phone">Phone</Label>
              <Input
                id="emp-ec-phone"
                type="tel"
                value={formData.emergencyContact.phone}
                onChange={(e) => handleEmergencyContactChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </FormField>

            <FormField>
              <Label htmlFor="emp-ec-relationship">Relationship</Label>
              <Input
                id="emp-ec-relationship"
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
        <Button type="button" $variant="reset" onClick={handleReset} disabled={isSubmitting}>
          Reset
        </Button>
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
