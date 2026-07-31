/**
 * MarketingDashboardPage Component
 *
 * Overview dashboard with campaign performance, budget tracking, and event management.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { formatNumber } from '../../utils/formatNumber';
import type { MarketingDashboardStats } from '../../types/marketing';
import { PageHeader, glassPanel, glassPanelHover, monoLabel } from '@a64core/shared';

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
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  ${glassPanel}
  border-radius: 16px;
  padding: 24px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 10px;
`;

const StatValue = styled.div<{ $color?: string }>`
  font-size: 32px;
  font-weight: 800;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
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
  border-radius: 16px;
  padding: 24px;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const CampaignList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CampaignItem = styled.div`
  ${glassPanelHover}
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
`;

const CampaignName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CampaignMetrics = styled.span`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
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
  background: rgba(107, 138, 224, 0.12);
  border-left: 3px solid ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 8px;
  font-size: 13px;
`;

const EventName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EventDate = styled.span`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.bright.lapis};
`;

const BudgetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const BudgetItem = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
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
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const BudgetAmount = styled.span`
  ${monoLabel}
  font-size: 0.7rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 10px;
  background: rgba(10, 14, 36, 0.6);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 99px;
  overflow: hidden;
`;

interface ProgressFillProps {
  $percentage: number;
}

/* Utilization gauge — not a phase status, so this stays off the phase
   vocabulary, but still off gold (spec §3): emerald under 75%, terra as it
   approaches the ceiling, coral (the only red) once over budget. Matches the
   identical gauge in BudgetTable.tsx. */
const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  border-radius: 99px;
  background: ${({ $percentage, theme }) =>
    $percentage >= 90 ? theme.colors.bright.coral :
    $percentage >= 75 ? theme.colors.bright.terra :
    theme.colors.bright.emerald
  };
  width: ${({ $percentage }) => Math.min($percentage, 100)}%;
  transition: width 300ms ease-in-out;
`;

const ProgressLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
  text-align: right;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

/* Four equal-weight navigation shortcuts, not a single primary action — kept
   off gold (spec §3 gold-discipline budget; this dashboard's one gold
   element is the PageHeader breadcrumb kicker). */
const ActionButton = styled.button`
  padding: 12px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
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

export function MarketingDashboardPage() {
  const navigate = useNavigate();
  const theme = useTheme();
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
      <PageHeader
        breadcrumb="Marketing · LIVE"
        title="Marketing Management"
        emphasizeLastWord
        description="Campaign performance, budget tracking, and event management"
      />

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Budget</StatLabel>
          <StatValue>{marketingApi.formatCurrency(stats.totalBudget)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Allocated</StatLabel>
          <StatValue $color={theme.colors.bright.lapis}>
            {marketingApi.formatCurrency(stats.allocatedBudget)}
          </StatValue>
        </StatCard>

        <StatCard>
          {/* Spent is an attention figure, not the Harvesting phase — terra,
              never gold (spec §3). */}
          <StatLabel>Spent</StatLabel>
          <StatValue $color={theme.colors.bright.terra}>
            {marketingApi.formatCurrency(stats.spentBudget)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available</StatLabel>
          <StatValue $color={theme.colors.bright.emerald}>
            {marketingApi.formatCurrency(stats.totalBudget - stats.spentBudget)}
          </StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Active Campaigns</StatLabel>
          <StatValue $color={theme.colors.bright.emerald}>{formatNumber(stats.activeCampaigns)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Total Impressions</StatLabel>
          <StatValue $color={theme.colors.bright.lapis}>
            {formatNumber(stats.totalImpressions)}
          </StatValue>
        </StatCard>

        <StatCard>
          {/* Night Observatory (T-901): this tile previously borrowed
              secondary/gold to distinguish it from the adjacent lapis
              "Total Impressions" tile — gold is now hard-limited to the
              Harvesting phase / primary CTA / stat-tile thread (spec §3) and
              must never be a plain category colour. Moved to bright.lavender,
              the palette's actual purple-family voice. */}
          <StatLabel>Total Clicks</StatLabel>
          <StatValue $color={theme.colors.bright.lavender}>
            {formatNumber(stats.totalClicks)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Conversions</StatLabel>
          <StatValue $color={theme.colors.bright.emerald}>
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
