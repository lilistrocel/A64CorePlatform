/**
 * RouteTable Component
 *
 * Displays routes in a sortable table format with action buttons.
 *
 * Night Observatory (T-901 Phase 3): glass table per spec §4 "Tables" — one
 * glassPanel wrapper, transparent rows, Space Mono uppercase celeste headers,
 * `line` dividers. Route has no multi-value status enum (only `isActive`),
 * so it maps onto the phase vocabulary as a two-state badge: active routes
 * read as spec §5.2 "open/active/in progress" -> `inoculated`; inactive
 * routes read as "cancelled/void/archived" -> `decommissioned` (dim, no
 * glow — this is the single-file consumer of that mapping, so it is inlined
 * rather than exported).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Pencil, Trash2 } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import type { Route } from '../../types/logistics';
import { formatLocation, formatDistance, formatDuration } from '../../services/logisticsService';

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

// Route "status" -> phase key. Route only carries isActive, so this is a
// two-state map, not a full vocabulary — spec §5.2 extrapolation:
// active reads "open/active/in progress", inactive reads "cancelled/void/archived".
function routePhaseKey(isActive: boolean): PhaseKey {
  return isActive ? 'inoculated' : 'decommissioned';
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TableContainer = styled.div`
  ${glassPanel}
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
  padding: 14px 16px;
  text-align: left;
  ${monoLabel}
  font-size: 0.68rem;
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
  opacity: 0.75;
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
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RouteNameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RouteName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RouteCode = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const LocationText = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  line-height: 1.4;
`;

const StatusBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button<{ $variant?: 'ghost' | 'secondary' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'secondary') {
      return `
        background: ${theme.colors.glass.base};
        color: ${theme.colors.textPrimary};
        border: 1px solid ${theme.colors.glass.border};
        &:hover {
          background: ${theme.colors.glass.hi};
        }
      `;
    }
    if ($variant === 'danger') {
      return `
        background: rgba(240, 138, 112, 0.12);
        color: ${theme.colors.bright.coral};
        border: 1px solid rgba(240, 138, 112, 0.35);
        &:hover {
          background: rgba(240, 138, 112, 0.2);
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border: 1px solid ${theme.colors.glass.border};
      &:hover {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
      }
    `;
  }}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 56px 24px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyBody = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
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
    if (sortField !== field) return <ArrowUpDown size={11} strokeWidth={1.8} aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={11} strokeWidth={1.8} aria-hidden="true" />
      : <ArrowDown size={11} strokeWidth={1.8} aria-hidden="true" />;
  };

  // Helper to get aria-sort value for sortable columns
  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  if (routes.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <EmptyHeadline>No routes found</EmptyHeadline>
          <EmptyBody>Routes you create will appear here.</EmptyBody>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table aria-label="Delivery routes table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('name')}
              aria-sort={getAriaSort('name')}
            >
              Route <SortIndicator aria-hidden="true">{getSortIndicator('name')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Origin</TableHeaderCell>
            <TableHeaderCell scope="col">Destination</TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('distance')}
              aria-sort={getAriaSort('distance')}
            >
              Distance (km) <SortIndicator aria-hidden="true">{getSortIndicator('distance')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('estimatedDuration')}
              aria-sort={getAriaSort('estimatedDuration')}
            >
              Duration (hrs) <SortIndicator aria-hidden="true">{getSortIndicator('estimatedDuration')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('isActive')}
              aria-sort={getAriaSort('isActive')}
            >
              Status <SortIndicator aria-hidden="true">{getSortIndicator('isActive')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Actions</TableHeaderCell>
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
              <TableCell>{formatDistance(route.distance)}</TableCell>
              <TableCell>{formatDuration(route.estimatedDuration)}</TableCell>
              <TableCell>
                <StatusBadge $phaseKey={routePhaseKey(route.isActive)}>
                  {route.isActive ? 'Active' : 'Inactive'}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="ghost" onClick={() => onView(route.routeId)}>
                      <Eye size={12} strokeWidth={1.8} /> View
                    </ActionButton>
                  )}
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(route.routeId)}>
                      <Pencil size={12} strokeWidth={1.8} /> Edit
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
                      <Trash2 size={12} strokeWidth={1.8} /> Delete
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
