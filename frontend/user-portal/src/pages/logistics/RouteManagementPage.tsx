/**
 * RouteManagementPage Component
 *
 * Route management with CRUD operations.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { RouteTable } from '../../components/logistics/RouteTable';
import { RouteForm } from '../../components/logistics/RouteForm';
import { logisticsApi } from '../../services/logisticsService';
import type { Route, RouteCreate, RouteUpdate } from '../../types/logistics';

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

  return (
    <Container>
      <Header>
        <Title>Route Management</Title>
        <CreateButton onClick={() => setShowCreateModal(true)}>
          <span>+</span> New Route
        </CreateButton>
      </Header>

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
        <Modal onClick={() => setShowCreateModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Route</ModalTitle>
              <CloseButton onClick={() => setShowCreateModal(false)}>&times;</CloseButton>
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
        <Modal onClick={() => setEditingRoute(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Route</ModalTitle>
              <CloseButton onClick={() => setEditingRoute(null)}>&times;</CloseButton>
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
