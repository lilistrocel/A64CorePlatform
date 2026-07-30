/**
 * Map Configuration for Geo-Fencing Feature
 *
 * Uses MapLibre GL JS with ESRI World Imagery satellite tiles (free, no API key required)
 */

import type { StyleSpecification } from 'maplibre-gl';
import { lightTheme } from '@a64core/shared';

// NOTE (A20Core sweep, T-900): these MapLibre paint specs are built once at
// module load with no theme context, and every consumer (FarmMapView,
// MapContainer, DrawingControls — all in src/components/) reads these as
// plain exported constants, not a function of theme. Making this
// theme-reactive would require changing the export shape and updating those
// three call sites, which sit outside this shard's file set. So: these
// reference lightTheme.colors directly (single source of truth, no
// duplicated hex) but will NOT flip in dark mode. Flagged for a follow-up
// shard that owns src/components/map + src/components/farm.
const c = lightTheme.colors;

/**
 * ESRI World Imagery satellite map style
 * Free to use, no API key required
 */
export const MAP_STYLE_SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [
    {
      id: 'satellite',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * OpenStreetMap style (fallback)
 */
export const MAP_STYLE_OSM: StyleSpecification = {
  version: 8,
  sources: {
    'osm': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * Default center position (UAE - typical farm location)
 */
export const DEFAULT_CENTER = {
  latitude: 25.276987,
  longitude: 55.296249,
};

/**
 * Default zoom level for farm viewing
 */
export const DEFAULT_ZOOM = 15;

/**
 * Zoom level when viewing a single farm
 */
export const FARM_ZOOM = 16;

/**
 * Zoom level when viewing a single block
 */
export const BLOCK_ZOOM = 18;

/**
 * Map control positions
 */
export const MAP_CONTROLS = {
  navigation: 'top-right' as const,
  scale: 'bottom-left' as const,
  fullscreen: 'top-left' as const,
};

/**
 * Polygon styling for farms
 */
export const FARM_POLYGON_STYLE = {
  fill: {
    color: c.emerald[500], // Emerald (was green)
    opacity: 0.2,
  },
  stroke: {
    color: c.emerald[600], // Darker emerald
    width: 3,
  },
};

/**
 * Polygon styling for blocks by status.
 * Kept in sync with BLOCK_STATE_COLORS in src/types/farm.ts — same lifecycle
 * states, same hex per state, across the map overlay and badges/legends.
 */
export const BLOCK_POLYGON_COLORS: Record<string, { fill: string; stroke: string }> = {
  empty: { fill: c.neutral[400], stroke: c.neutral[600] },       // Neutral (was gray)
  planned: { fill: c.primary[500], stroke: c.primary[600] },     // Lapis (was blue)
  growing: { fill: c.emerald[500], stroke: c.emerald[600] },     // Emerald (was green)
  fruiting: { fill: c.gold[400], stroke: c.gold[700] },          // Gold (was purple — categorical judgement call, spec §3)
  harvesting: { fill: c.gold[500], stroke: c.gold[600] },        // Gold/warning (was amber)
  cleaning: { fill: c.terracotta[400], stroke: c.terracotta[600] }, // Terracotta (was orange)
  alert: { fill: c.terracotta[600], stroke: c.terracotta[700] }, // Terracotta, deepened — danger carries weight (spec §1)
  partial: { fill: c.primary[400], stroke: c.primary[700] },     // Lapis (was cyan — art-only hue, spec §3)
};

/**
 * Color scheme for different boundary types
 */
export const BOUNDARY_COLORS = {
  // Farm boundaries - Gold/warning for clear distinction
  farm: {
    fill: c.gold[500],      // Gold (was amber)
    stroke: c.gold[600],    // Darker gold
    fillOpacity: 0.15,
  },
  // Block boundaries - Lapis for active drawing
  block: {
    fill: c.primary[500],   // Lapis (was blue)
    stroke: c.primary[600], // Darker lapis
    fillOpacity: 0.25,
  },
};

/**
 * Drawing control styling for BLOCK boundaries (blue)
 */
export const DRAW_STYLES = [
  // Polygon fill
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: {
      'fill-color': BOUNDARY_COLORS.block.fill,
      'fill-outline-color': BOUNDARY_COLORS.block.fill,
      'fill-opacity': BOUNDARY_COLORS.block.fillOpacity,
    },
  },
  // Polygon stroke (active)
  {
    id: 'gl-draw-polygon-stroke-active',
    type: 'line' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': BOUNDARY_COLORS.block.fill,
      'line-dasharray': [2, 2],
      'line-width': 2,
    },
  },
  // Polygon stroke (static/complete)
  {
    id: 'gl-draw-polygon-stroke-static',
    type: 'line' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': BOUNDARY_COLORS.block.stroke,
      'line-width': 3,
    },
  },
  // Vertex points
  {
    id: 'gl-draw-point',
    type: 'circle' as const,
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
    paint: {
      'circle-radius': 6,
      'circle-color': c.onAccent, // Cream (was pure white — brand never uses pure white, spec §2)
      'circle-stroke-width': 2,
      'circle-stroke-color': BOUNDARY_COLORS.block.fill,
    },
  },
  // Midpoint vertices
  {
    id: 'gl-draw-point-midpoint',
    type: 'circle' as const,
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: {
      'circle-radius': 4,
      'circle-color': BOUNDARY_COLORS.block.fill,
    },
  },
];

/**
 * Drawing control styling for FARM boundaries (gold)
 */
export const DRAW_STYLES_FARM = [
  // Polygon fill
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    paint: {
      'fill-color': BOUNDARY_COLORS.farm.fill,
      'fill-outline-color': BOUNDARY_COLORS.farm.fill,
      'fill-opacity': BOUNDARY_COLORS.farm.fillOpacity,
    },
  },
  // Polygon stroke (active)
  {
    id: 'gl-draw-polygon-stroke-active',
    type: 'line' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': BOUNDARY_COLORS.farm.fill,
      'line-dasharray': [2, 2],
      'line-width': 2,
    },
  },
  // Polygon stroke (static/complete)
  {
    id: 'gl-draw-polygon-stroke-static',
    type: 'line' as const,
    filter: ['all', ['==', '$type', 'Polygon'], ['==', 'mode', 'static']],
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
    paint: {
      'line-color': BOUNDARY_COLORS.farm.stroke,
      'line-width': 3,
    },
  },
  // Vertex points
  {
    id: 'gl-draw-point',
    type: 'circle' as const,
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
    paint: {
      'circle-radius': 6,
      'circle-color': c.onAccent, // Cream (was pure white — brand never uses pure white, spec §2)
      'circle-stroke-width': 2,
      'circle-stroke-color': BOUNDARY_COLORS.farm.fill,
    },
  },
  // Midpoint vertices
  {
    id: 'gl-draw-point-midpoint',
    type: 'circle' as const,
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
    paint: {
      'circle-radius': 4,
      'circle-color': BOUNDARY_COLORS.farm.fill,
    },
  },
];
