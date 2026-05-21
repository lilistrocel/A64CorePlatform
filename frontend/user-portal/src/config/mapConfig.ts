/**
 * Map Configuration for Geo-Fencing Feature
 *
 * Uses MapLibre GL JS with ESRI World Imagery satellite tiles (free, no API key required)
 */

import type { StyleSpecification } from 'maplibre-gl';

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
    color: '#0F6E56', // Green
    opacity: 0.2,
  },
  stroke: {
    color: '#0B5644', // Darker green
    width: 3,
  },
};

/**
 * Polygon styling for blocks by status
 */
export const BLOCK_POLYGON_COLORS: Record<string, { fill: string; stroke: string }> = {
  empty: { fill: '#4B4844', stroke: '#4B4844' },      // Gray
  planned: { fill: '#0F6E56', stroke: '#0B5644' },    // Blue
  growing: { fill: '#0F6E56', stroke: '#0B5644' },    // Green
  fruiting: { fill: '#A855F7', stroke: '#9333EA' },   // Purple
  harvesting: { fill: '#B8842A', stroke: '#D97706' }, // Yellow/Orange
  cleaning: { fill: '#B85C2A', stroke: '#EA580C' },   // Orange
  alert: { fill: '#9E2A2A', stroke: '#9E2A2A' },      // Red
  partial: { fill: '#06B6D4', stroke: '#0891B2' },    // Cyan
};

/**
 * Color scheme for different boundary types
 */
export const BOUNDARY_COLORS = {
  // Farm boundaries - Orange/Amber for clear distinction
  farm: {
    fill: '#B8842A',      // Amber
    stroke: '#D97706',    // Darker amber
    fillOpacity: 0.15,
  },
  // Block boundaries - Blue for active drawing
  block: {
    fill: '#0F6E56',      // Blue
    stroke: '#0B5644',    // Darker blue
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
      'circle-color': '#FFFFFF',
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
 * Drawing control styling for FARM boundaries (orange/amber)
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
      'circle-color': '#FFFFFF',
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
