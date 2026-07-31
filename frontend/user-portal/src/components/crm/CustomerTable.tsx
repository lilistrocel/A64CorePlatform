/**
 * CustomerTable Component
 *
 * Displays customers in a sortable table format with action buttons.
 */

import { useState } from 'react';
import styled, { css } from 'styled-components';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Customer } from '../../types/crm';
import { getCustomerTypeLabel, getCustomerStatusColor } from '../../services/crmService';
import { glassPanel, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CustomerTableProps {
  customers: Customer[];
  onView?: (customerId: string) => void;
  onEdit?: (customerId: string) => void;
  onDelete?: (customerId: string) => void;
}

type SortField = 'name' | 'email' | 'customerCode' | 'status' | 'type' | 'createdAt';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TableContainer = styled.div`
  ${glassPanel}
  border-radius: 16px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TableHeaderCell = styled.th<{ $sortable?: boolean }>`
  ${monoLabel}
  padding: 16px;
  text-align: left;
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ $sortable, theme }) => ($sortable ? theme.colors.textPrimary : theme.colors.celeste)};
  }
`;

const SortIndicator = styled.span`
  display: inline-flex;
  vertical-align: middle;
  margin-left: 4px;
  color: ${({ theme }) => theme.colors.muted};
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CustomerNameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 200px;
`;

const CustomerName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
`;

const CustomerCode = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const TruncatedCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;

  &:hover {
    position: relative;
  }

  /* Tooltip on truncated-cell hover — glassOpaque per spec §2 (menus/
     tooltips must not stack glass over the already-glass TableContainer). */
  &[title]:hover::after {
    content: attr(title);
    position: absolute;
    left: 0;
    top: 100%;
    z-index: ${({ theme }) => theme.zIndex.tooltip};
    background: ${({ theme }) => theme.colors.cosmosHi};
    border: 1px solid ${({ theme }) => theme.colors.glass.border};
    color: ${({ theme }) => theme.colors.onDark};
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    max-width: 400px;
    white-space: normal;
    word-wrap: break-word;
    box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5);
  }
`;

/* Status colour comes from crmService.getCustomerStatusColor(), already
   routed onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
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
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(107, 138, 224, 0.14);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

/* Lapis — the ordinary interactive accent for the row's primary action,
   restored per the gold-audit correction (not every action is gold). */
const primaryVariant = css`
  background: rgba(107, 138, 224, 0.12);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
  &:hover {
    background: rgba(107, 138, 224, 0.2);
  }
`;

const dangerVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }
`;

const secondaryVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 6px 12px;
  min-height: 44px; /* WCAG touch target minimum */
  min-width: 44px; /* WCAG touch target minimum */
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'primary') return primaryVariant;
    if ($variant === 'danger') return dangerVariant;
    return secondaryVariant;
  }}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerTable({ customers, onView, onEdit, onDelete }: CustomerTableProps) {
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    // Handle nested fields
    if (sortField === 'createdAt') {
      aValue = new Date(a.createdAt).getTime();
      bValue = new Date(b.createdAt).getTime();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={11} strokeWidth={1.8} />;
    return sortDirection === 'asc' ? (
      <ArrowUp size={11} strokeWidth={1.8} />
    ) : (
      <ArrowDown size={11} strokeWidth={1.8} />
    );
  };

  const handleView = (customerId: string) => {
    if (onView) onView(customerId);
  };

  const handleEdit = (customerId: string) => {
    if (onEdit) onEdit(customerId);
  };

  const handleDelete = (customerId: string) => {
    if (onDelete) onDelete(customerId);
  };

  if (customers.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No customers found</p>
        </EmptyState>
      </TableContainer>
    );
  }

  // Helper to get aria-sort value for sortable columns
  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <TableContainer>
      <Table aria-label="Customer list table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('name')}
              aria-sort={getAriaSort('name')}
            >
              Customer <SortIndicator aria-hidden="true">{renderSortIndicator('name')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('email')}
              aria-sort={getAriaSort('email')}
            >
              Email <SortIndicator aria-hidden="true">{renderSortIndicator('email')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Phone</TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('type')}
              aria-sort={getAriaSort('type')}
            >
              Type <SortIndicator aria-hidden="true">{renderSortIndicator('type')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('status')}
              aria-sort={getAriaSort('status')}
            >
              Status <SortIndicator aria-hidden="true">{renderSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedCustomers.map((customer) => (
            <TableRow key={customer.customerId}>
              <TruncatedCell title={customer.name}>
                <CustomerNameCell>
                  <CustomerName title={customer.name}>{customer.name}</CustomerName>
                  <CustomerCode>{customer.customerCode}</CustomerCode>
                </CustomerNameCell>
              </TruncatedCell>
              <TruncatedCell title={customer.email}>{customer.email}</TruncatedCell>
              <TableCell>{customer.phone || '-'}</TableCell>
              <TableCell>
                <TypeBadge>{getCustomerTypeLabel(customer.type)}</TypeBadge>
              </TableCell>
              <TableCell>
                <StatusBadge $color={getCustomerStatusColor(customer.status)}>
                  {customer.status}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="primary" onClick={() => handleView(customer.customerId)}>
                      View
                    </ActionButton>
                  )}
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => handleEdit(customer.customerId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${customer.name}"?`)) {
                          handleDelete(customer.customerId);
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
