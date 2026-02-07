/**
 * LogisticsDashboardPage Component
 *
 * Overview dashboard with fleet statistics and shipment tracking.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { logisticsApi } from '../../services/logisticsService';
import { formatNumber } from '../../utils/formatNumber';
import type { LogisticsDashboardStats } from '../../types/logistics';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #616161;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
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
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 16px 0;
`;

const ShipmentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ShipmentItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const ShipmentCode = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  font-family: 'JetBrains Mono', monospace;
`;

const ShipmentDate = styled.span`
  font-size: 12px;
  color: #9e9e9e;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

const ActionButton = styled.button`
  padding: 12px 24px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: #9e9e9e;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function LogisticsDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<LogisticsDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await logisticsApi.getDashboardStats();
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
      <Header>
        <Title>Logistics Management</Title>
        <Subtitle>Fleet and shipment tracking overview</Subtitle>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Vehicles</StatLabel>
          <StatValue>{formatNumber(stats.totalVehicles)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available</StatLabel>
          <StatValue style={{ color: '#10B981' }}>{formatNumber(stats.availableVehicles)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>In Use</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{formatNumber(stats.inUseVehicles)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Maintenance</StatLabel>
          <StatValue style={{ color: '#F59E0B' }}>{formatNumber(stats.maintenanceVehicles)}</StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Shipments</StatLabel>
          <StatValue>{formatNumber(stats.totalShipments)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Scheduled</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{formatNumber(stats.scheduledShipments)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>In Transit</StatLabel>
          <StatValue style={{ color: '#F59E0B' }}>{formatNumber(stats.inTransitShipments)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Delivered</StatLabel>
          <StatValue style={{ color: '#10B981' }}>{formatNumber(stats.deliveredShipments)}</StatValue>
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
          <StatValue style={{ fontSize: '48px', textAlign: 'center', padding: '32px 0' }}>
            {formatNumber(stats.activeRoutes)} / {formatNumber(stats.totalRoutes)}
          </StatValue>
        </Widget>
      </WidgetsRow>

      <QuickActions>
        <ActionButton onClick={() => navigate('/logistics/vehicles')}>Manage Vehicles</ActionButton>
        <ActionButton onClick={() => navigate('/logistics/routes')}>Manage Routes</ActionButton>
        <ActionButton onClick={() => navigate('/logistics/shipments')}>Track Shipments</ActionButton>
      </QuickActions>
    </Container>
  );
}
