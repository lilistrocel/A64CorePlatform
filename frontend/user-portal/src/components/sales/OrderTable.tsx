/**
 * OrderTable Component
 *
 * Displays sales orders in a sortable table format with status management.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { SalesOrder } from '../../types/sales';

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
  background: white;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: #f5f5f5;
  border-bottom: 2px solid #e0e0e0;
`;

const TableHeaderCell = styled.th<{ $sortable?: boolean }>`
  padding: 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ $sortable }) => ($sortable ? '#eeeeee' : '#f5f5f5')};
  }
`;

const SortIndicator = styled.span`
  margin-left: 4px;
  font-size: 10px;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid #e0e0e0;
  transition: background 150ms ease-in-out;

  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: #f9fafb;
  }

  &:nth-child(odd) {
    background: #ffffff;
  }

  &:hover {
    background: #f0f4f8;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: #212121;
`;

const OrderCodeCell = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: #212121;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status }) => {
    switch ($status) {
      case 'draft':
        return 'background: #E0E0E0; color: #616161;';
      case 'confirmed':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'processing':
        return 'background: #FEF3C7; color: #92400E;';
      case 'shipped':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'delivered':
        return 'background: #D1FAE5; color: #065F46;';
      case 'cancelled':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #E0E0E0; color: #616161;';
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

  ${({ $status }) => {
    switch ($status) {
      case 'paid':
        return 'background: #D1FAE5; color: #065F46;';
      case 'partial':
        return 'background: #FEF3C7; color: #92400E;';
      case 'pending':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #E0E0E0; color: #616161;';
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

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        &:hover {
          background: #1976d2;
        }
      `;
    }
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

const EmptyState = styled.div`
  text-align: center;
  padding: 48px;
  color: #9e9e9e;
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
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell $sortable onClick={() => handleSort('orderCode')}>
              Order Code <SortIndicator>{getSortIndicator('orderCode')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('customerName')}>
              Customer <SortIndicator>{getSortIndicator('customerName')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('status')}>
              Status <SortIndicator>{getSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Payment</TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('orderDate')}>
              Order Date <SortIndicator>{getSortIndicator('orderDate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Items</TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('total')}>
              Total <SortIndicator>{getSortIndicator('total')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedOrders.map((order) => (
            <TableRow key={order.orderId}>
              <TableCell>
                <OrderCodeCell>{order.orderCode}</OrderCodeCell>
              </TableCell>
              <TableCell>{order.customerName || order.customerId}</TableCell>
              <TableCell>
                <StatusBadge $status={order.status}>{order.status}</StatusBadge>
              </TableCell>
              <TableCell>
                <PaymentBadge $status={order.paymentStatus}>{order.paymentStatus}</PaymentBadge>
              </TableCell>
              <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
              <TableCell>{order.items.length} items</TableCell>
              <TableCell>${order.total.toFixed(2)}</TableCell>
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
