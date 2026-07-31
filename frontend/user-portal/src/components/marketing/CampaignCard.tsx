/**
 * CampaignCard Component - Display campaign in card format (optional alternative to table)
 */

import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingCampaign } from '../../types/marketing';
import { glassPanelHover, monoLabel } from '@a64core/shared';

interface CampaignCardProps {
  campaign: MarketingCampaign;
  onClick?: () => void;
}

interface BadgeProps {
  $color: string;
}

const Card = styled.div`
  ${glassPanelHover}
  padding: 24px;
  border-radius: 16px;
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

/* Status colours already flow through marketingApi.get*StatusColor(), which
   is routed onto colors.phase.* (spec §5.2) — this badge just applies the
   §4 badge visual (16%/45% tinted hex, mono uppercase, glowing dot). */
const Badge = styled.span<BadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
  font-weight: 700;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
`;

const Code = styled.div`
  ${monoLabel}
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.celeste};
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
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  padding: 12px;
`;

const MetricLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
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
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
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
