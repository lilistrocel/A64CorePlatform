/**
 * VehicleManagementPage Component
 *
 * Vehicle fleet management with filters and CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { VehicleTable } from '../../components/logistics/VehicleTable';
import { VehicleCard } from '../../components/logistics/VehicleCard';
import { VehicleForm } from '../../components/logistics/VehicleForm';
import { logisticsApi } from '../../services/logisticsService';
import type { Vehicle, VehicleType, VehicleStatus, VehicleOwnership, VehicleCreate, VehicleUpdate } from '../../types/logistics';

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
  white-space: nowrap;

  &:hover {
    background: #1976d2;
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

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  font-size: 24px;
  color: #616161;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: #212121;
  }
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

// ============================================================================
// COMPONENT
// ============================================================================

export function VehicleManagementPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<VehicleType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<VehicleOwnership | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const perPage = 20;

  useEffect(() => {
    loadVehicles();
  }, [page, typeFilter, statusFilter, ownershipFilter, searchQuery]);

  const loadVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await logisticsApi.getVehicles({
        page,
        perPage,
        search: searchQuery || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        ownership: ownershipFilter === 'all' ? undefined : ownershipFilter,
      });
      setVehicles(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err: any) {
      console.error('Failed to load vehicles:', err);
      setError(err.response?.data?.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVehicle = async (data: VehicleCreate) => {
    setIsSubmitting(true);
    try {
      await logisticsApi.createVehicle(data);
      setShowCreateModal(false);
      loadVehicles();
    } catch (err: any) {
      console.error('Failed to create vehicle:', err);
      alert(err.response?.data?.message || 'Failed to create vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateVehicle = async (data: VehicleUpdate) => {
    if (!editingVehicle) return;
    setIsSubmitting(true);
    try {
      await logisticsApi.updateVehicle(editingVehicle.vehicleId, data);
      setEditingVehicle(null);
      loadVehicles();
    } catch (err: any) {
      console.error('Failed to update vehicle:', err);
      alert(err.response?.data?.message || 'Failed to update vehicle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    try {
      await logisticsApi.deleteVehicle(vehicleId);
      loadVehicles();
    } catch (err: any) {
      console.error('Failed to delete vehicle:', err);
      alert(err.response?.data?.message || 'Failed to delete vehicle');
    }
  };

  return (
    <Container>
      <Header>
        <Title>Vehicle Management</Title>
        <Actions>
          <SearchInput
            type="text"
            placeholder="Search vehicles..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
          <CreateButton onClick={() => setShowCreateModal(true)}>
            <span>+</span> New Vehicle
          </CreateButton>
        </Actions>
      </Header>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Type:</FilterLabel>
          <FilterButton $active={typeFilter === 'all'} onClick={() => { setTypeFilter('all'); setPage(1); }}>
            All
          </FilterButton>
          <FilterButton $active={typeFilter === 'truck'} onClick={() => { setTypeFilter('truck'); setPage(1); }}>
            Truck
          </FilterButton>
          <FilterButton $active={typeFilter === 'van'} onClick={() => { setTypeFilter('van'); setPage(1); }}>
            Van
          </FilterButton>
          <FilterButton $active={typeFilter === 'pickup'} onClick={() => { setTypeFilter('pickup'); setPage(1); }}>
            Pickup
          </FilterButton>
          <FilterButton $active={typeFilter === 'refrigerated'} onClick={() => { setTypeFilter('refrigerated'); setPage(1); }}>
            Refrigerated
          </FilterButton>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Status:</FilterLabel>
          <FilterButton $active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); setPage(1); }}>
            All
          </FilterButton>
          <FilterButton $active={statusFilter === 'available'} onClick={() => { setStatusFilter('available'); setPage(1); }}>
            Available
          </FilterButton>
          <FilterButton $active={statusFilter === 'in_use'} onClick={() => { setStatusFilter('in_use'); setPage(1); }}>
            In Use
          </FilterButton>
          <FilterButton $active={statusFilter === 'maintenance'} onClick={() => { setStatusFilter('maintenance'); setPage(1); }}>
            Maintenance
          </FilterButton>
          <FilterButton $active={statusFilter === 'retired'} onClick={() => { setStatusFilter('retired'); setPage(1); }}>
            Retired
          </FilterButton>
        </FilterGroup>

        <ViewToggle>
          <ViewButton $active={viewMode === 'table'} onClick={() => setViewMode('table')}>
            Table
          </ViewButton>
          <ViewButton $active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
            Grid
          </ViewButton>
        </ViewToggle>
      </FilterBar>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>Loading vehicles...</LoadingContainer>
      ) : viewMode === 'table' ? (
        <VehicleTable
          vehicles={vehicles}
          onEdit={(id) => setEditingVehicle(vehicles.find((v) => v.vehicleId === id) || null)}
          onDelete={handleDeleteVehicle}
        />
      ) : (
        <CardGrid>
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.vehicleId}
              vehicle={vehicle}
              showActions={true}
              onEdit={() => setEditingVehicle(vehicle)}
              onDelete={() => {
                if (window.confirm(`Are you sure you want to delete "${vehicle.name}"?`)) {
                  handleDeleteVehicle(vehicle.vehicleId);
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

      {showCreateModal && (
        <Modal onClick={() => setShowCreateModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Vehicle</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)}>&times;</CloseButton>
            </ModalHeader>
            <VehicleForm
              onSubmit={handleCreateVehicle}
              onCancel={() => setShowCreateModal(false)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}

      {editingVehicle && (
        <Modal onClick={() => setEditingVehicle(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Vehicle</ModalTitle>
              <CloseButton onClick={() => setEditingVehicle(null)}>&times;</CloseButton>
            </ModalHeader>
            <VehicleForm
              vehicle={editingVehicle}
              onSubmit={handleUpdateVehicle}
              onCancel={() => setEditingVehicle(null)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
