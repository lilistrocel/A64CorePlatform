/**
 * VisaTab Component
 *
 * Manages employee visas with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { hrApi, getVisaStatusColor, formatDate } from '../../services/hrService';
import type { Visa, VisaCreate, VisaUpdate, VisaStatus } from '../../types/hr';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VisaTabProps {
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

/* Status colour comes from hrService.getVisaStatusColor(), already routed
   onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
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

/* Expiry callouts reuse the quarantined (expired) / fruitingInit (expiring
   soon → "pending") phase colours instead of solid red/gold, per spec §5. */
const ExpiryWarning = styled.div<{ $type: 'expired' | 'expiring_soon' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
  ${({ $type, theme }) =>
    $type === 'expired'
      ? css`
          background: rgba(240, 138, 112, 0.16);
          color: ${theme.colors.bright.coral};
          border: 1px solid rgba(240, 138, 112, 0.45);
        `
      : css`
          background: rgba(232, 147, 95, 0.16);
          color: ${theme.colors.bright.terra};
          border: 1px solid rgba(232, 147, 95, 0.45);
        `}
`;

const ExpiryIcon = styled.span`
  display: flex;
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

  a {
    color: ${({ theme }) => theme.colors.bright.lapis};
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

function getExpiryInfo(visa: Visa): { isExpired: boolean; isExpiringSoon: boolean; daysText: string } {
  const expiryDate = new Date(visa.expiryDate);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { isExpired: true, isExpiringSoon: false, daysText: `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago` };
  }
  if (days === 0) {
    return { isExpired: true, isExpiringSoon: false, daysText: 'Expires today' };
  }
  if (days <= 60) {
    return { isExpired: false, isExpiringSoon: true, daysText: `Expires in ${days} day${days !== 1 ? 's' : ''}` };
  }
  return { isExpired: false, isExpiringSoon: false, daysText: '' };
}

export function VisaTab({ employeeId }: VisaTabProps) {
  const [visas, setVisas] = useState<Visa[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVisa, setEditingVisa] = useState<Visa | null>(null);
  const [formData, setFormData] = useState({
    visaType: '',
    country: '',
    issueDate: '',
    expiryDate: '',
    status: 'valid' as VisaStatus,
    documentUrl: '',
  });

  useEffect(() => {
    loadVisas();
  }, [employeeId]);

  const loadVisas = async () => {
    setLoading(true);
    try {
      const data = await hrApi.getEmployeeVisas(employeeId);
      setVisas(data);
    } catch (err) {
      console.error('Failed to load visas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingVisa(null);
    setFormData({
      visaType: '',
      country: '',
      issueDate: getToday(),
      expiryDate: getDateYearsFromNow(2),
      status: 'valid',
      documentUrl: '',
    });
    setModalOpen(true);
  };

  const handleEdit = (visa: Visa) => {
    setEditingVisa(visa);
    setFormData({
      visaType: visa.visaType,
      country: visa.country,
      issueDate: visa.issueDate.split('T')[0],
      expiryDate: visa.expiryDate.split('T')[0],
      status: visa.status,
      documentUrl: visa.documentUrl || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: VisaCreate | VisaUpdate = {
        visaType: formData.visaType,
        country: formData.country,
        issueDate: formData.issueDate,
        expiryDate: formData.expiryDate,
        status: formData.status,
        documentUrl: formData.documentUrl || undefined,
      };

      if (editingVisa) {
        await hrApi.updateVisa(editingVisa.visaId, submitData);
      } else {
        await hrApi.createVisa(employeeId, submitData);
      }

      setModalOpen(false);
      loadVisas();
    } catch (err) {
      console.error('Failed to save visa:', err);
      alert('Failed to save visa');
    }
  };

  const handleDelete = async (visaId: string) => {
    if (window.confirm('Are you sure you want to delete this visa?')) {
      try {
        await hrApi.deleteVisa(visaId);
        loadVisas();
      } catch (err) {
        console.error('Failed to delete visa:', err);
        alert('Failed to delete visa');
      }
    }
  };

  if (loading) {
    return <div>Loading visas...</div>;
  }

  return (
    <Container>
      <Header>
        <Title>Visas</Title>
        <AddButton onClick={handleAdd}>
          <Plus size={14} strokeWidth={2} /> Add Visa
        </AddButton>
      </Header>

      {visas.length === 0 ? (
        <EmptyText>No visas found</EmptyText>
      ) : (
        <CardList>
          {visas.map((visa) => {
            const expiryInfo = getExpiryInfo(visa);
            return (
            <Card key={visa.visaId}>
              <CardHeader>
                <CardTitle>{visa.visaType} - {visa.country}</CardTitle>
                <StatusBadge $color={getVisaStatusColor(visa.status)}>{visa.status.replace('_', ' ')}</StatusBadge>
              </CardHeader>
              {expiryInfo.isExpired && (
                <ExpiryWarning $type="expired">
                  <ExpiryIcon><AlertTriangle size={14} strokeWidth={1.8} /></ExpiryIcon>
                  {expiryInfo.daysText}
                </ExpiryWarning>
              )}
              {expiryInfo.isExpiringSoon && (
                <ExpiryWarning $type="expiring_soon">
                  <ExpiryIcon><AlertTriangle size={14} strokeWidth={1.8} /></ExpiryIcon>
                  {expiryInfo.daysText}
                </ExpiryWarning>
              )}
              <CardDetails>
                <div>Issue Date: <span className="figure">{formatDate(visa.issueDate)}</span></div>
                <div>Expiry Date: <span className="figure">{formatDate(visa.expiryDate)}</span></div>
                {visa.documentUrl && <div>Document: <a href={visa.documentUrl} target="_blank" rel="noopener noreferrer">View</a></div>}
              </CardDetails>
              <Actions>
                <ActionButton onClick={() => handleEdit(visa)}>Edit</ActionButton>
                <ActionButton $variant="danger" onClick={() => handleDelete(visa.visaId)}>
                  Delete
                </ActionButton>
              </Actions>
            </Card>
            );
          })}
        </CardList>
      )}

      <Modal $isOpen={modalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{editingVisa ? 'Edit Visa' : 'Add Visa'}</ModalTitle>
            <CloseButton onClick={() => setModalOpen(false)} aria-label="Close">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
          </ModalHeader>

          <Form onSubmit={handleSubmit}>
            <FormField>
              <Label>Visa Type</Label>
              <Input
                type="text"
                value={formData.visaType}
                onChange={(e) => setFormData({ ...formData, visaType: e.target.value })}
                placeholder="e.g., Work Visa, Student Visa"
                required
              />
            </FormField>

            <FormField>
              <Label>Country</Label>
              <Input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g., USA, UK, Canada"
                required
              />
            </FormField>

            <FormField>
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={formData.issueDate}
                onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                max={getToday()}
                required
              />
            </FormField>

            <FormField>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                min={formData.issueDate || getToday()}
                required
              />
            </FormField>

            <FormField>
              <Label>Status</Label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as VisaStatus })}
              >
                <option value="valid">Valid</option>
                <option value="expired">Expired</option>
                <option value="pending_renewal">Pending Renewal</option>
              </Select>
            </FormField>

            <FormField>
              <Label>Document URL</Label>
              <Input
                type="text"
                value={formData.documentUrl}
                onChange={(e) => setFormData({ ...formData, documentUrl: e.target.value })}
                placeholder="https://..."
              />
            </FormField>

            <FormActions>
              <Button type="button" $variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" $variant="primary">
                {editingVisa ? 'Update' : 'Create'}
              </Button>
            </FormActions>
          </Form>
        </ModalContent>
      </Modal>
    </Container>
  );
}
