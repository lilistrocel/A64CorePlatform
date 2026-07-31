/**
 * ShipmentCard Component
 *
 * Displays shipment information in a card format.
 *
 * Night Observatory (T-901 Phase 3): glassPanel card (glassPanelHover when
 * clickable), Space Mono for the shipment code/weights/cost, phase badge for
 * status. See `SHIPMENT_STATUS_TO_PHASE` below — the same literal map is
 * duplicated in `ShipmentTable.tsx` (the only other consumer); kept as two
 * small inline maps rather than a new shared file per the shard brief.
 */

import styled from 'styled-components';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { Shipment, ShipmentStatus } from '../../types/logistics';
import { calculateTotalCargoWeight } from '../../services/logisticsService';

// Shipment status -> phase key (spec §5.2 extrapolation). scheduled reads as
// "pending / awaiting" (fruitingInit); in_transit reads as "open / active /
// in progress" (inoculated); delivered reads as "approved / delivered"
// (fruiting); cancelled reads as "cancelled / void" (decommissioned).
const SHIPMENT_STATUS_TO_PHASE: Record<ShipmentStatus, PhaseKey> = {
  scheduled: 'fruitingInit',
  in_transit: 'inoculated',
  delivered: 'fruiting',
  cancelled: 'decommissioned',
};

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
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  padding: 24px;
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
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
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

const CargoList = styled.div`
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  padding: 12px;
  border-radius: 10px;
  font-size: 12px;
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
        <StatusBadge $phaseKey={SHIPMENT_STATUS_TO_PHASE[shipment.status]}>
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
