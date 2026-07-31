/**
 * EditBlockModal Component
 *
 * Modal for editing an existing block's information including geo-fencing boundary.
 */

import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import styled from 'styled-components';
import maplibregl from 'maplibre-gl';
import { Map as MapIconGlyph } from 'lucide-react';
import { glassPanel, glassControl, glassOpaque, monoLabel } from '@a64core/shared';
import type { Block, BlockUpdate, GeoJSONPolygon, FarmBoundary, FarmLocation } from '../../types/farm';
import { useMapDrawing } from '../../hooks/map/useMapDrawing';

// Lazy load map components for better performance
const MapContainer = lazy(() => import('../map/MapContainer').then(m => ({ default: m.MapContainer })));
const DrawingControls = lazy(() => import('../map/DrawingControls').then(m => ({ default: m.DrawingControls })));

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
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
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
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
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Input = styled.input`
  ${glassControl}
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

// Primary: the one gold-gradient CTA on this view (spec §3). Secondary: glass
// ghost text (spec §4 "Buttons").
const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
  border: 1px solid transparent;

  ${({ $variant, theme }) =>
    $variant === 'primary'
      ? `
    background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
    color: ${theme.colors.onAccent};
    box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
    }
  `
      : `
    background: transparent;
    color: ${theme.colors.celeste};
    border-color: ${theme.colors.glass.border};

    &:hover:not(:disabled) {
      background: rgba(180, 200, 220, 0.07);
      color: ${theme.colors.textPrimary};
    }
  `}

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
`;

// Map Section Styles
const MapSection = styled.div`
  margin-top: 8px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  overflow: hidden;
`;

const MapToggleButton = styled.button<{ $active: boolean }>`
  ${glassControl}
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  width: 100%;
  border-color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.glass.border)};
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  svg {
    flex-shrink: 0;
  }
`;

// A map placeholder sitting inside an already-glass Modal — two-glass-layer
// rule (spec §2) — drops to glassOpaque rather than stacking a third layer.
const MapLoadingFallback = styled.div`
  ${glassOpaque}
  display: flex;
  align-items: center;
  justify-content: center;
  height: 350px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const MapHint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 8px 0 0 0;
`;

const BoundaryBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.bright.emerald};
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
`;

const MapIcon = () => <MapIconGlyph size={20} strokeWidth={1.8} />;

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

  const handleClose = () => {
    if (!loading) {
      setShowMap(false);
      onClose();
    }
  };

  const hasBoundary = !!block.boundary || !!polygon;

  return (
    <Overlay>
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
