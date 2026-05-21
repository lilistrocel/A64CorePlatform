/**
 * PurchaseOrdersPage Component
 *
 * Main page for managing purchase orders.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { PurchaseOrderTable } from '../../components/sales/PurchaseOrderTable';
import { PurchaseOrderForm } from '../../components/sales/PurchaseOrderForm';
import { salesService } from '../../services/salesService';
import type { PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderSearchParams } from '../../types/sales';
import { SalesActionTiles } from '../../components/sales/SalesActionTiles';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
`;

const PageTitle = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const FiltersGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
`;

const Select = styled.select`
  padding: 10px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SearchInput = styled.input`
  padding: 10px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  min-width: 250px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant, theme }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: ${theme.colors.text.secondary};
        border: 1px solid ${theme.colors.border.subtle};
        &:hover {
          background: ${theme.colors.surface.raised};
        }
      `;
    }
    return `
      background: #0F6E56;
      color: white;
      &:hover {
        background: #0F6E56;
      }
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
  }}
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
`;

const ModalContent = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 16px;
  padding: 32px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  margin-bottom: 24px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ErrorState = styled.div`
  background: rgba(158,42,42,0.08);
  border: 1px solid #9E2A2A;
  border-radius: 8px;
  padding: 16px;
  color: #9E2A2A;
  margin-bottom: 24px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    loadPurchaseOrders();
  }, []);

  const loadPurchaseOrders = async (params?: PurchaseOrderSearchParams) => {
    try {
      setLoading(true);
      setError(null);
      const data = await salesService.getPurchaseOrders(params);
      setPurchaseOrders(data.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase orders');
      console.error('Failed to load purchase orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Truncate search query to prevent issues with very long strings
    const truncatedSearch = searchQuery ? searchQuery.slice(0, 500) : undefined;
    const params: PurchaseOrderSearchParams = {
      search: truncatedSearch || undefined,
      status: statusFilter || undefined,
    };
    loadPurchaseOrders(params);
  };

  const handleReset = () => {
    setSearchQuery('');
    setStatusFilter('');
    loadPurchaseOrders();
  };

  const handleCreate = () => {
    setEditingPO(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (purchaseOrderId: string) => {
    const po = purchaseOrders.find((p) => p.purchaseOrderId === purchaseOrderId);
    if (po) {
      setEditingPO(po);
      setIsModalOpen(true);
    }
  };

  const handleDelete = async (purchaseOrderId: string) => {
    try {
      await salesService.deletePurchaseOrder(purchaseOrderId);
      await loadPurchaseOrders();
    } catch (err: any) {
      alert(`Failed to delete purchase order: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (purchaseOrderId: string, status: string) => {
    try {
      await salesService.updatePurchaseOrder(purchaseOrderId, { status: status as any });
      await loadPurchaseOrders();
    } catch (err: any) {
      alert(`Failed to update purchase order status: ${err.message}`);
    }
  };

  const handleSubmit = async (data: PurchaseOrderCreate | PurchaseOrderUpdate) => {
    try {
      setIsSubmitting(true);
      if (editingPO) {
        await salesService.updatePurchaseOrder(editingPO.purchaseOrderId, data);
      } else {
        await salesService.createPurchaseOrder(data);
      }
      setIsModalOpen(false);
      setEditingPO(undefined);
      await loadPurchaseOrders();
    } catch (err: any) {
      alert(`Failed to save purchase order: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingPO(undefined);
  };

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Purchase Orders</PageTitle>
        <Button $variant="primary" onClick={handleCreate}>
          + Create PO
        </Button>
      </PageHeader>

      <SalesActionTiles activeKey="purchase-orders" />

      {error && <ErrorState>{error}</ErrorState>}

      <Actions>
        <FiltersGroup>
          <SearchInput
            type="text"
            placeholder="Search by PO code or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="confirmed">Confirmed</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          <Button $variant="secondary" onClick={handleSearch}>
            Search
          </Button>

          <Button $variant="secondary" onClick={handleReset}>
            Reset
          </Button>
        </FiltersGroup>
      </Actions>

      {loading ? (
        <LoadingState>Loading purchase orders...</LoadingState>
      ) : (
        <PurchaseOrderTable
          purchaseOrders={purchaseOrders}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {isModalOpen && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editingPO ? 'Edit Purchase Order' : 'Create New Purchase Order'}</ModalTitle>
            </ModalHeader>
            <PurchaseOrderForm
              purchaseOrder={editingPO}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </PageContainer>
  );
}
