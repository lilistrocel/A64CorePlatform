/**
 * VisaTab Component
 *
 * Manages employee visas with list view and modal form for CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { hrApi, getVisaStatusColor, formatDate } from '../../services/hrService';
import type { Visa, VisaCreate, VisaUpdate, VisaStatus } from '../../types/hr';

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
// COMPONENT
// ============================================================================

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
      issueDate: '',
      expiryDate: '',
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
        <AddButton onClick={handleAdd}>+ Add Visa</AddButton>
      </Header>

      {visas.length === 0 ? (
        <EmptyText>No visas found</EmptyText>
      ) : (
        <CardList>
          {visas.map((visa) => (
            <Card key={visa.visaId}>
              <CardHeader>
                <CardTitle>{visa.visaType} - {visa.country}</CardTitle>
                <StatusBadge $color={getVisaStatusColor(visa.status)}>{visa.status.replace('_', ' ')}</StatusBadge>
              </CardHeader>
              <CardDetails>
                <div>Issue Date: {formatDate(visa.issueDate)}</div>
                <div>Expiry Date: {formatDate(visa.expiryDate)}</div>
                {visa.documentUrl && <div>Document: <a href={visa.documentUrl} target="_blank" rel="noopener noreferrer">View</a></div>}
              </CardDetails>
              <Actions>
                <ActionButton onClick={() => handleEdit(visa)}>Edit</ActionButton>
                <ActionButton $variant="danger" onClick={() => handleDelete(visa.visaId)}>
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
            <ModalTitle>{editingVisa ? 'Edit Visa' : 'Add Visa'}</ModalTitle>
            <CloseButton onClick={() => setModalOpen(false)}>×</CloseButton>
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
                required
              />
            </FormField>

            <FormField>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
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
