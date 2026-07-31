/**
 * VehicleCard Component
 *
 * Displays vehicle information in a card format.
 *
 * Night Observatory (T-901 Phase 3): glassPanel card (glassPanelHover when
 * clickable), Space Mono for the vehicle code/costs, phase badge for status.
 * See `VEHICLE_STATUS_TO_PHASE` below — the same literal map is duplicated
 * in `VehicleTable.tsx` (the only other consumer); kept as two small inline
 * maps rather than a new shared file per the shard brief.
 */

import styled from 'styled-components';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { Vehicle, VehicleStatus } from '../../types/logistics';
import { getVehicleTypeLabel, formatCapacity } from '../../services/logisticsService';

// Vehicle status -> phase key (spec §5.2 extrapolation). "available" reads
// as a ready/productive asset (fruiting, the "alive" phase); "in_use" reads
// as "open/active/in progress" (inoculated); "maintenance" maps directly to
// the maintenance phase; "retired" reads as "cancelled/void/archived"
// (decommissioned).
const VEHICLE_STATUS_TO_PHASE: Record<VehicleStatus, PhaseKey> = {
  available: 'fruiting',
  in_use: 'inoculated',
  maintenance: 'maintenance',
  retired: 'decommissioned',
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface VehicleCardProps {
  vehicle: Vehicle;
  onClick?: () => void;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div<{ $clickable: boolean }>`
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  padding: 24px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const VehicleInfo = styled.div`
  flex: 1;
`;

const VehicleName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const VehicleCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
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
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const ActionButton = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  flex: 1;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
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

// ============================================================================
// COMPONENT
// ============================================================================

export function VehicleCard({ vehicle, onClick, showActions = false, onEdit, onDelete }: VehicleCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick && !showActions) {
      onClick();
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete();
  };

  return (
    <Card $clickable={!!onClick && !showActions} onClick={handleCardClick}>
      <CardHeader>
        <VehicleInfo>
          <VehicleName>{vehicle.name}</VehicleName>
          <VehicleCode>{vehicle.vehicleCode}</VehicleCode>
        </VehicleInfo>
        <StatusBadge $phaseKey={VEHICLE_STATUS_TO_PHASE[vehicle.status]}>
          {vehicle.status.replace('_', ' ')}
        </StatusBadge>
      </CardHeader>

      <CardBody>
        <InfoRow>
          <InfoLabel>License Plate</InfoLabel>
          <InfoValue>{vehicle.licensePlate}</InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Type</InfoLabel>
          <InfoValue>
            <TypeBadge>{getVehicleTypeLabel(vehicle.type)}</TypeBadge>
          </InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Ownership</InfoLabel>
          <InfoValue style={{ textTransform: 'capitalize' }}>{vehicle.ownership}</InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Capacity</InfoLabel>
          <InfoValue>{formatCapacity(vehicle.capacity)}</InfoValue>
        </InfoRow>

        {vehicle.costPerKm && (
          <InfoRow>
            <InfoLabel>Cost per Km</InfoLabel>
            <InfoValue>${vehicle.costPerKm.toFixed(2)}</InfoValue>
          </InfoRow>
        )}

        {vehicle.rentalCostPerDay && (
          <InfoRow>
            <InfoLabel>Rental Cost / Day</InfoLabel>
            <InfoValue>${vehicle.rentalCostPerDay.toFixed(2)}</InfoValue>
          </InfoRow>
        )}
      </CardBody>

      {showActions && (
        <Actions>
          {onEdit && (
            <ActionButton $variant="secondary" onClick={handleEdit}>
              Edit
            </ActionButton>
          )}
          {onDelete && (
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
        </Actions>
      )}
    </Card>
  );
}
