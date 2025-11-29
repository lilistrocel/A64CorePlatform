/**
 * DrawingControls Component
 *
 * Provides polygon drawing tools for geo-fencing boundaries.
 * Uses @mapbox/mapbox-gl-draw for drawing functionality.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import styled from 'styled-components';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

import type { GeoJSONPolygon, FarmBoundary } from '../../types/farm';
import { DRAW_STYLES, DRAW_STYLES_FARM, BOUNDARY_COLORS } from '../../config/mapConfig';

export interface DrawingControlsProps {
  /** Map instance from MapContainer */
  map?: maplibregl.Map | null;
  /** Callback when polygon is created/updated */
  onPolygonChange: (polygon: GeoJSONPolygon | null, areaSquareMeters: number) => void;
  /** Initial polygon to load (for editing) */
  initialPolygon?: GeoJSONPolygon;
  /** Disable drawing (view-only mode) */
  disabled?: boolean;
  /** Type of boundary being drawn - affects color scheme */
  boundaryType?: 'farm' | 'block';
  /** Reference boundary to display (e.g., farm boundary when drawing blocks) */
  referenceBoundary?: FarmBoundary | null;
  /** Style version - changes when map style is toggled (triggers re-render) */
  styleVersion?: number;
}

/**
 * DrawingControls - Polygon drawing toolbar
 */
