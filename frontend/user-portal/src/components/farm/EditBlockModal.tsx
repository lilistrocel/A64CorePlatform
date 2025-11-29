/**
 * EditBlockModal Component
 *
 * Modal for editing an existing block's information including geo-fencing boundary.
 */

import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import type { Block, BlockUpdate, GeoJSONPolygon, FarmBoundary, FarmLocation } from '../../types/farm';
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
  max-width: 700px;
  width: 90%;
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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) =>
    $variant === 'primary'
      ? `
    background: #3B82F6;
    color: white;

    &:hover:not(:disabled) {
      background: #2563EB;
    }
  `
      : `
    background: transparent;
    color: #616161;
    border: 1px solid #e0e0e0;

    &:hover:not(:disabled) {
      background: #f5f5f5;
    }
  `}

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
`;

// Map Section Styles
const MapSection = styled.div`
  margin-top: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
`;

const MapToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  width: 100%;
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? '#EFF6FF' : 'white')};
  color: ${({ $active }) => ($active ? '#3B82F6' : '#374151')};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ $active }) => ($active ? '#DBEAFE' : '#f5f5f5')};
  }

  svg {
    flex-shrink: 0;
  }
`;

const MapLoadingFallback = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 350px;
  background: #f5f5f5;
  color: #666;
  font-size: 14px;
`;

const MapHint = styled.p`
  font-size: 12px;
  color: #6B7280;
  margin: 8px 0 0 0;
`;

const BoundaryBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #DCFCE7;
  color: #166534;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
`;

const MapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

// ============================================================================
// COMPONENT
// ============================================================================

interface EditBlockModalProps {
  block: Block;
  farmId: string;
  /** Farm boundary to center map on */
  farmBoundary?: FarmBoundary | null;
  /** Farm location as fallback if no boundary */
  farmLocation?: FarmLocation | null;
  onClose: () => void;
  onUpdate: (blockId: string, data: BlockUpdate) => Promise<void>;
}

