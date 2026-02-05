/**
 * SalesOrdersPage Component
 *
 * Main page for managing sales orders with search, filtering, and CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { salesApi } from '../../services/salesService';
import type { SalesOrder, OrderStatus, PaymentStatus } from '../../types/sales';
import { OrderTable } from '../../components/sales/OrderTable';
import { OrderForm } from '../../components/sales/OrderForm';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    if ($variant === 'secondary') {
      return `
        background: transparent;
        color: #616161;
        border: 1px solid #e0e0e0;
        &:hover {
          background: #f5f5f5;
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
`;

const FiltersRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  flex-wrap: wrap;
  gap: 16px;
`;

const PageInfo = styled.div`
  font-size: 14px;
  color: #616161;
`;

const PageControls = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'white')};
  color: ${({ $active }) => ($active ? 'white' : '#212121')};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #616161;
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: #212121;
  }
`;

const LoadingContainer = styled.div`
  text-align: center;
  padding: 48px;
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

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const perPage = 20;

  useEffect(() => {
    loadOrders();
  }, [currentPage, statusFilter, paymentFilter, searchTerm]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await salesApi.getSalesOrders({
        page: currentPage,
        perPage,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        paymentStatus: paymentFilter || undefined,
      });
      setOrders(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err: any) {
      console.error('Failed to load orders:', err);
      setError(err.response?.data?.message || 'Failed to load sales orders');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as OrderStatus | '');
    setCurrentPage(1);
  };

  const handlePaymentFilterChange = (value: string) => {
    setPaymentFilter(value as PaymentStatus | '');
    setCurrentPage(1);
  };

  const handleCreateOrder = () => {
    setSelectedOrder(null);
    setShowModal(true);
  };

  const handleEditOrder = (order: SalesOrder) => {
    setSelectedOrder(order);
    setShowModal(true);
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return;

    try {
      await salesApi.deleteSalesOrder(orderId);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      alert(err.response?.data?.message || 'Failed to delete order');
    }
  };

  const handleFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      if (selectedOrder) {
        await salesApi.updateSalesOrder(selectedOrder.orderId, data);
        showSuccessToast('Sales order updated successfully');
      } else {
        await salesApi.createSalesOrder(data);
        showSuccessToast('Sales order created successfully');
      }
      setShowModal(false);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to save order:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <Container>
      <Header>
        <Title>Sales Orders</Title>
        <Actions>
          <Button $variant="secondary" onClick={loadOrders}>Refresh</Button>
          <Button $variant="primary" onClick={handleCreateOrder}>+ New Order</Button>
        </Actions>
      </Header>

      <FiltersRow>
        <SearchInput
          type="text"
          placeholder="Search orders..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <Select value={statusFilter} onChange={(e) => handleStatusFilterChange(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select value={paymentFilter} onChange={(e) => handlePaymentFilterChange(e.target.value)}>
          <option value="">All Payments</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </Select>
      </FiltersRow>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>Loading orders...</LoadingContainer>
      ) : (
        <>
          <OrderTable
            orders={orders}
            onEdit={handleEditOrder}
            onDelete={handleDeleteOrder}
          />

          <Pagination>
            <PageInfo>
              Showing {orders.length > 0 ? ((currentPage - 1) * perPage + 1) : 0} to{' '}
              {Math.min(currentPage * perPage, total)} of {total} orders
            </PageInfo>
            <PageControls>
              <PageButton
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </PageButton>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const page = i + 1;
                return (
                  <PageButton
                    key={page}
                    $active={page === currentPage}
                    onClick={() => handlePageChange(page)}
                  >
                    {page}
                  </PageButton>
                );
              })}
              <PageButton
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </PageButton>
            </PageControls>
          </Pagination>
        </>
      )}

      {showModal && (
        <Modal onClick={() => setShowModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{selectedOrder ? 'Edit Order' : 'Create Order'}</ModalTitle>
              <CloseButton onClick={() => setShowModal(false)}>&times;</CloseButton>
            </ModalHeader>
            <OrderForm
              order={selectedOrder || undefined}
              onSubmit={handleFormSubmit}
              onCancel={() => setShowModal(false)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
