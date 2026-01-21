/**
 * InsuranceTab Component
 *
 * Manages employee insurance with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { hrApi, getInsuranceTypeLabel, formatCurrency, formatDate } from '../../services/hrService';
import type { Insurance, InsuranceCreate, InsuranceUpdate, InsuranceType } from '../../types/hr';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface InsuranceTabProps {
  employeeId: string;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const AddButton = styled.button`
  padding: 8px 16px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Card = styled.div`
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const CardTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const TypeBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  text-transform: capitalize;
`;

const CardDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #616161;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
`;

const ActionButton = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #EF4444;
        border: 1px solid #EF4444;
        &:hover {
          background: #FEE2E2;
        }
      `;
    }
    return `
      background: transparent;
      color: #3B82F6;
      border: 1px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 48px;
  color: #9e9e9e;
`;

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: 1100;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #9e9e9e;
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: #616161;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
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

const Input = styled.input`
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
`;

const Select = styled.select`
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
`;

const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        border: none;
        &:hover {
          background: #1976d2;
        }
      `;
    }
    return `
      background: transparent;
      color: #616161;
      border: 1px solid #e0e0e0;
      &:hover {
        background: #f5f5f5;
      }
    `;
  }}
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getInsuranceTypeColor(type: string): string {
  switch (type) {
    case 'health':
      return '#10B981'; // green
    case 'life':
      return '#3B82F6'; // blue
    case 'dental':
      return '#8B5CF6'; // purple
    case 'vision':
      return '#F59E0B'; // amber
    default:
      return '#6B7280'; // gray
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InsuranceTab({ employeeId }: InsuranceTabProps) {
  const [insurance, setInsurance] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<Insurance | null>(null);
  const [formData, setFormData] = useState({
    provider: '',
    policyNumber: '',
    type: 'health' as InsuranceType,
    coverage: '',
    startDate: '',
    endDate: '',
    monthlyCost: '',
  });

  useEffect(() => {
    loadInsurance();
  }, [employeeId]);

  const loadInsurance = async () => {
    setLoading(true);
    try {
      const data = await hrApi.getEmployeeInsurance(employeeId);
      setInsurance(data);
    } catch (err) {
      console.error('Failed to load insurance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingInsurance(null);
    setFormData({
      provider: '',
      policyNumber: '',
      type: 'health',
      coverage: '',
      startDate: '',
      endDate: '',
      monthlyCost: '',
    });
    setModalOpen(true);
  };

  const handleEdit = (ins: Insurance) => {
    setEditingInsurance(ins);
    setFormData({
      provider: ins.provider,
      policyNumber: ins.policyNumber,
      type: ins.type,
      coverage: ins.coverage?.toString() || '',
      startDate: ins.startDate.split('T')[0],
      endDate: ins.endDate ? ins.endDate.split('T')[0] : '',
      monthlyCost: ins.monthlyCost?.toString() || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: InsuranceCreate | InsuranceUpdate = {
        provider: formData.provider,
        policyNumber: formData.policyNumber,
        type: formData.type,
        coverage: formData.coverage ? parseFloat(formData.coverage) : undefined,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        monthlyCost: formData.monthlyCost ? parseFloat(formData.monthlyCost) : undefined,
      };

      if (editingInsurance) {
        await hrApi.updateInsurance(editingInsurance.insuranceId, submitData);
      } else {
        await hrApi.createInsurance(employeeId, submitData);
      }

      setModalOpen(false);
      loadInsurance();
    } catch (err) {
      console.error('Failed to save insurance:', err);
      alert('Failed to save insurance');
    }
  };

  const handleDelete = async (insuranceId: string) => {
    if (window.confirm('Are you sure you want to delete this insurance record?')) {
      try {
        await hrApi.deleteInsurance(insuranceId);
        loadInsurance();
      } catch (err) {
        console.error('Failed to delete insurance:', err);
        alert('Failed to delete insurance');
      }
    }
  };

  if (loading) {
    return <div>Loading insurance...</div>;
  }

  return (
    <Container>
      <Header>
        <Title>Insurance</Title>
        <AddButton onClick={handleAdd}>+ Add Insurance</AddButton>
      </Header>

      {insurance.length === 0 ? (
        <EmptyText>No insurance records found</EmptyText>
      ) : (
        <CardList>
          {insurance.map((ins) => (
            <Card key={ins.insuranceId}>
              <CardHeader>
                <CardTitle>{ins.provider} - {getInsuranceTypeLabel(ins.type)}</CardTitle>
                <TypeBadge $color={getInsuranceTypeColor(ins.type)}>{ins.type}</TypeBadge>
              </CardHeader>
              <CardDetails>
                <div>Policy: {ins.policyNumber}</div>
                <div>Start: {formatDate(ins.startDate)}</div>
                {ins.endDate && <div>End: {formatDate(ins.endDate)}</div>}
                {ins.coverage && <div>Coverage: {formatCurrency(ins.coverage, 'USD')}</div>}
                {ins.monthlyCost && <div>Monthly Cost: {formatCurrency(ins.monthlyCost, 'USD')}</div>}
              </CardDetails>
              <Actions>
                <ActionButton onClick={() => handleEdit(ins)}>Edit</ActionButton>
                <ActionButton $variant="danger" onClick={() => handleDelete(ins.insuranceId)}>
                  Delete
                </ActionButton>
              </Actions>
            </Card>
          ))}
        </CardList>
      )}

      <Modal $isOpen={modalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{editingInsurance ? 'Edit Insurance' : 'Add Insurance'}</ModalTitle>
            <CloseButton onClick={() => setModalOpen(false)}>×</CloseButton>
          </ModalHeader>

          <Form onSubmit={handleSubmit}>
            <FormField>
              <Label>Provider</Label>
              <Input
                type="text"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                placeholder="e.g., Blue Cross, Aetna"
                required
              />
            </FormField>

            <FormField>
              <Label>Policy Number</Label>
              <Input
                type="text"
                value={formData.policyNumber}
                onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                placeholder="e.g., POL123456"
                required
              />
            </FormField>

            <FormField>
              <Label>Type</Label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as InsuranceType })}
              >
                <option value="health">Health</option>
                <option value="life">Life</option>
                <option value="dental">Dental</option>
                <option value="vision">Vision</option>
              </Select>
            </FormField>

            <FormField>
              <Label>Coverage Amount</Label>
              <Input
                type="number"
                value={formData.coverage}
                onChange={(e) => setFormData({ ...formData, coverage: e.target.value })}
                placeholder="e.g., 100000"
                step="0.01"
              />
            </FormField>

            <FormField>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </FormField>

            <FormField>
              <Label>End Date</Label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </FormField>

            <FormField>
              <Label>Monthly Cost</Label>
              <Input
                type="number"
                value={formData.monthlyCost}
                onChange={(e) => setFormData({ ...formData, monthlyCost: e.target.value })}
                placeholder="e.g., 250.00"
                step="0.01"
              />
            </FormField>

            <FormActions>
              <Button type="button" $variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" $variant="primary">
                {editingInsurance ? 'Update' : 'Create'}
              </Button>
            </FormActions>
          </Form>
        </ModalContent>
      </Modal>
    </Container>
  );
}
