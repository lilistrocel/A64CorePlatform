/**
 * MushroomDashboardPage
 *
 * High-level mushroom operations dashboard. Shows:
 * - Summary stat cards (facilities, rooms, active rooms, contamination alerts)
 * - Facility selector
 * - Room status grid (color-coded by phase)
 * - Recent harvests table
 * - Active contamination alerts list
 *
 * Night Observatory (T-901 Phase 3): PageHeader on the page root (spec §4/§8),
 * glass stat cards, phase-map-aligned severity encoding, emoji -> lucide.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import type { Theme } from '@a64core/shared';
import { PageHeader, glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { Factory, Home, Sprout, AlertTriangle, Scale, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { useMushroomDashboard } from '../../hooks/mushroom/useMushroomDashboard';
import { useFacilities } from '../../hooks/mushroom/useFacilityData';
import { useFacilityRooms } from '../../hooks/mushroom/useRoomData';
import { GrowingRoomGrid } from '../../components/mushroom/GrowingRoomGrid';
import { RoomDetailsModal } from '../../components/mushroom/RoomDetailsModal';
import { QUALITY_GRADE_HUE } from '../../components/mushroom/phaseTheme';
import type { GrowingRoom, RoomPhase } from '../../types/mushroom';
import { PHASE_LABELS } from '../../types/mushroom';

// Alert severity is a data encoding — walked as one hue's (coral, the
// "quarantined"/alert phase colour) opacity ramp rather than mixing hues
// (matches RoomDetailsModal's severity treatment). Night Observatory (T-901):
// `warning` now resolves to gold-b, reserved for the Harvesting phase, so it
// no longer stands in for "medium" alert severity.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSeverityStyle(theme: Theme, severity: string): { bg: string; border: string; text: string } {
  const coral = theme.colors.bright.coral;
  const steps: Record<string, { bg: string; border: string; text: string }> = {
    low: { bg: hexToRgba(coral, 0.12), border: hexToRgba(coral, 0.35), text: coral },
    medium: { bg: hexToRgba(coral, 0.24), border: hexToRgba(coral, 0.5), text: coral },
    high: { bg: hexToRgba(coral, 0.5), border: coral, text: theme.colors.onDark },
    critical: { bg: coral, border: coral, text: theme.colors.onDark },
  };
  return steps[severity] ?? { bg: theme.colors.glass.base, border: theme.colors.glass.border, text: theme.colors.muted };
}

export function MushroomDashboardPage() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<GrowingRoom | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<RoomPhase | null>(null);

  const theme = useTheme();
  const { data: dashboardData, isLoading: dashLoading, refetch } = useMushroomDashboard();
  const { data: facilities = [] } = useFacilities();
  const { data: rooms = [], isLoading: roomsLoading } = useFacilityRooms(
    selectedFacilityId || undefined
  );

  // Pick the first facility automatically when list loads and none is selected
  const activeFacilityId = selectedFacilityId || facilities[0]?.id || '';

  const { data: activeFacilityRooms = [], isLoading: activeFacilityRoomsLoading } =
    useFacilityRooms(activeFacilityId || undefined);

  const displayRooms = selectedFacilityId
    ? rooms
    : activeFacilityRooms;

  const isRoomsLoading = selectedFacilityId ? roomsLoading : activeFacilityRoomsLoading;

  // Build phase counts from dashboard or from current room list
  const phaseCounts: Partial<Record<RoomPhase, number>> =
    dashboardData?.roomsByPhase ?? {};

  // Active contaminations
  const activeAlerts = dashboardData?.activeContaminations ?? [];

  return (
    <Container>
      <TopBarRow>
        <HeaderFlex
          breadcrumb="Operations · Live"
          title="Mushroom Dashboard"
          emphasizeLastWord
          description="Real-time grow room monitoring and operations"
        />
        <RefreshBtn onClick={() => refetch()} disabled={dashLoading} title="Refresh dashboard">
          <RefreshCw size={15} strokeWidth={2} className={dashLoading ? 'spinning' : undefined} />
          Refresh
        </RefreshBtn>
      </TopBarRow>

      {/* Summary Stat Cards */}
      <StatCardsRow>
        <StatCard $accent={theme.colors.bright.lapis}>
          <StatIcon><Factory size={20} strokeWidth={1.6} /></StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.totalFacilities ?? '—'}</StatNumber>
            <StatLabel>Facilities</StatLabel>
          </StatInfo>
        </StatCard>
        {/* Purple is legitimate decorative variety here (bright.lavender),
            not a status — distinguishes this tile from the facilities tile
            without touching gold (reserved, spec §3). */}
        <StatCard $accent={theme.colors.bright.lavender}>
          <StatIcon><Home size={20} strokeWidth={1.6} /></StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.totalRooms ?? '—'}</StatNumber>
            <StatLabel>Total Rooms</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $accent={theme.colors.bright.emerald}>
          <StatIcon><Sprout size={20} strokeWidth={1.6} /></StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.activeRooms ?? '—'}</StatNumber>
            <StatLabel>Active Rooms</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $accent={activeAlerts.length > 0 ? theme.colors.bright.coral : theme.colors.muted}>
          <StatIcon><AlertTriangle size={20} strokeWidth={1.6} /></StatIcon>
          <StatInfo>
            <StatNumber $alert={activeAlerts.length > 0}>
              {activeAlerts.length}
            </StatNumber>
            <StatLabel>Contamination Alerts</StatLabel>
          </StatInfo>
        </StatCard>
        {dashboardData?.totalHarvestThisMonth != null && (
          <StatCard $accent={theme.colors.bright.terra}>
            <StatIcon><Scale size={20} strokeWidth={1.6} /></StatIcon>
            <StatInfo>
              <StatNumber>
                {dashboardData.totalHarvestThisMonth.toFixed(1)} kg
              </StatNumber>
              <StatLabel>Harvest This Month</StatLabel>
            </StatInfo>
          </StatCard>
        )}
      </StatCardsRow>

      {/* Facility Selector & Phase Filter */}
      <ControlsRow>
        <ControlGroup>
          <ControlLabel htmlFor="facility-select">Facility</ControlLabel>
          <Select
            id="facility-select"
            value={selectedFacilityId}
            onChange={(e) => {
              setSelectedFacilityId(e.target.value);
              setPhaseFilter(null);
            }}
            aria-label="Select facility to view rooms"
          >
            {facilities.length > 1 && (
              <option value="">All Facilities</option>
            )}
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            {facilities.length === 0 && (
              <option value="">No facilities found</option>
            )}
          </Select>
        </ControlGroup>

        <ControlGroup>
          <ControlLabel htmlFor="phase-filter">Filter by Phase</ControlLabel>
          <Select
            id="phase-filter"
            value={phaseFilter ?? ''}
            onChange={(e) => setPhaseFilter((e.target.value as RoomPhase) || null)}
            aria-label="Filter rooms by phase"
          >
            <option value="">All Phases</option>
            {Object.entries(PHASE_LABELS).map(([phase, label]) => (
              <option key={phase} value={phase}>
                {label}
                {phaseCounts[phase as RoomPhase]
                  ? ` (${phaseCounts[phase as RoomPhase]})`
                  : ''}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {phaseFilter && (
          <ClearFilterBtn onClick={() => setPhaseFilter(null)}>
            <X size={13} strokeWidth={2} /> Clear Filter
          </ClearFilterBtn>
        )}
      </ControlsRow>

      {/* Room Status Grid */}
      <GridSection>
        <SectionHeader>
          <SectionTitle>
            Room Status
            {isRoomsLoading && <LoadingDot title="Loading rooms" />}
          </SectionTitle>
          <RoomCount>
            {displayRooms.length} room{displayRooms.length !== 1 ? 's' : ''}
          </RoomCount>
        </SectionHeader>

        {isRoomsLoading ? (
          <LoadingContainer>
            <Spinner />
            <LoadingText>Loading rooms...</LoadingText>
          </LoadingContainer>
        ) : (
          <GrowingRoomGrid
            rooms={displayRooms}
            onRoomClick={setSelectedRoom}
            filterPhase={phaseFilter}
            compact
          />
        )}
      </GridSection>

      {/* Bottom Two-Column Layout */}
      <BottomRow>
        {/* Recent Harvests */}
        <BottomCard>
          <SectionTitle>Recent Harvests</SectionTitle>
          {(dashboardData?.recentHarvests?.length ?? 0) === 0 ? (
            <EmptyState>No recent harvests.</EmptyState>
          ) : (
            <HarvestTable>
              <thead>
                <tr>
                  <HTh>Room</HTh>
                  <HTh>Weight</HTh>
                  <HTh>Flush</HTh>
                  <HTh>Grade</HTh>
                  <HTh>Date</HTh>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.recentHarvests ?? []).slice(0, 10).map((h) => (
                  <tr key={h.id}>
                    <HTd $mono>{h.roomCode ?? '—'}</HTd>
                    <HTd $mono>
                      <strong>{h.weightKg.toFixed(2)} kg</strong>
                    </HTd>
                    <HTd $mono>F{h.flushNumber}</HTd>
                    <HTd>
                      <GradeDot $hue={QUALITY_GRADE_HUE[h.qualityGrade]} />
                      {h.qualityGrade}
                    </HTd>
                    <HTd $mono>
                      {new Date(h.harvestDate).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </HTd>
                  </tr>
                ))}
              </tbody>
            </HarvestTable>
          )}
        </BottomCard>

        {/* Contamination Alerts */}
        <BottomCard>
          <SectionHeader>
            <SectionTitle>Contamination Alerts</SectionTitle>
            {activeAlerts.length > 0 && (
              <AlertCount>{activeAlerts.length} active</AlertCount>
            )}
          </SectionHeader>

          {activeAlerts.length === 0 ? (
            <EmptyState>
              <GreenCheck><CheckCircle2 size={15} strokeWidth={1.8} /></GreenCheck> No active contaminations
            </EmptyState>
          ) : (
            <AlertList>
              {activeAlerts.slice(0, 8).map((alert) => (
                <AlertItem key={alert.id} $severity={alert.severity}>
                  <AlertRoom>{alert.roomCode ?? 'Unknown Room'}</AlertRoom>
                  <AlertType>
                    {alert.contaminationType.replace(/_/g, ' ')}
                  </AlertType>
                  <AlertSeverityBadge $severity={alert.severity}>
                    {alert.severity}
                  </AlertSeverityBadge>
                </AlertItem>
              ))}
            </AlertList>
          )}
        </BottomCard>
      </BottomRow>

      {/* Room Details Modal */}
      {selectedRoom && (
        <RoomDetailsModal
          isOpen={!!selectedRoom}
          room={selectedRoom}
          facilityId={selectedRoom.facilityId}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS — Night Observatory (T-901 Phase 3)
// ============================================================================

// Transparent page container — the fixed sky shows through (spec §7).
const Container = styled.div`
  padding: 34px 40px 60px;
  max-width: 100%;
`;

const TopBarRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`;

const HeaderFlex = styled(PageHeader)`
  flex: 1;
  min-width: 280px;
`;

interface RefreshBtnProps {
  disabled?: boolean;
}

const RefreshBtn = styled.button<RefreshBtnProps>`
  ${glassControl}
  padding: 9px 16px;
  border-radius: 11px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: all 150ms;
  white-space: nowrap;
  margin-top: 2px;

  svg.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const StatCardsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin: 24px 0;
`;

interface StatCardProps {
  $accent: string;
}

const StatCard = styled.div<StatCardProps>`
  ${glassPanel}
  border-left: 3px solid ${({ $accent }) => $accent};
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StatIcon = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.celeste};
`;

const StatInfo = styled.div``;

interface StatNumberProps {
  $alert?: boolean;
}

const StatNumber = styled.div<StatNumberProps>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 1.4rem;
  font-weight: 700;
  color: ${({ $alert, theme }) => ($alert ? theme.colors.error : theme.colors.textPrimary)};
  line-height: 1;
  margin-bottom: 3px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ControlLabel = styled.label`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Select = styled.select`
  ${glassControl}
  padding: 9px 12px;
  border-radius: 11px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  outline: none;
  min-width: 200px;
  transition: border-color 150ms;

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ClearFilterBtn = styled.button`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 11px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms;
  align-self: flex-end;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const GridSection = styled.section`
  ${glassPanel}
  padding: 20px;
  margin-bottom: 24px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 8px;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LoadingDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.celeste};
  display: inline-block;
  animation: pulse 1s infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;

const RoomCount = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 12px;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const BottomRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const BottomCard = styled.section`
  ${glassPanel}
  padding: 20px;
`;

const HarvestTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 10px;
`;

const HTh = styled.th`
  text-align: left;
  padding: 7px 8px;
  ${monoLabel}
  font-size: 0.58rem;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const HTd = styled.td<{ $mono?: boolean }>`
  padding: 9px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.textPrimary};
  vertical-align: middle;
  ${({ $mono, theme }) => $mono && `font-family: ${theme.typography.fontFamily.mono};`}
`;

interface GradeDotProps {
  $hue: string;
}

const GradeDot = styled.span<GradeDotProps>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]};
  box-shadow: 0 0 6px ${({ theme, $hue }) => (theme.colors.bright as Record<string, string>)[$hue]};
  margin-right: 5px;
  vertical-align: middle;
`;

const EmptyState = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  padding: 24px;
  text-align: center;
`;

const GreenCheck = styled.span`
  color: ${({ theme }) => theme.colors.success};
  display: inline-flex;
  vertical-align: middle;
  margin-right: 4px;
`;

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
`;

interface AlertItemProps {
  $severity: string;
}

const AlertItem = styled.div<AlertItemProps>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: ${({ $severity, theme }) => getSeverityStyle(theme, $severity).bg};
  border: 1px solid ${({ $severity, theme }) => getSeverityStyle(theme, $severity).border};
`;

const AlertRoom = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 60px;
`;

const AlertType = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  flex: 1;
  text-transform: capitalize;
`;

interface AlertSeverityBadgeProps {
  $severity: string;
}

const AlertSeverityBadge = styled.span<AlertSeverityBadgeProps>`
  ${monoLabel}
  font-size: 0.6rem;
  font-weight: 700;
  color: ${({ theme, $severity }) => getSeverityStyle(theme, $severity).text};
  background: transparent;
  padding: 2px 0;
  text-transform: uppercase;
`;

const AlertCount = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: 99px;
  padding: 2px 8px;
`;
