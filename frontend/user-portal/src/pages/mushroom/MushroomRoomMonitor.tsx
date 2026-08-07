/**
 * MushroomRoomMonitor
 *
 * A dense, control-room-style grid displaying every growing room across ALL
 * facilities, color-coded by lifecycle phase.  Distinct from the regular
 * Mushroom Dashboard: the Dashboard shows summary cards and analytics; this
 * page shows every single room's status at a glance — like a SCADA wall.
 *
 * Night Observatory (T-901, spec §4/§5): this is the shard's own subject
 * matter — the visual ground truth mockup
 * (Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html) literally
 * renders this screen. PageHeader, the phase-distribution bar, the phase
 * filter pills, and the facility group headers below all reproduce that
 * mockup section-for-section (l.111-369).
 *
 * Features:
 *  - Summary stat bar (total rooms + per-phase counts) — PageHeader stats
 *  - Phase distribution stacked bar chart
 *  - Filters: facility selector, phase multi-select pills, room-code search
 *  - Dense glass-card grid grouped by facility
 */

import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import styled from 'styled-components';
import { PageHeader, monoLabel, glassPanel, glassControl, type PageHeaderStat } from '@a64core/shared';
import { apiClient } from '../../services/api';
import { useFacilities } from '../../hooks/mushroom/useFacilityData';
import { useRoomOccupancy } from '../../hooks/genetics/useGenetics';
import { GrowingRoomCard } from '../../components/mushroom/GrowingRoomCard';
import { RoomDetailsModal } from '../../components/mushroom/RoomDetailsModal';
import type { GrowingRoom, Facility, RoomPhase } from '../../types/mushroom';
import { PHASE_LABELS, ROOM_PHASE_TO_PHASE_KEY } from '../../types/mushroom';

// ============================================================================
// ORDERED PHASES — drives the pills and distribution bar (spec §5.1 order)
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

