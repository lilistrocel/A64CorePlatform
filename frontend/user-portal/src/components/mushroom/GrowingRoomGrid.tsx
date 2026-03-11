/**
 * GrowingRoomGrid Component
 *
 * Responsive grid of GrowingRoomCard components for a facility.
 * Supports filtering by phase and shows an empty state when no rooms exist.
 */

import styled from 'styled-components';
import { GrowingRoomCard } from './GrowingRoomCard';
import type { GrowingRoom, RoomPhase } from '../../types/mushroom';
import { PHASE_LABELS } from '../../types/mushroom';

interface GrowingRoomGridProps {
  rooms: GrowingRoom[];
  onRoomClick?: (room: GrowingRoom) => void;
  filterPhase?: RoomPhase | null;
  compact?: boolean;
}

export function GrowingRoomGrid({
  rooms,
  onRoomClick,
  filterPhase,
  compact = false,
}: GrowingRoomGridProps) {
  const filtered = filterPhase
    ? rooms.filter((r) => r.currentPhase === filterPhase)
    : rooms;

  if (filtered.length === 0) {
    return (
      <EmptyState>
        <EmptyIcon>🍄</EmptyIcon>
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

const Grid = styled.div<GridProps>`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(${({ $compact }) => ($compact ? '120px' : '170px')}, 1fr)
  );
  gap: ${({ $compact }) => ($compact ? '10px' : '16px')};
  padding: 4px 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  background: #fafafa;
  border-radius: 12px;
  border: 2px dashed #e0e0e0;
`;

const EmptyIcon = styled.div`
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.6;
`;

const EmptyTitle = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: #424242;
  margin: 0 0 6px 0;
`;

const EmptyText = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0;
`;
