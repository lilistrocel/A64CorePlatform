/**
 * ShipmentTrackingPage Component
 *
 * Shipment tracking and status management.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { ShipmentTable } from '../../components/logistics/ShipmentTable';
import { ShipmentCard } from '../../components/logistics/ShipmentCard';
import { ShipmentForm } from '../../components/logistics/ShipmentForm';
import { logisticsApi } from '../../services/logisticsService';
import type { Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus } from '../../types/logistics';

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
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0;
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

  &:hover {
    background: #1976d2;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
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

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
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

export function ShipmentTrackingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadShipments();
  }, [statusFilter]);

  const loadShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await logisticsApi.getShipments({
        status: statusFilter === 'all' ? undefined : statusFilter,
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
      <Header>
        <Title>Shipment Tracking</Title>
        <CreateButton onClick={() => setShowCreateModal(true)}>
          <span>+</span> New Shipment
        </CreateButton>
      </Header>

      <FilterBar>
        <FilterGroup>
          <FilterLabel>Status:</FilterLabel>
          <FilterButton $active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            All
          </FilterButton>
          <FilterButton $active={statusFilter === 'scheduled'} onClick={() => setStatusFilter('scheduled')}>
            Scheduled
          </FilterButton>
          <FilterButton $active={statusFilter === 'in_transit'} onClick={() => setStatusFilter('in_transit')}>
            In Transit
          </FilterButton>
          <FilterButton $active={statusFilter === 'delivered'} onClick={() => setStatusFilter('delivered')}>
            Delivered
          </FilterButton>
          <FilterButton $active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')}>
            Cancelled
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
        <Modal onClick={() => setShowCreateModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Shipment</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)}>&times;</CloseButton>
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
        <Modal onClick={() => setEditingShipment(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Shipment</ModalTitle>
              <CloseButton onClick={() => setEditingShipment(null)}>&times;</CloseButton>
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
