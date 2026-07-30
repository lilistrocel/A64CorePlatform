/**
 * MushroomRoomMonitor
 *
 * A dense, control-room-style grid displaying every growing room across ALL
 * facilities, color-coded by lifecycle phase.  Distinct from the regular
 * Mushroom Dashboard: the Dashboard shows summary cards and analytics; this
 * page shows every single room's status at a glance — like a SCADA wall.
 *
 * Features:
 *  - Phase legend bar (color chips for all phases)
 *  - Summary stat bar (total rooms + per-phase counts)
 *  - Filters: facility selector, phase multi-select chips, room-code search
 *  - Dense compact grid grouped by facility
 *  - Phase distribution stacked bar chart
 *
 * Colours come from the theme, not hardcoded values. This page was originally
 * built with a fixed dark palette for a "SCADA wall" look, which meant it
 * ignored the light/dark toggle entirely and sat as a dark island in light
 * mode. The dense at-a-glance layout is what makes it a monitor — the palette
 * does not need to fight the rest of the app to achieve that. Phase colours
 * (PHASE_COLORS) stay vivid and semantic in both modes.
 */

import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import styled from 'styled-components';
import { apiClient } from '../../services/api';
import { useFacilities } from '../../hooks/mushroom/useFacilityData';
import { GrowingRoomCard } from '../../components/mushroom/GrowingRoomCard';
import { RoomDetailsModal } from '../../components/mushroom/RoomDetailsModal';
import type { GrowingRoom, Facility, RoomPhase } from '../../types/mushroom';
import {
  PHASE_COLORS,
  PHASE_LABELS,
  PHASE_TEXT_COLORS,
} from '../../types/mushroom';

// ============================================================================
// ORDERED PHASES — drives the legend and distribution bar
// ============================================================================

const PHASE_ORDER: RoomPhase[] = [
  'empty',
  'preparing',
  'inoculated',
  'colonizing',
  'fruiting_initiation',
  'fruiting',
  'harvesting',
  'resting',
  'cleaning',
  'maintenance',
  'quarantined',
  'decommissioned',
];

// ============================================================================
// CUSTOM HOOK — fetch rooms for every facility in parallel via useQueries
// ============================================================================

interface FacilityRoomsResult {
  facilityId: string;
  rooms: GrowingRoom[];
  isLoading: boolean;
}

