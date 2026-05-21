/**
 * MarketingDashboardPage Component
 *
 * Overview dashboard with campaign performance, budget tracking, and event management.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { formatNumber } from '../../utils/formatNumber';
import type { MarketingDashboardStats } from '../../types/marketing';

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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
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
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 16px 0;
`;

const CampaignList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CampaignItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
`;

const CampaignName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CampaignMetrics = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const EventList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const EventItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(15,110,86,0.06);
  border-left: 3px solid #0F6E56;
  border-radius: 4px;
  font-size: 13px;
`;

const EventName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const EventDate = styled.span`
  font-size: 12px;
  color: #0F6E56;
`;

const BudgetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const BudgetItem = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
`;

const BudgetHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const BudgetName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const BudgetAmount = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #0F6E56;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${({ theme }) => theme.colors.border.subtle};
  border-radius: 4px;
  overflow: hidden;
`;

interface ProgressFillProps {
  $percentage: number;
}

const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  background: ${({ $percentage }) =>
    $percentage >= 90 ? '#9E2A2A' :
    $percentage >= 75 ? '#B8842A' :
    '#0F6E56'
  };
  width: ${({ $percentage }) => Math.min($percentage, 100)}%;
  transition: width 300ms ease-in-out;
`;

const ProgressLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 4px;
  text-align: right;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

const ActionButton = styled.button`
  padding: 12px 24px;
  background: #0F6E56;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #0F6E56;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ErrorContainer = styled.div`
  background: rgba(158,42,42,0.08);
  border: 1px solid #9E2A2A;
  color: #9E2A2A;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function MarketingDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MarketingDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await marketingApi.getDashboardStats();
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
        <Title>Marketing Management</Title>
        <Subtitle>Campaign performance, budget tracking, and event management</Subtitle>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Budget</StatLabel>
          <StatValue>{marketingApi.formatCurrency(stats.totalBudget)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Allocated</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>
            {marketingApi.formatCurrency(stats.allocatedBudget)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Spent</StatLabel>
          <StatValue style={{ color: '#B8842A' }}>
            {marketingApi.formatCurrency(stats.spentBudget)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>
            {marketingApi.formatCurrency(stats.totalBudget - stats.spentBudget)}
          </StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Active Campaigns</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>{formatNumber(stats.activeCampaigns)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Total Impressions</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>
            {formatNumber(stats.totalImpressions)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Total Clicks</StatLabel>
          <StatValue style={{ color: '#4B4844' }}>
            {formatNumber(stats.totalClicks)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Conversions</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>
            {formatNumber(stats.totalConversions)}
          </StatValue>
        </StatCard>
      </StatsGrid>

      <WidgetsRow>
        <Widget>
          <WidgetTitle>Top Campaigns</WidgetTitle>
          {stats.topCampaigns && stats.topCampaigns.length > 0 ? (
            <CampaignList>
              {stats.topCampaigns.map((campaign) => (
                <CampaignItem
                  key={campaign.campaignId}
                  onClick={() => navigate(`/marketing/campaigns/${campaign.campaignId}`)}
                >
                  <CampaignName>{campaign.name}</CampaignName>
                  <CampaignMetrics>
                    {formatNumber(campaign.metrics?.impressions || 0)} impressions
                  </CampaignMetrics>
                </CampaignItem>
              ))}
            </CampaignList>
          ) : (
            <EmptyText>No campaigns available</EmptyText>
          )}
        </Widget>

        <Widget>
          <WidgetTitle>Upcoming Events</WidgetTitle>
          {stats.upcomingEventsList && stats.upcomingEventsList.length > 0 ? (
            <EventList>
              {stats.upcomingEventsList.map((event) => (
                <EventItem key={event.eventId}>
                  <EventName>{event.name}</EventName>
                  <EventDate>
                    {event.date ? marketingApi.formatDate(event.date) : 'TBD'}
                  </EventDate>
                </EventItem>
              ))}
            </EventList>
          ) : (
            <EmptyText>No upcoming events</EmptyText>
          )}
        </Widget>
      </WidgetsRow>

      <Widget style={{ marginBottom: '32px' }}>
        <WidgetTitle>Budget Utilization</WidgetTitle>
        {stats.budgetUtilization && stats.budgetUtilization.length > 0 ? (
          <BudgetList>
            {stats.budgetUtilization.map((budget) => (
              <BudgetItem key={budget.budgetId}>
                <BudgetHeader>
                  <BudgetName>{budget.name}</BudgetName>
                  <BudgetAmount>
                    {marketingApi.formatCurrency(budget.spentAmount)} / {marketingApi.formatCurrency(budget.totalAmount)}
                  </BudgetAmount>
                </BudgetHeader>
                <ProgressBar>
                  <ProgressFill $percentage={budget.utilizationPercentage} />
                </ProgressBar>
                <ProgressLabel>{budget.utilizationPercentage}% utilized</ProgressLabel>
              </BudgetItem>
            ))}
          </BudgetList>
        ) : (
          <EmptyText>No budgets available</EmptyText>
        )}
      </Widget>

      <QuickActions>
        <ActionButton onClick={() => navigate('/marketing/campaigns')}>Manage Campaigns</ActionButton>
        <ActionButton onClick={() => navigate('/marketing/budgets')}>View Budgets</ActionButton>
        <ActionButton onClick={() => navigate('/marketing/events')}>Manage Events</ActionButton>
        <ActionButton onClick={() => navigate('/marketing/channels')}>View Channels</ActionButton>
      </QuickActions>
    </Container>
  );
}
