/**
 * VehicleCard Component
 *
 * Displays vehicle information in a card format.
 */

import styled from 'styled-components';
import type { Vehicle } from '../../types/logistics';
import { getVehicleStatusColor, getVehicleTypeLabel, formatCapacity } from '../../services/logisticsService';

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
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  &:hover {
    box-shadow: ${({ $clickable }) => ($clickable ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none')};
  }
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
  color: #212121;
  margin: 0 0 4px 0;
`;

const VehicleCode = styled.div`
  font-size: 12px;
  color: #9e9e9e;
  font-family: 'JetBrains Mono', monospace;
`;

const StatusBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  text-transform: capitalize;
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
  border-bottom: 1px solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: #616161;
  font-weight: 500;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: #212121;
  font-weight: 500;
`;

const TypeBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #f5f5f5;
  color: #616161;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  flex: 1;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
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
        <StatusBadge $color={getVehicleStatusColor(vehicle.status)}>
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
