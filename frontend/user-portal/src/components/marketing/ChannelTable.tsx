import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingChannel } from '../../types/marketing';
import { glassPanel, monoLabel } from '@a64core/shared';

interface ChannelTableProps { channels: MarketingChannel[]; onEdit: (channel: MarketingChannel) => void; onDelete: (channelId: string) => void; loading?: boolean; }

const TableWrap = styled.div`${glassPanel} border-radius: 16px; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Thead = styled.thead`border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const Th = styled.th`${monoLabel} padding: 16px; text-align: left; font-size: 0.66rem; color: ${({ theme }) => theme.colors.celeste};`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid ${({ theme }) => theme.colors.line}; transition: background 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.05); } &:last-child { border-bottom: none; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};`;
interface BadgeProps { $color: string; }
/* Channel `type` is CATEGORICAL, not a status — marketingApi.getChannelTypeColor()
   already routes it onto colors.bright.* (spec §3), never gold. */
const badgeCss = `
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  font-weight: 700;
`;
const Badge = styled.span<BadgeProps>`
  ${badgeCss}
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};
`;
/* isActive is a simple boolean toggle, not a phase status — emerald when on,
   muted/dim when off (not gold, not a phase key). */
const ActiveBadge = styled.span<{ $active: boolean }>`
  ${badgeCss}
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${({ $active }) => ($active ? 'rgba(84, 211, 155, 0.16)' : 'rgba(139, 144, 172, 0.16)')};
  color: ${({ $active, theme }) => ($active ? theme.colors.bright.emerald : theme.colors.muted)};
  border: 1px solid ${({ $active }) => ($active ? 'rgba(84, 211, 155, 0.45)' : 'rgba(139, 144, 172, 0.45)')};
`;
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; color: ${({ theme }) => theme.colors.celeste}; border: 1px solid ${({ theme }) => theme.colors.glass.border}; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }`;
const DeleteButton = styled(ActionButton)`color: ${({ theme }) => theme.colors.error}; border-color: ${({ theme }) => theme.colors.error}; &:hover { background: ${({ theme }) => theme.colors.errorBg}; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: ${({ theme }) => theme.colors.muted};`;

export function ChannelTable({ channels, onEdit, onDelete, loading }: ChannelTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (channels.length === 0) return <EmptyText>No channels found</EmptyText>;

  return (
    <TableWrap>
      <Table aria-label="Marketing channels table">
        <Thead>
          <Tr><Th scope="col">Name</Th><Th scope="col">Type</Th><Th scope="col">Platform</Th><Th scope="col">Cost/Impression</Th><Th scope="col">Status</Th><Th scope="col">Actions</Th></Tr>
        </Thead>
        <Tbody>
          {channels.map((channel) => (
            <Tr key={channel.channelId}>
              <Td>{channel.name}</Td>
              <Td><Badge $color={marketingApi.getChannelTypeColor(channel.type)}>{marketingApi.getChannelTypeLabel(channel.type)}</Badge></Td>
              <Td>{channel.platform || '-'}</Td>
              <Td>{channel.costPerImpression ? marketingApi.formatCurrency(channel.costPerImpression) : '-'}</Td>
              <Td><ActiveBadge $active={channel.isActive}>{channel.isActive ? 'Active' : 'Inactive'}</ActiveBadge></Td>
              <Td>
                <ActionButton onClick={() => onEdit(channel)}>Edit</ActionButton>
                <DeleteButton onClick={() => onDelete(channel.channelId)}>Delete</DeleteButton>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
