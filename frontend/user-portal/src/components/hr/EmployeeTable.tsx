/**
 * EmployeeTable Component
 *
 * Displays employees in a sortable table format with action buttons.
 */

import { useState } from 'react';
import styled, { css } from 'styled-components';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Employee } from '../../types/hr';
import { getEmployeeFullName, getEmployeeStatusLabel, getEmployeeStatusColor } from '../../services/hrService';
import { glassPanel, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface EmployeeTableProps {
  employees: Employee[];
  onView?: (employeeId: string) => void;
  onEdit?: (employeeId: string) => void;
  onDelete?: (employeeId: string) => void;
}

type SortField = 'firstName' | 'lastName' | 'email' | 'employeeCode' | 'status' | 'department' | 'createdAt';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TableContainer = styled.div`
  ${glassPanel}
  border-radius: 16px;
  overflow-x: auto;
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
`;

const TruncatedCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EmployeeNameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 200px;
`;

const EmployeeName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
`;

const EmployeeCode = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

/* Status colour comes from hrService.getEmployeeStatusColor(), already
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

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

/* Lapis — the ordinary interactive accent for the row's primary action,
   restored per the gold-audit correction. */
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
  min-height: 44px;
  min-width: 44px;
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

export function EmployeeTable({ employees, onView, onEdit, onDelete }: EmployeeTableProps) {
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

  const sortedEmployees = [...employees].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

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

  const handleView = (employeeId: string) => {
    if (onView) onView(employeeId);
  };

  const handleEdit = (employeeId: string) => {
    if (onEdit) onEdit(employeeId);
  };

  const handleDelete = (employeeId: string) => {
    if (onDelete) onDelete(employeeId);
  };

  if (employees.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No employees found</p>
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
      <Table aria-label="Employee list table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('firstName')}
              aria-sort={getAriaSort('firstName')}
            >
              Employee <SortIndicator aria-hidden="true">{renderSortIndicator('firstName')}</SortIndicator>
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
              onClick={() => handleSort('department')}
              aria-sort={getAriaSort('department')}
            >
              Department <SortIndicator aria-hidden="true">{renderSortIndicator('department')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Position</TableHeaderCell>
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
          {sortedEmployees.map((employee) => (
            <TableRow key={employee.employeeId}>
              <TruncatedCell title={getEmployeeFullName(employee)}>
                <EmployeeNameCell>
                  <EmployeeName title={getEmployeeFullName(employee)}>{getEmployeeFullName(employee)}</EmployeeName>
                  <EmployeeCode>{employee.employeeCode}</EmployeeCode>
                </EmployeeNameCell>
              </TruncatedCell>
              <TruncatedCell title={employee.email}>{employee.email}</TruncatedCell>
              <TruncatedCell title={employee.phone || '-'}>{employee.phone || '-'}</TruncatedCell>
              <TruncatedCell title={employee.department || '-'}>{employee.department || '-'}</TruncatedCell>
              <TruncatedCell title={employee.position || '-'}>{employee.position || '-'}</TruncatedCell>
              <TableCell>
                <StatusBadge $color={getEmployeeStatusColor(employee.status)}>
                  {getEmployeeStatusLabel(employee.status)}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="primary" onClick={() => handleView(employee.employeeId)}>
                      View
                    </ActionButton>
                  )}
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => handleEdit(employee.employeeId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${getEmployeeFullName(employee)}"?`)) {
                          handleDelete(employee.employeeId);
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
