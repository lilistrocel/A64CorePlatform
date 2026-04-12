/**
 * CampaignCard Component - Display campaign in card format (optional alternative to table)
 */

import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingCampaign } from '../../types/marketing';

interface CampaignCardProps {
  campaign: MarketingCampaign;
  onClick?: () => void;
}

interface BadgeProps {
  $color: string;
}

const Card = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const Badge = styled.span<BadgeProps>`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
`;

const Code = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #3B82F6;
  margin-bottom: 8px;
`;

const Description = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 16px 0;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
`;

const Metric = styled.div`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 8px;
  padding: 12px;
`;

const MetricLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const MetricValue = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`;

const Tag = styled.span`
  padding: 4px 10px;
  background: #E0F2FE;
  color: #0369A1;
  border-radius: 12px;
  font-size: 12px;
`;

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  return (
    <Card onClick={onClick}>
      <Header>
        <div>
          <Code>{campaign.campaignCode}</Code>
          <Title>{campaign.name}</Title>
        </div>
        <Badge $color={marketingApi.getCampaignStatusColor(campaign.status)}>
          {campaign.status}
        </Badge>
      </Header>

      {campaign.description && (
        <Description>{campaign.description}</Description>
      )}

      <MetricsGrid>
        <Metric>
          <MetricLabel>Budget</MetricLabel>
          <MetricValue>
            {campaign.budget ? marketingApi.formatCurrency(campaign.budget) : '-'}
          </MetricValue>
        </Metric>
        <Metric>
          <MetricLabel>Spent</MetricLabel>
          <MetricValue>
            {campaign.spent ? marketingApi.formatCurrency(campaign.spent) : '-'}
          </MetricValue>
        </Metric>
        <Metric>
          <MetricLabel>Impressions</MetricLabel>
          <MetricValue>
            {campaign.metrics?.impressions?.toLocaleString() || '0'}
          </MetricValue>
        </Metric>
        <Metric>
          <MetricLabel>Clicks</MetricLabel>
          <MetricValue>
            {campaign.metrics?.clicks?.toLocaleString() || '0'}
          </MetricValue>
        </Metric>
      </MetricsGrid>

      {campaign.goals && campaign.goals.length > 0 && (
        <TagsContainer>
          {campaign.goals.map((goal, idx) => (
            <Tag key={idx}>{goal}</Tag>
          ))}
        </TagsContainer>
      )}
    </Card>
  );
}
