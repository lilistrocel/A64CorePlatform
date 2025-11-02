/**
 * FarmDashboard Component
 *
 * Main dashboard for the Farm Management module showing key metrics and quick actions.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { DashboardMetrics } from '../../types/farm';

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
  font-size: 36px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const MetricCard = styled.div<{ $color?: string }>`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${({ $color }) => $color || '#3B82F6'};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const MetricIcon = styled.div`
  font-size: 36px;
  margin-bottom: 12px;
`;

const MetricLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

const MetricValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
  margin-bottom: 4px;
`;

const MetricSubtext = styled.div`
  font-size: 14px;
  color: #616161;
`;

const BlockStatsContainer = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const BlockStatBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
`;

const SectionTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 20px 0;
`;

const QuickActionsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
        &:hover {
          background: #1976d2;
          box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
        }
      `;
    }
    if ($variant === 'secondary') {
      return `
        background: #10B981;
        color: white;
        box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
        &:hover {
          background: #059669;
          box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4);
        }
      `;
    }
    return `
      background: white;
      color: #3B82F6;
      border: 2px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ActionIcon = styled.span`
  font-size: 24px;
`;

const RecentActivitySection = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;

// Activity components commented out for future use
// const ActivityList = styled.div`
//   display: flex;
//   flex-direction: column;
//   gap: 16px;
// `;

// const ActivityItem = styled.div`
//   display: flex;
//   gap: 16px;
//   padding: 16px;
//   background: #f5f5f5;
//   border-radius: 8px;
//   transition: all 150ms ease-in-out;

//   &:hover {
//     background: #eeeeee;
//   }
// `;

// const ActivityIcon = styled.div`
//   font-size: 24px;
//   flex-shrink: 0;
// `;

// const ActivityContent = styled.div`
//   flex: 1;
// `;

// const ActivityText = styled.div`
//   font-size: 14px;
//   color: #212121;
//   margin-bottom: 4px;
// `;

// const ActivityTime = styled.div`
//   font-size: 12px;
//   color: #9e9e9e;
// `;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 8px;
  color: #EF4444;
  text-align: center;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 32px;
  color: #9e9e9e;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all farms and aggregate metrics
      const farmsResponse = await farmApi.getFarms(1, 100);

      // Aggregate metrics from all farms
      const summaryPromises = farmsResponse.items.map((farm) =>
        farmApi.getFarmSummary(farm.farmId).catch(() => null)
      );
      const summaries = (await Promise.all(summaryPromises)).filter(Boolean);

      const aggregatedMetrics: DashboardMetrics = {
        totalFarms: farmsResponse.total,
        totalBlocks: summaries.reduce((sum, s) => sum + (s?.totalBlocks || 0), 0),
        blocksByState: {
          empty: summaries.reduce((sum, s) => sum + (s?.blocksByState.empty || 0), 0),
          planned: summaries.reduce((sum, s) => sum + (s?.blocksByState.planned || 0), 0),
          planted: summaries.reduce((sum, s) => sum + (s?.blocksByState.planted || 0), 0),
          harvesting: summaries.reduce((sum, s) => sum + (s?.blocksByState.harvesting || 0), 0),
          alert: summaries.reduce((sum, s) => sum + (s?.blocksByState.alert || 0), 0),
        },
        activePlantings: summaries.reduce((sum, s) => sum + (s?.activePlantings || 0), 0),
        upcomingHarvests: summaries.reduce((sum, s) => sum + (s?.blocksByState.harvesting || 0), 0),
      };

      setMetrics(aggregatedMetrics);
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
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

  if (!metrics) {
    return null;
  }

  return (
    <Container>
      <Header>
        <Title>Farm Manager Dashboard</Title>
        <Subtitle>Overview of your farming operations</Subtitle>
      </Header>

      <MetricsGrid>
        <MetricCard $color="#3B82F6">
          <MetricIcon>🏞️</MetricIcon>
          <MetricLabel>Total Farms</MetricLabel>
          <MetricValue>{metrics.totalFarms}</MetricValue>
          <MetricSubtext>Active farming locations</MetricSubtext>
        </MetricCard>

        <MetricCard $color="#10B981">
          <MetricIcon>🏗️</MetricIcon>
          <MetricLabel>Total Blocks</MetricLabel>
          <MetricValue>{metrics.totalBlocks}</MetricValue>
          <BlockStatsContainer>
            {metrics.blocksByState.empty > 0 && (
              <BlockStatBadge $color="#6B7280">{metrics.blocksByState.empty} Empty</BlockStatBadge>
            )}
            {metrics.blocksByState.planned > 0 && (
              <BlockStatBadge $color="#3B82F6">{metrics.blocksByState.planned} Planned</BlockStatBadge>
            )}
            {metrics.blocksByState.planted > 0 && (
              <BlockStatBadge $color="#10B981">{metrics.blocksByState.planted} Planted</BlockStatBadge>
            )}
            {metrics.blocksByState.harvesting > 0 && (
              <BlockStatBadge $color="#F59E0B">{metrics.blocksByState.harvesting} Harvesting</BlockStatBadge>
            )}
          </BlockStatsContainer>
        </MetricCard>

        <MetricCard $color="#F59E0B">
          <MetricIcon>🌱</MetricIcon>
          <MetricLabel>Active Plantings</MetricLabel>
          <MetricValue>{metrics.activePlantings}</MetricValue>
          <MetricSubtext>Currently growing</MetricSubtext>
        </MetricCard>

        <MetricCard $color="#EF4444">
          <MetricIcon>🌾</MetricIcon>
          <MetricLabel>Upcoming Harvests</MetricLabel>
          <MetricValue>{metrics.upcomingHarvests}</MetricValue>
          <MetricSubtext>Blocks ready for harvest</MetricSubtext>
        </MetricCard>
      </MetricsGrid>

      <SectionTitle>Quick Actions</SectionTitle>
      <QuickActionsGrid>
        <ActionButton $variant="primary" onClick={() => navigate('/farm/farms')}>
          <ActionIcon>🏞️</ActionIcon>
          <span>Manage Farms</span>
        </ActionButton>

        <ActionButton $variant="secondary" onClick={() => navigate('/farm/plants')}>
          <ActionIcon>🌿</ActionIcon>
          <span>Plant Data Library</span>
        </ActionButton>

        <ActionButton $variant="outline" onClick={() => navigate('/farm/plantings')}>
          <ActionIcon>📋</ActionIcon>
          <span>View Plantings</span>
        </ActionButton>
      </QuickActionsGrid>

      <RecentActivitySection>
        <SectionTitle>Recent Activity</SectionTitle>
        <EmptyState>
          <p>Activity tracking coming soon</p>
        </EmptyState>
      </RecentActivitySection>
    </Container>
  );
}
