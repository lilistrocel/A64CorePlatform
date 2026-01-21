/**
 * ShipmentCard Component
 *
 * Displays shipment information in a card format.
 */

import styled from 'styled-components';
import type { Shipment } from '../../types/logistics';
import { getShipmentStatusColor, calculateTotalCargoWeight } from '../../services/logisticsService';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface ShipmentCardProps {
  shipment: Shipment;
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

const ShipmentInfo = styled.div`
  flex: 1;
`;

const ShipmentCode = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0;
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

const CargoList = styled.div`
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
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

export function ShipmentCard({ shipment, onClick, showActions = false, onEdit, onDelete }: ShipmentCardProps) {
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
        <ShipmentInfo>
          <ShipmentCode>{shipment.shipmentCode}</ShipmentCode>
        </ShipmentInfo>
        <StatusBadge $color={getShipmentStatusColor(shipment.status)}>
          {shipment.status.replace('_', ' ')}
        </StatusBadge>
      </CardHeader>

      <CardBody>
        <InfoRow>
          <InfoLabel>Scheduled Date</InfoLabel>
          <InfoValue>{new Date(shipment.scheduledDate).toLocaleDateString()}</InfoValue>
        </InfoRow>

        {shipment.actualDepartureDate && (
          <InfoRow>
            <InfoLabel>Departure Date</InfoLabel>
            <InfoValue>{new Date(shipment.actualDepartureDate).toLocaleDateString()}</InfoValue>
          </InfoRow>
        )}

        {shipment.actualArrivalDate && (
          <InfoRow>
            <InfoLabel>Arrival Date</InfoLabel>
            <InfoValue>{new Date(shipment.actualArrivalDate).toLocaleDateString()}</InfoValue>
          </InfoRow>
        )}

        <InfoRow>
          <InfoLabel>Cargo Items</InfoLabel>
          <InfoValue>{shipment.cargo.length} items</InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Total Weight</InfoLabel>
          <InfoValue>{calculateTotalCargoWeight(shipment.cargo)} kg</InfoValue>
        </InfoRow>

        {shipment.totalCost && (
          <InfoRow>
            <InfoLabel>Total Cost</InfoLabel>
            <InfoValue>${shipment.totalCost.toFixed(2)}</InfoValue>
          </InfoRow>
        )}

        <CargoList>
          <strong>Cargo Details:</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
            {shipment.cargo.map((item, index) => (
              <li key={index}>
                {item.description} - {item.quantity} units
                {item.weight && ` (${item.weight} kg)`}
              </li>
            ))}
          </ul>
        </CargoList>
      </CardBody>

      {showActions && (
        <Actions>
          {onEdit && shipment.status === 'scheduled' && (
            <ActionButton $variant="secondary" onClick={handleEdit}>
              Edit
            </ActionButton>
          )}
          {onDelete && shipment.status === 'scheduled' && (
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
        </Actions>
      )}
    </Card>
  );
}
