/**
 * EditFarmBoundaryModal Component
 *
 * Modal for editing a farm's geo-fencing boundary on a map.
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import { glassPanel, glassOpaque, monoLabel } from '@a64core/shared';
import type { Farm, FarmUpdate, GeoJSONPolygon } from '../../types/farm';
import { useMapDrawing } from '../../hooks/map/useMapDrawing';

// Lazy load map components for better performance
const MapContainer = lazy(() => import('../map/MapContainer').then(m => ({ default: m.MapContainer })));
const DrawingControls = lazy(() => import('../map/DrawingControls').then(m => ({ default: m.DrawingControls })));

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers"): glassPanel at
// blur 24px over a rgba(10,14,36,.6) scrim, 20px radius.
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
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
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const MapSection = styled.div`
  margin-bottom: 24px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  overflow: hidden;
`;

// A map placeholder sitting inside an already-glass Modal — per the two-glass-
// layer rule (spec §2) this drops to glassOpaque rather than stacking a third
// translucent layer.
const MapLoadingFallback = styled.div`
  ${glassOpaque}
  display: flex;
  align-items: center;
  justify-content: center;
  height: 450px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 24px;
`;

const InfoLabel = styled.span`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

// Primary: the one gold-gradient CTA (spec §3). Secondary: glass ghost.
// Danger: coral-tinted glass, never solid red (spec §4 "Buttons").
const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  border: 1px solid transparent;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
          color: ${theme.colors.onAccent};
          box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
          &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25); }
        `;
      case 'danger':
        return `
          background: ${theme.colors.errorBg};
          border-color: rgba(240, 138, 112, 0.4);
          color: ${theme.colors.bright.coral};
          &:hover:not(:disabled) { background: rgba(240, 138, 112, 0.24); }
        `;
      default:
        return `
          background: transparent;
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.glass.border};
          &:hover:not(:disabled) { background: rgba(180, 200, 220, 0.07); color: ${theme.colors.textPrimary}; }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 16px;
`;

const HelpText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
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
    <Overlay>
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
