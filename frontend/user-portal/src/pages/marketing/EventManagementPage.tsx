/**
 * EventManagementPage Component - Event list with CRUD operations
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { EventTable } from '../../components/marketing/EventTable';
import { EventForm } from '../../components/marketing/EventForm';
import type { MarketingEvent, EventType, EventStatus } from '../../types/marketing';

const Container = styled.div`padding: 32px; max-width: 1440px; margin: 0 auto;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;`;
const Title = styled.h1`font-size: 28px; font-weight: 600; color: #212121; margin: 0;`;
const FilterRow = styled.div`display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;`;
const SearchInput = styled.input`flex: 1; min-width: 200px; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; cursor: pointer; &:focus { outline: none; border-color: #3B82F6; }`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const LoadingContainer = styled.div`display: flex; justify-content: center; align-items: center; min-height: 400px; font-size: 16px; color: #9e9e9e;`;
const ErrorContainer = styled.div`background: #FEE2E2; border: 1px solid #EF4444; color: #991B1B; padding: 16px; border-radius: 8px; margin-bottom: 24px;`;

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
      <Header><Title>Event Management</Title><Button onClick={handleCreate}>Create Event</Button></Header>
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
