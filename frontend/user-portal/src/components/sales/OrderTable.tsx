/**
 * OrderTable Component
 *
 * Displays sales orders in a sortable table format with status management.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { SalesOrder } from '../../types/sales';
import { formatCurrency, formatNumber } from '../../utils/formatNumber';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface OrderTableProps {
  orders: SalesOrder[];
  onView?: (orderId: string) => void;
  onEdit?: (orderId: string) => void;
  onDelete?: (orderId: string) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
}

type SortField = 'orderCode' | 'customerName' | 'status' | 'total' | 'orderDate';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TableContainer = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const TableHeaderCell = styled.th<{ $sortable?: boolean }>`
  padding: 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ $sortable, theme }) => ($sortable ? theme.colors.neutral[200] : theme.colors.surface)};
  }
`;

const SortIndicator = styled.span`
  margin-left: 4px;
  font-size: 10px;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  transition: background 150ms ease-in-out;

  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }

  &:nth-child(odd) {
    background: ${({ theme }) => theme.colors.background};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TruncatedCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const OrderCodeCell = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status, theme }) => {
    switch ($status) {
      case 'draft':
        return `background: ${theme.colors.surface}; color: ${theme.colors.textSecondary};`;
      case 'confirmed':
        return `background: ${theme.colors.infoBg}; color: #1E40AF;`;
      case 'processing':
        return `background: ${theme.colors.warningBg}; color: #92400E;`;
      case 'shipped':
        return `background: ${theme.colors.infoBg}; color: #1E40AF;`;
      case 'delivered':
        return `background: ${theme.colors.successBg}; color: #065F46;`;
      case 'cancelled':
        return `background: ${theme.colors.errorBg}; color: #991B1B;`;
      default:
        return `background: ${theme.colors.surface}; color: ${theme.colors.textSecondary};`;
    }
  }}
`;

const PaymentBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status, theme }) => {
    switch ($status) {
      case 'paid':
        return `background: ${theme.colors.successBg}; color: #065F46;`;
      case 'partial':
        return `background: ${theme.colors.warningBg}; color: #92400E;`;
      case 'pending':
        return `background: ${theme.colors.errorBg}; color: #991B1B;`;
      default:
        return `background: ${theme.colors.surface}; color: ${theme.colors.textSecondary};`;
    }
  }}
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.primary[500]};
        color: white;
        &:hover {
          background: ${theme.colors.primary[700]};
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #EF4444;
        border: 1px solid #EF4444;
        &:hover {
          background: ${theme.colors.errorBg};
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.primary[500]};
      border: 1px solid ${theme.colors.primary[500]};
      &:hover {
        background: ${theme.colors.infoBg};
      }
    `;
  }}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function OrderTable({ orders, onView, onEdit, onDelete, onUpdateStatus }: OrderTableProps) {
  const [sortField, setSortField] = useState<SortField>('orderDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    if (sortField === 'orderDate') {
      aValue = new Date(a.orderDate).getTime();
      bValue = new Date(b.orderDate).getTime();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Helper to get aria-sort value for sortable columns
  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  if (orders.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No orders found</p>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table aria-label="Sales orders table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('orderCode')}
              aria-sort={getAriaSort('orderCode')}
            >
              Order Code <SortIndicator aria-hidden="true">{getSortIndicator('orderCode')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('customerName')}
              aria-sort={getAriaSort('customerName')}
            >
              Customer <SortIndicator aria-hidden="true">{getSortIndicator('customerName')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('status')}
              aria-sort={getAriaSort('status')}
            >
              Status <SortIndicator aria-hidden="true">{getSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Payment</TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('orderDate')}
              aria-sort={getAriaSort('orderDate')}
            >
              Order Date <SortIndicator aria-hidden="true">{getSortIndicator('orderDate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Items</TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('total')}
              aria-sort={getAriaSort('total')}
            >
              Total <SortIndicator aria-hidden="true">{getSortIndicator('total')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedOrders.map((order) => (
            <TableRow key={order.orderId}>
              <TableCell>
                <OrderCodeCell>{order.orderCode}</OrderCodeCell>
              </TableCell>
              <TruncatedCell title={order.customerName || order.customerId}>{order.customerName || order.customerId}</TruncatedCell>
              <TableCell>
                <StatusBadge $status={order.status}>{order.status}</StatusBadge>
              </TableCell>
              <TableCell>
                <PaymentBadge $status={order.paymentStatus}>{order.paymentStatus}</PaymentBadge>
              </TableCell>
              <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
              <TableCell>{formatNumber(order.items.length)} items</TableCell>
              <TableCell>{formatCurrency(order.total, 'USD')}</TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="primary" onClick={() => onView(order.orderId)}>
                      View
                    </ActionButton>
                  )}
                  {onEdit && order.status === 'draft' && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(order.orderId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && order.status === 'draft' && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete order "${order.orderCode}"?`)) {
                          onDelete(order.orderId);
                        }
                      }}
                    >
                      Delete
                    </ActionButton>
                  )}
                </Actions>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
