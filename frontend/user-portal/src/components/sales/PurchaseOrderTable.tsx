/**
 * PurchaseOrderTable Component
 *
 * Displays purchase orders in a sortable table format with status management.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { PurchaseOrder } from '../../types/sales';
import { formatCurrency, formatNumber } from '../../utils/formatNumber';

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
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border.subtle};
`;

const TableHeaderCell = styled.th<{ $sortable?: boolean }>`
  padding: 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ $sortable, theme }) => ($sortable ? theme.colors.surface.sunken : theme.colors.surface.raised)};
  }
`;

const SortIndicator = styled.span`
  margin-left: 4px;
  font-size: 10px;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  transition: background 150ms ease-in-out;

  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }

  &:nth-child(odd) {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const POCodeCell = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
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
        return `background: ${theme.colors.surface.raised}; color: ${theme.colors.text.secondary};`;
      case 'sent':
        return `background: ${theme.colors.surface.sunken}; color: #1E40AF;`;
      case 'confirmed':
        return `background: ${theme.colors.status.warning}; color: #B8842A;`;
      case 'received':
        return `background: ${theme.colors.accent.sageSoft}; color: #065F46;`;
      case 'cancelled':
        return `background: ${theme.colors.status.danger}; color: #9E2A2A;`;
      default:
        return `background: ${theme.colors.surface.raised}; color: ${theme.colors.text.secondary};`;
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
        background: ${theme.colors.accent.sage};
        color: white;
        &:hover {
          background: ${theme.colors.accent.sageDeep};
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #9E2A2A;
        border: 1px solid #9E2A2A;
        &:hover {
          background: ${theme.colors.status.danger};
        }
      `;
    }
    return `
      background: transparent;
      color: #0F6E56;
      border: 1px solid #0F6E56;
      &:hover {
        background: ${theme.colors.accent.sageSoft};
      }
    `;
  }}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.text.tertiary};
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
              <TableCell>{formatNumber(po.items.length)} items</TableCell>
              <TableCell>{po.total ? formatCurrency(po.total, 'USD') : '-'}</TableCell>
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
