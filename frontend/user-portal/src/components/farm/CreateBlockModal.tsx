/**
 * CreateBlockModal Component
 *
 * Modal for creating a new block in a farm with optional geo-fencing boundary.
 */

import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import type { BlockCreate, GeoJSONPolygon, FarmBoundary, FarmLocation } from '../../types/farm';
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

const Select = styled.select`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
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

const HelpText = styled.p`
  font-size: 12px;
  color: #9e9e9e;
  margin: 0;
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

interface CreateBlockModalProps {
  farmId: string;
  /** Farm boundary to center map on */
  farmBoundary?: FarmBoundary | null;
  /** Farm location as fallback if no boundary */
  farmLocation?: FarmLocation | null;
  onClose: () => void;
  onCreate: (data: Omit<BlockCreate, 'farmId'>) => Promise<void>;
}

export function CreateBlockModal({ farmId, farmBoundary, farmLocation, onClose, onCreate }: CreateBlockModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    blockType: 'greenhouse' as const,
    area: '',
    maxPlants: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map-related state
  const [showMap, setShowMap] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const { polygon, areaHectares, setPolygon, clearPolygon, getBoundary } = useMapDrawing();

  // Calculate initial map center from farm boundary or location
  const initialMapCenter = useMemo(() => {
    // Priority 1: Farm boundary center
    if (farmBoundary?.center) {
      return {
        latitude: farmBoundary.center.latitude,
        longitude: farmBoundary.center.longitude,
      };
    }
    // Priority 2: Farm location coordinates
    if (farmLocation?.coordinates) {
      return {
        latitude: farmLocation.coordinates.latitude,
        longitude: farmLocation.coordinates.longitude,
      };
    }
    // Default: undefined (MapContainer will use its default)
    return undefined;
  }, [farmBoundary, farmLocation]);

  // Handle polygon change from drawing controls
  const handlePolygonChange = useCallback((newPolygon: GeoJSONPolygon | null, areaSquareMeters: number) => {
    setPolygon(newPolygon, areaSquareMeters);
    // Auto-update area if polygon is drawn
    if (newPolygon && areaSquareMeters > 0) {
      const hectares = areaSquareMeters / 10000;
      setFormData(prev => ({ ...prev, area: hectares.toFixed(2) }));
    }
  }, [setPolygon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Block name is required');
      return;
    }

    const area = parseFloat(formData.area);
    if (isNaN(area) || area <= 0) {
      setError('Area must be a valid number greater than 0');
      return;
    }

    const maxPlants = parseInt(formData.maxPlants, 10);
    if (isNaN(maxPlants) || maxPlants <= 0) {
      setError('Max plants must be a valid number greater than 0');
      return;
    }

    try {
      setLoading(true);
      // User enters area in hectares, convert to sqm for storage
      const areaInSqm = area * 10000;

      // Get boundary if polygon was drawn
      const boundary = getBoundary();

      await onCreate({
        name: formData.name.trim(),
        blockType: formData.blockType,
        area: areaInSqm,
        areaUnit: 'sqm',
        maxPlants,
        boundary: boundary || undefined,
      });

      // Reset state
      clearPolygon();
      setShowMap(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create block');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      clearPolygon();
      setShowMap(false);
      onClose();
    }
  };

  const handleClose = () => {
    if (!loading) {
      clearPolygon();
      setShowMap(false);
      onClose();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick}>
      <Modal>
        <Header>
          <Title>Add New Block</Title>
          <Subtitle>Create a new block in your farm</Subtitle>
        </Header>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="name">Block Name *</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Greenhouse Block A"
              disabled={loading}
              required
            />
            <HelpText>Choose a unique name for easy identification</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="blockType">Block Type *</Label>
            <Select
              id="blockType"
              value={formData.blockType}
              onChange={(e) => setFormData({ ...formData, blockType: e.target.value as any })}
              disabled={loading}
              required
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="openfield">Open Field</option>
              <option value="hydroponic">Hydroponic</option>
              <option value="nethouse">Net House</option>
              <option value="aeroponic">Aeroponic</option>
              <option value="containerfarm">Container Farm</option>
              <option value="hybrid">Hybrid</option>
              <option value="special">Special</option>
            </Select>
            <HelpText>Type of cultivation system</HelpText>
          </FormGroup>

          {/* Map Boundary Section */}
          <FormGroup>
            <Label>Block Boundary (Optional)</Label>
            <MapToggleButton
              type="button"
              $active={showMap}
              onClick={() => setShowMap(!showMap)}
              disabled={loading}
            >
              <MapIcon />
              {showMap ? 'Hide Map' : 'Draw Block Boundary on Map'}
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
                ? `Boundary drawn: ${areaHectares.toFixed(2)} hectares`
                : 'You can optionally draw the block boundary on a map'}
            </MapHint>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="area">Area (hectares) *</Label>
            <Input
              id="area"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              placeholder="e.g., 0.5"
              disabled={loading}
              required
            />
            <HelpText>Total area of the block in hectares</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="maxPlants">Maximum Plant Capacity *</Label>
            <Input
              id="maxPlants"
              type="number"
              min="1"
              value={formData.maxPlants}
              onChange={(e) => setFormData({ ...formData, maxPlants: e.target.value })}
              placeholder="e.g., 100"
              disabled={loading}
              required
            />
            <HelpText>Maximum number of plants this block can accommodate</HelpText>
          </FormGroup>

          <ButtonGroup>
            <Button type="button" $variant="secondary" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Block'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
