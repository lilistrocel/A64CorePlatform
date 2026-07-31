/**
 * GrowingRoomCard Component
 *
 * Individual room card. What it shows depends on the room's type:
 *  - batch rooms (fruiting) run one crop, so they show the phase, strain and BE
 *  - container rooms (lab, spawn, incubation, storage) hold many independent
 *    items, so they show what is physically in them instead
 *
 * Night Observatory (T-901 Phase 3): glass room card per spec §4 / mockup
 * `.card` (l.186-234) — code/type-line/phase-badge/telemetry-row layout, a
 * glowing left edge bar while the room is mid-process, opacity-.82 when
 * empty/idle. No environment (temp/RH/CO2) props reach this component today
 * — the mockup's TEMP/RH/CO2 telemetry example is illustrative of the
 * pattern, not literal data this card has; the telemetry row below renders
 * the data this card actually receives (BE%, flush progress, occupancy).
 */

import styled, { useTheme } from 'styled-components';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, glassPanelHover, monoLabel, phaseBadge, sheen } from '@a64core/shared';
import type { GrowingRoom, RoomOccupancy } from '../../types/mushroom';
import {
  PHASE_LABELS,
  ROOM_TYPE_LABELS,
  isBatchRoom,
} from '../../types/mushroom';
import type { VesselForm } from '../../types/genetics';
import { VESSEL_LABELS } from '../../types/genetics';
import { ROOM_PHASE_TO_PHASE_KEY } from '../../types/mushroom';
import { ROOM_TYPE_ICON_COMPONENTS } from './phaseTheme';

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
  const theme = useTheme();
  const phaseKey = ROOM_PHASE_TO_PHASE_KEY[room.currentPhase];
  const phaseLabel = PHASE_LABELS[room.currentPhase] ?? room.currentPhase;
  const batchRoom = isBatchRoom(room.roomType);
  const TypeIcon = room.roomType ? ROOM_TYPE_ICON_COMPONENTS[room.roomType] : undefined;

  // A room "in process" gets the glowing edge bar; empty/idle rooms drop to
  // reduced opacity (spec §4 room-card pattern). Container rooms have no
  // crop phase, so occupancy stands in for "in process".
  const isIdle = batchRoom
    ? room.currentPhase === 'empty' || room.currentPhase === 'decommissioned'
    : !occupancy?.vessels;
  const isActive = !isIdle;

  // BE% data encoding (spec §3): `bright.gold` is reserved for the
  // Harvesting phase, not a generic "good" reading — the mid band takes
  // `bright.lapis` instead, matching BiologicalEfficiencyGauge's ramp.
  const bePercent = room.biologicalEfficiency;
  const beColor = bePercent == null
    ? theme.colors.muted
    : bePercent >= 80
    ? theme.colors.bright.emerald
    : bePercent >= 60
    ? theme.colors.bright.lapis
    : theme.colors.bright.terra;

  return (
    <CardWrapper
      $phaseColor={theme.colors.phase[phaseKey]}
      $compact={compact}
      $clickable={!!onClick}
      $isActive={isActive}
      $isIdle={isIdle}
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
      <Top>
        <RoomCode>{room.roomCode}</RoomCode>
        {room.currentFlush > 0 && (
          <FlushChip title={`Flush ${room.currentFlush}`}>F{room.currentFlush}</FlushChip>
        )}
      </Top>

      {room.roomType && (
        <UseLine title={ROOM_TYPE_LABELS[room.roomType]}>
          {TypeIcon && <TypeIcon size={13} strokeWidth={1.6} />}
          {ROOM_TYPE_LABELS[room.roomType]}
        </UseLine>
      )}

      {/* A crop phase only means something in a batch room. Container rooms
          hold many independent items, so they show contents instead. */}
      {batchRoom ? (
        <PhaseBadgeChip $phaseKey={phaseKey}>{phaseLabel}</PhaseBadgeChip>
      ) : (
        <OccupancyBadge $empty={!occupancy?.vessels}>
          {occupancy?.vessels
            ? `${occupancy.vessels} item${occupancy.vessels === 1 ? '' : 's'}`
            : 'empty'}
        </OccupancyBadge>
      )}

      {!compact && batchRoom && room.strainName && (
        <StrainName title={room.strainName}>{room.strainName}</StrainName>
      )}

      {!compact && !batchRoom && occupancy && occupancy.records > 0 && (
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

      {!compact && batchRoom && (bePercent != null || room.maxFlushes != null) && (
        <Tele>
          {bePercent != null && (
            <TeleItem>
              BE <TeleValue $color={beColor}>{bePercent.toFixed(1)}%</TeleValue>
            </TeleItem>
          )}
          {room.maxFlushes != null && (
            <TeleItem>
              FLUSH <TeleValue>{room.currentFlush}/{room.maxFlushes}</TeleValue>
            </TeleItem>
          )}
        </Tele>
      )}
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS — Night Observatory glass room card, spec §4 / mockup
// `.card` (Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html l.186-234)
// ============================================================================

const UseLine = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 12px;

  svg {
    flex-shrink: 0;
    opacity: 0.85;
  }
`;

const OccupancyBadge = styled.span<{ $empty: boolean }>`
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
  font-weight: 700;
  background: ${({ $empty, theme }) =>
    $empty ? 'rgba(126, 134, 166, 0.16)' : theme.colors.infoBg};
  color: ${({ $empty, theme }) => ($empty ? theme.colors.muted : theme.colors.bright.lapis)};
  border: 1px solid ${({ $empty, theme }) =>
    $empty ? 'rgba(126, 134, 166, 0.4)' : 'rgba(107, 138, 224, 0.4)'};
`;

const ContentsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
`;

const ContentsRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  ${monoLabel}
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
`;

const ContentsForm = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ContentsCount = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
`;

interface CardWrapperProps {
  $phaseColor: string;
  $compact: boolean;
  $clickable: boolean;
  $isActive: boolean;
  $isIdle: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  ${sheen}
  overflow: hidden;
  border-radius: 18px;
  padding: ${({ $compact }) => ($compact ? '16px 16px 14px' : '20px 20px 18px')};
  min-width: ${({ $compact }) => ($compact ? '150px' : '240px')};
  opacity: ${({ $isIdle }) => ($isIdle ? 0.82 : 1)};

  ${({ $isActive, $phaseColor }) =>
    $isActive &&
    `
    &::after {
      content: '';
      position: absolute;
      left: 0;
      top: 14%;
      bottom: 14%;
      width: 2.5px;
      border-radius: 3px;
      background: ${$phaseColor};
      box-shadow: 0 0 12px ${$phaseColor};
    }
  `}
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
`;

const RoomCode = styled.span`
  font-weight: 800;
  font-size: 1.12rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: 0.01em;
`;

const FlushChip = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 99px;
  padding: 2px 8px;
`;

const PhaseBadgeChip = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
  margin-bottom: 6px;
`;

const StrainName = styled.div`
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Tele = styled.div`
  display: flex;
  gap: 14px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  letter-spacing: 0.04em;
`;

const TeleItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const TeleValue = styled.span<{ $color?: string }>`
  color: ${({ $color, theme }) => $color ?? theme.colors.celeste};
  font-weight: 700;
`;
