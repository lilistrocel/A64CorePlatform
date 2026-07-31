/**
 * InsuranceTab Component
 *
 * Manages employee insurance with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled, { css, useTheme } from 'styled-components';
import { Plus, X } from 'lucide-react';
import { hrApi, getInsuranceTypeLabel, formatCurrency, formatDate } from '../../services/hrService';
import type { Insurance, InsuranceCreate, InsuranceUpdate, InsuranceType } from '../../types/hr';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import type { Theme } from '@a64core/shared';

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

const TypeBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};
  text-transform: capitalize;
`;

const CardDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};

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
// HELPER FUNCTIONS
// ============================================================================

// Four insurance categories mapped onto the brand's categorical `bright.*`
// voices (spec §3/SHARD notes: gold is hard-limited to the Harvesting phase
// and must never be a category colour — 'vision' previously used
// `theme.colors.gold[500]`, moved to `bright.lavender`, the palette's actual
// purple-family voice).
function getInsuranceTypeColor(type: string, theme: Theme): string {
  switch (type) {
    case 'health':
      return theme.colors.bright.emerald;
    case 'life':
      return theme.colors.bright.lapis;
    case 'dental':
      return theme.colors.bright.terra;
    case 'vision':
      return theme.colors.bright.lavender;
    default:
      return theme.colors.muted;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InsuranceTab({ employeeId }: InsuranceTabProps) {
  const theme = useTheme();
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
      startDate: getToday(),
      endDate: getDateYearsFromNow(1),
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
        <AddButton onClick={handleAdd}>
          <Plus size={14} strokeWidth={2} /> Add Insurance
        </AddButton>
      </Header>

      {insurance.length === 0 ? (
        <EmptyText>No insurance records found</EmptyText>
      ) : (
        <CardList>
          {insurance.map((ins) => (
            <Card key={ins.insuranceId}>
              <CardHeader>
                <CardTitle>{ins.provider} - {getInsuranceTypeLabel(ins.type)}</CardTitle>
                <TypeBadge $color={getInsuranceTypeColor(ins.type, theme)}>{ins.type}</TypeBadge>
              </CardHeader>
              <CardDetails>
                <div>Policy: <span className="figure">{ins.policyNumber}</span></div>
                <div>Start: <span className="figure">{formatDate(ins.startDate)}</span></div>
                {ins.endDate && <div>End: <span className="figure">{formatDate(ins.endDate)}</span></div>}
                {ins.coverage && <div>Coverage: <span className="figure">{formatCurrency(ins.coverage)}</span></div>}
                {ins.monthlyCost && <div>Monthly Cost: <span className="figure">{formatCurrency(ins.monthlyCost)}</span></div>}
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
            <CloseButton onClick={() => setModalOpen(false)} aria-label="Close">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
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
                min={formData.startDate || getToday()}
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
