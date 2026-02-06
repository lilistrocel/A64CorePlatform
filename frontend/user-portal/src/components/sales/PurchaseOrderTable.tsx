/**
 * PurchaseOrderTable Component
 *
 * Displays purchase orders in a sortable table format with status management.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { PurchaseOrder } from '../../types/sales';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PurchaseOrderTableProps {
  purchaseOrders: PurchaseOrder[];
  onEdit?: (purchaseOrderId: string) => void;
  onDelete?: (purchaseOrderId: string) => void;
  onUpdateStatus?: (purchaseOrderId: string, status: string) => void;
}

type SortField = 'poCode' | 'supplierName' | 'status' | 'orderDate' | 'total';
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

const POCodeCell = styled.div`
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
      case 'sent':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'confirmed':
        return 'background: #FEF3C7; color: #92400E;';
      case 'received':
        return 'background: #D1FAE5; color: #065F46;';
      case 'cancelled':
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

export function PurchaseOrderTable({ purchaseOrders, onEdit, onDelete, onUpdateStatus }: PurchaseOrderTableProps) {
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

  const sortedPOs = [...purchaseOrders].sort((a, b) => {
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

  if (purchaseOrders.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No purchase orders found</p>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table aria-label="Purchase orders table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('poCode')}
              aria-sort={getAriaSort('poCode')}
            >
              PO Code <SortIndicator aria-hidden="true">{getSortIndicator('poCode')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('supplierName')}
              aria-sort={getAriaSort('supplierName')}
            >
              Supplier <SortIndicator aria-hidden="true">{getSortIndicator('supplierName')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('status')}
              aria-sort={getAriaSort('status')}
            >
              Status <SortIndicator aria-hidden="true">{getSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('orderDate')}
              aria-sort={getAriaSort('orderDate')}
            >
              Order Date <SortIndicator aria-hidden="true">{getSortIndicator('orderDate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Expected Delivery</TableHeaderCell>
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
          {sortedPOs.map((po) => (
            <TableRow key={po.purchaseOrderId}>
              <TableCell>
                <POCodeCell>{po.poCode}</POCodeCell>
              </TableCell>
              <TableCell>{po.supplierName || po.supplierId || '-'}</TableCell>
              <TableCell>
                <StatusBadge $status={po.status}>{po.status}</StatusBadge>
              </TableCell>
              <TableCell>{new Date(po.orderDate).toLocaleDateString()}</TableCell>
              <TableCell>
                {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : '-'}
              </TableCell>
              <TableCell>{po.items.length} items</TableCell>
              <TableCell>{po.total ? `$${po.total.toFixed(2)}` : '-'}</TableCell>
              <TableCell>
                <Actions>
                  {onEdit && po.status === 'draft' && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(po.purchaseOrderId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && po.status === 'draft' && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete PO "${po.poCode}"?`)) {
                          onDelete(po.purchaseOrderId);
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
