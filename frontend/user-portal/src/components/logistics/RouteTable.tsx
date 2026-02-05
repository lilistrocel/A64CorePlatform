/**
 * RouteTable Component
 *
 * Displays routes in a sortable table format with action buttons.
 */

import { useState } from 'react';
import styled from 'styled-components';
import type { Route } from '../../types/logistics';
import { formatLocation } from '../../services/logisticsService';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface RouteTableProps {
  routes: Route[];
  onView?: (routeId: string) => void;
  onEdit?: (routeId: string) => void;
  onDelete?: (routeId: string) => void;
}

type SortField = 'name' | 'routeCode' | 'distance' | 'estimatedDuration' | 'isActive' | 'createdAt';
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

const RouteNameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RouteName = styled.span`
  font-weight: 500;
  color: #212121;
`;

const RouteCode = styled.span`
  font-size: 12px;
  color: #9e9e9e;
  font-family: 'JetBrains Mono', monospace;
`;

const LocationText = styled.div`
  font-size: 13px;
  color: #616161;
  line-height: 1.4;
`;

const StatusBadge = styled.span<{ $isActive: boolean }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $isActive }) => ($isActive ? '#10B98120' : '#6B728020')};
  color: ${({ $isActive }) => ($isActive ? '#10B981' : '#6B7280')};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
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

export function RouteTable({ routes, onView, onEdit, onDelete }: RouteTableProps) {
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

  const sortedRoutes = [...routes].sort((a, b) => {
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

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (routes.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <p>No routes found</p>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell $sortable onClick={() => handleSort('name')}>
              Route <SortIndicator>{getSortIndicator('name')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Origin</TableHeaderCell>
            <TableHeaderCell>Destination</TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('distance')}>
              Distance (km) <SortIndicator>{getSortIndicator('distance')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('estimatedDuration')}>
              Duration (hrs) <SortIndicator>{getSortIndicator('estimatedDuration')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell $sortable onClick={() => handleSort('isActive')}>
              Status <SortIndicator>{getSortIndicator('isActive')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedRoutes.map((route) => (
            <TableRow key={route.routeId}>
              <TableCell>
                <RouteNameCell>
                  <RouteName>{route.name}</RouteName>
                  <RouteCode>{route.routeCode}</RouteCode>
                </RouteNameCell>
              </TableCell>
              <TableCell>
                <LocationText>{formatLocation(route.origin)}</LocationText>
              </TableCell>
              <TableCell>
                <LocationText>{formatLocation(route.destination)}</LocationText>
              </TableCell>
              <TableCell>{route.distance ? route.distance.toFixed(1) : '-'}</TableCell>
              <TableCell>{route.estimatedDuration ? (route.estimatedDuration / 60).toFixed(1) : '-'}</TableCell>
              <TableCell>
                <StatusBadge $isActive={route.isActive}>{route.isActive ? 'Active' : 'Inactive'}</StatusBadge>
              </TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="primary" onClick={() => onView(route.routeId)}>
                      View
                    </ActionButton>
                  )}
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(route.routeId)}>
                      Edit
                    </ActionButton>
                  )}
                  {onDelete && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${route.name}"?`)) {
                          onDelete(route.routeId);
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
