/**
 * MushroomDashboardPage
 *
 * High-level mushroom operations dashboard. Shows:
 * - Summary stat cards (facilities, rooms, active rooms, contamination alerts)
 * - Facility selector
 * - Room status grid (color-coded by phase)
 * - Recent harvests table
 * - Active contamination alerts list
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useMushroomDashboard } from '../../hooks/mushroom/useMushroomDashboard';
import { useFacilities } from '../../hooks/mushroom/useFacilityData';
import { useFacilityRooms } from '../../hooks/mushroom/useRoomData';
import { GrowingRoomGrid } from '../../components/mushroom/GrowingRoomGrid';
import { RoomDetailsModal } from '../../components/mushroom/RoomDetailsModal';
import type { GrowingRoom, RoomPhase } from '../../types/mushroom';
import { PHASE_LABELS, QUALITY_GRADE_COLORS } from '../../types/mushroom';

export function MushroomDashboardPage() {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<GrowingRoom | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<RoomPhase | null>(null);

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
      {/* Top Bar */}
      <TopBar>
        <TitleSection>
          <PageTitle>Mushroom Dashboard</PageTitle>
          <PageSubtitle>Real-time grow room monitoring and operations</PageSubtitle>
        </TitleSection>
        <TopControls>
          <RefreshBtn onClick={() => refetch()} disabled={dashLoading} title="Refresh dashboard">
            <SpinIcon $spinning={dashLoading}>&#8635;</SpinIcon>
            Refresh
          </RefreshBtn>
        </TopControls>
      </TopBar>

      {/* Summary Stat Cards */}
      <StatCardsRow>
        <StatCard $accent="#3B82F6">
          <StatIcon>🏭</StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.totalFacilities ?? '—'}</StatNumber>
            <StatLabel>Facilities</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $accent="#8B5CF6">
          <StatIcon>🏠</StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.totalRooms ?? '—'}</StatNumber>
            <StatLabel>Total Rooms</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $accent="#10B981">
          <StatIcon>🍄</StatIcon>
          <StatInfo>
            <StatNumber>{dashboardData?.activeRooms ?? '—'}</StatNumber>
            <StatLabel>Active Rooms</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $accent={activeAlerts.length > 0 ? '#EF4444' : '#9E9E9E'}>
          <StatIcon>⚠️</StatIcon>
          <StatInfo>
            <StatNumber $alert={activeAlerts.length > 0}>
              {activeAlerts.length}
            </StatNumber>
            <StatLabel>Contamination Alerts</StatLabel>
          </StatInfo>
        </StatCard>
        {dashboardData?.totalHarvestThisMonth != null && (
          <StatCard $accent="#F59E0B">
            <StatIcon>⚖️</StatIcon>
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
            Clear Filter &#10005;
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
                    <HTd>{h.roomCode ?? '—'}</HTd>
                    <HTd>
                      <strong>{h.weightKg.toFixed(2)} kg</strong>
                    </HTd>
                    <HTd>F{h.flushNumber}</HTd>
                    <HTd>
                      <GradeDot $color={QUALITY_GRADE_COLORS[h.qualityGrade]} />
                      {h.qualityGrade}
                    </HTd>
                    <HTd>
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
              <GreenCheck>&#10003;</GreenCheck> No active contaminations
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
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 24px;
  max-width: 100%;
  min-height: 100vh;
  background: #f5f5f5;
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleSection = styled.div``;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: #212121;
  margin: 0 0 4px 0;
`;

const PageSubtitle = styled.p`
  font-size: 14px;
  color: #757575;
  margin: 0;
`;

const TopControls = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

interface RefreshBtnProps {
  disabled?: boolean;
}

const RefreshBtn = styled.button<RefreshBtnProps>`
  padding: 9px 16px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 150ms;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: #1976d2;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

interface SpinIconProps {
  $spinning: boolean;
}

const SpinIcon = styled.span<SpinIconProps>`
  font-size: 16px;
  display: inline-block;
  animation: ${({ $spinning }) => ($spinning ? 'spin 1s linear infinite' : 'none')};

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const StatCardsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
`;

interface StatCardProps {
  $accent: string;
}

const StatCard = styled.div<StatCardProps>`
  background: white;
  border-radius: 12px;
  border-left: 4px solid ${({ $accent }) => $accent};
  padding: 16px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StatIcon = styled.span`
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
`;

const StatInfo = styled.div``;

interface StatNumberProps {
  $alert?: boolean;
}

const StatNumber = styled.div<StatNumberProps>`
  font-size: 24px;
  font-weight: 700;
  color: ${({ $alert }) => ($alert ? '#EF4444' : '#212121')};
  line-height: 1;
  margin-bottom: 2px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: #9e9e9e;
  font-weight: 500;
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
  gap: 4px;
`;

const ControlLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const Select = styled.select`
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  color: #212121;
  background: white;
  cursor: pointer;
  outline: none;
  min-width: 200px;
  transition: border-color 150ms;

  &:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
  }
`;

const ClearFilterBtn = styled.button`
  padding: 8px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  color: #616161;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms;
  margin-bottom: 0;
  align-self: flex-end;

  &:hover {
    background: #f5f5f5;
    color: #212121;
  }
  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const GridSection = styled.section`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
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
  font-size: 16px;
  font-weight: 600;
  color: #212121;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LoadingDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  display: inline-block;
  animation: pulse 1s infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;

const RoomCount = styled.span`
  font-size: 13px;
  color: #9e9e9e;
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
  border: 3px solid #e0e0e0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  font-size: 14px;
  color: #9e9e9e;
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
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
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
  font-size: 11px;
  font-weight: 600;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid #f0f0f0;
`;

const HTd = styled.td`
  padding: 9px 8px;
  border-bottom: 1px solid #f5f5f5;
  color: #424242;
  vertical-align: middle;
`;

interface GradeDotProps {
  $color: string;
}

const GradeDot = styled.span<GradeDotProps>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  margin-right: 5px;
  vertical-align: middle;
`;

const EmptyState = styled.div`
  font-size: 14px;
  color: #9e9e9e;
  padding: 24px;
  text-align: center;
`;

const GreenCheck = styled.span`
  color: #10B981;
  font-size: 16px;
  margin-right: 6px;
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

const ALERT_SEVERITY_BG: Record<string, string> = {
  low: '#f0fdf4',
  medium: '#fffbeb',
  high: '#fff5f5',
  critical: '#fef2f2',
};

const AlertItem = styled.div<AlertItemProps>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: ${({ $severity }) => ALERT_SEVERITY_BG[$severity] ?? '#fff5f5'};
  border-radius: 8px;
  border: 1px solid ${({ $severity }) =>
    $severity === 'critical' ? '#fecaca' : '#f0f0f0'};
`;

const AlertRoom = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #212121;
  min-width: 60px;
`;

const AlertType = styled.span`
  font-size: 12px;
  color: #616161;
  flex: 1;
  text-transform: capitalize;
`;

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7F1D1D',
};

interface AlertSeverityBadgeProps {
  $severity: string;
}

const AlertSeverityBadge = styled.span<AlertSeverityBadgeProps>`
  font-size: 10px;
  font-weight: 700;
  color: white;
  background: ${({ $severity }) => SEVERITY_BADGE_COLORS[$severity] ?? '#9e9e9e'};
  border-radius: 20px;
  padding: 2px 7px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const AlertCount = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #EF4444;
  background: #FEE2E2;
  border-radius: 20px;
  padding: 2px 8px;
`;
