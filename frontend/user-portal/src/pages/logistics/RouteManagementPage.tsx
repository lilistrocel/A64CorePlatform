/**
 * RouteManagementPage Component
 *
 * Route management with CRUD operations.
 *
 * Night Observatory (T-901 Phase 3): PageHeader for the title block, glass
 * modal over a cosmos scrim, gold Primary CTA for the single "New Route"
 * action (spec §3 gold budget: one primary CTA per page).
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Plus, X } from 'lucide-react';
import { PageHeader, Button, glassPanel, monoLabel } from '@a64core/shared';
import { RouteTable } from '../../components/logistics/RouteTable';
import { RouteForm } from '../../components/logistics/RouteForm';
import { logisticsApi } from '../../services/logisticsService';
import type { Route, RouteCreate, RouteUpdate } from '../../types/logistics';

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

export function RouteManagementPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await logisticsApi.getRoutes();
      setRoutes(result.items);
    } catch (err: any) {
      console.error('Failed to load routes:', err);
      setError(err.response?.data?.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoute = async (data: RouteCreate) => {
    setIsSubmitting(true);
    try {
      await logisticsApi.createRoute(data);
      setShowCreateModal(false);
      loadRoutes();
    } catch (err: any) {
      console.error('Failed to create route:', err);
      alert(err.response?.data?.message || 'Failed to create route');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRoute = async (data: RouteUpdate) => {
    if (!editingRoute) return;
    setIsSubmitting(true);
    try {
      await logisticsApi.updateRoute(editingRoute.routeId, data);
      setEditingRoute(null);
      loadRoutes();
    } catch (err: any) {
      console.error('Failed to update route:', err);
      alert(err.response?.data?.message || 'Failed to update route');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    try {
      await logisticsApi.deleteRoute(routeId);
      loadRoutes();
    } catch (err: any) {
      console.error('Failed to delete route:', err);
      alert(err.response?.data?.message || 'Failed to delete route');
    }
  };

  const activeCount = routes.filter((r) => r.isActive).length;

  return (
    <Container>
      <PageHeader
        breadcrumb="Logistics · Live"
        title="Route Management"
        emphasizeLastWord
        description="Origin/destination lanes used to schedule shipments."
        stats={[
          { value: routes.length, label: 'Routes' },
          { value: activeCount, label: 'Active', alive: true },
        ]}
      />

      <ActionRow>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} strokeWidth={2} /> New Route
        </Button>
      </ActionRow>

      {error && <ErrorContainer>{error}</ErrorContainer>}

      {loading ? (
        <LoadingContainer>Loading routes...</LoadingContainer>
      ) : (
        <RouteTable
          routes={routes}
          onEdit={(id) => setEditingRoute(routes.find((r) => r.routeId === id) || null)}
          onDelete={handleDeleteRoute}
        />
      )}

      {showCreateModal && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Route</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <RouteForm
              onSubmit={handleCreateRoute}
              onCancel={() => setShowCreateModal(false)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}

      {editingRoute && (
        <Modal>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Route</ModalTitle>
              <CloseButton onClick={() => setEditingRoute(null)} aria-label="Close">
                <X size={22} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <RouteForm
              route={editingRoute}
              onSubmit={handleUpdateRoute}
              onCancel={() => setEditingRoute(null)}
              isSubmitting={isSubmitting}
            />
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}