export const DrawingControls: React.FC<DrawingControlsProps> = ({
  map,
  onPolygonChange,
  initialPolygon,
  disabled = false,
  boundaryType = 'block',
  referenceBoundary,
  styleVersion = 0,
}) => {
  const drawRef = useRef<MapboxDraw | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(!!initialPolygon);
  const [area, setArea] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);

  // Store initial polygon in ref to avoid re-renders when prop reference changes
  const initialPolygonRef = useRef(initialPolygon);
  const initializedRef = useRef(false);

  // Select draw styles based on boundary type
  const drawStyles = boundaryType === 'farm' ? DRAW_STYLES_FARM : DRAW_STYLES;

  // Wait for map to be ready
  useEffect(() => {
    if (!map) {
      setIsMapReady(false);
      return;
    }

    const checkMapReady = () => {
      if (map.isStyleLoaded()) {
        setIsMapReady(true);
      }
    };

    // Check if already ready
    if (map.isStyleLoaded()) {
      setIsMapReady(true);
    } else {
      map.on('load', checkMapReady);
      return () => {
        map.off('load', checkMapReady);
      };
    }
  }, [map]);

  // Store callback in ref to avoid re-triggering effect
  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;

  // Calculate area from polygon (defined before useEffect that uses it)
  const calculateArea = useCallback((polygon: GeoJSONPolygon) => {
    try {
      const feature = turf.polygon(polygon.coordinates);
      const areaSquareMeters = turf.area(feature);
      setArea(areaSquareMeters);
    } catch (error) {
      console.error('Error calculating area:', error);
      setArea(0);
    }
  }, []);

  // Track if initial fit has been done (persists across style changes)
  const initialFitDoneRef = useRef(false);

  // Add reference boundary layer (farm boundary when drawing blocks)
  // styleVersion in dependency triggers re-run when map style changes
  useEffect(() => {
    if (!map || !isMapReady || !referenceBoundary?.geometry) return;

    const sourceId = 'reference-boundary-source';
    const fillLayerId = 'reference-boundary-fill';
    const strokeLayerId = 'reference-boundary-stroke';
    let isCancelled = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    const addReferenceBoundary = () => {
      if (isCancelled) return;

      // Check if source already exists (avoid duplicates)
      if (map.getSource(sourceId)) {
        return;
      }

      try {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: referenceBoundary.geometry,
          },
        });

        // Fill layer
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': BOUNDARY_COLORS.farm.fill,
            'fill-opacity': BOUNDARY_COLORS.farm.fillOpacity,
          },
        });

        // Stroke layer
        map.addLayer({
          id: strokeLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': BOUNDARY_COLORS.farm.stroke,
            'line-width': 3,
            'line-dasharray': [4, 2],
          },
        });

        // Fit map to reference boundary only on first load (not after style changes)
        if (!initialFitDoneRef.current && referenceBoundary.geometry.coordinates?.[0]) {
          const coords = referenceBoundary.geometry.coordinates[0] as [number, number][];
          const bounds = coords.reduce(
            (b, coord) => b.extend(coord),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50, maxZoom: 17 });
          initialFitDoneRef.current = true;
        }
      } catch (error) {
        console.error('Error adding reference boundary:', error);
      }
    };

    // Poll until style is loaded, then add the boundary
    // This is more reliable than event-based approaches when dealing with style changes
    const tryAddBoundary = () => {
      if (isCancelled) {
        if (pollIntervalId) clearInterval(pollIntervalId);
        return;
      }

      if (map.isStyleLoaded()) {
        if (pollIntervalId) clearInterval(pollIntervalId);
        addReferenceBoundary();
      }
    };

    // Try immediately if style is already loaded
    if (map.isStyleLoaded()) {
      addReferenceBoundary();
    } else {
      // Poll every 100ms until style is loaded (max 3 seconds)
      let attempts = 0;
      pollIntervalId = setInterval(() => {
        attempts++;
        if (attempts > 30) {
          // Give up after 3 seconds
          if (pollIntervalId) clearInterval(pollIntervalId);
          return;
        }
        tryAddBoundary();
      }, 100);
    }

    return () => {
      isCancelled = true;
      if (pollIntervalId) clearInterval(pollIntervalId);
      try {
        if (map.getLayer(strokeLayerId)) map.removeLayer(strokeLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch (error) {
        // Map may already be destroyed or style already changed
      }
    };
  }, [map, isMapReady, referenceBoundary, styleVersion]);

  // Initialize draw control when map is ready
  useEffect(() => {
    if (!map || !isMapReady) return;

    // Create draw control with appropriate styles
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: false,
        trash: false,
      },
      styles: drawStyles,
    });

    drawRef.current = draw;

    // Add control to map - cast to any to avoid type issues between mapbox and maplibre
    map.addControl(draw as unknown as maplibregl.IControl);

    // Load initial polygon if provided (only once)
    if (initialPolygonRef.current && !initializedRef.current) {
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: initialPolygonRef.current,
      };
      draw.add(feature as GeoJSON.Feature);
      calculateArea(initialPolygonRef.current);
      setHasPolygon(true);
      initializedRef.current = true;
    }

    // Event handlers - use refs to avoid stale closures
    const handleCreate = (e: { features: GeoJSON.Feature[] }) => {
      if (e.features.length > 0) {
        const polygon = e.features[0].geometry as GeoJSONPolygon;
        calculateArea(polygon);
        setHasPolygon(true);
        setIsDrawing(false);
        onPolygonChangeRef.current(polygon, turf.area(e.features[0]));
      }
    };

    const handleUpdate = (e: { features: GeoJSON.Feature[] }) => {
      if (e.features.length > 0) {
        const polygon = e.features[0].geometry as GeoJSONPolygon;
        calculateArea(polygon);
        onPolygonChangeRef.current(polygon, turf.area(e.features[0]));
      }
    };

    const handleDelete = () => {
      setHasPolygon(false);
      setArea(0);
      onPolygonChangeRef.current(null, 0);
    };

    map.on('draw.create', handleCreate);
    map.on('draw.update', handleUpdate);
    map.on('draw.delete', handleDelete);

    return () => {
      map.off('draw.create', handleCreate);
      map.off('draw.update', handleUpdate);
      map.off('draw.delete', handleDelete);

      if (draw && map.hasControl(draw as unknown as maplibregl.IControl)) {
        map.removeControl(draw as unknown as maplibregl.IControl);
      }
      drawRef.current = null;
    };
  }, [map, isMapReady, calculateArea, drawStyles]);

  // Start drawing mode
  const handleStartDraw = useCallback(() => {
    if (!drawRef.current || disabled) return;

    // Clear existing polygon
    drawRef.current.deleteAll();
    setHasPolygon(false);
    setArea(0);
    onPolygonChange(null, 0);

    // Start polygon drawing
    drawRef.current.changeMode('draw_polygon');
    setIsDrawing(true);
  }, [disabled, onPolygonChange]);

  // Edit existing polygon
  const handleEdit = useCallback(() => {
    if (!drawRef.current || disabled) return;

    const features = drawRef.current.getAll();
    if (features.features.length > 0) {
      drawRef.current.changeMode('direct_select', {
        featureId: features.features[0].id as string,
      });
    }
  }, [disabled]);

  // Delete polygon
  const handleDelete = useCallback(() => {
    if (!drawRef.current || disabled) return;

    drawRef.current.deleteAll();
    setHasPolygon(false);
    setArea(0);
    setIsDrawing(false);
    onPolygonChange(null, 0);
  }, [disabled, onPolygonChange]);

  // Cancel drawing
  const handleCancel = useCallback(() => {
    if (!drawRef.current) return;

    drawRef.current.changeMode('simple_select');
    setIsDrawing(false);
  }, []);

  // Format area for display
  const formatArea = (squareMeters: number): string => {
    if (squareMeters < 10000) {
      return `${squareMeters.toFixed(1)} m\u00B2`;
    }
    const hectares = squareMeters / 10000;
    return `${hectares.toFixed(2)} hectares`;
  };

  if (disabled || !isMapReady) {
    return null;
  }

  return (
    <ControlsContainer>
      <ControlsToolbar>
        {!isDrawing && !hasPolygon && (
          <ToolbarButton onClick={handleStartDraw} $variant="primary">
            <DrawIcon />
            Draw Boundary
          </ToolbarButton>
        )}

        {isDrawing && (
          <>
            <ToolbarInfo>
              Click to place points. Double-click to finish.
            </ToolbarInfo>
            <ToolbarButton onClick={handleCancel} $variant="secondary">
              Cancel
            </ToolbarButton>
          </>
        )}

        {hasPolygon && !isDrawing && (
          <>
            <ToolbarButton onClick={handleEdit} $variant="secondary">
              <EditIcon />
              Edit
            </ToolbarButton>
            <ToolbarButton onClick={handleStartDraw} $variant="secondary">
              <RedrawIcon />
              Redraw
            </ToolbarButton>
            <ToolbarButton onClick={handleDelete} $variant="danger">
              <DeleteIcon />
              Delete
            </ToolbarButton>
          </>
        )}
      </ControlsToolbar>

      {hasPolygon && area > 0 && (
        <AreaDisplay>
          <AreaIcon />
          <AreaText>Area: {formatArea(area)}</AreaText>
        </AreaDisplay>
      )}
    </ControlsContainer>
  );
};

// Icons
const DrawIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12,2 22,22 12,17 2,22" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const RedrawIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23,4 23,10 17,10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const AreaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </svg>
);

// Styled Components
const ControlsContainer = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ControlsToolbar = styled.div`
  display: flex;
  gap: 8px;
  background: white;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const ToolbarButton = styled.button<{ $variant: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  ${(props) => {
    switch (props.$variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          &:hover { background: #2563eb; }
        `;
      case 'danger':
        return `
          background: #fee2e2;
          color: #dc2626;
          &:hover { background: #fecaca; }
        `;
      default:
        return `
          background: #f3f4f6;
          color: #374151;
          &:hover { background: #e5e7eb; }
        `;
    }
  }}

  svg {
    flex-shrink: 0;
  }
`;

const ToolbarInfo = styled.span`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  font-size: 13px;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 6px;
`;

const AreaDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const AreaText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #10b981;
`;

export default DrawingControls;
