/**
 * FarmList Component
 *
 * Displays a paginated grid of farm cards with search and filter capabilities.
 * Mobile-responsive with collapsible filter section.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import { FarmCard } from './FarmCard';
import { CreateFarmModal } from './CreateFarmModal';
import { FarmAnalyticsModal } from './FarmAnalyticsModal';
import { farmApi } from '../../services/farmApi';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
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
  overflow-x: hidden; /* Prevent horizontal scroll from card content */

  @media (max-width: 768px) {
    padding: 16px;
  }

  @media (max-width: 480px) {
    padding: 16px;
  }
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
  font-size: 16px; /* Prevents iOS zoom on focus */
  width: 300px;
  transition: all 150ms ease-in-out;
  min-height: 44px; /* Touch-friendly height */

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #9e9e9e;
  }

  @media (max-width: 768px) {
    width: 100%;
    font-size: 16px;
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
  justify-content: center;
  gap: 8px;
  min-height: 44px; /* Touch-friendly height */
  white-space: nowrap;

  &:hover {
    background: #1976d2;
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

// Animation for collapsible filter section
const slideDown = keyframes`
  from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    max-height: 500px;
    transform: translateY(0);
  }
`;

// Mobile filter toggle button
const FilterToggleButton = styled.button<{ $isOpen: boolean; $hasActiveFilters: boolean }>`
  display: none;
  padding: 12px 16px;
  background: ${({ $hasActiveFilters }) => ($hasActiveFilters ? '#EBF5FF' : '#f5f5f5')};
  color: ${({ $hasActiveFilters }) => ($hasActiveFilters ? '#3B82F6' : '#616161')};
  border: 1px solid ${({ $hasActiveFilters }) => ($hasActiveFilters ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  @media (max-width: 768px) {
    display: flex;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const FilterToggleIcon = styled.span<{ $isOpen: boolean }>`
  transition: transform 200ms ease-in-out;
  transform: ${({ $isOpen }) => ($isOpen ? 'rotate(180deg)' : 'rotate(0deg)')};
  font-size: 12px;
`;

const FilterToggleText = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActiveFilterBadge = styled.span`
  background: #3B82F6;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
`;

const FilterBar = styled.div<{ $isCollapsed?: boolean }>`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
    overflow: hidden;

    ${({ $isCollapsed }) =>
      $isCollapsed
        ? css`
            display: none;
          `
        : css`
            display: flex;
            animation: ${slideDown} 200ms ease-out forwards;
          `}
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 12px 16px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'transparent')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-height: 44px; /* Touch-friendly height */
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }

  &:active {
    transform: scale(0.98);
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const ResetFiltersButton = styled.button`
  padding: 12px 16px;
  background: transparent;
  color: #EF4444;
  border: 1px solid #EF4444;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-left: auto;
  min-height: 44px; /* Touch-friendly height */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    background: #FEE2E2;
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    margin-left: 0;
    width: 100%;
    margin-top: 4px;
  }
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 16px;
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
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 12px;
  }
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 12px 16px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'white')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-height: 44px; /* Touch-friendly height */
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
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

const PageSizeContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;

  @media (max-width: 768px) {
    margin-left: 0;
    width: 100%;
    justify-content: center;
    margin-top: 12px;
  }
`;

const PageSizeLabel = styled.span`
  font-size: 14px;
  color: #616161;
`;

const PageSizeSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px; /* Prevents iOS zoom */
  color: #212121;
  background: white;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-height: 44px; /* Touch-friendly height */

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:hover {
    border-color: #bdbdbd;
  }
`;

// Page size options
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

// ============================================================================
// COMPONENT
// ============================================================================

type FilterType = 'all' | 'active' | 'inactive';

export function FarmList({ onCreateFarm, onEditFarm }: FarmListProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [summaries, setSummaries] = useState<Record<string, FarmSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get filter values from URL params with defaults
  const searchTerm = searchParams.get('search') || '';
  const filterType = (searchParams.get('filter') as FilterType) || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('perPage') || String(DEFAULT_PAGE_SIZE), 10);

  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [selectedFarmName, setSelectedFarmName] = useState<string>('');

  // Mobile filter collapse state
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Count active filters for badge
  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) +
    (perPage !== DEFAULT_PAGE_SIZE ? 1 : 0);


  // Helper function to update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || (key === 'filter' && value === 'all') || (key === 'page' && value === '1')) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  const setSearchTerm = (value: string) => updateParams({ search: value });
  const setFilterType = (value: FilterType) => updateParams({ filter: value, page: '1' });
  const setPage = (value: number) => updateParams({ page: value.toString() });
  const setPerPage = (value: number) => updateParams({ perPage: value === DEFAULT_PAGE_SIZE ? null : value.toString(), page: '1' });

  // Reset all filters to default state
  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // Check if any filters are active
  const hasActiveFilters = searchTerm !== '' || filterType !== 'all' || page !== 1 || perPage !== DEFAULT_PAGE_SIZE;

  // Load farms
  useEffect(() => {
    loadFarms();
  }, [page, perPage]);

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
      showSuccessToast('Farm deleted successfully');
      // Remove deleted farm from state immediately to prevent stale data errors
      setFarms((prev) => prev.filter((f) => f.farmId !== farmId));
      setSummaries((prev) => {
        const newSummaries = { ...prev };
        delete newSummaries[farmId];
        return newSummaries;
      });
      // Then reload the full list
      loadFarms();
    } catch (err) {
      showErrorToast('Failed to delete farm. Please try again.');
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

      {/* Mobile filter toggle button */}
      <FilterToggleButton
        $isOpen={isFilterOpen}
        $hasActiveFilters={hasActiveFilters}
        onClick={() => setIsFilterOpen(!isFilterOpen)}
        aria-expanded={isFilterOpen}
        aria-controls="filter-bar"
      >
        <FilterToggleText>
          <span>🔍</span>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <ActiveFilterBadge>{activeFilterCount}</ActiveFilterBadge>
          )}
        </FilterToggleText>
        <FilterToggleIcon $isOpen={isFilterOpen}>▼</FilterToggleIcon>
      </FilterToggleButton>

      <FilterBar $isCollapsed={!isFilterOpen} id="filter-bar">
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
        {hasActiveFilters && (
          <ResetFiltersButton onClick={resetFilters}>
            <span>✕</span>
            <span>Clear Filters</span>
          </ResetFiltersButton>
        )}
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
            <PageSizeContainer>
              <PageSizeLabel>Items per page:</PageSizeLabel>
              <PageSizeSelect
                value={perPage}
                onChange={(e) => setPerPage(parseInt(e.target.value, 10))}
                aria-label="Items per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </PageSizeSelect>
            </PageSizeContainer>
          </Pagination>
        </>
      )}
    </Container>
  );
}
