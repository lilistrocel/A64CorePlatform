/**
 * ContractTab Component
 *
 * Manages employee contracts with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { hrApi, getContractTypeLabel, getContractStatusColor, formatCurrency, formatDate } from '../../services/hrService';
import type { Contract, ContractCreate, ContractUpdate, ContractType, ContractStatus } from '../../types/hr';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface ContractTabProps {
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

const StatusBadge = styled.span<{ $color: string }>`
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
// DATE UTILITIES
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format for date inputs
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get a date N years from today in YYYY-MM-DD format
 */
function getDateYearsFromNow(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ContractTab({ employeeId }: ContractTabProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [formData, setFormData] = useState({
    type: 'full_time' as ContractType,
    startDate: '',
    endDate: '',
    salary: '',
    currency: 'AED',
    benefits: '',
    status: 'active' as ContractStatus,
    documentUrl: '',
  });

  useEffect(() => {
    loadContracts();
  }, [employeeId]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const data = await hrApi.getEmployeeContracts(employeeId);
      setContracts(data);
    } catch (err) {
      console.error('Failed to load contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingContract(null);
    setFormData({
      type: 'full_time',
      startDate: getToday(),
      endDate: getDateYearsFromNow(1),
      salary: '',
      currency: 'AED',
      benefits: '',
      status: 'active',
      documentUrl: '',
    });
    setModalOpen(true);
  };

  const handleEdit = (contract: Contract) => {
    setEditingContract(contract);
    setFormData({
      type: contract.type,
      startDate: contract.startDate.split('T')[0],
      endDate: contract.endDate ? contract.endDate.split('T')[0] : '',
      salary: contract.salary?.toString() || '',
      currency: contract.currency || 'AED',
      benefits: contract.benefits?.join(', ') || '',
      status: contract.status,
      documentUrl: contract.documentUrl || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: ContractCreate | ContractUpdate = {
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        salary: formData.salary ? parseFloat(formData.salary) : undefined,
        currency: formData.currency || undefined,
        benefits: formData.benefits ? formData.benefits.split(',').map((b) => b.trim()) : undefined,
        status: formData.status,
        documentUrl: formData.documentUrl || undefined,
      };

      if (editingContract) {
        await hrApi.updateContract(editingContract.contractId, submitData);
      } else {
        await hrApi.createContract(employeeId, submitData);
      }

      setModalOpen(false);
      loadContracts();
    } catch (err) {
      console.error('Failed to save contract:', err);
      alert('Failed to save contract');
    }
  };

  const handleDelete = async (contractId: string) => {
    if (window.confirm('Are you sure you want to delete this contract?')) {
      try {
        await hrApi.deleteContract(contractId);
        loadContracts();
      } catch (err) {
        console.error('Failed to delete contract:', err);
        alert('Failed to delete contract');
      }
    }
  };

  if (loading) {
    return <div>Loading contracts...</div>;
  }

  return (
    <Container>
      <Header>
        <Title>Contracts</Title>
        <AddButton onClick={handleAdd}>+ Add Contract</AddButton>
      </Header>

      {contracts.length === 0 ? (
        <EmptyText>No contracts found</EmptyText>
      ) : (
        <CardList>
          {contracts.map((contract) => (
            <Card key={contract.contractId}>
              <CardHeader>
                <CardTitle>{getContractTypeLabel(contract.type)}</CardTitle>
                <StatusBadge $color={getContractStatusColor(contract.status)}>{contract.status}</StatusBadge>
              </CardHeader>
              <CardDetails>
                <div>Start: {formatDate(contract.startDate)}</div>
                <div>End: {contract.endDate ? formatDate(contract.endDate) : 'Ongoing'}</div>
                {contract.salary && <div>Salary: {formatCurrency(contract.salary, contract.currency)}</div>}
                {contract.benefits && contract.benefits.length > 0 && <div>Benefits: {contract.benefits.join(', ')}</div>}
              </CardDetails>
              <Actions>
                <ActionButton onClick={() => handleEdit(contract)}>Edit</ActionButton>
                <ActionButton $variant="danger" onClick={() => handleDelete(contract.contractId)}>
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
            <ModalTitle>{editingContract ? 'Edit Contract' : 'Add Contract'}</ModalTitle>
            <CloseButton onClick={() => setModalOpen(false)}>×</CloseButton>
          </ModalHeader>

          <Form onSubmit={handleSubmit}>
            <FormField>
              <Label>Type</Label>
              <Select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as ContractType })}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contractor">Contractor</option>
                <option value="intern">Intern</option>
              </Select>
            </FormField>

            <FormField>
              <Label>Start Date</Label>
              <Input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
            </FormField>

            <FormField>
              <Label>End Date</Label>
              <Input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} min={formData.startDate || getToday()} />
            </FormField>

            <FormField>
              <Label>Salary</Label>
              <Input type="number" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} />
            </FormField>

            <FormField>
              <Label>Currency</Label>
              <Input type="text" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} />
            </FormField>

            <FormField>
              <Label>Benefits (comma-separated)</Label>
              <Input type="text" value={formData.benefits} onChange={(e) => setFormData({ ...formData, benefits: e.target.value })} />
            </FormField>

            <FormField>
              <Label>Status</Label>
              <Select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as ContractStatus })}>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="terminated">Terminated</option>
              </Select>
            </FormField>

            <FormField>
              <Label>Document URL</Label>
              <Input type="text" value={formData.documentUrl} onChange={(e) => setFormData({ ...formData, documentUrl: e.target.value })} />
            </FormField>

            <FormActions>
              <Button type="button" $variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" $variant="primary">
                {editingContract ? 'Update' : 'Create'}
              </Button>
            </FormActions>
          </Form>
        </ModalContent>
      </Modal>
    </Container>
  );
}
