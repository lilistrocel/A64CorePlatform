import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { formatNumber } from '../../utils/formatNumber';
import type { MarketingEvent } from '../../types/marketing';
import { glassPanel, monoLabel } from '@a64core/shared';

interface EventTableProps { events: MarketingEvent[]; onEdit: (event: MarketingEvent) => void; onDelete: (eventId: string) => void; loading?: boolean; }

const TableWrap = styled.div`${glassPanel} border-radius: 16px; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Thead = styled.thead`border-bottom: 1px solid ${({ theme }) => theme.colors.line};`;
const Th = styled.th`${monoLabel} padding: 16px; text-align: left; font-size: 0.66rem; color: ${({ theme }) => theme.colors.celeste};`;
const Tbody = styled.tbody``;
const Tr = styled.tr`border-bottom: 1px solid ${({ theme }) => theme.colors.line}; transition: background 150ms ease-in-out; &:hover { background: rgba(180, 200, 220, 0.05); } &:last-child { border-bottom: none; }`;
const Td = styled.td`padding: 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary};`;
const Code = styled.span`${monoLabel} font-size: 0.7rem; color: ${({ theme }) => theme.colors.celeste};`;
interface BadgeProps { $color: string; }
/* Event `type` (categorical, colors.bright.*) and `status` (phase, routed
   through marketingApi.getEventStatusColor()) share the same §4 badge
   visual — only the source of the colour differs. */
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

export function EventTable({ events, onEdit, onDelete, loading }: EventTableProps) {
  if (loading) return <EmptyText>Loading...</EmptyText>;
  if (events.length === 0) return <EmptyText>No events found</EmptyText>;

  return (
    <TableWrap>
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
              <Td>{event.actualAttendees !== undefined ? formatNumber(event.actualAttendees) : event.expectedAttendees ? formatNumber(event.expectedAttendees) : '-'}</Td>
              <Td><Badge $color={marketingApi.getEventStatusColor(event.status)}>{event.status}</Badge></Td>
              <Td>
                <ActionButton onClick={() => onEdit(event)}>Edit</ActionButton>
                <DeleteButton onClick={() => onDelete(event.eventId)}>Delete</DeleteButton>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
