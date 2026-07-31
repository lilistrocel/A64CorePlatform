/**
 * LogisticsDashboardPage Component
 *
 * Overview dashboard with fleet statistics and shipment tracking.
 *
 * Night Observatory (T-901 Phase 3): PageHeader for the title block, plain
 * glass stat tiles (no chart library here — spec §4 "Charts" doesn't apply).
 * Per-stat numeral colours route through the same phase vocabulary as the
 * rest of the logistics module (`VEHICLE_STATUS_TO_PHASE` /
 * `SHIPMENT_STATUS_TO_PHASE`, matching VehicleCard/Table and
 * ShipmentCard/Table) rather than the old ad hoc `theme.colors.warning`/
 * `primary[500]` picks — two of those picks (Maintenance, Scheduled/In
 * Transit) previously landed on the wrong colour for their phase meaning;
 * see the inline notes below. Quick-action buttons are Secondary (glass),
 * not gold — three simultaneous nav shortcuts of equal weight would blow
 * the gold budget if all three were Primary.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import type { PhaseKey } from '@a64core/shared';
import { PageHeader, Button, glassPanel, monoLabel } from '@a64core/shared';
import { logisticsApi } from '../../services/logisticsService';
import { formatNumber } from '../../utils/formatNumber';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import type { LogisticsDashboardStats, ShipmentStatus, VehicleStatus } from '../../types/logistics';

// Same phase maps as VehicleCard.tsx / VehicleTable.tsx and
// ShipmentCard.tsx / ShipmentTable.tsx (spec §5.2) — duplicated here rather
// than shared per the shard brief; kept literal-identical for consistency.
const VEHICLE_STATUS_TO_PHASE: Record<VehicleStatus, PhaseKey> = {
  available: 'fruiting',
  in_use: 'inoculated',
  maintenance: 'maintenance',
  retired: 'decommissioned',
};

const SHIPMENT_STATUS_TO_PHASE: Record<ShipmentStatus, PhaseKey> = {
  scheduled: 'fruitingInit',
  in_transit: 'inoculated',
  delivered: 'fruiting',
  cancelled: 'decommissioned',
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  ${glassPanel}
  padding: 20px 22px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 10px;
`;

const StatValue = styled.div<{ $phaseKey?: PhaseKey }>`
  font-size: 32px;
  font-weight: 800;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme, $phaseKey }) => ($phaseKey ? theme.colors.phase[$phaseKey] : theme.colors.textPrimary)};
`;

const WidgetsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Widget = styled.div`
  ${glassPanel}
  padding: 22px 24px;
`;

const WidgetTitle = styled.h3`
  ${monoLabel}
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 16px 0;
`;

const ShipmentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ShipmentItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.05);
    border-color: rgba(180, 200, 220, 0.3);
  }
`;

const ShipmentCode = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const ShipmentDate = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  ${monoLabel}
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function LogisticsDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<LogisticsDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the global farming year from sidebar
  const { selectedYear } = useFarmingYearStore();

  // Load dashboard stats when farming year changes
  useEffect(() => {
    loadDashboardStats();
  }, [selectedYear]);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await logisticsApi.getDashboardStats({
        farmingYear: selectedYear ?? undefined,
      });
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load dashboard stats:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading dashboard...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Container>
      <PageHeader
        breadcrumb="Logistics · Live"
        title="Logistics Management"
        emphasizeLastWord
        description={`Fleet and shipment tracking overview${selectedYear !== null ? ' — filtered by farming year' : ''}.`}
        stats={[
          { value: formatNumber(stats.totalVehicles), label: 'Vehicles' },
          { value: formatNumber(stats.totalShipments), label: 'Shipments' },
          ...(selectedYear !== null ? [{ value: selectedYear, label: 'Farming Year' }] : []),
        ]}
      />

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Vehicles</StatLabel>
          <StatValue>{formatNumber(stats.totalVehicles)}</StatValue>
        </StatCard>

        {/* phase.fruiting (bright.emerald) — matches VehicleCard/Table's
            VEHICLE_STATUS_TO_PHASE.available. */}
        <StatCard>
          <StatLabel>Available</StatLabel>
          <StatValue $phaseKey={VEHICLE_STATUS_TO_PHASE.available}>
            {formatNumber(stats.availableVehicles)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>In Use</StatLabel>
          <StatValue $phaseKey={VEHICLE_STATUS_TO_PHASE.in_use}>{formatNumber(stats.inUseVehicles)}</StatValue>
        </StatCard>

        {/* phase.maintenance (rose-b #EDD1BE) — was `theme.colors.warning`
            (gold-b) before this reskin, which reads as a status gold and
            collides with spec §3 ("gold is not a status colour except
            Harvesting"). Corrected to match VehicleCard/Table. */}
        <StatCard>
          <StatLabel>Maintenance</StatLabel>
          <StatValue $phaseKey={VEHICLE_STATUS_TO_PHASE.maintenance}>{formatNumber(stats.maintenanceVehicles)}</StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Shipments</StatLabel>
          <StatValue>{formatNumber(stats.totalShipments)}</StatValue>
        </StatCard>

        {/* phase.fruitingInit (terra-b) — was `primary[500]` (lapis) before
            this reskin; corrected to match ShipmentCard/Table's
            SHIPMENT_STATUS_TO_PHASE.scheduled. */}
        <StatCard>
          <StatLabel>Scheduled</StatLabel>
          <StatValue $phaseKey={SHIPMENT_STATUS_TO_PHASE.scheduled}>{formatNumber(stats.scheduledShipments)}</StatValue>
        </StatCard>

        {/* phase.inoculated (lapis-b) — was `theme.colors.warning` (gold-b)
            before this reskin, same gold-discipline collision as
            Maintenance above; corrected to match
            SHIPMENT_STATUS_TO_PHASE.in_transit. */}
        <StatCard>
          <StatLabel>In Transit</StatLabel>
          <StatValue $phaseKey={SHIPMENT_STATUS_TO_PHASE.in_transit}>{formatNumber(stats.inTransitShipments)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Delivered</StatLabel>
          <StatValue $phaseKey={SHIPMENT_STATUS_TO_PHASE.delivered}>{formatNumber(stats.deliveredShipments)}</StatValue>
        </StatCard>
      </StatsGrid>

      <WidgetsRow>
        <Widget>
          <WidgetTitle>Recent Shipments</WidgetTitle>
          {stats.recentShipments && stats.recentShipments.length > 0 ? (
            <ShipmentList>
              {stats.recentShipments.map((shipment) => (
                <ShipmentItem
                  key={shipment.shipmentId}
                  onClick={() => navigate(`/logistics/shipments/${shipment.shipmentId}`)}
                >
                  <ShipmentCode>{shipment.shipmentCode}</ShipmentCode>
                  <ShipmentDate>{new Date(shipment.scheduledDate).toLocaleDateString()}</ShipmentDate>
                </ShipmentItem>
              ))}
            </ShipmentList>
          ) : (
            <EmptyText>No recent shipments</EmptyText>
          )}
        </Widget>

        <Widget>
          <WidgetTitle>Active Routes</WidgetTitle>
          <StatValue style={{ fontSize: '44px', textAlign: 'center', padding: '28px 0', width: '100%' }}>
            {formatNumber(stats.activeRoutes)} / {formatNumber(stats.totalRoutes)}
          </StatValue>
        </Widget>
      </WidgetsRow>

      <QuickActions>
        <Button variant="secondary" onClick={() => navigate('/logistics/vehicles')}>
          Manage Vehicles
        </Button>
        <Button variant="secondary" onClick={() => navigate('/logistics/routes')}>
          Manage Routes
        </Button>
        <Button variant="secondary" onClick={() => navigate('/logistics/shipments')}>
          Track Shipments
        </Button>
      </QuickActions>
    </Container>
  );
}
