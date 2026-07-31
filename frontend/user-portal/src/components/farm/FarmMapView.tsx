/**
 * FarmMapView Component
 *
 * Displays an interactive map showing the farm boundary and all block boundaries.
 * Blocks are color-coded by their current state.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import styled, { useTheme } from 'styled-components';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Map as MapIcon } from 'lucide-react';
import { glassOpaque, monoLabel } from '@a64core/shared';

import type { Farm, Block, BlockState } from '../../types/farm';
import { BLOCK_STATE_COLORS, BLOCK_STATE_LABELS } from '../../types/farm';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../config/mapConfig';

// Satellite imagery style using Esri World Imagery (free for non-commercial/limited use)
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
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
};

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
  background-color: ${({ theme }) => theme.colors.neutral[200]};
`;

const MapInner = styled.div`
  width: 100%;
  height: 100%;

  .maplibregl-ctrl-logo {
    display: none;
  }

  .maplibregl-ctrl-attrib {
    font-size: 10px;
    /* Intentionally NOT themed — same exception as the block labels below and
       components/map/MapContainer.tsx (spec §8). MapLibre's own attribution
       text is hardcoded dark by the library's default stylesheet, so the
       control needs a light backing to stay legible over the satellite photo
       basemap regardless of app theme. */
    background: rgba(255, 255, 255, 0.7);
  }

  /* Popup card floats directly over Esri imagery, so it needs an opaque
     (not glass-translucent) ground per the popup pattern (spec §4/§8
     screen-sweep brief). MapLibre's own default is a plain white card; both
     the content box and the anchor "tip" triangle are retinted here since
     the popup HTML (built via setHTML below) only carries text/row colours,
     not the card's own background/tip. */
  .maplibregl-popup-content {
    padding: 0;
    border-radius: 10px;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.cosmosHi};
    border: 1px solid ${({ theme }) => theme.colors.glass.border};
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }

  .maplibregl-popup-tip {
    border-top-color: ${({ theme }) => theme.colors.cosmosHi} !important;
    border-bottom-color: ${({ theme }) => theme.colors.cosmosHi} !important;
    border-left-color: ${({ theme }) => theme.colors.cosmosHi} !important;
    border-right-color: ${({ theme }) => theme.colors.cosmosHi} !important;
  }

  .maplibregl-popup-close-button {
    font-size: 18px;
    padding: 4px 8px;
    color: ${({ theme }) => theme.colors.textSecondary};

    &:hover {
      background: ${({ theme }) => theme.colors.glass.hi};
      color: ${({ theme }) => theme.colors.textPrimary};
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
  background: ${({ theme }) => theme.colors.glass.opaque};
  z-index: 10;
`;

const LoadingSpinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

// Map overlay control — floats directly over the Esri satellite photo, not
// the app's own cosmos-gradient background. glassOpaque (solid cosmos-hi,
// no blur) is used instead of the translucent glassPanel/glassControl
// recipe: at glass.base's ~42% opacity, bright imagery (satellite greens/
// browns/greys) bleeds through enough to wreck the legend's own text
// contrast, so this control needs the fully-opaque variant.
const Legend = styled.div`
  position: absolute;
  bottom: 24px;
  left: 16px;
  ${glassOpaque}
  padding: 12px 16px;
  border-radius: 12px;
  z-index: 5;
  max-width: 200px;
`;

const LegendTitle = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};

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
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

// Same extra-opacity treatment as Legend above — this control floats over
// bright satellite imagery, so it stays fully opaque (theme.colors.background,
// solid cosmos-hi) rather than the translucent glassControl recipe.
const EditBoundaryButton = styled.button`
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  z-index: 5;
  transition: all 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    color: ${({ theme }) => theme.colors.secondary[500]};
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

// This empty state's one primary button — the map's single sanctioned gold
// CTA (spec §3/§4 gold discipline). Was previously a lapis (primary[500])
// fill with onAccent (dark cosmos) text, which was backwards: onAccent is
// only correct on a gold fill. Promoting the fill to gold makes onAccent
// correct again instead of swapping it for onDark.
const AddBoundaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  margin-top: 16px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onAccent};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[400]}, ${({ theme }) => theme.colors.secondary[500]});
    transform: translateY(-1px);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const PopupContent = styled.div`
  min-width: 200px;
`;

// $stateColor is one of the 12 phase colours (BLOCK_STATE_COLORS), and only
// ONE of them — harvesting — is the gold that onAccent is meant for; the
// other 11 are lapis/coral/emerald/celeste/etc "bright.*" fills that need
// onDark (cream) text instead. Same conditional applied to the real popup
// HTML below (search for `headerTextColor`).
const PopupHeader = styled.div<{ $stateColor: string }>`
  background: ${(props) => props.$stateColor};
  color: ${({ theme, $stateColor }) =>
    $stateColor === theme.colors.phase.harvesting ? theme.colors.onAccent : theme.colors.onDark};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PopupValue = styled.span`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const PopupButton = styled.button`
  width: 100%;
  padding: 10px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 8px;
  border-radius: 4px;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const NoBoundaryMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: 40px;
`;

