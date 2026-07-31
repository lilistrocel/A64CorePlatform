/**
 * VehicleTable Component
 *
 * Displays vehicles in a sortable table format with action buttons.
 *
 * Night Observatory (T-901 Phase 3): glass table per spec §4 "Tables". See
 * `VEHICLE_STATUS_TO_PHASE` — the same literal map is duplicated in
 * `VehicleCard.tsx` (the only other consumer); kept as two small inline
 * maps rather than a new shared file per the shard brief.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Pencil, Trash2 } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import type { Vehicle, VehicleStatus } from '../../types/logistics';
import { getVehicleTypeLabel, formatCapacity } from '../../services/logisticsService';

// Vehicle status -> phase key (spec §5.2 extrapolation) — identical map to
// VehicleCard.tsx, see that file's header comment for the reasoning.
const VEHICLE_STATUS_TO_PHASE: Record<VehicleStatus, PhaseKey> = {
  available: 'fruiting',
  in_use: 'inoculated',
  maintenance: 'maintenance',
  retired: 'decommissioned',
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VehicleTableProps {
  vehicles: Vehicle[];
  onView?: (vehicleId: string) => void;
  onEdit?: (vehicleId: string) => void;
  onDelete?: (vehicleId: string) => void;
}

type SortField = 'name' | 'vehicleCode' | 'type' | 'status' | 'licensePlate' | 'ownership' | 'createdAt';
type SortDirection = 'asc' | 'desc';

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

const VehicleNameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const VehicleName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const VehicleCode = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const TypeBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
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
    // 'ghost' — the View action. Previously a solid primary[500] fill with
    // onAccent text (flagged onAccent misuse — the fill is lapis, not
    // gold). Repeated per-row actions must not consume the gold budget, so
    // this is restyled as the spec's Ghost button: transparent, celeste.
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

export function VehicleTable({ vehicles, onView, onEdit, onDelete }: VehicleTableProps) {
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

  const sortedVehicles = [...vehicles].sort((a, b) => {
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

  if (vehicles.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <EmptyHeadline>No vehicles found</EmptyHeadline>
          <EmptyBody>Vehicles you add to the fleet will appear here.</EmptyBody>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table aria-label="Fleet vehicles table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('name')}
              aria-sort={getAriaSort('name')}
            >
              Vehicle <SortIndicator aria-hidden="true">{getSortIndicator('name')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('licensePlate')}
              aria-sort={getAriaSort('licensePlate')}
            >
              License Plate <SortIndicator aria-hidden="true">{getSortIndicator('licensePlate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('type')}
              aria-sort={getAriaSort('type')}
            >
              Type <SortIndicator aria-hidden="true">{getSortIndicator('type')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Capacity</TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('ownership')}
              aria-sort={getAriaSort('ownership')}
            >
              Ownership <SortIndicator aria-hidden="true">{getSortIndicator('ownership')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('status')}
              aria-sort={getAriaSort('status')}
            >
              Status <SortIndicator aria-hidden="true">{getSortIndicator('status')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedVehicles.map((vehicle) => (
            <TableRow key={vehicle.vehicleId}>
              <TableCell>
                <VehicleNameCell>
                  <VehicleName>{vehicle.name}</VehicleName>
                  <VehicleCode>{vehicle.vehicleCode}</VehicleCode>
                </VehicleNameCell>
              </TableCell>
              <TableCell>{vehicle.licensePlate}</TableCell>
              <TableCell>
                <TypeBadge>{getVehicleTypeLabel(vehicle.type)}</TypeBadge>
              </TableCell>
              <TableCell>{formatCapacity(vehicle.capacity)}</TableCell>
              <TableCell style={{ textTransform: 'capitalize' }}>{vehicle.ownership}</TableCell>
              <TableCell>
                <StatusBadge $phaseKey={VEHICLE_STATUS_TO_PHASE[vehicle.status]}>
                  {vehicle.status.replace('_', ' ')}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="ghost" onClick={() => onView(vehicle.vehicleId)}>
                      <Eye size={12} strokeWidth={1.8} /> View
                    </ActionButton>
                  )}
                  {onEdit && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(vehicle.vehicleId)}>
                      <Pencil size={12} strokeWidth={1.8} /> Edit
                    </ActionButton>
                  )}
                  {onDelete && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${vehicle.name}"?`)) {
                          onDelete(vehicle.vehicleId);
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
