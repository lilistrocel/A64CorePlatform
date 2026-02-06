import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import type { MarketingEvent } from '../../types/marketing';

interface EventTableProps { events: MarketingEvent[]; onEdit: (event: MarketingEvent) => void; onDelete: (eventId: string) => void; loading?: boolean; }

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

export function EventTable({ events, onEdit, onDelete, loading }: EventTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (events.length === 0) return <EmptyText>No events found</EmptyText>;

  return (
    <Table aria-label="Marketing events table">
      <Thead>
        <Tr><Th scope="col">Code</Th><Th scope="col">Name</Th><Th scope="col">Type</Th><Th scope="col">Date</Th><Th scope="col">Location</Th><Th scope="col">Attendees</Th><Th scope="col">Status</Th><Th scope="col">Actions</Th></Tr>
      </Thead>
      <Tbody>
        {events.map((event) => (
          <Tr key={event.eventId}>
            <Td><Code>{event.eventCode}</Code></Td>
            <Td>{event.name}</Td>
            <Td><Badge $color={marketingApi.getChannelTypeColor('event')}>{marketingApi.getEventTypeLabel(event.type)}</Badge></Td>
            <Td>{event.date ? marketingApi.formatDate(event.date) : 'TBD'}</Td>
            <Td>{event.location || '-'}</Td>
            <Td>{event.actualAttendees !== undefined ? `${event.actualAttendees}` : event.expectedAttendees || '-'}</Td>
            <Td><Badge $color={marketingApi.getEventStatusColor(event.status)}>{event.status}</Badge></Td>
            <Td>
              <ActionButton onClick={() => onEdit(event)}>Edit</ActionButton>
              <DeleteButton onClick={() => onDelete(event.eventId)}>Delete</DeleteButton>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
