/**
 * CampaignTable Component - Display campaigns in a table
 */

import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { formatNumber } from '../../utils/formatNumber';
import type { MarketingCampaign } from '../../types/marketing';
import { glassPanel, monoLabel } from '@a64core/shared';

interface CampaignTableProps {
  campaigns: MarketingCampaign[];
  onEdit: (campaign: MarketingCampaign) => void;
  onDelete: (campaignId: string) => void;
  loading?: boolean;
}

const TableWrap = styled.div`${glassPanel} border-radius: 16px; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Thead = styled.thead`border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const Th = styled.th`${monoLabel} padding: 16px; text-align: left; font-size: 0.66rem; color: ${({ theme }) => theme.colors.celeste};`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid ${({ theme }) => theme.colors.line}; transition: background 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.05); } &:last-child { border-bottom: none; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};`;
const Code = styled.span`${monoLabel} font-size: 0.7rem; color: ${({ theme }) => theme.colors.celeste};`;
interface BadgeProps { $color: string; }
/* Status colours already flow through marketingApi.get*StatusColor(), routed
   onto colors.phase.* (spec §5.2) — this badge applies the §4 badge visual. */
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
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const DeleteButton = styled(ActionButton)`color: ${({ theme }) => theme.colors.error}; border-color: ${({ theme }) => theme.colors.error}; &:hover { background: ${({ theme }) => theme.colors.errorBg}; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: ${({ theme }) => theme.colors.muted};`;
const TagsContainer = styled.div`display: flex; flex-wrap: wrap; gap: 4px;`;
const Tag = styled.span`padding: 2px 8px; background: rgba(107, 138, 224, 0.16); color: ${({ theme }) => theme.colors.bright.lapis}; border: 1px solid rgba(107, 138, 224, 0.35); border-radius: 4px; font-size: 11px;`;

export function CampaignTable({ campaigns, onEdit, onDelete, loading }: CampaignTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (campaigns.length === 0) return <EmptyText>No campaigns found</EmptyText>;

  return (
    <TableWrap>
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
    </TableWrap>
  );
}
