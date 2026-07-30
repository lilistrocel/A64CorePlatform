/**
 * FacilityCard Component
 *
 * Summary card for a mushroom growing facility.
 * Shows name, type, room count, active rooms, and status badge.
 */

import styled, { useTheme } from 'styled-components';
import type { Theme } from '@a64core/shared';
import type { Facility, FacilityStatus, FacilityType } from '../../types/mushroom';

interface FacilityCardProps {
  facility: Facility;
  onClick?: (facility: Facility) => void;
  selected?: boolean;
}

function getStatusColors(theme: Theme): Record<FacilityStatus, string> {
  return {
    active: theme.colors.success,
    inactive: theme.colors.neutral[500],
    maintenance: theme.colors.warning,
    construction: theme.colors.info,
  };
}

function getStatusBg(theme: Theme): Record<FacilityStatus, string> {
  return {
    active: theme.colors.successBg,
    inactive: theme.colors.neutral[100],
    maintenance: theme.colors.warningBg,
    construction: theme.colors.infoBg,
  };
}

const TYPE_LABELS: Record<FacilityType, string> = {
  indoor: 'Indoor',
  greenhouse: 'Greenhouse',
  outdoor: 'Outdoor',
  hybrid: 'Hybrid',
  container: 'Container',
  cave: 'Cave',
};

export function FacilityCard({ facility, onClick, selected = false }: FacilityCardProps) {
  const theme = useTheme();
  const statusColors = getStatusColors(theme);
  const statusBg = getStatusBg(theme);
  const activePercent =
    facility.totalRooms > 0
      ? Math.round((facility.activeRooms / facility.totalRooms) * 100)
      : 0;

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
      <CardHeader>
        <FacilityIcon>🏭</FacilityIcon>
        <HeaderInfo>
          <FacilityName>{facility.name}</FacilityName>
          <FacilityType>{TYPE_LABELS[facility.facilityType]}</FacilityType>
        </HeaderInfo>
        <StatusBadge
          $color={statusColors[facility.status]}
          $bg={statusBg[facility.status]}
        >
          {facility.status.charAt(0).toUpperCase() + facility.status.slice(1)}
        </StatusBadge>
      </CardHeader>

      {facility.location && (
        <LocationRow>
          <LocationIcon aria-hidden="true">📍</LocationIcon>
          <LocationText>{facility.location}</LocationText>
        </LocationRow>
      )}

      <StatsRow>
        <StatItem>
          <StatValue>{facility.totalRooms}</StatValue>
          <StatLabel>Total Rooms</StatLabel>
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

      {/* Utilization bar */}
      <UtilizationTrack>
        <UtilizationFill $percent={activePercent} />
      </UtilizationTrack>
    </CardWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface CardWrapperProps {
  $selected: boolean;
  $clickable: boolean;
}

const CardWrapper = styled.div<CardWrapperProps>`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  border: 2px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary[500] : theme.colors.neutral[300])};
  padding: 16px;
  box-shadow: ${({ $selected, theme }) =>
    $selected
      ? `0 0 0 3px ${theme.colors.primary[500]}2e`
      : '0 2px 6px rgba(0,0,0,0.07)'};
  transition: all 150ms ease-in-out;

  ${({ $clickable, theme }) =>
    $clickable &&
    `
    cursor: pointer;
    &:hover {
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
      transform: translateY(-1px);
    }
    &:focus-visible {
      outline: 2px solid ${theme.colors.primary[500]};
      outline-offset: 2px;
    }
  `}
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
`;

const FacilityIcon = styled.span`
  font-size: 24px;
  line-height: 1;
  margin-top: 2px;
`;

const HeaderInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FacilityName = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FacilityType = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface StatusBadgeProps {
  $color: string;
  $bg: string;
}

const StatusBadge = styled.span<StatusBadgeProps>`
  font-size: 11px;
  font-weight: 600;
  color: ${({ $color }) => $color};
  background: ${({ $bg }) => $bg};
  border-radius: 20px;
  padding: 3px 9px;
  white-space: nowrap;
`;

const LocationRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
`;

const LocationIcon = styled.span`
  font-size: 12px;
`;

const LocationText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const StatItem = styled.div`
  flex: 1;
  text-align: center;
`;

interface StatValueProps {
  $highlight?: boolean;
}

const StatValue = styled.div<StatValueProps>`
  font-size: 18px;
  font-weight: 700;
  color: ${({ $highlight, theme }) => ($highlight ? theme.colors.success : theme.colors.textPrimary)};
  line-height: 1;
  margin-bottom: 2px;
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const Divider = styled.div`
  width: 1px;
  height: 28px;
  background: ${({ theme }) => theme.colors.neutral[300]};
`;

const UtilizationTrack = styled.div`
  height: 4px;
  background: ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  overflow: hidden;
`;

interface UtilizationFillProps {
  $percent: number;
}

const UtilizationFill = styled.div<UtilizationFillProps>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: ${({ theme }) => `linear-gradient(90deg, ${theme.colors.success}, ${theme.colors.info})`};
  border-radius: 4px;
  transition: width 400ms ease-in-out;
`;
