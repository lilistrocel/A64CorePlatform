/**
 * FarmList Component
 *
 * Displays a paginated grid of farm cards with search and filter capabilities.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FarmCard } from './FarmCard';
import { CreateFarmModal } from './CreateFarmModal';
import { FarmAnalyticsModal } from './FarmAnalyticsModal';
import { farmApi } from '../../services/farmApi';
import type { Farm, FarmSummary } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FarmListProps {
  onCreateFarm?: () => void;
  onEditFarm?: (farmId: string) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const Actions = styled.div`
  display: flex;
  gap: 16px;

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
  }
`;

const SearchInput = styled.input`
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  width: 300px;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const CreateButton = styled.button`
  padding: 12px 24px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: #1976d2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'transparent')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e0e0e0;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ErrorContainer = styled.div`
  padding: 24px;
  background: #FEE2E2;
  border: 1px solid #EF4444;
  border-radius: 8px;
  color: #EF4444;
  text-align: center;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: #9e9e9e;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  font-weight: 600;
  color: #616161;
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: #9e9e9e;
  margin: 0 0 24px 0;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'white')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: 14px;
  color: #616161;
`;

// ============================================================================
// COMPONENT
// ============================================================================

type FilterType = 'all' | 'active' | 'inactive';

export function FarmList({ onCreateFarm, onEditFarm }: FarmListProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [summaries, setSummaries] = useState<Record<string, FarmSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [selectedFarmName, setSelectedFarmName] = useState<string>('');
  const perPage = 12;

  // Load farms
  useEffect(() => {
    loadFarms();
  }, [page]);

  const loadFarms = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await farmApi.getFarms(page, perPage);
      setFarms(response.items);
      setTotalPages(response.totalPages);
      setTotal(response.total);

      // Load summaries for each farm
      const summaryPromises = response.items.map((farm) =>
        farmApi.getFarmSummary(farm.farmId).catch(() => null)
      );
      const summaryResults = await Promise.all(summaryPromises);

      const summaryMap: Record<string, FarmSummary> = {};
      summaryResults.forEach((summary, index) => {
        if (summary) {
          summaryMap[response.items[index].farmId] = summary;
        }
      });
      setSummaries(summaryMap);
    } catch (err) {
      setError('Failed to load farms. Please try again.');
      console.error('Error loading farms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (farmId: string) => {
    try {
      await farmApi.deleteFarm(farmId);
      loadFarms(); // Reload list
    } catch (err) {
      alert('Failed to delete farm. Please try again.');
      console.error('Error deleting farm:', err);
    }
  };

  // Filter farms
  const filteredFarms = farms.filter((farm) => {
    // Search filter - safely handle null location
    const matchesSearch =
      farm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (farm.location?.city?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (farm.location?.state?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    // Status filter
    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'active' && farm.isActive) ||
      (filterType === 'inactive' && !farm.isActive);

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner />
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  const handleCreateFarm = () => {
    setIsCreateModalOpen(true);
    onCreateFarm?.();
  };

  const handleCreateSuccess = () => {
    loadFarms(); // Reload farms list
  };

  const handleViewStatistics = (farmId: string, farmName: string) => {
    setSelectedFarmId(farmId);
    setSelectedFarmName(farmName);
    setIsAnalyticsModalOpen(true);
  };

  return (
    <Container>
      <CreateFarmModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <FarmAnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => {
          setIsAnalyticsModalOpen(false);
          setSelectedFarmId(null);
          setSelectedFarmName('');
        }}
        farmId={selectedFarmId}
        farmName={selectedFarmName}
      />

      <Header>
        <Title>Farm Management</Title>
        <Actions>
          <SearchInput
            type="text"
            placeholder="Search farms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <CreateButton onClick={handleCreateFarm}>
            <span>+</span>
            <span>New Farm</span>
          </CreateButton>
        </Actions>
      </Header>

      <FilterBar>
        <FilterButton $active={filterType === 'all'} onClick={() => setFilterType('all')}>
          All Farms ({total})
        </FilterButton>
        <FilterButton
          $active={filterType === 'active'}
          onClick={() => setFilterType('active')}
        >
          Active ({farms.filter((f) => f.isActive).length})
        </FilterButton>
        <FilterButton
          $active={filterType === 'inactive'}
          onClick={() => setFilterType('inactive')}
        >
          Inactive ({farms.filter((f) => !f.isActive).length})
        </FilterButton>
      </FilterBar>

      {filteredFarms.length === 0 ? (
        <EmptyState>
          <EmptyIcon>🏞️</EmptyIcon>
          <EmptyTitle>No farms found</EmptyTitle>
          <EmptyDescription>
            {searchTerm
              ? 'Try adjusting your search or filters'
              : 'Get started by creating your first farm'}
          </EmptyDescription>
          {!searchTerm && (
            <CreateButton onClick={handleCreateFarm}>
              <span>+</span>
              <span>Create Your First Farm</span>
            </CreateButton>
          )}
        </EmptyState>
      ) : (
        <>
          <GridContainer>
            {filteredFarms.map((farm) => (
              <FarmCard
                key={farm.farmId}
                farm={farm}
                summary={summaries[farm.farmId]}
                onEdit={onEditFarm}
                onDelete={handleDelete}
                onViewStatistics={handleViewStatistics}
              />
            ))}
          </GridContainer>

          {totalPages > 1 && (
            <Pagination>
              <PageButton onClick={() => setPage(page - 1)} disabled={page === 1}>
                Previous
              </PageButton>
              <PageInfo>
                Page {page} of {totalPages}
              </PageInfo>
              <PageButton onClick={() => setPage(page + 1)} disabled={page === totalPages}>
                Next
              </PageButton>
            </Pagination>
          )}
        </>
      )}
    </Container>
  );
}
