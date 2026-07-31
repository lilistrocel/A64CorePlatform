/**
 * GrowingRoomGrid Component
 *
 * Responsive grid of GrowingRoomCard components for a facility.
 * Supports filtering by phase and shows an empty state when no rooms exist.
 */

import styled from 'styled-components';
import { Sprout } from 'lucide-react';
import { GrowingRoomCard } from './GrowingRoomCard';
import type { GrowingRoom, RoomOccupancy, RoomPhase } from '../../types/mushroom';
import { PHASE_LABELS } from '../../types/mushroom';

interface GrowingRoomGridProps {
  rooms: GrowingRoom[];
  onRoomClick?: (room: GrowingRoom) => void;
  filterPhase?: RoomPhase | null;
  compact?: boolean;
  /** Live material per roomId, from the genetics repo. */
  occupancy?: Record<string, RoomOccupancy>;
}

export function GrowingRoomGrid({
  rooms,
  onRoomClick,
  filterPhase,
  compact = false,
  occupancy,
}: GrowingRoomGridProps) {
  const filtered = filterPhase
    ? rooms.filter((r) => r.currentPhase === filterPhase)
    : rooms;

  if (filtered.length === 0) {
    return (
      <EmptyState>
        <EmptyIcon><Sprout size={40} strokeWidth={1.4} /></EmptyIcon>
        <EmptyTitle>
          {filterPhase
            ? `No rooms in ${PHASE_LABELS[filterPhase] ?? filterPhase} phase`
            : 'No rooms found'}
        </EmptyTitle>
        <EmptyText>
          {filterPhase
            ? 'Try removing the phase filter to see all rooms.'
            : 'Add rooms to this facility to start tracking your grow cycles.'}
        </EmptyText>
      </EmptyState>
    );
  }

  return (
    <Grid $compact={compact}>
      {filtered.map((room) => (
        <GrowingRoomCard
          key={room.id}
          room={room}
          onClick={onRoomClick}
          compact={compact}
          occupancy={occupancy?.[room.id]}
        />
      ))}
    </Grid>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface GridProps {
  $compact: boolean;
}

// Spec §4 room-card grid: repeat(auto-fill, minmax(240px, 1fr)), 18px gap.
// `compact` is a separate, tighter density used outside the Room Monitor
// mockup screen (dashboard summaries etc.) — kept proportionally smaller.
const Grid = styled.div<GridProps>`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(${({ $compact }) => ($compact ? '170px' : '240px')}, 1fr)
  );
  gap: ${({ $compact }) => ($compact ? '12px' : '18px')};
  padding: 4px 0;
`;

// Empty state — Fraunces italic celeste headline, one muted sentence (spec
// §4 "Empty states"). No dashed border box in the Night Observatory system.
const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
`;

const EmptyIcon = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  opacity: 0.7;
`;

const EmptyTitle = styled.h4`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.15rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 6px 0;
`;

const EmptyText = styled.p`
  font-size: 0.88rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;