/** `#rrggbb` -> `rgba(r, g, b, alpha)` — same technique as mixins.ts
 * `hexToRgba` (not exported), needed here for the pill's active-state tint
 * which uses different percentages (14%/30%) than the `phaseBadge` mixin's
 * badge tint (16%/45%), per mockup `.pill.on` (l.175) vs `.card .phase`
 * (l.217-218). */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

  // What is physically held in every room, across every facility, in one
  // request — this page (unlike MushroomFacilityManager, which is scoped to
  // one facility at a time) groups rooms across all of them, so it calls the
  // hook with no facility argument rather than once per facility in a loop.
  const { data: roomOccupancy } = useRoomOccupancy();

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

  // "In cycle" — rooms with an actual crop process running (PageHeader's
  // third stat, mockup l.295: emerald "alive" numeral).
  const inCycleCount = useMemo(
    () =>
      allRooms.filter(
        (r) => r.currentPhase !== 'empty' && r.currentPhase !== 'decommissioned'
      ).length,
    [allRooms]
  );

  const headerStats: PageHeaderStat[] = [
    { value: allRooms.length, label: 'Total rooms' },
    { value: facilities.length, label: 'Facilities' },
    { value: inCycleCount, label: 'In cycle', alive: true },
  ];

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

  // Present phases, in spec order, for the distribution bar + its summary text
  const presentPhases = PHASE_ORDER.filter((p) => (phaseCounts[p] ?? 0) > 0);
  const distributionSummary = presentPhases
    .map((p) => `${phaseCounts[p]} ${(PHASE_LABELS[p] ?? p).toLowerCase()}`)
    .join(' · ');

  return (
    <PageWrapper>
      <PageHeader
        breadcrumb="Operations · Live"
        title="Room Monitor"
        emphasizeLastWord
        description="Live status of all growing rooms across every facility"
        stats={headerStats}
      />

      {isAnyLoading && <LoadingNote>Loading…</LoadingNote>}

      {/* ------------------------------------------------------------------ */}
      {/* PHASE DISTRIBUTION STACKED BAR — mockup `.distro` (l.130-138)       */}
      {/* ------------------------------------------------------------------ */}
      {allRooms.length > 0 && (
        <DistributionSection aria-label="Phase distribution">
          <DistributionLabelRow>
            <DistributionTitle>Phase distribution</DistributionTitle>
            <DistributionValue>{distributionSummary}</DistributionValue>
          </DistributionLabelRow>
          <DistributionBar>
            {presentPhases.map((phase) => {
              const count = phaseCounts[phase] ?? 0;
              const pct = (count / allRooms.length) * 100;
              return (
                <DistributionSegment
                  key={phase}
                  $phaseKey={ROOM_PHASE_TO_PHASE_KEY[phase]}
                  $pct={pct}
                  title={`${PHASE_LABELS[phase]}: ${count} (${pct.toFixed(1)}%)`}
                  aria-label={`${PHASE_LABELS[phase]} ${pct.toFixed(1)} percent`}
                />
              );
            })}
          </DistributionBar>
        </DistributionSection>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FILTERS BAR — mockup `.controls` (l.140-154)                       */}
      {/* ------------------------------------------------------------------ */}
      <FiltersBar>
        <FilterGroup>
          <FilterLabel htmlFor="monitor-facility-select">Facility</FilterLabel>
          <FilterSelect
            id="monitor-facility-select"
            value={selectedFacilityId}
            onChange={(e) => setSelectedFacilityId(e.target.value)}
            aria-label="Filter by facility"
          >
            <option value="">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </FilterSelect>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel htmlFor="monitor-room-search">Room code</FilterLabel>
          <FilterInput
            id="monitor-room-search"
            type="search"
            placeholder="Search room…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search by room code or name"
          />
        </FilterGroup>

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
      {/* PHASE FILTER PILLS — mockup `.pills` (l.156-175); doubles as the   */}
      {/* phase legend (dot + label + count), same pattern as the mockup —   */}
      {/* no separate static legend bar.                                     */}
      {/* ------------------------------------------------------------------ */}
      <Pills role="group" aria-label="Phase filter">
        {PHASE_ORDER.map((phase) => {
          const active = activePhaseFilters.has(phase);
          const count = phaseCounts[phase] ?? 0;
          return (
            <Pill
              key={phase}
              type="button"
              $phaseKey={ROOM_PHASE_TO_PHASE_KEY[phase]}
              $active={active}
              onClick={() => handlePhaseToggle(phase)}
              aria-pressed={active}
            >
              <PillDot />
              {PHASE_LABELS[phase]}
              {count > 0 && <PillCount>{count}</PillCount>}
            </Pill>
          );
        })}
      </Pills>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN GRID — grouped by facility, mockup `.group`/`.cards`           */}
      {/* (l.177-184, 328-356)                                                */}
      {/* ------------------------------------------------------------------ */}
      <GridArea>
        {facilitiesLoading && (
          <LoadingOverlay>
            <Spinner />
            <LoadingMsg>Loading facilities…</LoadingMsg>
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
            <FacilityGroup key={facility.id}>
              <GroupHeader>
                <GroupTitle>{facility.name.toUpperCase()}</GroupTitle>
                {facility.location && <GroupSub>{facility.location}</GroupSub>}
                <GroupCount>
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
                </GroupCount>
              </GroupHeader>

              {loading ? (
                <FacilityLoadingRow>
                  <Spinner $small />
                  <span>Loading rooms…</span>
                </FacilityLoadingRow>
              ) : filtered.length === 0 ? (
                <FacilityEmptyMsg>
                  {hasFilters
                    ? 'No rooms match the current filters in this facility.'
                    : 'No rooms have been added to this facility yet.'}
                </FacilityEmptyMsg>
              ) : (
                <Cards>
                  {filtered.map((room) => (
                    <GrowingRoomCard
                      key={room.id}
                      room={room}
                      onClick={setSelectedRoom}
                      occupancy={roomOccupancy?.[room.id]}
                    />
                  ))}
                </Cards>
              )}
            </FacilityGroup>
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
// Night Observatory (T-901 Phase 3) — visual ground truth: mockup l.111-369.
// All custom props follow the transient $ prefix pattern.
// ============================================================================

// Transparent page container — the fixed sky (mounted once at the app shell)
// shows through every page; no opaque background here (spec §7). Padding
// matches MushroomFacilityManager's Container (both live under the same
// Operations section) — this page was previously missing it entirely.
const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 34px 40px 60px;
  max-width: 100%;
`;

const LoadingNote = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin: -14px 0 18px;
`;

// ---- Phase Distribution Bar — mockup `.distro` (l.130-138) -----------------

const DistributionSection = styled.div`
  ${glassPanel}
  margin-bottom: 24px;
  padding: 16px 20px;
  border-radius: 16px;
`;

const DistributionLabelRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  gap: 12px;
`;

const DistributionTitle = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const DistributionValue = styled.span`
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
  text-align: right;
`;

const DistributionBar = styled.div`
  display: flex;
  height: 10px;
  border-radius: 99px;
  overflow: hidden;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid rgba(180, 200, 220, 0.1);
`;

const DistributionSegment = styled.div<{ $phaseKey: string; $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  min-width: ${({ $pct }) => ($pct > 0 ? '4px' : '0')};
  transition: width 300ms ease-in-out;
  background: ${({ theme, $phaseKey }) =>
    (theme.colors.phase as Record<string, string>)[$phaseKey]};
  box-shadow: 0 0 10px
    ${({ theme, $phaseKey }) => (theme.colors.phase as Record<string, string>)[$phaseKey]}80;
`;

// ---- Filters Bar — mockup `.controls`/`.field` (l.140-154) -----------------

const FiltersBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 18px;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FilterLabel = styled.label`
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const fieldStyles = `
  border-radius: 11px;
  padding: 10px 14px;
  font-size: 0.86rem;
  font-weight: 600;
  outline: none;
`;

const FilterSelect = styled.select`
  ${glassControl}
  ${fieldStyles}
  appearance: none;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 190px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23B4C8DC' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 38px;

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FilterInput = styled.input`
  ${glassControl}
  ${fieldStyles}
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 230px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    font-weight: 400;
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ClearBtn = styled.button`
  ${glassControl}
  padding: 10px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  align-self: center;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.glass.border};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

// ---- Phase filter pills — mockup `.pills`/`.pill` (l.156-175) --------------

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 34px;
`;

const Pill = styled.button<{ $phaseKey: string; $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 6px 13px;
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.18s ease;
  background: ${({ theme, $active, $phaseKey }) =>
    $active
      ? hexToRgba((theme.colors.phase as Record<string, string>)[$phaseKey], 0.14)
      : 'rgba(23, 29, 64, 0.35)'};
  border: 1px solid
    ${({ theme, $active, $phaseKey }) =>
      $active ? (theme.colors.phase as Record<string, string>)[$phaseKey] : theme.colors.line};
  color: ${({ theme, $active }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: ${({ theme, $active, $phaseKey }) =>
    $active
      ? `0 0 18px ${hexToRgba((theme.colors.phase as Record<string, string>)[$phaseKey], 0.3)}`
      : 'none'};

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const PillDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
`;

const PillCount = styled.small`
  font-weight: 400;
  opacity: 0.75;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.62rem;
`;

// ---- Facility groups — mockup `.group`/`.group-h` (l.177-184) --------------

const GridArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const FacilityGroup = styled.section`
  margin-bottom: 12px;
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 64px;
    height: 1px;
    background: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 8px rgba(220, 185, 79, 0.6);
  }
`;

const GroupTitle = styled.h2`
  font-size: 1.05rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: 0.03em;
`;

const GroupSub = styled.span`
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const GroupCount = styled.span`
  margin-left: auto;
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
`;

const TotalRoomHint = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
`;

const FacilityLoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.muted};
  padding: 16px 0;
`;

const FacilityEmptyMsg = styled.p`
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  padding: 16px 0;
`;

// ---- Full-page states — spec §4 "Empty states" ------------------------------

const LoadingOverlay = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 24px;
`;

const LoadingMsg = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
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
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px 0;
`;

const EmptyPageText = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

// ---- Spinner ----------------------------------------------------------------

const Spinner = styled.div<{ $small?: boolean }>`
  width: ${({ $small }) => ($small ? '16px' : '36px')};
  height: ${({ $small }) => ($small ? '16px' : '36px')};
  border: ${({ $small }) => ($small ? '2px' : '3px')} solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  border-radius: 50%;
  animation: spinAnim 0.9s linear infinite;

  @keyframes spinAnim {
    to {
      transform: rotate(360deg);
    }
  }
`;
