/**
 * CampaignManagementPage Component
 *
 * Campaign list with pagination, filtering, and CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { marketingApi } from '../../services/marketingService';
import { CampaignTable } from '../../components/marketing/CampaignTable';
import { CampaignForm } from '../../components/marketing/CampaignForm';
import type { MarketingCampaign, CampaignStatus } from '../../types/marketing';

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3B82F6;
  }
`;

const Select = styled.select`
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3B82F6;
  }
`;

const Button = styled.button`
  padding: 10px 24px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: #9e9e9e;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

export function CampaignManagementPage() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, [searchTerm, statusFilter, page]);

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await marketingApi.getCampaigns({
        page,
        perPage: 20,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
      });
      setCampaigns(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      console.error('Failed to load campaigns:', err);
      setError(err.response?.data?.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setShowForm(true);
  };

  const handleEdit = (campaign: MarketingCampaign) => {
    setSelectedCampaign(campaign);
    setShowForm(true);
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await marketingApi.deleteCampaign(campaignId);
      loadCampaigns();
    } catch (err: any) {
      console.error('Failed to delete campaign:', err);
      alert(err.response?.data?.message || 'Failed to delete campaign');
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedCampaign(null);
    loadCampaigns();
  };

  if (loading && campaigns.length === 0) {
    return (
      <Container>
        <LoadingContainer>Loading campaigns...</LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Campaign Management</Title>
        <Button onClick={handleCreate}>Create Campaign</Button>
      </Header>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search campaigns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | '')}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </Select>
      </FilterRow>

      <CampaignTable
        campaigns={campaigns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
      />

      {showForm && (
        <CampaignForm
          campaign={selectedCampaign}
          onClose={handleFormClose}
        />
      )}
    </Container>
  );
}
