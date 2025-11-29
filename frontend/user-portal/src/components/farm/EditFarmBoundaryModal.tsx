/**
 * EditFarmBoundaryModal Component
 *
 * Modal for editing a farm's geo-fencing boundary on a map.
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import type { Farm, FarmUpdate, GeoJSONPolygon } from '../../types/farm';
import { useMapDrawing } from '../../hooks/map/useMapDrawing';

// Lazy load map components for better performance
const MapContainer = lazy(() => import('../map/MapContainer').then(m => ({ default: m.MapContainer })));
const DrawingControls = lazy(() => import('../map/DrawingControls').then(m => ({ default: m.DrawingControls })));

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 800px;
  width: 95%;
  max-height: 90vh;
  overflow-y: auto;
`;

const Header = styled.div`
  margin-bottom: 24px;
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #616161;
  margin: 0;
`;

const MapSection = styled.div`
  margin-bottom: 24px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
`;

const MapLoadingFallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 450px;
  background: #f5f5f5;
  color: #666;
  font-size: 14px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const InfoLabel = styled.span`
  font-size: 14px;
  color: #6b7280;
`;

const InfoValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #10b981;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: #3B82F6;
          color: white;
          &:hover:not(:disabled) { background: #2563EB; }
        `;
      case 'danger':
        return `
          background: #FEE2E2;
          color: #DC2626;
          &:hover:not(:disabled) { background: #FECACA; }
        `;
      default:
        return `
          background: transparent;
          color: #616161;
          border: 1px solid #e0e0e0;
          &:hover:not(:disabled) { background: #f5f5f5; }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  font-size: 14px;
  margin-bottom: 16px;
`;

const HelpText = styled.p`
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 16px 0;
  line-height: 1.5;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface EditFarmBoundaryModalProps {
  farm: Farm;
  onClose: () => void;
  onUpdate: (farmId: string, data: FarmUpdate) => Promise<void>;
}

export function EditFarmBoundaryModal({ farm, onClose, onUpdate }: EditFarmBoundaryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // useMapDrawing hook initializes with farm.boundary, so no need to call loadBoundary again
  const { polygon, areaHectares, setPolygon, clearPolygon, getBoundary } = useMapDrawing(farm.boundary);

  // Handle polygon change from drawing controls
  const handlePolygonChange = useCallback((newPolygon: GeoJSONPolygon | null, areaSquareMeters: number) => {
    setPolygon(newPolygon, areaSquareMeters);
  }, [setPolygon]);

  const handleSave = async () => {
    setError(null);

    try {
      setLoading(true);

      // Get boundary data
      const boundary = getBoundary();

      const dataToSubmit: FarmUpdate = {
        boundary: boundary || undefined,
        // Optionally update totalArea if boundary was drawn
        ...(boundary && boundary.area ? { totalArea: boundary.area / 10000 } : {}),
      };

      await onUpdate(farm.farmId, dataToSubmit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update farm boundary');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBoundary = async () => {
    if (!confirm('Are you sure you want to remove the farm boundary? This cannot be undone.')) {
      return;
    }

    setError(null);

    try {
      setLoading(true);

      // Send null boundary to remove it
      const dataToSubmit: FarmUpdate = {
        boundary: undefined,
      };

      await onUpdate(farm.farmId, dataToSubmit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove farm boundary');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  // Determine initial map center
  const getInitialCenter = () => {
    if (farm.boundary?.center) {
      return {
        latitude: farm.boundary.center.latitude,
        longitude: farm.boundary.center.longitude,
      };
    }
    if (farm.location?.coordinates) {
      return {
        latitude: farm.location.coordinates.latitude,
        longitude: farm.location.coordinates.longitude,
      };
    }
    return undefined;
  };

  const hasBoundary = !!farm.boundary || !!polygon;

  return (
    <Overlay onClick={handleOverlayClick}>
      <Modal>
        <Header>
          <Title>Edit Farm Boundary</Title>
          <Subtitle>{farm.name}</Subtitle>
        </Header>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <HelpText>
          Use the drawing tools to create or modify the farm boundary. Click "Draw Boundary" to start,
          then click on the map to place points. Double-click to complete the polygon.
        </HelpText>

        <MapSection>
          <Suspense fallback={<MapLoadingFallback>Loading map...</MapLoadingFallback>}>
            <MapContainer
              height="450px"
              onMapRef={setMapInstance}
              showFullscreen={true}
              showSearch={true}
              showStyleToggle={true}
              initialCenter={getInitialCenter()}
              initialZoom={farm.boundary ? 15 : 12}
            >
              <DrawingControls
                map={mapInstance}
                onPolygonChange={handlePolygonChange}
                initialPolygon={farm.boundary?.geometry}
                disabled={loading}
                boundaryType="farm"
              />
            </MapContainer>
          </Suspense>
        </MapSection>

        <InfoRow>
          <InfoLabel>Boundary Area</InfoLabel>
          <InfoValue>
            {polygon ? `${areaHectares.toFixed(2)} hectares` : 'No boundary defined'}
          </InfoValue>
        </InfoRow>

        <ButtonGroup>
          {hasBoundary && (
            <Button
              type="button"
              $variant="danger"
              onClick={handleRemoveBoundary}
              disabled={loading}
            >
              Remove Boundary
            </Button>
          )}
          <Button type="button" $variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" $variant="primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Boundary'}
          </Button>
        </ButtonGroup>
      </Modal>
    </Overlay>
  );
}

export default EditFarmBoundaryModal;
