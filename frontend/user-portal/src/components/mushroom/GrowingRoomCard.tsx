/**
 * GrowingRoomCard Component
 *
 * Individual room card. What it shows depends on the room's type:
 *  - batch rooms (fruiting) run one crop, so they show the phase, strain and BE
 *  - container rooms (lab, spawn, incubation, storage) hold many independent
 *    items, so they show what is physically in them instead
 */

import styled from 'styled-components';
import type { GrowingRoom, RoomOccupancy } from '../../types/mushroom';
import {
  PHASE_COLORS,
  PHASE_LABELS,
  PHASE_TEXT_COLORS,
  ROOM_TYPE_ICONS,
  ROOM_TYPE_LABELS,
  isBatchRoom,
} from '../../types/mushroom';
import type { VesselForm } from '../../types/genetics';
import { VESSEL_LABELS } from '../../types/genetics';

interface GrowingRoomCardProps {
  room: GrowingRoom;
  onClick?: (room: GrowingRoom) => void;
  compact?: boolean;
  /**
   * Live material held in this room, from the genetics repo. Container rooms
   * (lab, spawn, incubation, storage) show this instead of a crop phase —
   * they hold many independent items rather than running one crop.
   */
  occupancy?: RoomOccupancy;
}

export function GrowingRoomCard({
  room,
  onClick,
  compact = false,
  occupancy,
}: GrowingRoomCardProps) {
  const phaseColor = PHASE_COLORS[room.currentPhase] ?? '#9e9e9e';
  const phaseLabel = PHASE_LABELS[room.currentPhase] ?? room.currentPhase;
  const batchRoom = isBatchRoom(room.roomType);
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

        {room.roomType && (
          <RoomTypeChip title={ROOM_TYPE_LABELS[room.roomType]}>
            {ROOM_TYPE_ICONS[room.roomType]} {ROOM_TYPE_LABELS[room.roomType]}
          </RoomTypeChip>
        )}

        {/* A crop phase only means something in a batch room. Container rooms
            hold many independent items, so they show contents instead. */}
        {batchRoom ? (
          <PhaseBadge $bgColor={phaseColor} $textColor={phaseTextColor}>
            {phaseLabel}
          </PhaseBadge>
        ) : (
          <OccupancyBadge $empty={!occupancy?.vessels}>
            {occupancy?.vessels
              ? `${occupancy.vessels} item${occupancy.vessels === 1 ? '' : 's'}`
              : 'empty'}
          </OccupancyBadge>
        )}

        {!compact && (
          <>
            {batchRoom && room.strainName && (
              <StrainName title={room.strainName}>{room.strainName}</StrainName>
            )}

            {!batchRoom && occupancy && occupancy.records > 0 && (
              <ContentsList>
                {Object.entries(occupancy.byForm)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([form, count]) => (
                    <ContentsRow key={form}>
                      <ContentsForm>
                        {VESSEL_LABELS[form as VesselForm] ?? form}
                      </ContentsForm>
                      <ContentsCount>{count}</ContentsCount>
                    </ContentsRow>
                  ))}
              </ContentsList>
            )}

            {batchRoom && (
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
            )}
          </>
        )}
      </CardBody>
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const RoomTypeChip = styled.div`
  font-size: 10.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
`;

const OccupancyBadge = styled.span<{ $empty: boolean }>`
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  background: ${({ $empty, theme }) =>
    $empty ? theme.colors.neutral[200] : theme.colors.primary[50]};
  color: ${({ $empty, theme }) =>
    $empty ? theme.colors.textSecondary : theme.colors.primary[800]};
`;

const ContentsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
`;

const ContentsRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ContentsForm = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ContentsCount = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

interface CardWrapperProps {
  $phaseColor: string;
  $compact: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  position: relative;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  box-shadow: ${({ theme }) => theme.shadows.sm};
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
  `}

  ${({ $clickable, theme }) =>
    $clickable &&
    `
    &:focus-visible {
      outline: 2px solid ${theme.colors.primary[500]};
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
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: 0.3px;
`;

const FlushBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.primary[800]};
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
  color: ${({ theme }) => theme.colors.textSecondary};
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
  color: ${({ theme }) => theme.colors.textDisabled};
`;
