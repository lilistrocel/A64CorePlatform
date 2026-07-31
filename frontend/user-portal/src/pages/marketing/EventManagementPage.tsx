/**
 * EventManagementPage Component - Event list with CRUD operations
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Plus } from 'lucide-react';
import { marketingApi } from '../../services/marketingService';
import { EventTable } from '../../components/marketing/EventTable';
import { EventForm } from '../../components/marketing/EventForm';
import type { MarketingEvent, EventType, EventStatus } from '../../types/marketing';
import { PageHeader, glassControl } from '@a64core/shared';

const Container = styled.div`padding: 32px; max-width: 1440px; margin: 0 auto;`;
const HeaderActions = styled.div`display: flex; justify-content: flex-end; margin-bottom: 24px;`;
const FilterRow = styled.div`display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;`;
const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
`;
const Select = styled.select`
  ${glassControl}
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
  option { background: ${({ theme }) => theme.colors.cosmosHi}; color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  &:hover { filter: brightness(1.05); }
`;
const LoadingContainer = styled.div`display: flex; justify-content: center; align-items: center; min-height: 400px; font-size: 16px; color: ${({ theme }) => theme.colors.muted};`;
const ErrorContainer = styled.div`background: ${({ theme }) => theme.colors.errorBg}; border: 1px solid rgba(240, 138, 112, 0.45); color: ${({ theme }) => theme.colors.bright.coral}; padding: 16px; border-radius: 10px; margin-bottom: 24px;`;

export function EventManagementPage() {
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<EventType | ''>('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MarketingEvent | null>(null);

  useEffect(() => {
    loadEvents();
  }, [searchTerm, typeFilter, statusFilter, page]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketingApi.getEvents({ page, perPage: 20, search: searchTerm || undefined, type: typeFilter || undefined, status: statusFilter || undefined });
      setEvents(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('Failed to load events:', err);
      setError(err.response?.data?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setSelectedEvent(null); setShowForm(true); };
  const handleEdit = (event: MarketingEvent) => { setSelectedEvent(event); setShowForm(true); };
  const handleDelete = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try { await marketingApi.deleteEvent(eventId); loadEvents(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to delete event'); }
  };
  const handleFormClose = () => { setShowForm(false); setSelectedEvent(null); loadEvents(); };

  if (loading && events.length === 0) {
    return <Container><LoadingContainer>Loading events...</LoadingContainer></Container>;
  }

  return (
    <Container>
      <PageHeader breadcrumb="Marketing · LIVE" title="Event Management" emphasizeLastWord />
      <HeaderActions>
        <Button onClick={handleCreate}>
          <Plus size={15} strokeWidth={2} /> Create Event
        </Button>
      </HeaderActions>
      {error && <ErrorContainer>{error}</ErrorContainer>}
      <FilterRow>
        <SearchInput type="text" placeholder="Search events..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EventType | '')}>
          <option value="">All Types</option>
          <option value="trade_show">Trade Show</option>
          <option value="webinar">Webinar</option>
          <option value="workshop">Workshop</option>
          <option value="conference">Conference</option>
          <option value="farm_visit">Farm Visit</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EventStatus | '')}>
          <option value="">All Statuses</option>
          <option value="planned">Planned</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </FilterRow>
      <EventTable events={events} onEdit={handleEdit} onDelete={handleDelete} loading={loading} />
      {showForm && <EventForm event={selectedEvent} onClose={handleFormClose} />}
    </Container>
  );
}
