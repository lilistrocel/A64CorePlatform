/**
 * SalesOrdersPage Component
 *
 * Main page for managing sales orders with search, filtering, and CRUD operations.
 *
 * Phase 4 changes:
 *  - Edit mode removed (orders cannot be edited after save).
 *  - Delete now uses a two-step preview-then-confirm flow via DeleteOrderConfirmModal.
 *  - "Report Return" action added for shipped/delivered orders via ReportReturnModal.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { salesApi } from '../../services/salesService';
import type { DeleteOrderPreview } from '../../services/salesService';
import { crmApi } from '../../services/crmService';
import { SalesActionTiles } from '../../components/sales/SalesActionTiles';
import type { SalesOrder, OrderStatus, PaymentStatus, FarmingYearItem } from '../../types/sales';
import type { Customer } from '../../types/crm';
import { OrderTable } from '../../components/sales/OrderTable';
import { OrderForm } from '../../components/sales/OrderForm';
import { DeleteOrderConfirmModal } from '../../components/sales/DeleteOrderConfirmModal';
import { ReportReturnModal } from '../../components/sales/ReportReturnModal';
import { FarmingYearSelector } from '../../components/farm/FarmingYearSelector';
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
  color: ${({ theme }) => theme.colors.text.primary};
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
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: #0F6E56;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #0F6E56;
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
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const PageControls = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  background: ${({ $active, theme }) => ($active ? '#0F6E56' : theme.colors.surface.canvas)};
  color: ${({ $active, theme }) => ($active ? 'white' : theme.colors.text.primary)};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $active, theme }) => ($active ? '#0F6E56' : theme.colors.surface.raised)};
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
  background: ${({ theme }) => theme.colors.surface.canvas};
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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const LoadingContainer = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ErrorContainer = styled.div`
  background: rgba(158,42,42,0.08);
  border: 1px solid #9E2A2A;
  color: #9E2A2A;
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
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create order modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Farming year filter state
  const [selectedFarmingYear, setSelectedFarmingYear] = useState<number | null>(null);
  const [availableFarmingYears, setAvailableFarmingYears] = useState<FarmingYearItem[]>([]);
  const [farmingYearsLoading, setFarmingYearsLoading] = useState(true);

  // Phase 4: two-step delete state
  const [deletePreviewOrderId, setDeletePreviewOrderId] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeleteOrderPreview | null>(null);
  const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);

  // Phase 4: report return state
  const [returnOrder, setReturnOrder] = useState<SalesOrder | null>(null);

  const perPage = 20;

  useEffect(() => {
    loadCustomers();
    loadFarmingYears();
  }, []);

  const loadFarmingYears = async () => {
    setFarmingYearsLoading(true);
    try {
      const response = await salesApi.getAvailableFarmingYears();
      setAvailableFarmingYears(response.years);
    } catch (err) {
      console.error('Failed to load farming years:', err);
    } finally {
      setFarmingYearsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [currentPage, statusFilter, paymentFilter, customerFilter, searchTerm, selectedFarmingYear]);

  const loadCustomers = async () => {
    try {
      const response = await crmApi.getCustomers({ perPage: 100 });
      setCustomers(response.items);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

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
        customerId: customerFilter || undefined,
        farmingYear: selectedFarmingYear || undefined,
      });
      setOrders(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      console.error('Failed to load orders:', err);
      setError(axiosErr?.response?.data?.message || 'Failed to load sales orders');
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

  const handleCustomerFilterChange = (value: string) => {
    setCustomerFilter(value);
    setCurrentPage(1);
  };

  const handleFarmingYearChange = (year: number | null) => {
    setSelectedFarmingYear(year);
    setCurrentPage(1);
  };

  const handleCreateOrder = () => {
    setShowCreateModal(true);
  };

  /**
   * Phase 4: Delete button click — fetch preview then open confirm modal.
   * If the preview fetch fails, show an error toast and don't open the modal.
   */
  const handleDeleteClick = async (orderId: string) => {
    setIsLoadingDeletePreview(true);
    try {
      const preview = await salesApi.getOrderDeletePreview(orderId);
      setDeletePreview(preview);
      setDeletePreviewOrderId(orderId);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; detail?: string } } };
      showErrorToast(
        axiosErr?.response?.data?.message ??
        axiosErr?.response?.data?.detail ??
        'Failed to load delete preview. Please try again.',
      );
    } finally {
      setIsLoadingDeletePreview(false);
    }
  };

  const handleDeleteModalClose = () => {
    setDeletePreview(null);
    setDeletePreviewOrderId(null);
  };

  const handleDeleteSuccess = () => {
    showSuccessToast('Order deleted successfully');
    loadOrders();
  };

  /**
   * Phase 4: Report Return button click — open the return modal for the order.
   */
  const handleReportReturnClick = (order: SalesOrder) => {
    setReturnOrder(order);
  };

  const handleReturnModalClose = () => {
    setReturnOrder(null);
  };

  const handleReturnSuccess = () => {
    showSuccessToast('Return reported successfully');
    loadOrders();
  };

  const handleFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      await salesApi.createSalesOrder(data);
      showSuccessToast('Sales order created successfully');
      setShowCreateModal(false);
      loadOrders();
    } catch (err: unknown) {
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
          <Button $variant="secondary" onClick={loadOrders} disabled={isLoadingDeletePreview}>
            Refresh
          </Button>
          <Button $variant="primary" onClick={handleCreateOrder}>+ New Order</Button>
        </Actions>
      </Header>

      <SalesActionTiles activeKey="orders" />

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
        <Select value={customerFilter} onChange={(e) => handleCustomerFilterChange(e.target.value)}>
          <option value="">All Customers</option>
          {customers.map((customer) => (
            <option key={customer.customerId} value={customer.customerId}>
              {customer.name}
            </option>
          ))}
        </Select>
        <FarmingYearSelector
          selectedYear={selectedFarmingYear}
          availableYears={availableFarmingYears}
          onYearChange={handleFarmingYearChange}
          isLoading={farmingYearsLoading}
          showAllOption={true}
          compact={true}
        />
      </FiltersRow>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>Loading orders...</LoadingContainer>
      ) : (
        <>
          <OrderTable
            orders={orders}
            onDelete={handleDeleteClick}
            onReportReturn={handleReportReturnClick}
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

      {/* Create Order modal (no overlay-click close per UX rules) */}
      {showCreateModal && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create Order</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)} aria-label="Close modal">
                &times;
              </CloseButton>
            </ModalHeader>
            <OrderForm
              onSubmit={handleFormSubmit}
              onCancel={() => setShowCreateModal(false)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}

      {/* Phase 4: Two-step delete confirm modal */}
      {deletePreview && deletePreviewOrderId && (
        <DeleteOrderConfirmModal
          isOpen={Boolean(deletePreview)}
          onClose={handleDeleteModalClose}
          orderId={deletePreviewOrderId}
          preview={deletePreview}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {/* Phase 4: Report Return modal */}
      {returnOrder && (
        <ReportReturnModal
          isOpen={Boolean(returnOrder)}
          onClose={handleReturnModalClose}
          order={returnOrder}
          onSuccess={handleReturnSuccess}
        />
      )}
    </Container>
  );
}
