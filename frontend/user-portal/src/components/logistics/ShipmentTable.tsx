/**
 * ShipmentTable Component
 *
 * Displays shipments in a sortable table format with status management.
 *
 * Night Observatory (T-901 Phase 3): glass table per spec §4 "Tables". See
 * `SHIPMENT_STATUS_TO_PHASE` — the same literal map is duplicated in
 * `ShipmentCard.tsx` (the only other consumer); kept as two small inline
 * maps rather than a new shared file per the shard brief.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Pencil, Trash2 } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, monoLabel, phaseBadge } from '@a64core/shared';
import type { Shipment, ShipmentStatus } from '../../types/logistics';
import { calculateTotalCargoWeight, formatWeight } from '../../services/logisticsService';
import { formatNumber, formatCurrency } from '../../utils/formatNumber';

// Shipment status -> phase key (spec §5.2 extrapolation) — identical map to
// ShipmentCard.tsx, see that file's header comment for the reasoning.
const SHIPMENT_STATUS_TO_PHASE: Record<ShipmentStatus, PhaseKey> = {
  scheduled: 'fruitingInit',
  in_transit: 'inoculated',
  delivered: 'fruiting',
  cancelled: 'decommissioned',
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface ShipmentTableProps {
  shipments: Shipment[];
  onView?: (shipmentId: string) => void;
  onEdit?: (shipmentId: string) => void;
  onDelete?: (shipmentId: string) => void;
  onUpdateStatus?: (shipmentId: string, status: string) => void;
}

type SortField = 'shipmentCode' | 'status' | 'scheduledDate' | 'createdAt';
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

const ShipmentCodeCell = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatusBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const CargoInfo = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
    // 'ghost' — the View action. Was previously a solid primary[500] fill
    // with a literal color: white (the fix this shard was asked to find
    // and correct). Repeated per-row actions must not consume the
    // gold budget or fall back to a hardcoded colour, so this is restyled
    // as the spec's Ghost button: transparent, celeste text/border.
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

export function ShipmentTable({ shipments, onView, onEdit, onDelete, onUpdateStatus }: ShipmentTableProps) {
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

  const sortedShipments = [...shipments].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    if (sortField === 'scheduledDate' || sortField === 'createdAt') {
      aValue = new Date(a[sortField]).getTime();
      bValue = new Date(b[sortField]).getTime();
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

  if (shipments.length === 0) {
    return (
      <TableContainer>
        <EmptyState>
          <EmptyHeadline>No shipments found</EmptyHeadline>
          <EmptyBody>Shipments you schedule will appear here.</EmptyBody>
        </EmptyState>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table aria-label="Shipment tracking table">
        <TableHead>
          <tr>
            <TableHeaderCell
              scope="col"
              $sortable
              onClick={() => handleSort('shipmentCode')}
              aria-sort={getAriaSort('shipmentCode')}
            >
              Shipment Code <SortIndicator aria-hidden="true">{getSortIndicator('shipmentCode')}</SortIndicator>
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
              onClick={() => handleSort('scheduledDate')}
              aria-sort={getAriaSort('scheduledDate')}
            >
              Scheduled Date <SortIndicator aria-hidden="true">{getSortIndicator('scheduledDate')}</SortIndicator>
            </TableHeaderCell>
            <TableHeaderCell scope="col">Cargo</TableHeaderCell>
            <TableHeaderCell scope="col">Total Cost</TableHeaderCell>
            <TableHeaderCell scope="col">Actions</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {sortedShipments.map((shipment) => (
            <TableRow key={shipment.shipmentId}>
              <TableCell>
                <ShipmentCodeCell>{shipment.shipmentCode}</ShipmentCodeCell>
              </TableCell>
              <TableCell>
                <StatusBadge $phaseKey={SHIPMENT_STATUS_TO_PHASE[shipment.status]}>
                  {shipment.status.replace('_', ' ')}
                </StatusBadge>
              </TableCell>
              <TableCell>{new Date(shipment.scheduledDate).toLocaleDateString()}</TableCell>
              <TableCell>
                <CargoInfo>
                  {formatNumber(shipment.cargo.length)} items ({formatWeight(calculateTotalCargoWeight(shipment.cargo))})
                </CargoInfo>
              </TableCell>
              <TableCell>{shipment.totalCost ? formatCurrency(shipment.totalCost, 'USD') : '-'}</TableCell>
              <TableCell>
                <Actions>
                  {onView && (
                    <ActionButton $variant="ghost" onClick={() => onView(shipment.shipmentId)}>
                      <Eye size={12} strokeWidth={1.8} /> View
                    </ActionButton>
                  )}
                  {onEdit && shipment.status === 'scheduled' && (
                    <ActionButton $variant="secondary" onClick={() => onEdit(shipment.shipmentId)}>
                      <Pencil size={12} strokeWidth={1.8} /> Edit
                    </ActionButton>
                  )}
                  {onDelete && shipment.status === 'scheduled' && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${shipment.shipmentCode}"?`)) {
                          onDelete(shipment.shipmentId);
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
