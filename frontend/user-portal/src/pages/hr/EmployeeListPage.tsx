/**
 * EmployeeListPage Component
 *
 * Main employee list page with search, filters, and pagination.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { EmployeeTable } from '../../components/hr/EmployeeTable';
import { EmployeeCard } from '../../components/hr/EmployeeCard';
import { hrApi } from '../../services/hrService';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import type { Employee, EmployeeStatus } from '../../types/hr';

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
  white-space: nowrap;

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
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const FilterLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #616161;
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

const FilterSelect = styled.select`
  padding: 8px 32px 8px 12px;
  background: white;
  color: #616161;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23616161' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  min-width: 150px;

  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:hover {
    border-color: #bdbdbd;
  }
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 8px;
  background: #f5f5f5;
  padding: 4px;
  border-radius: 8px;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? 'white' : 'transparent')};
  color: #616161;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none')};

  &:hover {
    background: ${({ $active }) => ($active ? 'white' : '#eeeeee')};
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
  color: #9e9e9e;
  gap: 16px;
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
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
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
  padding: 8px 16px;
  background: white;
  color: #616161;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: #f5f5f5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageInfo = styled.span`
  font-size: 14px;
  color: #616161;
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
`;

const EmptyStateIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const EmptyStateTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #424242;
  margin: 0 0 8px 0;
`;

const EmptyStateMessage = styled.p`
  font-size: 14px;
  color: #9e9e9e;
  margin: 0 0 24px 0;
  text-align: center;
  max-width: 400px;
`;

const ClearSearchButton = styled.button`
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

const CreateActionButton = styled.button`
  padding: 12px 24px;
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

const ClearFiltersButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: #EF4444;
  border: 1px solid #EF4444;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-left: auto;

  &:hover {
    background: #FEE2E2;
  }

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

// Common departments for filtering
const DEPARTMENTS = [
  'Farm Operations',
  'Engineering',
  'HR',
  'Sales',
  'Marketing',
  'Finance',
  'IT',
  'Administration',
  'Logistics',
  'Quality Assurance',
];

export function EmployeeListPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
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
    loadEmployees();
  }, [page, statusFilter, departmentFilter, searchQuery]);

  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      // Truncate search query to prevent issues with very long strings
      const truncatedSearch = searchQuery ? searchQuery.slice(0, 500) : undefined;
      const result = await hrApi.getEmployees({
        page,
        perPage,
        search: truncatedSearch || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        department: departmentFilter === 'all' ? undefined : departmentFilter,
      });
      setEmployees(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
      setError(err.response?.data?.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleStatusFilter = (status: EmployeeStatus | 'all') => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleDepartmentFilter = (department: string) => {
    setDepartmentFilter(department);
    setPage(1);
  };

  const handleCreateEmployee = () => {
    navigate('/hr/employees/new');
  };

  const handleViewEmployee = (employeeId: string) => {
    navigate(`/hr/employees/${employeeId}`);
  };

  const handleEditEmployee = (employeeId: string) => {
    navigate(`/hr/employees/${employeeId}`);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    try {
      await hrApi.deleteEmployee(employeeId);
      showSuccessToast('Employee deleted successfully');
      loadEmployees();
    } catch (err: any) {
      console.error('Failed to delete employee:', err);
      showErrorToast(err.response?.data?.message || 'Failed to delete employee');
    }
  };

  // Reset all filters to default state
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDepartmentFilter('all');
    setPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || departmentFilter !== 'all';

  return (
    <Container>
      <Header>
        <Title>Employee Management</Title>
        <Actions>
          <SearchInput
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <CreateButton onClick={handleCreateEmployee}>
            <span>+</span>
            New Employee
          </CreateButton>
        </Actions>
      </Header>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Status:</FilterLabel>
          <FilterButton $active={statusFilter === 'all'} onClick={() => handleStatusFilter('all')}>
            All
          </FilterButton>
          <FilterButton $active={statusFilter === 'active'} onClick={() => handleStatusFilter('active')}>
            Active
          </FilterButton>
          <FilterButton $active={statusFilter === 'on_leave'} onClick={() => handleStatusFilter('on_leave')}>
            On Leave
          </FilterButton>
          <FilterButton $active={statusFilter === 'terminated'} onClick={() => handleStatusFilter('terminated')}>
            Terminated
          </FilterButton>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Department:</FilterLabel>
          <FilterSelect
            value={departmentFilter}
            onChange={(e) => handleDepartmentFilter(e.target.value)}
            aria-label="Department filter"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </FilterSelect>
        </FilterGroup>

        <ViewToggle>
          <ViewButton $active={viewMode === 'table'} onClick={() => setViewMode('table')}>
            Table
          </ViewButton>
          <ViewButton $active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
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
          Loading employees...
        </LoadingContainer>
      ) : !loading && employees.length === 0 && searchQuery ? (
        <EmptyStateContainer>
          <EmptyStateIcon>🔍</EmptyStateIcon>
          <EmptyStateTitle>No results found</EmptyStateTitle>
          <EmptyStateMessage>
            No employees match your search for &ldquo;{searchQuery.length > 50 ? searchQuery.slice(0, 50) + '...' : searchQuery}&rdquo;. Try adjusting your search or filters.
          </EmptyStateMessage>
          <ClearSearchButton onClick={() => { setSearchQuery(''); setPage(1); }}>
            Clear Search
          </ClearSearchButton>
        </EmptyStateContainer>
      ) : !loading && employees.length === 0 && !searchQuery ? (
        <EmptyStateContainer>
          <EmptyStateIcon>👔</EmptyStateIcon>
          <EmptyStateTitle>No employees yet</EmptyStateTitle>
          <EmptyStateMessage>
            Get started by adding your first employee to the HR system.
          </EmptyStateMessage>
          <CreateActionButton onClick={handleCreateEmployee}>
            + Add Your First Employee
          </CreateActionButton>
        </EmptyStateContainer>
      ) : viewMode === 'table' ? (
        <EmployeeTable
          employees={employees}
          onView={handleViewEmployee}
          onEdit={handleEditEmployee}
          onDelete={handleDeleteEmployee}
        />
      ) : (
        <CardGrid>
          {employees.map((employee) => (
            <EmployeeCard
              key={employee.employeeId}
              employee={employee}
              onClick={() => handleViewEmployee(employee.employeeId)}
              showActions={true}
              onEdit={() => handleEditEmployee(employee.employeeId)}
              onDelete={() => {
                if (window.confirm(`Are you sure you want to delete "${employee.firstName} ${employee.lastName}"?`)) {
                  handleDeleteEmployee(employee.employeeId);
                }
              }}
            />
          ))}
        </CardGrid>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PageButton onClick={() => setPage(page - 1)} disabled={page === 1}>
            Previous
          </PageButton>
          <PageInfo>
            Page {page} of {totalPages} ({total} total)
          </PageInfo>
          <PageButton onClick={() => setPage(page + 1)} disabled={page === totalPages}>
            Next
          </PageButton>
        </Pagination>
      )}
    </Container>
  );
}
