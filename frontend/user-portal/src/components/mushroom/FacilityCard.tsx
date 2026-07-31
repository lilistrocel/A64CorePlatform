/**
 * FacilityCard Component
 *
 * Summary card for a mushroom growing facility.
 * Shows name, type, room count, active rooms, and status badge.
 *
 * Night Observatory (T-901 Phase 3): full glass entity-card treatment per
 * spec §4 (§1's room/entity card pattern) — same recipe as GrowingRoomCard.
 * `FacilityStatus` isn't one of the 12 room phases, so it's extrapolated
 * onto the closest phase per spec §5.2 rather than getting its own colour
 * vocabulary.
 */

import styled from 'styled-components';
import { Factory, MapPin } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, glassPanelHover, monoLabel, phaseBadge, sheen } from '@a64core/shared';
import type { Facility, FacilityStatus, FacilityType } from '../../types/mushroom';

interface FacilityCardProps {
  facility: Facility;
  onClick?: (facility: Facility) => void;
  selected?: boolean;
}

// Extrapolated per spec §5.2 — "open/active/in progress" -> inoculated,
// "maintenance/on hold" -> maintenance (literal match), "cancelled/archived"
// -> decommissioned, and "construction" reads closest to the literal
// `preparing` room phase (a facility being made ready).
const FACILITY_STATUS_TO_PHASE: Record<FacilityStatus, PhaseKey> = {
  active: 'inoculated',
  inactive: 'decommissioned',
  maintenance: 'maintenance',
  construction: 'preparing',
};

const TYPE_LABELS: Record<FacilityType, string> = {
  indoor: 'Indoor',
  greenhouse: 'Greenhouse',
  outdoor: 'Outdoor',
  hybrid: 'Hybrid',
  container: 'Container',
  cave: 'Cave',
};

export function FacilityCard({ facility, onClick, selected = false }: FacilityCardProps) {
  const activePercent =
    facility.totalRooms > 0
      ? Math.round((facility.activeRooms / facility.totalRooms) * 100)
      : 0;
  const statusPhase = FACILITY_STATUS_TO_PHASE[facility.status];

  return (
    <CardWrapper
      $selected={selected}
      $clickable={!!onClick}
      onClick={() => onClick?.(facility)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(facility);
        }
      }}
      aria-label={`Facility: ${facility.name}`}
      aria-pressed={onClick ? selected : undefined}
    >
      <Top>
        <FacilityName>{facility.name}</FacilityName>
        <StatusBadge $phaseKey={statusPhase}>
          {facility.status.charAt(0).toUpperCase() + facility.status.slice(1)}
        </StatusBadge>
      </Top>

      <UseLine>
        <Factory size={13} strokeWidth={1.6} />
        {TYPE_LABELS[facility.facilityType]}
      </UseLine>

      {facility.location && (
        <LocationRow>
          <MapPin size={12} strokeWidth={1.6} aria-hidden="true" />
          <LocationText>{facility.location}</LocationText>
        </LocationRow>
      )}

      <StatsRow>
        <StatItem>
          <StatValue>{facility.totalRooms}</StatValue>
          <StatLabel>Total</StatLabel>
        </StatItem>
        <Divider />
        <StatItem>
          <StatValue $highlight>{facility.activeRooms}</StatValue>
          <StatLabel>Active</StatLabel>
        </StatItem>
        <Divider />
        <StatItem>
          <StatValue>{activePercent}%</StatValue>
          <StatLabel>Utilization</StatLabel>
        </StatItem>
      </StatsRow>

      <UtilizationTrack>
        <UtilizationFill $percent={activePercent} />
      </UtilizationTrack>
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS — glass entity card, spec §4 / mockup `.card` pattern
// ============================================================================

interface CardWrapperProps {
  $selected: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  ${sheen}
  overflow: hidden;
  border-radius: 18px;
  padding: 20px 20px 18px;

  ${({ $selected, theme }) =>
    $selected &&
    `
    border-color: ${theme.colors.celeste};
    box-shadow: 0 0 0 3px rgba(180, 200, 220, 0.18);
  `}
`;

const Top = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 4px;
`;

const FacilityName = styled.h3`
  font-weight: 800;
  font-size: 1.05rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: 0.01em;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
  flex-shrink: 0;
`;

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

const LocationRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 14px;
  color: ${({ theme }) => theme.colors.muted};

  svg {
    flex-shrink: 0;
  }
`;

const LocationText = styled.span`
  font-size: 0.76rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const StatItem = styled.div`
  flex: 1;
  text-align: center;
`;

interface StatValueProps {
  $highlight?: boolean;
}

const StatValue = styled.div<StatValueProps>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 1.05rem;
  font-weight: 700;
  color: ${({ $highlight, theme }) => ($highlight ? theme.colors.bright.emerald : theme.colors.textPrimary)};
  line-height: 1;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Divider = styled.div`
  width: 1px;
  height: 28px;
  background: ${({ theme }) => theme.colors.line};
`;

const UtilizationTrack = styled.div`
  height: 6px;
  border-radius: 99px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid rgba(180, 200, 220, 0.1);
  overflow: hidden;
`;

interface UtilizationFillProps {
  $percent: number;
}

const UtilizationFill = styled.div<UtilizationFillProps>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.bright.emerald},
    ${({ theme }) => theme.colors.bright.lapis}
  );
  border-radius: 99px;
  transition: width 400ms ease-in-out;
`;
