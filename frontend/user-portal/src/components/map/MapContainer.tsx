/**
 * MapContainer Component
 *
 * Reusable map wrapper using MapLibre GL JS with satellite imagery.
 * Provides base map functionality for farm and block visualization.
 *
 * Uses maplibre-gl directly to avoid react-map-gl initialization issues.
 */

import React, { useCallback, useState, useRef, useEffect, lazy, Suspense } from 'react';
import maplibregl from 'maplibre-gl';
import styled from 'styled-components';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../config/mapConfig';

// Lazy load search bar for better performance
const MapSearchBar = lazy(() => import('./MapSearchBar'));

// Map style URLs
const MAP_STYLES = {
  street: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  satellite: 'https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_key', // Placeholder - needs API key
  // Free satellite alternatives:
  // Using ESRI World Imagery (free for non-commercial use)
  esriSatellite: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  }
} as const;

type MapStyleType = 'street' | 'satellite';

export interface MapContainerProps {
  /** Initial center position */
  initialCenter?: {
    latitude: number;
    longitude: number;
  };
  /** Initial zoom level */
  initialZoom?: number;
  /** Map height (default: 400px) */
  height?: string;
  /** Callback when map loads */
  onLoad?: () => void;
  /** Callback when map ref is ready */
  onMapRef?: (map: maplibregl.Map | null) => void;
  /** Child components (layers, markers, etc.) */
  children?: React.ReactNode;
  /** Show navigation controls (default: true) */
  showNavigation?: boolean;
  /** Show scale control (default: true) */
  showScale?: boolean;
  /** Show fullscreen control (default: false) */
  showFullscreen?: boolean;
  /** Show search bar (default: false) */
  showSearch?: boolean;
  /** Show style toggle for satellite/street view (default: false) */
  showStyleToggle?: boolean;
  /** Interactive mode (default: true) */
  interactive?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * MapContainer - Base map component using maplibre-gl directly
 */
export const MapContainer: React.FC<MapContainerProps> = ({
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  height = '400px',
  onLoad,
  onMapRef,
  children,
  showNavigation = true,
  showScale = true,
  showFullscreen = false,
  showSearch = false,
  showStyleToggle = false,
  interactive = true,
  className,
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleType>('street');
  const [styleVersion, setStyleVersion] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Store initial values in refs to prevent re-renders when props change
  // These are "initial" values - they should only be used once when map is created
  const initialCenterRef = useRef(initialCenter);
  const initialZoomRef = useRef(initialZoom);
  const onLoadRef = useRef(onLoad);
  const onMapRefCallback = useRef(onMapRef);

  // Update callback refs on each render so they always have the latest value
  onLoadRef.current = onLoad;
  onMapRefCallback.current = onMapRef;

  // Toggle between street and satellite view
  const handleStyleToggle = useCallback(() => {
    if (!mapRef.current) return;

    const newStyle = mapStyle === 'street' ? 'satellite' : 'street';
    const styleSpec = newStyle === 'street' ? MAP_STYLES.street : MAP_STYLES.esriSatellite;

    // Save current center and zoom
    const center = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();

    const map = mapRef.current;

    const onStyleReady = () => {
      map.setCenter(center);
      map.setZoom(zoom);
      // Increment style version to trigger child component updates
      setStyleVersion(v => v + 1);
    };

    // Set new style - this clears all existing sources and layers
    map.setStyle(styleSpec as maplibregl.StyleSpecification | string);

    // Use the 'idle' event which fires when all rendering is complete
    // This is more reliable than polling isStyleLoaded() for inline style objects
    map.once('idle', onStyleReady);

    setMapStyle(newStyle);
  }, [mapStyle]);

  // Initialize map when container is ready
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES.street,
        center: [initialCenterRef.current.longitude, initialCenterRef.current.latitude],
        zoom: initialZoomRef.current,
        interactive: interactive,
        attributionControl: true,
      });

      // Add controls
      if (showNavigation) {
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
      }
      if (showScale) {
        map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
      }
      if (showFullscreen) {
        map.addControl(new maplibregl.FullscreenControl(), 'top-left');
      }

      map.on('load', () => {
        setMapLoaded(true);
        onLoadRef.current?.();
      });

