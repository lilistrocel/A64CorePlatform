/**
 * InventoryTable Component
 *
 * Displays harvest inventory in a sortable table format.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { HarvestInventory } from '../../types/sales';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface InventoryTableProps {
  inventory: HarvestInventory[];
  onEdit?: (inventoryId: string) => void;
  onDelete?: (inventoryId: string) => void;
}

type SortField = 'productName' | 'quantity' | 'status' | 'quality' | 'harvestDate';
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

  &:hover {
    background: #fafafa;
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

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status }) => {
    switch ($status) {
      case 'available':
        return 'background: #D1FAE5; color: #065F46;';
      case 'reserved':
        return 'background: #FEF3C7; color: #92400E;';
      case 'sold':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'expired':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #E0E0E0; color: #616161;';
    }
  }}
`;

const QualityBadge = styled.span<{ $quality: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;

  ${({ $quality }) => {
    switch ($quality) {
      case 'A':
        return 'background: #D1FAE5; color: #065F46;';
      case 'B':
        return 'background: #FEF3C7; color: #92400E;';
      case 'C':
        return 'background: #FED7AA; color: #9A3412;';
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

export function InventoryTable({ inventory, onEdit, onDelete }: InventoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('productName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedInventory = [...inventory].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    if (sortField === 'harvestDate' && a.harvestDate && b.harvestDate) {
      aValue = new Date(a.harvestDate).getTime();
      bValue = new Date(b.harvestDate).getTime();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (inventory.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No inventory items found</p>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell $sortable onClick={() => handleSort('productName')}>
              Product Name <SortIndicator>{getSortIndicator('productName')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Category</TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('quantity')}>
              Quantity <SortIndicator>{getSortIndicator('quantity')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('quality')}>
              Quality <SortIndicator>{getSortIndicator('quality')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('status')}>
              Status <SortIndicator>{getSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('harvestDate')}>
              Harvest Date <SortIndicator>{getSortIndicator('harvestDate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Storage</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedInventory.map((item) => (
            <TableRow key={item.inventoryId}>
              <TableCell>
                <strong>{item.productName}</strong>
              </TableCell>
              <TableCell>{item.category || '-'}</TableCell>
              <TableCell>
                {item.quantity} {item.unit}
              </TableCell>
              <TableCell>{item.quality ? <QualityBadge $quality={item.quality}>Grade {item.quality}</QualityBadge> : '-'}</TableCell>
              <TableCell>
                <StatusBadge $status={item.status}>{item.status}</StatusBadge>
              </TableCell>
              <TableCell>{item.harvestDate ? new Date(item.harvestDate).toLocaleDateString() : '-'}</TableCell>
              <TableCell>{item.storageLocation || '-'}</TableCell>
              <TableCell>
                <Actions>
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(item.inventoryId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${item.productName}"?`)) {
                          onDelete(item.inventoryId);
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
