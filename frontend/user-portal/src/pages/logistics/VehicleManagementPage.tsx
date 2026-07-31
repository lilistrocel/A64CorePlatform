/**
 * VehicleManagementPage Component
 *
 * Vehicle fleet management with filters and CRUD operations.
 *
 * Night Observatory (T-901 Phase 3): PageHeader for the title block, Chip
 * filter pills (phaseBadge-coloured for status, celeste for type — vehicle
 * type is not a lifecycle state so it never takes a phase colour), glass
 * modal, gold Primary CTA for "New Vehicle".
 */

import { useState, useEffect, useCallback } from 'react';
import styled, { css } from 'styled-components';
import { Plus, X } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import { VehicleTable } from '../../components/logistics/VehicleTable';
import { VehicleCard } from '../../components/logistics/VehicleCard';
import { VehicleForm } from '../../components/logistics/VehicleForm';
import { logisticsApi } from '../../services/logisticsService';
import type { Vehicle, VehicleType, VehicleStatus, VehicleOwnership, VehicleCreate, VehicleUpdate } from '../../types/logistics';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';

// Mobile breakpoint for responsive view switching
const MOBILE_BREAKPOINT = 768;

// Vehicle status -> phase key (spec §5.2 extrapolation) — identical map to
// VehicleCard.tsx / VehicleTable.tsx.
const VEHICLE_STATUS_TO_PHASE: Record<VehicleStatus, PhaseKey> = {
  available: 'fruiting',
  in_use: 'inoculated',
  maintenance: 'maintenance',
  retired: 'decommissioned',
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: 10px 16px;
  font-size: 14px;
  width: 280px;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  justify-content: space-between;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterLabel = styled.span`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

/** Filter pill — spec §5 preamble: "same status = same colour in every
 * context (badge, card edge, filter pill, ...)". Type filters have no phase
 * (vehicle type is not a lifecycle state) so their active state always
 * falls back to celeste, never gold. */
const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey }>`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: capitalize;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $active, $phase, theme }) =>
    $active &&
    ($phase
      ? phaseBadge($phase)
      : css`
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.celeste};
          background: rgba(180, 200, 220, 0.14);
        `)}
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 4px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  padding: 4px;
  border-radius: 10px;
`;

const ViewButton = styled.button<{ $active: boolean }>`
  padding: 7px 16px;
  background: ${({ $active, theme }) => ($active ? theme.colors.glass.hi : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  border: none;
  border-radius: 7px;
  font-size: 13px;
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
  justify-content: center;
  align-items: center;
  min-height: 400px;
  ${monoLabel}
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 24px;
`;

const ModalContent = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
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
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.bright.coral};
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
  ${glassControl}
  padding: 8px 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
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
  color: ${({ theme }) => theme.colors.celeste};
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [userViewPreference, setUserViewPreference] = useState<'table' | 'grid' | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    loadVehicles();
  }, [page, typeFilter, statusFilter, ownershipFilter, searchQuery]);

  const loadVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      // Truncate search query to prevent issues with very long strings
      const truncatedSearch = searchQuery ? searchQuery.slice(0, 500) : undefined;
      const result = await logisticsApi.getVehicles({
        page,
        perPage,
        search: truncatedSearch || undefined,
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
      showSuccessToast('Vehicle created successfully');
      loadVehicles();
    } catch (err: any) {
      console.error('Failed to create vehicle:', err);
      showErrorToast(err.response?.data?.message || 'Failed to create vehicle');
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
      showSuccessToast('Vehicle updated successfully');
      loadVehicles();
    } catch (err: any) {
      console.error('Failed to update vehicle:', err);
      showErrorToast(err.response?.data?.message || 'Failed to update vehicle');
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
      <PageHeader
        breadcrumb="Logistics · Live"
        title="Vehicle Management"
        emphasizeLastWord
        description="The fleet used to run scheduled shipments."
        stats={[{ value: total, label: 'Vehicles' }]}
      />

      <ActionRow>
        <SearchInput
          type="text"
          placeholder="Search vehicles..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
        />
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} strokeWidth={2} /> New Vehicle
        </Button>
      </ActionRow>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Type:</FilterLabel>
          {(['all', 'truck', 'van', 'pickup', 'refrigerated'] as const).map((t) => (
            <Chip key={t} $active={typeFilter === t} onClick={() => { setTypeFilter(t as VehicleType | 'all'); setPage(1); }}>
              {t === 'all' ? 'All' : t}
            </Chip>
          ))}
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Status:</FilterLabel>
          {(['all', 'available', 'in_use', 'maintenance', 'retired'] as const).map((s) => (
            <Chip
              key={s}
              $active={statusFilter === s}
              $phase={s === 'all' ? undefined : VEHICLE_STATUS_TO_PHASE[s]}
              onClick={() => { setStatusFilter(s as VehicleStatus | 'all'); setPage(1); }}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </Chip>
          ))}
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
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Vehicle</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
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
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Vehicle</ModalTitle>
              <CloseButton onClick={() => setEditingVehicle(null)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
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
