/**
 * CampaignManagementPage Component
 *
 * Campaign list with pagination, filtering, and CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Plus } from 'lucide-react';
import { marketingApi } from '../../services/marketingService';
import { CampaignTable } from '../../components/marketing/CampaignTable';
import { CampaignForm } from '../../components/marketing/CampaignForm';
import type { MarketingCampaign, CampaignStatus } from '../../types/marketing';
import { PageHeader, glassControl } from '@a64core/shared';

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const HeaderActions = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Select = styled.select`
  ${glassControl}
  padding: 10px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
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

  &:hover {
    filter: brightness(1.05);
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
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
      <PageHeader breadcrumb="Marketing · LIVE" title="Campaign Management" emphasizeLastWord />

      <HeaderActions>
        <Button onClick={handleCreate}>
          <Plus size={15} strokeWidth={2} />
          Create Campaign
        </Button>
      </HeaderActions>

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
