/**
 * ContractTab Component
 *
 * Manages employee contracts with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Plus, X } from 'lucide-react';
import { hrApi, getContractTypeLabel, getContractStatusColor, formatCurrency, formatDate } from '../../services/hrService';
import type { Contract, ContractCreate, ContractUpdate, ContractType, ContractStatus } from '../../types/hr';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Card = styled.div`
  ${glassPanel}
  border-radius: 16px;
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
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/* Status colour comes from hrService.getContractStatusColor(), already
   routed onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
  font-weight: 700;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
`;

const CardDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};

  /* Salary is a payroll figure — Space Mono per spec §5 */
  span.figure {
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const dangerVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }
`;

const defaultVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ActionButton = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  ${({ $variant }) => ($variant === 'danger' ? dangerVariant : defaultVariant)}
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
`;

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  justify-content: center;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const ModalContent = styled.div`
  ${glassPanel}
  border-radius: 20px;
  padding: 32px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
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
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Select = styled.select`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
`;

const primaryVariant = css`
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-weight: 700;
  border: none;
  &:hover {
    filter: brightness(1.05);
  }
`;

const secondaryVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  ${({ $variant }) => ($variant === 'primary' ? primaryVariant : secondaryVariant)}
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
        <AddButton onClick={handleAdd}>
          <Plus size={14} strokeWidth={2} /> Add Contract
        </AddButton>
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
                <div>Start: <span className="figure">{formatDate(contract.startDate)}</span></div>
                <div>End: <span className="figure">{contract.endDate ? formatDate(contract.endDate) : 'Ongoing'}</span></div>
                {contract.salary && <div>Salary: <span className="figure">{formatCurrency(contract.salary, contract.currency)}</span></div>}
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
            <CloseButton onClick={() => setModalOpen(false)} aria-label="Close">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
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
