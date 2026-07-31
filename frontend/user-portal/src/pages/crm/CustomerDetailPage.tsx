/**
 * CustomerDetailPage Component
 *
 * Customer detail/edit view with view and edit modes.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft } from 'lucide-react';
import { CustomerForm } from '../../components/crm/CustomerForm';
import { crmApi, formatCustomerAddress, getCustomerTypeLabel, getCustomerStatusColor } from '../../services/crmService';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import { QuickServiceChargeModal } from '../../components/sales/QuickServiceChargeModal';
import type { Customer, CustomerUpdate } from '../../types/crm';
import { glassPanel, monoLabel } from '@a64core/shared';

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
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover {
          background: ${theme.colors.errorBg};
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border: 1px solid ${theme.colors.glass.border};
      &:hover {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
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
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const DetailsCard = styled.div`
  ${glassPanel}
  padding: 32px;
  border-radius: 18px;
`;

const CustomerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const CustomerInfo = styled.div`
  flex: 1;
`;

const CustomerName = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const CustomerCode = styled.div`
  ${monoLabel}
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const BadgeContainer = styled.div`
  display: flex;
  gap: 12px;
`;

/* Status colour comes from crmService.getCustomerStatusColor(), already
   routed onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.72rem;
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

/* Lapis, not gold or celeste — restored as the ordinary interactive/info
   accent (gold-audit correction). */
const TypeBadge = styled.span`
  display: inline-block;
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  background: rgba(107, 138, 224, 0.14);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
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
  color: ${({ theme }) => theme.colors.textPrimary};
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
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const DetailValue = styled.span`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Tag = styled.span`
  display: inline-block;
  padding: 6px 12px;
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
`;

const Notes = styled.div`
  background: ${({ theme }) => theme.colors.glass.base};
  padding: 16px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
  white-space: pre-wrap;
`;

const EmptyText = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`;

const Metadata = styled.div`
  ${monoLabel}
  display: flex;
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditRoute = location.pathname.endsWith('/edit');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [showQuickCharge, setShowQuickCharge] = useState(false);

  // Track unsaved changes for navigation warning
  useUnsavedChanges(editMode && formDirty);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setFormDirty(dirty);
  }, []);

  useEffect(() => {
    if (customerId === 'new') {
      setIsNew(true);
      setEditMode(true);
      setLoading(false);
      setCustomer(null);
    } else if (customerId) {
      // Reset states when navigating to an existing customer (e.g., after creation)
      setIsNew(false);
      // Edit mode is driven by the URL: /crm/customers/:id/edit → edit; /crm/customers/:id → view
      setEditMode(isEditRoute);
      loadCustomer();
    }
  }, [customerId, isEditRoute]);

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
    // Navigate to the /edit URL; the route change will flip editMode on via useEffect.
    navigate(`/crm/customers/${customerId}/edit`);
  };

  const handleCancelEdit = () => {
    setFormDirty(false);
    if (isNew) {
      navigate('/crm/customers');
    } else {
      // Drop /edit from the URL — returns to view mode via useEffect.
      navigate(`/crm/customers/${customerId}`);
    }
  };

  const handleSave = async (data: CustomerUpdate) => {
    try {
      setFormDirty(false);
      if (isNew) {
        const newCustomer = await crmApi.createCustomer(data);
        showSuccessToast('Customer created successfully');
        navigate(`/crm/customers/${newCustomer.customerId}`);
      } else if (customerId) {
        const updatedCustomer = await crmApi.updateCustomer(customerId, data);
        setCustomer(updatedCustomer);
        // Drop /edit from the URL on successful save — returns to view mode.
        navigate(`/crm/customers/${customerId}`);
        showSuccessToast('Customer updated successfully');
      }
    } catch (err: any) {
      console.error('Failed to save customer:', err);
      showErrorToast('Failed to save customer. Please try again.');
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!customerId || customerId === 'new') return;

    if (window.confirm(`Are you sure you want to delete "${customer?.name}"?`)) {
      try {
        await crmApi.deleteCustomer(customerId);
        showSuccessToast('Customer deleted successfully');
        navigate('/crm/customers');
      } catch (err: any) {
        console.error('Failed to delete customer:', err);
        showErrorToast(err.response?.data?.message || 'Failed to delete customer');
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
        <BackButton onClick={handleBack}>
          <ArrowLeft size={15} strokeWidth={1.8} /> Back to Customers
        </BackButton>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton onClick={handleBack}>
          <ArrowLeft size={15} strokeWidth={1.8} /> Back to Customers
        </BackButton>
        {!isNew && !editMode && (
          <HeaderActions>
            {/* T-201.11: Quick Service Charge — collapses 6-click SO→ARI chain into 1 modal.
                Only shown for active customers (status === 'active'). */}
            {customer?.status === 'active' && (
              <ActionButton onClick={() => setShowQuickCharge(true)}>
                Quick Service Charge
              </ActionButton>
            )}
            <ActionButton onClick={handleEdit}>Edit</ActionButton>
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          </HeaderActions>
        )}
      </Header>

      {/* T-201.11: Quick Service Charge modal — shown when button is clicked.
          onSuccess navigates to the newly-created AR Invoice detail page. */}
      {showQuickCharge && customer && (
        <QuickServiceChargeModal
          customer={customer}
          onClose={() => setShowQuickCharge(false)}
          onSuccess={(ariDocEntry) => {
            setShowQuickCharge(false);
            navigate(`/sales/ar-invoices/${ariDocEntry}`);
          }}
        />
      )}

      <DetailsCard>
        {editMode ? (
          <CustomerForm
            customer={customer || undefined}
            onSubmit={handleSave}
            onCancel={handleCancelEdit}
            isEdit={!isNew}
            onDirtyChange={handleDirtyChange}
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
