/**
 * useMapDrawing Hook
 *
 * Custom hook for managing polygon drawing state and calculations.
 * Provides a simple interface for form integration.
 */

import { useState, useCallback } from 'react';
import * as turf from '@turf/turf';
import type { GeoJSONPolygon, FarmBoundary, BlockBoundary } from '../../types/farm';

interface MapDrawingState {
  /** Current polygon geometry */
  polygon: GeoJSONPolygon | null;
  /** Area in square meters */
  areaSquareMeters: number;
  /** Area in hectares */
  areaHectares: number;
  /** Centroid coordinates */
  center: { latitude: number; longitude: number } | null;
  /** Is polygon valid */
  isValid: boolean;
  /** Validation error message */
  error: string | null;
}

interface UseMapDrawingReturn extends MapDrawingState {
  /** Update polygon from drawing controls */
  setPolygon: (polygon: GeoJSONPolygon | null, area: number) => void;
  /** Clear polygon */
  clearPolygon: () => void;
  /** Get boundary object for API submission */
  getBoundary: () => FarmBoundary | BlockBoundary | null;
  /** Load existing boundary */
  loadBoundary: (boundary: FarmBoundary | BlockBoundary | null) => void;
}

/**
 * Hook for managing polygon drawing state
 */
export function useMapDrawing(
  initialBoundary?: FarmBoundary | BlockBoundary | null
): UseMapDrawingReturn {
  const [state, setState] = useState<MapDrawingState>(() => {
    if (initialBoundary?.geometry) {
      const areaMeters = initialBoundary.area || calculateArea(initialBoundary.geometry);
      return {
        polygon: initialBoundary.geometry,
        areaSquareMeters: areaMeters,
        areaHectares: areaMeters / 10000,
        center: initialBoundary.center || calculateCentroid(initialBoundary.geometry),
        isValid: true,
        error: null,
      };
    }
    return {
      polygon: null,
      areaSquareMeters: 0,
      areaHectares: 0,
      center: null,
      isValid: false,
      error: null,
    };
  });

  /**
   * Set polygon from drawing controls
   */
  const setPolygon = useCallback((polygon: GeoJSONPolygon | null, area: number) => {
    if (!polygon) {
      setState({
        polygon: null,
        areaSquareMeters: 0,
        areaHectares: 0,
        center: null,
        isValid: false,
        error: null,
      });
      return;
    }

    // Validate polygon
    const validation = validatePolygon(polygon);
    if (!validation.valid) {
      setState((prev) => ({
        ...prev,
        polygon,
        isValid: false,
        error: validation.error,
      }));
      return;
    }

    const center = calculateCentroid(polygon);

    setState({
      polygon,
      areaSquareMeters: area,
      areaHectares: area / 10000,
      center,
      isValid: true,
      error: null,
    });
  }, []);

  /**
   * Clear polygon
   */
  const clearPolygon = useCallback(() => {
    setState({
      polygon: null,
      areaSquareMeters: 0,
      areaHectares: 0,
      center: null,
      isValid: false,
      error: null,
    });
  }, []);

  /**
   * Get boundary object for API submission
   */
  const getBoundary = useCallback((): FarmBoundary | BlockBoundary | null => {
    if (!state.polygon || !state.isValid) {
      return null;
    }

    return {
      geometry: state.polygon,
      area: state.areaSquareMeters,
      center: state.center || undefined,
    };
  }, [state.polygon, state.isValid, state.areaSquareMeters, state.center]);

  /**
   * Load existing boundary
   */
  const loadBoundary = useCallback((boundary: FarmBoundary | BlockBoundary | null) => {
    if (!boundary?.geometry) {
      clearPolygon();
      return;
    }

    const areaMeters = boundary.area || calculateArea(boundary.geometry);
    setState({
      polygon: boundary.geometry,
      areaSquareMeters: areaMeters,
      areaHectares: areaMeters / 10000,
      center: boundary.center || calculateCentroid(boundary.geometry),
      isValid: true,
      error: null,
    });
  }, [clearPolygon]);

  return {
    ...state,
    setPolygon,
    clearPolygon,
    getBoundary,
    loadBoundary,
  };
}

// Utility functions

/**
 * Calculate area of polygon in square meters
 */
function calculateArea(polygon: GeoJSONPolygon): number {
  try {
    const feature = turf.polygon(polygon.coordinates);
    return turf.area(feature);
  } catch (error) {
    console.error('Error calculating area:', error);
    return 0;
  }
}

/**
 * Calculate centroid of polygon
 */
function calculateCentroid(polygon: GeoJSONPolygon): { latitude: number; longitude: number } | null {
  try {
    const feature = turf.polygon(polygon.coordinates);
    const centroid = turf.centroid(feature);
    const [lng, lat] = centroid.geometry.coordinates;
    return { latitude: lat, longitude: lng };
  } catch (error) {
    console.error('Error calculating centroid:', error);
    return null;
  }
}

/**
 * Validate polygon geometry
 */
function validatePolygon(polygon: GeoJSONPolygon): { valid: boolean; error: string | null } {
  if (!polygon.coordinates || polygon.coordinates.length === 0) {
    return { valid: false, error: 'No coordinates provided' };
  }

  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) {
    return { valid: false, error: 'Polygon must have at least 3 points' };
  }

  // Check if polygon is closed
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'Polygon must be closed' };
  }

  // Check coordinate ranges
  for (const point of ring) {
    const [lng, lat] = point;
    if (lng < -180 || lng > 180) {
      return { valid: false, error: 'Invalid longitude value' };
    }
    if (lat < -90 || lat > 90) {
      return { valid: false, error: 'Invalid latitude value' };
    }
  }

  // Check minimum area (1 square meter)
  try {
    const area = calculateArea(polygon);
    if (area < 1) {
      return { valid: false, error: 'Area is too small' };
    }
  } catch {
    return { valid: false, error: 'Invalid polygon geometry' };
  }

  return { valid: true, error: null };
}

export default useMapDrawing;
