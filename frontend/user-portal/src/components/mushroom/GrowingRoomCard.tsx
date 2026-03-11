/**
 * GrowingRoomCard Component
 *
 * Individual room card that is color-coded by growing phase.
 * Displays room code, strain name, current phase badge, flush info, and BE%.
 */

import styled from 'styled-components';
import type { GrowingRoom, RoomPhase } from '../../types/mushroom';
import { PHASE_COLORS, PHASE_LABELS, PHASE_TEXT_COLORS } from '../../types/mushroom';

interface GrowingRoomCardProps {
  room: GrowingRoom;
  onClick?: (room: GrowingRoom) => void;
  compact?: boolean;
}

export function GrowingRoomCard({ room, onClick, compact = false }: GrowingRoomCardProps) {
  const phaseColor = PHASE_COLORS[room.currentPhase] ?? '#9e9e9e';
  const phaseLabel = PHASE_LABELS[room.currentPhase] ?? room.currentPhase;
  const phaseTextColor = PHASE_TEXT_COLORS[room.currentPhase] ?? '#fff';

  const bePercent = room.biologicalEfficiency;
  const beColor = bePercent == null
    ? '#9e9e9e'
    : bePercent >= 80
    ? '#10B981'
    : bePercent >= 60
    ? '#F59E0B'
    : '#EF4444';

  return (
    <CardWrapper
      $phaseColor={phaseColor}
      $compact={compact}
      $clickable={!!onClick}
      onClick={() => onClick?.(room)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(room);
        }
      }}
      aria-label={`Room ${room.roomCode} - ${phaseLabel}`}
    >
      {/* Phase accent stripe */}
      <PhaseStripe $color={phaseColor} />

      <CardBody>
        <RoomCodeRow>
          <RoomCode>{room.roomCode}</RoomCode>
          {room.currentFlush > 0 && (
            <FlushBadge title={`Flush ${room.currentFlush}`}>
              F{room.currentFlush}
            </FlushBadge>
          )}
        </RoomCodeRow>

        <PhaseBadge $bgColor={phaseColor} $textColor={phaseTextColor}>
          {phaseLabel}
        </PhaseBadge>

        {!compact && (
          <>
            {room.strainName && (
              <StrainName title={room.strainName}>{room.strainName}</StrainName>
            )}

            <MetaRow>
              {bePercent != null && (
                <BeValue $color={beColor} title="Biological Efficiency">
                  BE: {bePercent.toFixed(1)}%
                </BeValue>
              )}
              {room.maxFlushes != null && (
                <FlushInfo>
                  {room.currentFlush}/{room.maxFlushes} flushes
                </FlushInfo>
              )}
            </MetaRow>
          </>
        )}
      </CardBody>
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface CardWrapperProps {
  $phaseColor: string;
  $compact: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  position: relative;
  background: white;
  border-radius: 10px;
  border: 1px solid #e0e0e0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
  overflow: hidden;
  transition: box-shadow 150ms ease-in-out, transform 150ms ease-in-out;
  min-width: ${({ $compact }) => ($compact ? '110px' : '160px')};

  ${({ $clickable }) =>
    $clickable &&
    `
    cursor: pointer;
    &:hover {
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.14);
      transform: translateY(-2px);
    }
    &:focus-visible {
      outline: 2px solid #2196f3;
      outline-offset: 2px;
    }
  `}
`;

interface PhaseStripeProps {
  $color: string;
}

const PhaseStripe = styled.div<PhaseStripeProps>`
  height: 5px;
  background: ${({ $color }) => $color};
`;

const CardBody = styled.div`
  padding: 10px 12px 12px;
`;

const RoomCodeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
`;

const RoomCode = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: #212121;
  letter-spacing: 0.3px;
`;

const FlushBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  background: #e3f2fd;
  color: #1565c0;
  border-radius: 20px;
  padding: 2px 7px;
`;

interface PhaseBadgeProps {
  $bgColor: string;
  $textColor: string;
}

const PhaseBadge = styled.span<PhaseBadgeProps>`
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $bgColor }) => $bgColor};
  color: ${({ $textColor }) => $textColor};
  border-radius: 20px;
  padding: 2px 8px;
  margin-bottom: 6px;
`;

const StrainName = styled.div`
  font-size: 12px;
  color: #616161;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
`;

interface BeValueProps {
  $color: string;
}

const BeValue = styled.span<BeValueProps>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ $color }) => $color};
`;

const FlushInfo = styled.span`
  font-size: 11px;
  color: #9e9e9e;
`;
