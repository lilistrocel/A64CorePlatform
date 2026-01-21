import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingChannel } from '../../types/marketing';

interface ChannelTableProps { channels: MarketingChannel[]; onEdit: (channel: MarketingChannel) => void; onDelete: (channelId: string) => void; loading?: boolean; }

const Table = styled.table`width: 100%; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;`;
const Thead = styled.thead`background: #fafafa; border-bottom: 2px solid #e0e0e0;`;
const Th = styled.th`padding: 16px; text-align: left; font-size: 13px; font-weight: 600; color: #616161; text-transform: uppercase;`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid #e0e0e0; &:hover { background: #fafafa; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: #212121;`;
interface BadgeProps { $color: string; }
const Badge = styled.span<BadgeProps>`padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${({ $color }) => $color}20; color: ${({ $color }) => $color};`;
const ActiveBadge = styled.span<{ $active: boolean }>`padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${({ $active }) => $active ? '#10B98120' : '#6B728020'}; color: ${({ $active }) => $active ? '#10B981' : '#6B7280'};`;
const ActionButton = styled.button`padding: 6px 12px; margin-right: 8px; background: transparent; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #f5f5f5; }`;
const DeleteButton = styled(ActionButton)`color: #EF4444; border-color: #EF4444; &:hover { background: #FEE2E2; }`;
const EmptyText = styled.div`text-align: center; padding: 48px 24px; color: #9e9e9e;`;

export function ChannelTable({ channels, onEdit, onDelete, loading }: ChannelTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (channels.length === 0) return <EmptyText>No channels found</EmptyText>;

  return (
    <Table>
      <Thead>
        <Tr><Th>Name</Th><Th>Type</Th><Th>Platform</Th><Th>Cost/Impression</Th><Th>Status</Th><Th>Actions</Th></Tr>
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
  );
}
