/**
 * CampaignTable Component - Display campaigns in a table
 */

import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { formatNumber } from '../../utils/formatNumber';
import type { MarketingCampaign } from '../../types/marketing';

interface CampaignTableProps {
  campaigns: MarketingCampaign[];
  onEdit: (campaign: MarketingCampaign) => void;
  onDelete: (campaignId: string) => void;
  loading?: boolean;
}

const Table = styled.table`width: 100%; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;`;
const Thead = styled.thead`background: #fafafa; border-bottom: 2px solid #e0e0e0;`;
const Th = styled.th`padding: 16px; text-align: left; font-size: 13px; font-weight: 600; color: #616161; text-transform: uppercase;`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid #e0e0e0; &:hover { background: #fafafa; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: #212121;`;
const Code = styled.span`font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #3B82F6;`;
interface BadgeProps { $color: string; }
const Badge = styled.span<BadgeProps>`padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${({ $color }) => $color}20; color: ${({ $color }) => $color};`;
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #f5f5f5; }`;
const DeleteButton = styled(ActionButton)`color: #EF4444; border-color: #EF4444; &:hover { background: #FEE2E2; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: #9e9e9e;`;
const TagsContainer = styled.div`display: flex; flex-wrap: wrap; gap: 4px;`;
const Tag = styled.span`padding: 2px 8px; background: #E0F2FE; color: #0369A1; border-radius: 4px; font-size: 11px;`;

export function CampaignTable({ campaigns, onEdit, onDelete, loading }: CampaignTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (campaigns.length === 0) return <EmptyText>No campaigns found</EmptyText>;

  return (
    <Table aria-label="Marketing campaigns table">
      <Thead>
        <Tr>
          <Th scope="col">Code</Th>
          <Th scope="col">Name</Th>
          <Th scope="col">Status</Th>
          <Th scope="col">Budget</Th>
          <Th scope="col">Spent</Th>
          <Th scope="col">Goals</Th>
          <Th scope="col">Impressions</Th>
          <Th scope="col">Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {campaigns.map((campaign) => (
          <Tr key={campaign.campaignId}>
            <Td><Code>{campaign.campaignCode}</Code></Td>
            <Td>{campaign.name}</Td>
            <Td><Badge $color={marketingApi.getCampaignStatusColor(campaign.status)}>{campaign.status}</Badge></Td>
            <Td>{campaign.budget ? marketingApi.formatCurrency(campaign.budget) : '-'}</Td>
            <Td>{campaign.spent ? marketingApi.formatCurrency(campaign.spent) : '-'}</Td>
            <Td>
              <TagsContainer>
                {campaign.goals?.slice(0, 2).map((goal, idx) => <Tag key={idx}>{goal}</Tag>)}
                {campaign.goals && campaign.goals.length > 2 && <Tag>+{campaign.goals.length - 2}</Tag>}
              </TagsContainer>
            </Td>
            <Td>{formatNumber(campaign.metrics?.impressions || 0)}</Td>
            <Td>
              <ActionButton onClick={() => onEdit(campaign)}>Edit</ActionButton>
              <DeleteButton onClick={() => onDelete(campaign.campaignId)}>Delete</DeleteButton>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