export function EditBlockModal({ block, farmId, farmBoundary, farmLocation, onClose, onUpdate }: EditBlockModalProps) {
  // Convert area from sqm to hectares for display (if stored in sqm)
  const convertToHectares = (area: number | null | undefined, unit: string | null | undefined): number | undefined => {
    if (area === null || area === undefined) return undefined;
    if (unit === 'sqm') return area / 10000;
    if (unit === 'sqft') return area / 107639;
    return area; // Already in hectares or unknown
  };

  // Convert area from hectares to sqm for storage
  const convertToSqm = (areaInHectares: number | undefined): number | undefined => {
    if (areaInHectares === undefined) return undefined;
    return areaInHectares * 10000;
  };

  const [formData, setFormData] = useState<BlockUpdate>({
    name: block.name,
    area: convertToHectares(block.area, block.areaUnit), // Display in hectares
    maxPlants: block.maxPlants,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map-related state
  const [showMap, setShowMap] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const { polygon, areaHectares, setPolygon, clearPolygon, getBoundary, loadBoundary } = useMapDrawing(block.boundary);

  // Calculate initial map center - prioritize block boundary, then farm boundary/location
  const initialMapCenter = useMemo(() => {
    // Priority 1: Block's own boundary center
    if (block.boundary?.center) {
      return {
        latitude: block.boundary.center.latitude,
        longitude: block.boundary.center.longitude,
      };
    }
    // Priority 2: Farm boundary center
    if (farmBoundary?.center) {
      return {
        latitude: farmBoundary.center.latitude,
        longitude: farmBoundary.center.longitude,
      };
    }
    // Priority 3: Farm location coordinates
    if (farmLocation?.coordinates) {
      return {
        latitude: farmLocation.coordinates.latitude,
        longitude: farmLocation.coordinates.longitude,
      };
    }
    // Default: undefined (MapContainer will use its default)
    return undefined;
  }, [block.boundary, farmBoundary, farmLocation]);

  // Load existing boundary when component mounts
  useEffect(() => {
    if (block.boundary) {
      loadBoundary(block.boundary);
    }
  }, [block.boundary, loadBoundary]);

  // Handle polygon change from drawing controls
  const handlePolygonChange = useCallback((newPolygon: GeoJSONPolygon | null, areaSquareMeters: number) => {
    setPolygon(newPolygon, areaSquareMeters);
    // Auto-update area if polygon is drawn
    if (newPolygon && areaSquareMeters > 0) {
      const hectares = areaSquareMeters / 10000;
      setFormData(prev => ({ ...prev, area: Number(hectares.toFixed(2)) }));
    }
  }, [setPolygon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name?.trim()) {
      setError('Block name is required');
      return;
    }

    if (formData.area !== undefined && formData.area <= 0) {
      setError('Area must be greater than 0');
      return;
    }

    if (formData.maxPlants !== undefined && formData.maxPlants <= 0) {
      setError('Max plants must be greater than 0');
      return;
    }

    try {
      setLoading(true);

      // Get boundary if polygon was drawn
      const boundary = getBoundary();

      // Convert hectares back to sqm for storage
      const dataToSubmit: BlockUpdate = {
        ...formData,
        area: convertToSqm(formData.area),
        areaUnit: 'sqm', // Always store in sqm
        boundary: boundary || undefined,
      };

      await onUpdate(block.blockId, dataToSubmit);

      // Reset state
      setShowMap(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update block');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      setShowMap(false);
      onClose();
    }
  };

  const handleClose = () => {
    if (!loading) {
      setShowMap(false);
      onClose();
    }
  };

  const hasBoundary = !!block.boundary || !!polygon;

  return (
    <Overlay onClick={handleOverlayClick}>
      <Modal>
        <Header>
          <Title>Edit Block</Title>
          <Subtitle>Update block information</Subtitle>
        </Header>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="name">Block Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name ?? ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Greenhouse Block A"
              disabled={loading}
              required
            />
          </FormGroup>

          {/* Map Boundary Section */}
          <FormGroup>
            <Label>
              Block Boundary (Optional)
              {hasBoundary && <BoundaryBadge style={{ marginLeft: '8px' }}>Has Boundary</BoundaryBadge>}
            </Label>
            <MapToggleButton
              type="button"
              $active={showMap}
              onClick={() => setShowMap(!showMap)}
              disabled={loading}
            >
              <MapIcon />
              {showMap ? 'Hide Map' : (hasBoundary ? 'View/Edit Block Boundary' : 'Draw Block Boundary on Map')}
            </MapToggleButton>

            {showMap && (
              <MapSection>
                <Suspense fallback={<MapLoadingFallback>Loading map...</MapLoadingFallback>}>
                  <MapContainer
                    height="350px"
                    onMapRef={setMapInstance}
                    showFullscreen={true}
                    showSearch={true}
                    showStyleToggle={true}
                    initialCenter={initialMapCenter}
                    initialZoom={initialMapCenter ? 16 : undefined}
                  >
                    <DrawingControls
                      map={mapInstance}
                      onPolygonChange={handlePolygonChange}
                      initialPolygon={block.boundary?.geometry}
                      disabled={loading}
                      boundaryType="block"
                      referenceBoundary={farmBoundary}
                    />
                  </MapContainer>
                </Suspense>
              </MapSection>
            )}
            <MapHint>
              {polygon
                ? `Boundary: ${areaHectares.toFixed(2)} hectares`
                : 'You can optionally draw or edit the block boundary on a map'}
            </MapHint>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="area">Area (hectares) *</Label>
            <Input
              id="area"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.area ?? ''}
              onChange={(e) => setFormData({ ...formData, area: parseFloat(e.target.value) })}
              placeholder="e.g., 0.5"
              disabled={loading}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="maxPlants">Maximum Plant Capacity *</Label>
            <Input
              id="maxPlants"
              type="number"
              min="1"
              value={formData.maxPlants ?? ''}
              onChange={(e) => setFormData({ ...formData, maxPlants: parseInt(e.target.value, 10) })}
              placeholder="e.g., 100"
              disabled={loading}
              required
            />
          </FormGroup>

          <ButtonGroup>
            <Button type="button" $variant="secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Block'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
