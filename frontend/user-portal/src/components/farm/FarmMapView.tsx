/**
 * FarmMapView Component
 *
 * Displays an interactive map showing the farm boundary and all block boundaries.
 * Blocks are color-coded by their current state.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import styled from 'styled-components';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Farm, Block, BlockState } from '../../types/farm';
import { BLOCK_STATE_COLORS, BLOCK_STATE_LABELS } from '../../types/farm';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../config/mapConfig';

// CARTO Voyager style - works well with MapLibre
const MAPLIBRE_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// ============================================================================
// TYPES
// ============================================================================

interface FarmMapViewProps {
  farm: Farm;
  blocks: Block[];
  onBlockClick?: (block: Block) => void;
  onEditFarmBoundary?: () => void;
  height?: string;
}

interface BlockPopupInfo {
  block: Block;
  coordinates: [number, number];
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const MapWrapper = styled.div<{ $height: string }>`
  width: 100%;
  height: ${(props) => props.$height};
  min-height: 400px;
  border-radius: 8px;
  overflow: hidden;
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

  .maplibregl-popup-content {
    padding: 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .maplibregl-popup-close-button {
    font-size: 18px;
    padding: 4px 8px;
    color: #666;

    &:hover {
      background: #f0f0f0;
    }
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

const Legend = styled.div`
  position: absolute;
  bottom: 24px;
  left: 16px;
  background: white;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 5;
  max-width: 200px;
`;

const LegendTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #4b5563;

  &:last-child {
    margin-bottom: 0;
  }
`;

const LegendColor = styled.div<{ $color: string }>`
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background-color: ${(props) => props.$color};
  opacity: 0.7;
  border: 1px solid rgba(0, 0, 0, 0.2);
`;

const EditBoundaryButton = styled.button`
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: white;
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  z-index: 5;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    color: #3b82f6;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const AddBoundaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  margin-top: 16px;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #2563eb;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const PopupContent = styled.div`
  min-width: 200px;
`;

const PopupHeader = styled.div<{ $stateColor: string }>`
  background: ${(props) => props.$stateColor};
  color: white;
  padding: 12px 16px;
`;

const PopupTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
`;

const PopupState = styled.div`
  font-size: 12px;
  opacity: 0.9;
  margin-top: 2px;
`;

const PopupBody = styled.div`
  padding: 12px 16px;
`;

const PopupRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const PopupLabel = styled.span`
  color: #6b7280;
`;

const PopupValue = styled.span`
  color: #1f2937;
  font-weight: 500;
`;

const PopupButton = styled.button`
  width: 100%;
  padding: 10px;
  background: #3b82f6;
  color: white;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 8px;
  border-radius: 4px;

  &:hover {
    background: #2563eb;
  }
`;

const NoBoundaryMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7280;
  text-align: center;
  padding: 40px;
`;

const NoBoundaryIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
`;

const NoBoundaryText = styled.p`
  font-size: 14px;
  margin: 0 0 8px 0;
`;

const NoBoundaryHint = styled.p`
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmMapView({ farm, blocks, onBlockClick, onEditFarmBoundary, height = '500px' }: FarmMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<BlockPopupInfo | null>(null);

  // Check if farm or any blocks have boundaries
  const hasFarmBoundary = !!farm.boundary?.geometry;
  const blocksWithBoundaries = blocks.filter((b) => b.boundary?.geometry);
  const hasAnyBoundary = hasFarmBoundary || blocksWithBoundaries.length > 0;

  // Get unique block states that are present
  const presentStates = [...new Set(blocks.map((b) => b.state))];

  // Calculate map center from boundaries
  const getMapCenter = useCallback((): [number, number] => {
    // Priority 1: Farm boundary center
    if (farm.boundary?.center) {
      return [farm.boundary.center.longitude, farm.boundary.center.latitude];
    }

    // Priority 2: Farm location coordinates
    if (farm.location?.coordinates) {
      return [farm.location.coordinates.longitude, farm.location.coordinates.latitude];
    }

    // Priority 3: First block with boundary center
    const blockWithCenter = blocksWithBoundaries.find((b) => b.boundary?.center);
    if (blockWithCenter?.boundary?.center) {
      return [blockWithCenter.boundary.center.longitude, blockWithCenter.boundary.center.latitude];
    }

    // Fallback to default
    return [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude];
  }, [farm, blocksWithBoundaries]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center = getMapCenter();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPLIBRE_STYLE_URL,
      center: center,
      zoom: hasAnyBoundary ? 15 : DEFAULT_ZOOM,
      attributionControl: true,
    });

    // Add controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.on('load', () => {
      setMapLoaded(true);

      // Add farm boundary if available
      if (hasFarmBoundary && farm.boundary?.geometry) {
        map.addSource('farm-boundary', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { name: farm.name },
            geometry: farm.boundary.geometry,
          },
        });

        // Farm boundary fill (very subtle)
        map.addLayer({
          id: 'farm-boundary-fill',
          type: 'fill',
          source: 'farm-boundary',
          paint: {
            'fill-color': '#3B82F6',
            'fill-opacity': 0.05,
          },
        });

        // Farm boundary outline (dashed)
        map.addLayer({
          id: 'farm-boundary-outline',
          type: 'line',
          source: 'farm-boundary',
          paint: {
            'line-color': '#3B82F6',
            'line-width': 3,
            'line-dasharray': [4, 2],
          },
        });
      }

      // Add block boundaries
      if (blocksWithBoundaries.length > 0) {
        const blockFeatures = blocksWithBoundaries.map((block) => ({
          type: 'Feature' as const,
          properties: {
            blockId: block.blockId,
            name: block.name,
            state: block.state,
            color: BLOCK_STATE_COLORS[block.state] || '#6B7280',
            area: block.area,
            maxPlants: block.maxPlants,
            currentPlantingId: block.currentPlantingId,
            targetCrop: block.targetCropName || block.targetCrop,
          },
          geometry: block.boundary!.geometry,
        }));

        map.addSource('block-boundaries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: blockFeatures,
          },
        });

        // Block boundary fills
        map.addLayer({
          id: 'block-boundaries-fill',
          type: 'fill',
          source: 'block-boundaries',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.4,
          },
        });

        // Block boundary outlines
        map.addLayer({
          id: 'block-boundaries-outline',
          type: 'line',
          source: 'block-boundaries',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
          },
        });

        // Block labels
        map.addLayer({
          id: 'block-labels',
          type: 'symbol',
          source: 'block-boundaries',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        });

        // Click handler for blocks
        map.on('click', 'block-boundaries-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const blockId = feature.properties?.blockId;
            const block = blocks.find((b) => b.blockId === blockId);

            if (block) {
              const coordinates = e.lngLat;
              setSelectedBlock({
                block,
                coordinates: [coordinates.lng, coordinates.lat],
              });
            }
          }
        });

        // Hover effect
        map.on('mouseenter', 'block-boundaries-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'block-boundaries-fill', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // Fit bounds to show all features
      if (hasAnyBoundary) {
        const bounds = new maplibregl.LngLatBounds();

        if (hasFarmBoundary && farm.boundary?.geometry) {
          farm.boundary.geometry.coordinates[0].forEach((coord) => {
            bounds.extend(coord as [number, number]);
          });
        }

        blocksWithBoundaries.forEach((block) => {
          if (block.boundary?.geometry) {
            block.boundary.geometry.coordinates[0].forEach((coord) => {
              bounds.extend(coord as [number, number]);
            });
          }
        });

        map.fitBounds(bounds, { padding: 50 });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [farm, blocks, hasAnyBoundary, hasFarmBoundary, blocksWithBoundaries, getMapCenter]);

  // Handle popup for selected block
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Remove existing popup
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (selectedBlock) {
      const { block, coordinates } = selectedBlock;
      const stateColor = BLOCK_STATE_COLORS[block.state] || '#6B7280';
      const areaHectares = block.area ? (block.area / 10000).toFixed(2) : 'N/A';

      const popupHtml = `
        <div style="min-width: 200px;">
          <div style="background: ${stateColor}; color: white; padding: 12px 16px;">
            <div style="font-size: 14px; font-weight: 600;">${block.name}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
              ${BLOCK_STATE_LABELS[block.state]}
            </div>
          </div>
          <div style="padding: 12px 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
              <span style="color: #6b7280;">Area</span>
              <span style="color: #1f2937; font-weight: 500;">${areaHectares} ha</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
              <span style="color: #6b7280;">Max Plants</span>
              <span style="color: #1f2937; font-weight: 500;">${block.maxPlants}</span>
            </div>
            ${block.targetCropName ? `
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                <span style="color: #6b7280;">Crop</span>
                <span style="color: #1f2937; font-weight: 500;">${block.targetCropName}</span>
              </div>
            ` : ''}
            ${onBlockClick ? `
              <button
                id="popup-view-btn"
                style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; border-radius: 4px;"
              >
                View Details
              </button>
            ` : ''}
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '300px',
      })
        .setLngLat(coordinates)
        .setHTML(popupHtml)
        .addTo(mapRef.current);

      // Add click handler for the button after popup is rendered
      if (onBlockClick) {
        setTimeout(() => {
          const btn = document.getElementById('popup-view-btn');
          if (btn) {
            btn.addEventListener('click', () => {
              onBlockClick(block);
              popup.remove();
            });
          }
        }, 0);
      }

      popup.on('close', () => {
        setSelectedBlock(null);
      });

      popupRef.current = popup;
    }
  }, [selectedBlock, mapLoaded, onBlockClick]);

  // If no boundaries at all, show a message
  if (!hasAnyBoundary) {
    return (
      <MapWrapper $height={height}>
        <NoBoundaryMessage>
          <NoBoundaryIcon>🗺️</NoBoundaryIcon>
          <NoBoundaryText>No map boundaries defined</NoBoundaryText>
          <NoBoundaryHint>
            Draw boundaries when creating or editing the farm and blocks to see them on the map.
          </NoBoundaryHint>
          {onEditFarmBoundary && (
            <AddBoundaryButton onClick={onEditFarmBoundary}>
              <EditIcon />
              Add Farm Boundary
            </AddBoundaryButton>
          )}
        </NoBoundaryMessage>
      </MapWrapper>
    );
  }

  return (
    <MapWrapper $height={height}>
      <MapInner ref={containerRef} />

      {!mapLoaded && (
        <LoadingOverlay>
          <LoadingSpinner />
          <LoadingText>Loading map...</LoadingText>
        </LoadingOverlay>
      )}

      {mapLoaded && onEditFarmBoundary && (
        <EditBoundaryButton onClick={onEditFarmBoundary}>
          <EditIcon />
          Edit Farm Boundary
        </EditBoundaryButton>
      )}

      {mapLoaded && presentStates.length > 0 && (
        <Legend>
          <LegendTitle>Block Status</LegendTitle>
          {presentStates.map((state) => (
            <LegendItem key={state}>
              <LegendColor $color={BLOCK_STATE_COLORS[state]} />
              <span>{BLOCK_STATE_LABELS[state]}</span>
            </LegendItem>
          ))}
          {hasFarmBoundary && (
            <>
              <div style={{ height: 8 }} />
              <LegendItem>
                <LegendColor $color="#3B82F6" />
                <span>Farm Boundary</span>
              </LegendItem>
            </>
          )}
        </Legend>
      )}
    </MapWrapper>
  );
}

export default FarmMapView;