      map.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map. Please try again.');
      });

      mapRef.current = map;
      onMapRefCallback.current?.(map);

      return () => {
        map.remove();
        mapRef.current = null;
        onMapRefCallback.current?.(null);
      };
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError('Failed to initialize map.');
    }
  }, [interactive, showNavigation, showScale, showFullscreen]);

  const handleRetry = useCallback(() => {
    setMapError(null);
    setMapLoaded(false);
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    // Trigger re-initialization
    if (containerRef.current) {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLES.street,
        center: [initialCenterRef.current.longitude, initialCenterRef.current.latitude],
        zoom: initialZoomRef.current,
        interactive: interactive,
        attributionControl: true,
      });

      if (showNavigation) {
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
      }
      if (showScale) {
        map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
      }
      if (showFullscreen) {
        map.addControl(new maplibregl.FullscreenControl(), 'top-left');
      }

      map.on('load', () => {
        setMapLoaded(true);
        onLoadRef.current?.();
      });

      mapRef.current = map;
      onMapRefCallback.current?.(map);
    }
  }, [interactive, showNavigation, showScale, showFullscreen]);

  if (mapError) {
    return (
      <MapWrapper $height={height} className={className}>
        <ErrorContainer>
          <ErrorIcon>!</ErrorIcon>
          <ErrorText>{mapError}</ErrorText>
          <RetryButton onClick={handleRetry}>
            Retry
          </RetryButton>
        </ErrorContainer>
      </MapWrapper>
    );
  }

  return (
    <MapWrapper $height={height} className={className}>
      <MapInner ref={containerRef} />

      {!mapLoaded && (
        <LoadingOverlay>
          <LoadingSpinner />
          <LoadingText>Loading map...</LoadingText>
        </LoadingOverlay>
      )}

      {/* Search bar */}
      {mapLoaded && showSearch && (
        <Suspense fallback={null}>
          <MapSearchBar map={mapRef.current} placeholder="Search location..." />
        </Suspense>
      )}

      {/* Style toggle button (satellite/street) */}
      {mapLoaded && showStyleToggle && (
        <StyleToggleButton
          onClick={handleStyleToggle}
          title={mapStyle === 'street' ? 'Switch to Satellite View' : 'Switch to Street View'}
          aria-label={mapStyle === 'street' ? 'Switch to Satellite View' : 'Switch to Street View'}
        >
          {mapStyle === 'street' ? (
            <SatelliteIcon />
          ) : (
            <StreetIcon />
          )}
          <span>{mapStyle === 'street' ? 'Satellite' : 'Street'}</span>
        </StyleToggleButton>
      )}

      {/* Render children with map context */}
      {mapLoaded && children && (
        <ChildrenContainer>
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<{ map?: maplibregl.Map; styleVersion?: number }>, {
                map: mapRef.current || undefined,
                styleVersion,
              });
            }
            return child;
          })}
        </ChildrenContainer>
      )}
    </MapWrapper>
  );
};

// Styled Components
const MapWrapper = styled.div<{ $height: string }>`
  width: 100%;
  height: ${(props) => props.$height};
  min-height: 300px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid ${(props) => props.theme?.colors?.border || '#e0e0e0'};
  position: relative;
  background-color: #f0f0f0;
`;

const MapInner = styled.div`
  width: 100%;
  height: 100%;

  .maplibregl-ctrl-logo {
    display: none;
  }

  .maplibregl-ctrl-attrib {
    font-size: 10px;
    background: rgba(255, 255, 255, 0.7);
  }
`;

const ChildrenContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.span`
  margin-top: 12px;
  color: #666;
  font-size: 14px;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
`;

const ErrorIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fee2e2;
  color: #dc2626;
  font-size: 24px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
`;

const ErrorText = styled.p`
  color: #dc2626;
  margin: 0 0 16px 0;
  font-size: 14px;
`;

const RetryButton = styled.button`
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }
`;

const StyleToggleButton = styled.button`
  position: absolute;
  bottom: 10px;
  right: 10px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: white;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.98);
  }

  svg {
    flex-shrink: 0;
  }
`;

// Satellite icon (globe/earth)
const SatelliteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// Street/map icon
const StreetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

export default MapContainer;

// Re-export MapRef type for compatibility
export type MapRef = maplibregl.Map;
