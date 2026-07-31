/**
 * CRMPage Component
 *
 * Main CRM page with customer list, search, and filters.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Search, Users, Plus, LayoutGrid, TableProperties } from 'lucide-react';
import { CustomerTable } from '../../components/crm/CustomerTable';
import { CustomerCard } from '../../components/crm/CustomerCard';
import { crmApi } from '../../services/crmService';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import { formatNumber } from '../../utils/formatNumber';
import type { Customer, CustomerType, CustomerStatus } from '../../types/crm';
import { PageHeader, glassControl, glassPanel, monoLabel } from '@a64core/shared';

// Mobile breakpoint for responsive view switching
const MOBILE_BREAKPOINT = 768;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Actions = styled.div`
  display: flex;
  gap: 16px;

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
  }
`;

const SearchWrap = styled.div`
  position: relative;
  width: 300px;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  pointer-events: none;
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: 12px 16px 12px 38px;
  min-height: 44px; /* WCAG touch target minimum */
  font-size: 14px;
  width: 100%;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const CreateButton = styled.button`
  padding: 12px 24px;
  min-height: 44px; /* WCAG touch target minimum */
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;

  &:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
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
  flex-wrap: wrap;
  align-items: center;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const FilterLabel = styled.span`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
`;

/* Active state uses celeste, not gold — gold is budgeted for the breadcrumb
   kicker + primary CTA only on this screen (spec §3: filter/selection chips
   are not on the gold allow-list). */
const FilterButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  min-height: 44px; /* WCAG touch target minimum */
  background: ${({ $active }) => ($active ? 'rgba(180, 200, 220, 0.1)' : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.celeste)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.glass.border : 'transparent')};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ViewToggle = styled.div`
  ${glassControl}
  display: flex;
  gap: 4px;
  padding: 4px;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  min-height: 36px;
  background: ${({ $active, theme }) => ($active ? theme.colors.glass.hi : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
  gap: 16px;
`;

/* Lapis, not gold — spinners are not on the spec §3 gold allow-list. */
const Spinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid ${({ theme }) => theme.colors.glass.border};
  border-top-color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

/* Secondary (glass), not gold — the header's CreateButton is already this
   view's one primary CTA (spec §3) and stays mounted behind this empty
   state, so a second gold gradient here would put two gold CTAs on screen
   at once. */
const CreateActionButton = styled.button`
  padding: 12px 24px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
`;

const PageButton = styled.button`
  ${glassControl}
  padding: 8px 16px;
  min-height: 44px; /* WCAG touch target minimum */
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  ${monoLabel}
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyStateContainer = styled.div`
  ${glassPanel}
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  border-radius: 18px;
`;

const EmptyStateIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
`;

const EmptyStateTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 22px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px 0;
`;

const EmptyStateMessage = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 24px 0;
  text-align: center;
  max-width: 400px;
`;

/* Secondary (glass), not gold — same reasoning as CreateActionButton above:
   the header CreateButton is this view's one gold CTA. */
const ClearSearchButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ClearFiltersButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-left: auto;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CRMPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<CustomerType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [userViewPreference, setUserViewPreference] = useState<'table' | 'grid' | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  // Calculate actual view mode: on mobile, default to grid unless user explicitly chose table
  const viewMode: 'table' | 'grid' = isMobile
    ? (userViewPreference || 'grid')
    : (userViewPreference || 'table');

  // Handle window resize for responsive view switching
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle view mode change (user explicit choice)
  const setViewMode = useCallback((mode: 'table' | 'grid') => {
    setUserViewPreference(mode);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [page, typeFilter, statusFilter, searchQuery]);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Truncate search query to prevent issues with very long strings
      const truncatedSearch = searchQuery ? searchQuery.slice(0, 500) : undefined;
      const result = await crmApi.getCustomers({
        page,
        perPage,
        search: truncatedSearch || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setCustomers(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err: any) {
      console.error('Failed to load customers:', err);
      setError(err.response?.data?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1); // Reset to first page on search
  };

  const handleTypeFilter = (type: CustomerType | 'all') => {
    setTypeFilter(type);
    setPage(1);
  };

  const handleStatusFilter = (status: CustomerStatus | 'all') => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleCreateCustomer = () => {
    navigate('/crm/customers/new');
  };

  const handleViewCustomer = (customerId: string) => {
    navigate(`/crm/customers/${customerId}`);
  };

  const handleEditCustomer = (customerId: string) => {
    navigate(`/crm/customers/${customerId}/edit`);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      await crmApi.deleteCustomer(customerId);
      showSuccessToast('Customer deleted successfully');
      loadCustomers();
    } catch (err: any) {
      console.error('Failed to delete customer:', err);
      showErrorToast(err.response?.data?.detail || err.response?.data?.message || 'Failed to delete customer');
    }
  };

  // Reset all filters to default state
  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'all' || statusFilter !== 'all';

  return (
    <Container>
      <PageHeader
        breadcrumb="CRM · LIVE"
        title="Customer Relationship Management"
        emphasizeLastWord
        description="Track leads, prospects and accounts in one place."
        stats={[{ value: formatNumber(total), label: 'Total Customers', alive: true }]}
      />

      <Actions style={{ marginBottom: 24, justifyContent: 'flex-end' }}>
        <SearchWrap>
          <SearchIcon><Search size={15} strokeWidth={1.8} /></SearchIcon>
          <SearchInput
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </SearchWrap>
        <CreateButton onClick={handleCreateCustomer}>
          <Plus size={15} strokeWidth={2} />
          New Customer
        </CreateButton>
      </Actions>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Type</FilterLabel>
          <FilterButton $active={typeFilter === 'all'} onClick={() => handleTypeFilter('all')}>
            All
          </FilterButton>
          <FilterButton $active={typeFilter === 'individual'} onClick={() => handleTypeFilter('individual')}>
            Individual
          </FilterButton>
          <FilterButton $active={typeFilter === 'business'} onClick={() => handleTypeFilter('business')}>
            Business
          </FilterButton>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Status</FilterLabel>
          <FilterButton $active={statusFilter === 'all'} onClick={() => handleStatusFilter('all')}>
            All
          </FilterButton>
          <FilterButton $active={statusFilter === 'lead'} onClick={() => handleStatusFilter('lead')}>
            Lead
          </FilterButton>
          <FilterButton $active={statusFilter === 'prospect'} onClick={() => handleStatusFilter('prospect')}>
            Prospect
          </FilterButton>
          <FilterButton $active={statusFilter === 'active'} onClick={() => handleStatusFilter('active')}>
            Active
          </FilterButton>
          <FilterButton $active={statusFilter === 'inactive'} onClick={() => handleStatusFilter('inactive')}>
            Inactive
          </FilterButton>
        </FilterGroup>

        <ViewToggle>
          <ViewButton $active={viewMode === 'table'} onClick={() => setViewMode('table')}>
            <TableProperties size={14} strokeWidth={1.8} />
            Table
          </ViewButton>
          <ViewButton $active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
            <LayoutGrid size={14} strokeWidth={1.8} />
            Grid
          </ViewButton>
        </ViewToggle>

        {hasActiveFilters && (
          <ClearFiltersButton onClick={handleClearFilters}>
            Clear Filters
          </ClearFiltersButton>
        )}
      </FilterBar>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>
          <Spinner />
          Loading customers...
        </LoadingContainer>
      ) : !loading && customers.length === 0 && searchQuery ? (
        <EmptyStateContainer>
          <EmptyStateIcon><Search size={40} strokeWidth={1.4} /></EmptyStateIcon>
          <EmptyStateTitle>No results found</EmptyStateTitle>
          <EmptyStateMessage>
            No customers match your search for &ldquo;{searchQuery.length > 50 ? searchQuery.slice(0, 50) + '...' : searchQuery}&rdquo;. Try adjusting your search or filters.
          </EmptyStateMessage>
          <ClearSearchButton onClick={() => { setSearchQuery(''); setPage(1); }}>
            Clear Search
          </ClearSearchButton>
        </EmptyStateContainer>
      ) : !loading && customers.length === 0 && !searchQuery ? (
        <EmptyStateContainer>
          <EmptyStateIcon><Users size={40} strokeWidth={1.4} /></EmptyStateIcon>
          <EmptyStateTitle>No customers yet</EmptyStateTitle>
          <EmptyStateMessage>
            Get started by adding your first customer to the CRM.
          </EmptyStateMessage>
          <CreateActionButton onClick={handleCreateCustomer}>
            <Plus size={15} strokeWidth={2} />
            Create Your First Customer
          </CreateActionButton>
        </EmptyStateContainer>
      ) : viewMode === 'table' ? (
        <CustomerTable
          customers={customers}
          onView={handleViewCustomer}
          onEdit={handleEditCustomer}
          onDelete={handleDeleteCustomer}
        />
      ) : (
        <CardGrid>
          {customers.map((customer) => (
            <CustomerCard
              key={customer.customerId}
              customer={customer}
              onClick={() => handleViewCustomer(customer.customerId)}
              showActions={true}
              onEdit={() => handleEditCustomer(customer.customerId)}
              onDelete={() => {
                if (window.confirm(`Are you sure you want to delete "${customer.name}"?`)) {
                  handleDeleteCustomer(customer.customerId);
                }
              }}
            />
          ))}
        </CardGrid>
      )}

      {!loading && customers.length > 0 && (
        <Pagination>
          <PageButton onClick={() => setPage(page - 1)} disabled={page === 1}>
            Previous
          </PageButton>
          <PageInfo>
            Page {formatNumber(page)} of {formatNumber(totalPages)} ({formatNumber(total)} total)
          </PageInfo>
          <PageButton onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
            Next
          </PageButton>
        </Pagination>
      )}
    </Container>
  );
}
