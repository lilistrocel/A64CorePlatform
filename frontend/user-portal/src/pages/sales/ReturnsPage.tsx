/**
 * ReturnsPage Component
 *
 * Main page for managing return orders with search, filtering, and CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { salesApi } from '../../services/salesService';
import type { ReturnOrder, ReturnStatus, PaginatedReturns } from '../../types/sales';

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

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin-bottom: 8px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #616161;
  font-weight: 500;
`;

const FiltersRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  min-width: 200px;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const TableContainer = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: #f9fafb;
  border-bottom: 1px solid #e0e0e0;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #e0e0e0;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #f9fafb;
  }
`;

const TableHeader = styled.th`
  padding: 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: #212121;
`;

const StatusBadge = styled.span<{ $status: ReturnStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;

  ${({ $status }) => {
    switch ($status) {
      case 'pending':
        return 'background: #FEF3C7; color: #92400E;';
      case 'processing':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'completed':
        return 'background: #D1FAE5; color: #065F46;';
      case 'rejected':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #F3F4F6; color: #374151;';
    }
  }}
`;

const ActionsCell = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'success' | 'danger' }>`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: #3B82F6;
          color: white;
          &:hover {
            background: #2563EB;
          }
        `;
      case 'success':
        return `
          background: #10B981;
          color: white;
          &:hover {
            background: #059669;
          }
        `;
      case 'danger':
        return `
          background: #EF4444;
          color: white;
          &:hover {
            background: #DC2626;
          }
        `;
      default:
        return `
          background: #6B7280;
          color: white;
          &:hover {
            background: #4B5563;
          }
        `;
    }
  }}
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

const LoadingContainer = styled.div`
  text-align: center;
  padding: 48px;
  color: #9e9e9e;
  font-size: 16px;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  font-size: 14px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
  color: #6B7280;
`;

const EmptyStateTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 8px 0;
`;

const EmptyStateText = styled.p`
  font-size: 14px;
  color: #6B7280;
  margin: 0 0 24px 0;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function ReturnsPage() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const perPage = 20;

  useEffect(() => {
    loadReturns();
  }, [currentPage, statusFilter]);

  const loadReturns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await salesApi.getReturns({
        page: currentPage,
        perPage,
        status: statusFilter || undefined,
      });
      setReturns(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err: any) {
      console.error('Failed to load returns:', err);
      setError(err.response?.data?.message || 'Failed to load return orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as ReturnStatus | '');
    setCurrentPage(1);
  };

  const handleProcessReturn = async (returnId: string) => {
    try {
      await salesApi.processReturnOrder(returnId);
      alert('Return order processed successfully');
      loadReturns();
    } catch (err: any) {
      console.error('Failed to process return:', err);
      alert(err.response?.data?.message || 'Failed to process return order');
    }
  };

  const handleDeleteReturn = async (returnId: string) => {
    if (!window.confirm('Are you sure you want to delete this return order?')) {
      return;
    }

    try {
      await salesApi.deleteReturnOrder(returnId);
      alert('Return order deleted successfully');
      loadReturns();
    } catch (err: any) {
      console.error('Failed to delete return:', err);
      alert(err.response?.data?.message || 'Failed to delete return order');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate stats from current data
  const pendingCount = returns.filter((r) => r.status === 'pending').length;
  const processingCount = returns.filter((r) => r.status === 'processing').length;
  const completedCount = returns.filter((r) => r.status === 'completed').length;
  const rejectedCount = returns.filter((r) => r.status === 'rejected').length;

  return (
    <Container>
      <Header>
        <Title>Return Orders</Title>
        <Actions>
          <Button $variant="secondary" onClick={loadReturns}>
            Refresh
          </Button>
          <Button $variant="primary" onClick={() => navigate('/sales/returns/new')}>
            + Create Return
          </Button>
        </Actions>
      </Header>

      <StatsRow>
        <StatCard>
          <StatValue>{total}</StatValue>
          <StatLabel>Total Returns</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{pendingCount}</StatValue>
          <StatLabel>Pending</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{processingCount}</StatValue>
          <StatLabel>Processing</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{completedCount}</StatValue>
          <StatLabel>Completed</StatLabel>
        </StatCard>
      </StatsRow>

      <FiltersRow>
        <Select value={statusFilter} onChange={(e) => handleStatusFilterChange(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </Select>
      </FiltersRow>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>Loading return orders...</LoadingContainer>
      ) : returns.length === 0 ? (
        <TableContainer>
          <EmptyState>
            <EmptyStateTitle>No return orders found</EmptyStateTitle>
            <EmptyStateText>
              {statusFilter
                ? `No returns with status "${statusFilter}". Try adjusting your filters.`
                : "There are no return orders yet. Create your first return to get started."}
            </EmptyStateText>
            <Button $variant="primary" onClick={() => navigate('/sales/returns/new')}>
              Create First Return
            </Button>
          </EmptyState>
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Return Code</TableHeader>
                  <TableHeader>Order Code</TableHeader>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Return Date</TableHeader>
                  <TableHeader>Qty Returned</TableHeader>
                  <TableHeader>Refund Amount</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <tbody>
                {returns.map((returnOrder) => (
                  <TableRow key={returnOrder.returnId}>
                    <TableCell>
                      <strong>{returnOrder.returnCode}</strong>
                    </TableCell>
                    <TableCell>{returnOrder.orderCode || '-'}</TableCell>
                    <TableCell>{returnOrder.customerName || '-'}</TableCell>
                    <TableCell>
                      <StatusBadge $status={returnOrder.status}>{returnOrder.status}</StatusBadge>
                    </TableCell>
                    <TableCell>{formatDate(returnOrder.returnDate)}</TableCell>
                    <TableCell>{returnOrder.totalReturnedQuantity.toFixed(2)}</TableCell>
                    <TableCell>
                      {returnOrder.totalRefundAmount ? formatCurrency(returnOrder.totalRefundAmount) : '-'}
                    </TableCell>
                    <TableCell>
                      <ActionsCell>
                        <ActionButton
                          $variant="primary"
                          onClick={() => navigate(`/sales/returns/${returnOrder.returnId}`)}
                        >
                          View
                        </ActionButton>
                        {returnOrder.status === 'pending' && (
                          <>
                            <ActionButton
                              $variant="success"
                              onClick={() => handleProcessReturn(returnOrder.returnId)}
                            >
                              Process
                            </ActionButton>
                            <ActionButton
                              $variant="danger"
                              onClick={() => handleDeleteReturn(returnOrder.returnId)}
                            >
                              Delete
                            </ActionButton>
                          </>
                        )}
                      </ActionsCell>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </TableContainer>

          <Pagination>
            <PageInfo>
              Showing {returns.length > 0 ? (currentPage - 1) * perPage + 1 : 0} to{' '}
              {Math.min(currentPage * perPage, total)} of {total} returns
            </PageInfo>
            <PageControls>
              <PageButton onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
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
    </Container>
  );
}