// Icon container for the empty/error states below — matches the sibling
// BlockGrid.tsx EmptyIcon pattern (lucide icon, not an emoji glyph).
const NoBoundaryIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
`;

const NoBoundaryText = styled.p`
  font-size: 14px;
  margin: 0 0 8px 0;
`;

const NoBoundaryHint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textDisabled};
  margin: 0;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmMapView({ farm, blocks, onBlockClick, onEditFarmBoundary, height = '500px' }: FarmMapViewProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
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

    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: SATELLITE_STYLE,
        center: center,
        zoom: hasAnyBoundary ? 15 : DEFAULT_ZOOM,
        attributionControl: true,
      });

      // Handle map errors (including WebGL errors)
      map.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map. Your browser may not support WebGL.');
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
            'fill-color': theme.colors.primary[500],
            'fill-opacity': 0.05,
          },
        });

        // Farm boundary outline (dashed)
        map.addLayer({
          id: 'farm-boundary-outline',
          type: 'line',
          source: 'farm-boundary',
          paint: {
            'line-color': theme.colors.primary[500],
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
            color: BLOCK_STATE_COLORS[block.state] || theme.colors.textSecondary,
            area: block.area,
            availableArea: block.availableArea,
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

        // Block labels (white text with dark halo for satellite visibility).
        // Intentionally NOT themed: these render directly onto the Esri satellite
        // photo basemap, not app chrome — the basemap's own contrast (not the
        // light/dark app theme) is what this halo needs to read against.
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
            'text-color': '#ffffff',
            'text-halo-color': '#000000',
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
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError('Failed to initialize map. Your browser may not support WebGL.');
    }
  }, [farm, blocks, hasAnyBoundary, hasFarmBoundary, blocksWithBoundaries, getMapCenter, theme]);

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
      const stateColor = BLOCK_STATE_COLORS[block.state] || theme.colors.textSecondary;
      // Only the harvesting phase colour is the gold onAccent is meant for;
      // the other 11 phase colours (lapis/coral/emerald/celeste/etc "bright.*"
      // fills) need onDark (cream) text instead — see the PopupHeader comment
      // above for the same rule applied to the (unused) styled-component twin.
      const headerTextColor =
        stateColor === theme.colors.phase.harvesting ? theme.colors.onAccent : theme.colors.onDark;
      const areaHectares = block.area ? (block.area / 10000).toFixed(2) : 'N/A';

      const availableAreaHectares = block.availableArea != null ? (block.availableArea / 10000).toFixed(2) : 'N/A';

      // Popup content is rendered by MapLibre via raw HTML (setHTML), so it can't
      // use styled-components — theme values are interpolated directly instead.
      // Card background/border/tip are handled by the .maplibregl-popup-content /
      // .maplibregl-popup-tip overrides in MapInner above; this string only
      // needs to carry the row-level colours.
      const popupHtml = `
        <div style="min-width: 200px;">
          <div style="background: ${stateColor}; color: ${headerTextColor}; padding: 12px 16px;">
            <div style="font-size: 14px; font-weight: 600;">${block.name}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
              ${BLOCK_STATE_LABELS[block.state]}
            </div>
          </div>
          <div style="padding: 12px 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
              <span style="color: ${theme.colors.textSecondary};">Area</span>
              <span style="color: ${theme.colors.textPrimary}; font-weight: 500; font-family: ${theme.typography.fontFamily.mono};">${areaHectares} ha</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
              <span style="color: ${theme.colors.textSecondary};">Available</span>
              <span style="color: ${theme.colors.textPrimary}; font-weight: 500; font-family: ${theme.typography.fontFamily.mono};">${availableAreaHectares} ha</span>
            </div>
            ${block.targetCropName ? `
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                <span style="color: ${theme.colors.textSecondary};">Crop</span>
                <span style="color: ${theme.colors.textPrimary}; font-weight: 500;">${block.targetCropName}</span>
              </div>
            ` : ''}
            ${onBlockClick ? `
              <button
                id="popup-view-btn"
                style="width: 100%; padding: 10px; background: ${theme.colors.primary[500]}; color: ${theme.colors.onDark}; border: none; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; border-radius: 4px;"
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
  }, [selectedBlock, mapLoaded, onBlockClick, theme]);

  // Show error message if map initialization failed
  if (mapError) {
    return (
      <MapWrapper $height={height}>
        <NoBoundaryMessage>
          <NoBoundaryIcon aria-hidden="true"><AlertTriangle size={40} strokeWidth={1.4} /></NoBoundaryIcon>
          <NoBoundaryText>{mapError}</NoBoundaryText>
          <NoBoundaryHint>
            This may happen if WebGL is not available in your browser. Try using a different browser or enabling hardware acceleration.
          </NoBoundaryHint>
        </NoBoundaryMessage>
      </MapWrapper>
    );
  }

  // If no boundaries at all, show a message
  if (!hasAnyBoundary) {
    return (
      <MapWrapper $height={height}>
        <NoBoundaryMessage>
          <NoBoundaryIcon aria-hidden="true"><MapIcon size={40} strokeWidth={1.4} /></NoBoundaryIcon>
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
                <LegendColor $color={theme.colors.primary[500]} />
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
