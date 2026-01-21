/**
 * ChannelManagementPage Component - Marketing channel list with CRUD operations
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { ChannelTable } from '../../components/marketing/ChannelTable';
import { ChannelForm } from '../../components/marketing/ChannelForm';
import type { MarketingChannel, ChannelType } from '../../types/marketing';

const Container = styled.div`padding: 32px; max-width: 1440px; margin: 0 auto;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;`;
const Title = styled.h1`font-size: 28px; font-weight: 600; color: #212121; margin: 0;`;
const FilterRow = styled.div`display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;`;
const SearchInput = styled.input`flex: 1; min-width: 200px; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; &:focus { outline: none; border-color: #3B82F6; }`;
const Select = styled.select`padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; cursor: pointer; &:focus { outline: none; border-color: #3B82F6; }`;
const Button = styled.button`padding: 10px 24px; background: #3B82F6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 150ms ease-in-out; &:hover { background: #1976d2; }`;
const LoadingContainer = styled.div`display: flex; justify-content: center; align-items: center; min-height: 400px; font-size: 16px; color: #9e9e9e;`;
const ErrorContainer = styled.div`background: #FEE2E2; border: 1px solid #EF4444; color: #991B1B; padding: 16px; border-radius: 8px; margin-bottom: 24px;`;

export function ChannelManagementPage() {
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<ChannelType | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<MarketingChannel | null>(null);

  useEffect(() => {
    loadChannels();
  }, [searchTerm, typeFilter, activeFilter, page]);

  const loadChannels = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketingApi.getChannels({
        page, perPage: 20, search: searchTerm || undefined, type: typeFilter || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'active'
      });
      setChannels(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('Failed to load channels:', err);
      setError(err.response?.data?.message || 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => { setSelectedChannel(null); setShowForm(true); };
  const handleEdit = (channel: MarketingChannel) => { setSelectedChannel(channel); setShowForm(true); };
  const handleDelete = async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    try { await marketingApi.deleteChannel(channelId); loadChannels(); } catch (err: any) { alert(err.response?.data?.message || 'Failed to delete channel'); }
  };
  const handleFormClose = () => { setShowForm(false); setSelectedChannel(null); loadChannels(); };

  if (loading && channels.length === 0) {
    return <Container><LoadingContainer>Loading channels...</LoadingContainer></Container>;
  }

  return (
    <Container>
      <Header><Title>Channel Management</Title><Button onClick={handleCreate}>Create Channel</Button></Header>
      {error && <ErrorContainer>{error}</ErrorContainer>}
      <FilterRow>
        <SearchInput type="text" placeholder="Search channels..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ChannelType | '')}>
          <option value="">All Types</option>
          <option value="social_media">Social Media</option>
          <option value="email">Email</option>
          <option value="print">Print</option>
          <option value="digital">Digital</option>
          <option value="event">Event</option>
          <option value="other">Other</option>
        </Select>
        <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          <option value="all">All Channels</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </Select>
      </FilterRow>
      <ChannelTable channels={channels} onEdit={handleEdit} onDelete={handleDelete} loading={loading} />
      {showForm && <ChannelForm channel={selectedChannel} onClose={handleFormClose} />}
    </Container>
  );
}