function useAllFacilityRooms(facilities: Facility[]): FacilityRoomsResult[] {
  const queries = useQueries({
    queries: facilities.map((facility) => ({
      queryKey: ['mushroom', 'facilities', facility.id, 'rooms'] as const,
      queryFn: async (): Promise<GrowingRoom[]> => {
        const { data } = await apiClient.get(
          `/v1/mushroom/facilities/${facility.id}/rooms`
        );
        return Array.isArray(data.data) ? data.data : data.data?.items ?? [];
      },
      enabled: !!facility.id,
    })),
  });

  return facilities.map((facility, index) => ({
    facilityId: facility.id,
    rooms: (queries[index]?.data as GrowingRoom[] | undefined) ?? [],
    isLoading: queries[index]?.isLoading ?? false,
  }));
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MushroomRoomMonitor() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [activePhaseFilters, setActivePhaseFilters] = useState<Set<RoomPhase>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<GrowingRoom | null>(null);

  const { data: facilities = [], isLoading: facilitiesLoading } =
    useFacilities();

  const facilityRoomsResults = useAllFacilityRooms(facilities);

  const isAnyLoading =
    facilitiesLoading ||
    facilityRoomsResults.some((r) => r.isLoading);

  // Build a map from facilityId -> rooms for easy lookup
  const roomsByFacility = useMemo(() => {
    const map = new Map<string, GrowingRoom[]>();
    for (const result of facilityRoomsResults) {
      map.set(result.facilityId, result.rooms);
    }
    return map;
  }, [facilityRoomsResults]);

  // Flat list of ALL rooms across all facilities
  const allRooms = useMemo(
    () => facilityRoomsResults.flatMap((r) => r.rooms),
    [facilityRoomsResults]
  );

  // Per-phase counts across all rooms
  const phaseCounts = useMemo(() => {
    const counts: Partial<Record<RoomPhase, number>> = {};
    for (const room of allRooms) {
      counts[room.currentPhase] = (counts[room.currentPhase] ?? 0) + 1;
    }
    return counts;
  }, [allRooms]);

  // Toggle a phase chip in the multi-select filter
  const handlePhaseToggle = (phase: RoomPhase) => {
    setActivePhaseFilters((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  // Facilities to display (all, or just the selected one)
  const visibleFacilities = useMemo(
    () =>
      selectedFacilityId
        ? facilities.filter((f) => f.id === selectedFacilityId)
        : facilities,
    [facilities, selectedFacilityId]
  );

  // Apply search and phase filters to a room list
  const filterRooms = (rooms: GrowingRoom[]): GrowingRoom[] => {
    let result = rooms;

    if (activePhaseFilters.size > 0) {
      result = result.filter((r) => activePhaseFilters.has(r.currentPhase));
    }

    const trimmed = searchQuery.trim().toLowerCase();
    if (trimmed) {
      result = result.filter(
        (r) =>
          r.roomCode.toLowerCase().includes(trimmed) ||
          (r.name ?? '').toLowerCase().includes(trimmed)
      );
    }

    return result;
  };

  // Total rooms shown after filtering (all facilities combined)
  const totalVisibleRooms = useMemo(
    () =>
      visibleFacilities.reduce((acc, f) => {
        const rooms = roomsByFacility.get(f.id) ?? [];
        return acc + filterRooms(rooms).length;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleFacilities, roomsByFacility, activePhaseFilters, searchQuery]
  );

  const hasFilters = activePhaseFilters.size > 0 || searchQuery.trim() !== '';

  return (
    <PageWrapper>
      {/* ------------------------------------------------------------------ */}
      {/* HEADER                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Header>
        <HeaderLeft>
          <PageTitle>Room Monitor</PageTitle>
          <PageSubtitle>
            Live status of all growing rooms across every facility
          </PageSubtitle>
        </HeaderLeft>

        <HeaderRight>
          {isAnyLoading && (
            <LoadingPill>
              <Spinner $small />
              Loading
            </LoadingPill>
          )}

          <StatPill>
            <StatPillNumber>{allRooms.length}</StatPillNumber>
            <StatPillLabel>Total Rooms</StatPillLabel>
          </StatPill>

          <StatPill>
            <StatPillNumber>{facilities.length}</StatPillNumber>
            <StatPillLabel>Facilities</StatPillLabel>
          </StatPill>
        </HeaderRight>
      </Header>

      {/* ------------------------------------------------------------------ */}
      {/* PHASE LEGEND                                                        */}
      {/* ------------------------------------------------------------------ */}
      <LegendBar role="list" aria-label="Phase legend">
        {PHASE_ORDER.map((phase) => {
          const count = phaseCounts[phase] ?? 0;
          return (
            <LegendChip
              key={phase}
              $bg={PHASE_COLORS[phase]}
              $text={PHASE_TEXT_COLORS[phase]}
              role="listitem"
              title={`${PHASE_LABELS[phase]}: ${count} room${count !== 1 ? 's' : ''}`}
            >
              {PHASE_LABELS[phase]}
              {count > 0 && <LegendCount>{count}</LegendCount>}
            </LegendChip>
          );
        })}
      </LegendBar>

      {/* ------------------------------------------------------------------ */}
      {/* PHASE DISTRIBUTION STACKED BAR                                     */}
      {/* ------------------------------------------------------------------ */}
      {allRooms.length > 0 && (
        <DistributionSection aria-label="Phase distribution">
          <DistributionLabel>Phase Distribution</DistributionLabel>
          <DistributionBar>
            {PHASE_ORDER.filter((p) => (phaseCounts[p] ?? 0) > 0).map(
              (phase) => {
                const count = phaseCounts[phase] ?? 0;
                const pct = (count / allRooms.length) * 100;
                return (
                  <DistributionSegment
                    key={phase}
                    $color={PHASE_COLORS[phase]}
                    $pct={pct}
                    title={`${PHASE_LABELS[phase]}: ${count} (${pct.toFixed(1)}%)`}
                    aria-label={`${PHASE_LABELS[phase]} ${pct.toFixed(1)} percent`}
                  />
                );
              }
            )}
          </DistributionBar>
        </DistributionSection>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FILTERS BAR                                                         */}
      {/* ------------------------------------------------------------------ */}
      <FiltersBar>
        {/* Facility selector */}
        <FilterGroup>
          <FilterLabel htmlFor="monitor-facility-select">Facility</FilterLabel>
          <FilterSelect
            id="monitor-facility-select"
            value={selectedFacilityId}
            onChange={(e) => setSelectedFacilityId(e.target.value)}
            aria-label="Filter by facility"
          >
            <option value="">All Facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </FilterSelect>
        </FilterGroup>

        {/* Room code search */}
        <FilterGroup>
          <FilterLabel htmlFor="monitor-room-search">Room Code</FilterLabel>
          <FilterInput
            id="monitor-room-search"
            type="search"
            placeholder="Search room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search by room code or name"
          />
        </FilterGroup>

        {/* Phase multi-select chips */}
        <FilterGroup $grow>
          <FilterLabel>Filter by Phase</FilterLabel>
          <PhaseChipRow role="group" aria-label="Phase filter chips">
            {PHASE_ORDER.map((phase) => {
              const active = activePhaseFilters.has(phase);
              const count = phaseCounts[phase] ?? 0;
              return (
                <PhaseFilterChip
                  key={phase}
                  $bg={PHASE_COLORS[phase]}
                  $text={PHASE_TEXT_COLORS[phase]}
                  $active={active}
                  onClick={() => handlePhaseToggle(phase)}
                  aria-pressed={active}
                  title={`${PHASE_LABELS[phase]} (${count} rooms)`}
                >
                  {PHASE_LABELS[phase]}
                  {count > 0 && (
                    <PhaseChipCount $active={active}>{count}</PhaseChipCount>
                  )}
                </PhaseFilterChip>
              );
            })}
          </PhaseChipRow>
        </FilterGroup>

        {/* Clear filters */}
        {hasFilters && (
          <ClearBtn
            onClick={() => {
              setActivePhaseFilters(new Set());
              setSearchQuery('');
            }}
            aria-label="Clear all filters"
          >
            Clear filters
          </ClearBtn>
        )}
      </FiltersBar>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN GRID — grouped by facility                                     */}
      {/* ------------------------------------------------------------------ */}
      <GridArea>
        {facilitiesLoading && (
          <LoadingOverlay>
            <Spinner />
            <LoadingMsg>Loading facilities...</LoadingMsg>
          </LoadingOverlay>
        )}

        {!facilitiesLoading && facilities.length === 0 && (
          <EmptyPage>
            <EmptyPageTitle>No facilities found</EmptyPageTitle>
            <EmptyPageText>
              Create a facility and add rooms to start monitoring.
            </EmptyPageText>
          </EmptyPage>
        )}

        {visibleFacilities.map((facility) => {
          const raw = roomsByFacility.get(facility.id) ?? [];
          const filtered = filterRooms(raw);
          const facilityResult = facilityRoomsResults.find(
            (r) => r.facilityId === facility.id
          );
          const loading = facilityResult?.isLoading ?? false;

          return (
            <FacilitySection key={facility.id}>
              <FacilityHeader>
                <FacilityMeta>
                  <FacilityName>{facility.name}</FacilityName>
                  {facility.location && (
                    <FacilityLocation>{facility.location}</FacilityLocation>
                  )}
                </FacilityMeta>
                <FacilityRoomCount>
                  {loading ? (
                    <Spinner $small />
                  ) : (
                    <>
                      {filtered.length}
                      {hasFilters && raw.length !== filtered.length && (
                        <TotalRoomHint>/{raw.length}</TotalRoomHint>
                      )}{' '}
                      room{filtered.length !== 1 ? 's' : ''}
                    </>
                  )}
                </FacilityRoomCount>
              </FacilityHeader>

              {loading ? (
                <FacilityLoadingRow>
                  <Spinner $small />
                  <span>Loading rooms...</span>
                </FacilityLoadingRow>
              ) : filtered.length === 0 ? (
                <FacilityEmptyMsg>
                  {hasFilters
                    ? 'No rooms match the current filters in this facility.'
                    : 'No rooms have been added to this facility yet.'}
                </FacilityEmptyMsg>
              ) : (
                <CompactGrid>
                  {filtered.map((room) => (
                    <GrowingRoomCard
                      key={room.id}
                      room={room}
                      compact
                      onClick={setSelectedRoom}
                    />
                  ))}
                </CompactGrid>
              )}
            </FacilitySection>
          );
        })}

        {/* No results across all facilities */}
        {!facilitiesLoading &&
          facilities.length > 0 &&
          totalVisibleRooms === 0 &&
          hasFilters && (
            <EmptyPage>
              <EmptyPageTitle>No rooms match your filters</EmptyPageTitle>
              <EmptyPageText>
                Adjust the phase filter, search query, or facility selection.
              </EmptyPageText>
            </EmptyPage>
          )}
      </GridArea>

      {/* ------------------------------------------------------------------ */}
      {/* ROOM DETAILS MODAL                                                  */}
      {/* ------------------------------------------------------------------ */}
      {selectedRoom && (
        <RoomDetailsModal
          isOpen={!!selectedRoom}
          room={selectedRoom}
          facilityId={selectedRoom.facilityId}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </PageWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// All custom props follow the transient $ prefix pattern per UI-Standards.md
// ============================================================================

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface};
  padding: 0;
`;

// ---- Header ----------------------------------------------------------------

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div``;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
  letter-spacing: -0.3px;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const StatPill = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 10px;
  padding: 8px 16px;
  min-width: 80px;
`;

const StatPillNumber = styled.span`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1;
`;

const StatPillLabel = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
`;

const LoadingPill = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 10px;
  padding: 8px 12px;
`;

// ---- Phase Legend ----------------------------------------------------------

const LegendBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 24px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

interface LegendChipProps {
  $bg: string;
  $text: string;
}

const LegendChip = styled.span<LegendChipProps>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $bg }) => $bg};
  color: ${({ $text }) => $text};
  border-radius: 20px;
  padding: 3px 9px;
  letter-spacing: 0.2px;
`;

const LegendCount = styled.span`
  font-size: 10px;
  font-weight: 700;
  opacity: 0.9;
`;

// ---- Phase Distribution Bar -----------------------------------------------

const DistributionSection = styled.div`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DistributionLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
`;

const DistributionBar = styled.div`
  display: flex;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
  background: ${({ theme }) => theme.colors.surface};
`;

interface DistributionSegmentProps {
  $color: string;
  $pct: number;
}

const DistributionSegment = styled.div<DistributionSegmentProps>`
  background: ${({ $color }) => $color};
  width: ${({ $pct }) => $pct}%;
  transition: width 300ms ease-in-out;
  min-width: ${({ $pct }) => ($pct > 0 ? '4px' : '0')};
`;

// ---- Filters Bar -----------------------------------------------------------

const FiltersBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 12px 24px;
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-wrap: wrap;
`;

interface FilterGroupProps {
  $grow?: boolean;
}

const FilterGroup = styled.div<FilterGroupProps>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: ${({ $grow }) => ($grow ? 1 : 'none')};
  min-width: 0;
`;

const FilterLabel = styled.label`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const FilterSelect = styled.select`
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  cursor: pointer;
  outline: none;
  min-width: 180px;
  transition: border-color 150ms;

  option {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 2px ${theme.colors.primary[500]}40`};
  }
`;

const FilterInput = styled.input`
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  outline: none;
  min-width: 160px;
  transition: border-color 150ms;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 2px ${theme.colors.primary[500]}40`};
  }
`;

const PhaseChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

interface PhaseFilterChipProps {
  $bg: string;
  $text: string;
  $active: boolean;
}

const PhaseFilterChip = styled.button<PhaseFilterChipProps>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  padding: 4px 10px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 150ms ease-in-out;
  letter-spacing: 0.2px;

  background: ${({ $active, $bg }) => ($active ? $bg : 'transparent')};
  color: ${({ $active, $bg, $text }) =>
    $active ? $text : $bg};
  border-color: ${({ $bg }) => $bg};
  opacity: ${({ $active }) => ($active ? 1 : 0.6)};

  &:hover {
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

interface PhaseChipCountProps {
  $active: boolean;
}

const PhaseChipCount = styled.span<PhaseChipCountProps>`
  font-size: 10px;
  font-weight: 700;
`;

const ClearBtn = styled.button`
  padding: 7px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  align-self: flex-end;
  transition: all 150ms;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// ---- Main Grid Area --------------------------------------------------------

const GridArea = styled.main`
  flex: 1;
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const FacilitySection = styled.section`
  /* no background — stays in the dark page context */
`;

const FacilityHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const FacilityMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`;

const FacilityName = styled.h2`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.6px;
`;

const FacilityLocation = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const FacilityRoomCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`;

const TotalRoomHint = styled.span`
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const CompactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
`;

const FacilityLoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textDisabled};
  padding: 16px 0;
`;

const FacilityEmptyMsg = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0;
  padding: 16px 0;
  font-style: italic;
`;

// ---- Full-page states ------------------------------------------------------

const LoadingOverlay = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 24px;
`;

const LoadingMsg = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0;
`;

const EmptyPage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
`;

const EmptyPageTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0 0 8px 0;
`;

const EmptyPageText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0;
`;

// ---- Spinner ----------------------------------------------------------------

interface SpinnerProps {
  $small?: boolean;
}

const Spinner = styled.div<SpinnerProps>`
  width: ${({ $small }) => ($small ? '16px' : '36px')};
  height: ${({ $small }) => ($small ? '16px' : '36px')};
  border: ${({ $small }) => ($small ? '2px' : '3px')} solid ${({ theme }) => theme.colors.neutral[200]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: spinAnim 0.9s linear infinite;

  @keyframes spinAnim {
    to {
      transform: rotate(360deg);
    }
  }
`;
