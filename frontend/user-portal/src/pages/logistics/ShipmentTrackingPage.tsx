/**
 * ShipmentTrackingPage Component
 *
 * Shipment tracking and status management.
 *
 * Night Observatory (T-901 Phase 3): PageHeader for the title block, Chip
 * filter pills (phaseBadge-coloured for real ShipmentStatus values, celeste
 * fallback for "All"), glass modal, gold Primary CTA for "New Shipment".
 */

import { useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Plus, X } from 'lucide-react';
import type { PhaseKey } from '@a64core/shared';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import { ShipmentTable } from '../../components/logistics/ShipmentTable';
import { ShipmentCard } from '../../components/logistics/ShipmentCard';
import { ShipmentForm } from '../../components/logistics/ShipmentForm';
import { logisticsApi } from '../../services/logisticsService';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import type { Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus } from '../../types/logistics';

// Shipment status -> phase key (spec §5.2 extrapolation) — identical map to
// ShipmentCard.tsx / ShipmentTable.tsx (this page renders filter pills, not
// status badges, so it only needs the lookup, not the full map type).
const SHIPMENT_STATUS_TO_PHASE: Record<ShipmentStatus, PhaseKey> = {
  scheduled: 'fruitingInit',
  in_transit: 'inoculated',
  delivered: 'fruiting',
  cancelled: 'decommissioned',
};

// Note: the pre-existing "Pending" filter option below does not correspond
// to a value in the ShipmentStatus union (which is only scheduled /
// in_transit / delivered / cancelled) — that mismatch predates this reskin
// and is left exactly as-is (behaviour unchanged); it simply has no phase
// colour to fall back on, same as "All".
function filterPhase(status: string): PhaseKey | undefined {
  return (SHIPMENT_STATUS_TO_PHASE as Record<string, PhaseKey>)[status];
}

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const FilterBar = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
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
 * context (badge, card edge, filter pill, ...)". Active state without a
 * phase (the "All"/"Pending" chips) falls back to celeste, never gold. */
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

export function ShipmentTrackingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the global farming year from sidebar
  const { selectedYear } = useFarmingYearStore();

  // Load shipments when filters change
  useEffect(() => {
    loadShipments();
  }, [statusFilter, selectedYear]);

  const loadShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await logisticsApi.getShipments({
        status: statusFilter === 'all' ? undefined : statusFilter,
        farmingYear: selectedYear ?? undefined,
      });
      setShipments(result.items);
    } catch (err: any) {
      console.error('Failed to load shipments:', err);
      setError(err.response?.data?.message || 'Failed to load shipments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShipment = async (data: ShipmentCreate) => {
    setIsSubmitting(true);
    try {
      await logisticsApi.createShipment(data);
      setShowCreateModal(false);
      loadShipments();
    } catch (err: any) {
      console.error('Failed to create shipment:', err);
      alert(err.response?.data?.message || 'Failed to create shipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateShipment = async (data: ShipmentUpdate) => {
    if (!editingShipment) return;
    setIsSubmitting(true);
    try {
      await logisticsApi.updateShipment(editingShipment.shipmentId, data);
      setEditingShipment(null);
      loadShipments();
    } catch (err: any) {
      console.error('Failed to update shipment:', err);
      alert(err.response?.data?.message || 'Failed to update shipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteShipment = async (shipmentId: string) => {
    try {
      await logisticsApi.deleteShipment(shipmentId);
      loadShipments();
    } catch (err: any) {
      console.error('Failed to delete shipment:', err);
      alert(err.response?.data?.message || 'Failed to delete shipment');
    }
  };

  return (
    <Container>
      <PageHeader
        breadcrumb="Logistics · Live"
        title="Shipment Tracking"
        emphasizeLastWord
        description={`${shipments.length} shipment${shipments.length !== 1 ? 's' : ''} found${selectedYear !== null ? ' for the selected farming year' : ''}.`}
        stats={selectedYear !== null ? [{ value: selectedYear, label: 'Farming Year' }] : undefined}
      />

      <ActionRow>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} strokeWidth={2} /> New Shipment
        </Button>
      </ActionRow>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Status:</FilterLabel>
          {(['all', 'pending', 'scheduled', 'in_transit', 'delivered', 'cancelled'] as const).map((s) => (
            <Chip
              key={s}
              $active={statusFilter === s}
              $phase={filterPhase(s)}
              onClick={() => setStatusFilter(s as ShipmentStatus | 'all')}
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
        <LoadingContainer>Loading shipments...</LoadingContainer>
      ) : viewMode === 'table' ? (
        <ShipmentTable
          shipments={shipments}
          onEdit={(id) => setEditingShipment(shipments.find((s) => s.shipmentId === id) || null)}
          onDelete={handleDeleteShipment}
        />
      ) : (
        <CardGrid>
          {shipments.map((shipment) => (
            <ShipmentCard
              key={shipment.shipmentId}
              shipment={shipment}
              showActions={true}
              onEdit={() => setEditingShipment(shipment)}
              onDelete={() => {
                if (window.confirm(`Are you sure you want to delete "${shipment.shipmentCode}"?`)) {
                  handleDeleteShipment(shipment.shipmentId);
                }
              }}
            />
          ))}
        </CardGrid>
      )}

      {showCreateModal && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Shipment</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ShipmentForm
              onSubmit={handleCreateShipment}
              onCancel={() => setShowCreateModal(false)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}

      {editingShipment && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Shipment</ModalTitle>
              <CloseButton onClick={() => setEditingShipment(null)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ShipmentForm
              shipment={editingShipment}
              onSubmit={handleUpdateShipment}
              onCancel={() => setEditingShipment(null)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
