/**
 * CustomerDetailPage Component
 *
 * Customer detail/edit view with view and edit modes.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { CustomerForm } from '../../components/crm/CustomerForm';
import { crmApi, formatCustomerAddress, getCustomerStatusColor, getCustomerTypeLabel } from '../../services/crmService';
import type { Customer, CustomerUpdate } from '../../types/crm';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  color: #3B82F6;
  border: 1px solid #3B82F6;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #e3f2fd;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
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
      background: #3B82F6;
      color: white;
      &:hover {
        background: #1976d2;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: #9e9e9e;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const DetailsCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  border: 1px solid #e0e0e0;
`;

const CustomerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid #e0e0e0;
`;

const CustomerInfo = styled.div`
  flex: 1;
`;

const CustomerName = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const CustomerCode = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #9e9e9e;
  font-family: 'JetBrains Mono', monospace;
`;

const BadgeContainer = styled.div`
  display: flex;
  gap: 12px;
`;

const StatusBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  text-transform: capitalize;
`;

const TypeBadge = styled.span`
  display: inline-block;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  background: #f5f5f5;
  color: #616161;
`;

const Section = styled.div`
  margin-bottom: 32px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 16px 0;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DetailLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailValue = styled.span`
  font-size: 15px;
  color: #212121;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Tag = styled.span`
  display: inline-block;
  padding: 6px 12px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
`;

const Notes = styled.div`
  background: #fafafa;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  font-size: 14px;
  color: #616161;
  line-height: 1.6;
  white-space: pre-wrap;
`;

const EmptyText = styled.span`
  color: #9e9e9e;
  font-style: italic;
`;

const Metadata = styled.div`
  display: flex;
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid #e0e0e0;
  font-size: 12px;
  color: #9e9e9e;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (customerId === 'new') {
      setIsNew(true);
      setEditMode(true);
      setLoading(false);
      setCustomer(null);
    } else if (customerId) {
      // Reset states when navigating to an existing customer (e.g., after creation)
      setIsNew(false);
      setEditMode(false);
      loadCustomer();
    }
  }, [customerId]);

  const loadCustomer = async () => {
    if (!customerId || customerId === 'new') return;

    setLoading(true);
    setError(null);
    try {
      const data = await crmApi.getCustomer(customerId);
      setCustomer(data);
    } catch (err: any) {
      console.error('Failed to load customer:', err);
      setError(err.response?.data?.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/crm/customers');
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (isNew) {
      navigate('/crm/customers');
    } else {
      setEditMode(false);
    }
  };

  const handleSave = async (data: CustomerUpdate) => {
    try {
      if (isNew) {
        const newCustomer = await crmApi.createCustomer(data);
        navigate(`/crm/customers/${newCustomer.customerId}`);
      } else if (customerId) {
        const updatedCustomer = await crmApi.updateCustomer(customerId, data);
        setCustomer(updatedCustomer);
        setEditMode(false);
      }
    } catch (err: any) {
      console.error('Failed to save customer:', err);
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!customerId || customerId === 'new') return;

    if (window.confirm(`Are you sure you want to delete "${customer?.name}"?`)) {
      try {
        await crmApi.deleteCustomer(customerId);
        navigate('/crm/customers');
      } catch (err: any) {
        console.error('Failed to delete customer:', err);
        alert(err.response?.data?.message || 'Failed to delete customer');
      }
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading customer...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <BackButton onClick={handleBack}>← Back to Customers</BackButton>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton onClick={handleBack}>← Back to Customers</BackButton>
        {!isNew && !editMode && (
          <HeaderActions>
            <ActionButton onClick={handleEdit}>Edit</ActionButton>
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          </HeaderActions>
        )}
      </Header>

      <DetailsCard>
        {editMode ? (
          <CustomerForm
            customer={customer || undefined}
            onSubmit={handleSave}
            onCancel={handleCancelEdit}
            isEdit={!isNew}
          />
        ) : customer ? (
          <>
            <CustomerHeader>
              <CustomerInfo>
                <CustomerName>{customer.name}</CustomerName>
                <CustomerCode>{customer.customerCode}</CustomerCode>
              </CustomerInfo>
              <BadgeContainer>
                <StatusBadge $color={getCustomerStatusColor(customer.status)}>{customer.status}</StatusBadge>
                <TypeBadge>{getCustomerTypeLabel(customer.type)}</TypeBadge>
              </BadgeContainer>
            </CustomerHeader>

            <Section>
              <SectionTitle>Contact Information</SectionTitle>
              <DetailGrid>
                <DetailItem>
                  <DetailLabel>Email</DetailLabel>
                  <DetailValue>{customer.email}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Phone</DetailLabel>
                  <DetailValue>{customer.phone || <EmptyText>Not provided</EmptyText>}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Company</DetailLabel>
                  <DetailValue>{customer.company || <EmptyText>Not provided</EmptyText>}</DetailValue>
                </DetailItem>
              </DetailGrid>
            </Section>

            {customer.address && (
              <Section>
                <SectionTitle>Address</SectionTitle>
                <DetailValue>
                  {formatCustomerAddress(customer.address) || <EmptyText>No address provided</EmptyText>}
                </DetailValue>
              </Section>
            )}

            {customer.tags && customer.tags.length > 0 && (
              <Section>
                <SectionTitle>Tags</SectionTitle>
                <TagsContainer>
                  {customer.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </TagsContainer>
              </Section>
            )}

            {customer.notes && (
              <Section>
                <SectionTitle>Notes</SectionTitle>
                <Notes>{customer.notes}</Notes>
              </Section>
            )}

            <Metadata>
              <span>Created: {new Date(customer.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(customer.updatedAt).toLocaleDateString()}</span>
              <span>Created by: {customer.createdBy}</span>
            </Metadata>
          </>
        ) : null}
      </DetailsCard>
    </Container>
  );
}
