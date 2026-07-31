/**
 * Map Configuration for Geo-Fencing Feature
 *
 * Uses MapLibre GL JS with ESRI World Imagery satellite tiles (free, no API key required)
 */

import type { StyleSpecification } from 'maplibre-gl';
import { theme } from '@a64core/shared';
import type { BlockState } from '../types/farm';
import { BLOCK_STATE_PHASE_KEYS } from '../types/farm';

// NOTE (A20Core sweep, T-900; updated Night Observatory sweep, T-901): these
// MapLibre paint specs are built once at module load with no theme context,
// and every consumer (FarmMapView, MapContainer, DrawingControls — all in
// src/components/) reads these as plain exported constants, not a function
// of theme. Making this theme-reactive would require changing the export
// shape and updating those three call sites, which sit outside this shard's
// file set (they belong to other agents in this same wave). So: these
// reference `theme.colors` directly (single source of truth, no duplicated
// hex) at module load. The original T-900 caveat ("won't flip in dark mode")
// is now moot — dark is the only mode (`theme` === `darkTheme`) — but the
// underlying problem (frozen-at-import-time, not reactive to a theme
// context) is unchanged and would resurface if a light mode ever ships.
// Flagged for a follow-up shard that owns src/components/map + src/components/farm.
const c = theme.colors;

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
    color: c.bright.emerald, // categorical farm-shape colour, not a status — spec §3/#3
    opacity: 0.2,
  },
  stroke: {
    color: c.emerald[700], // deeper emerald ramp step for the outline
    width: 3,
  },
};

/**
 * Polygon styling for blocks by status.
 * Kept in sync with BLOCK_STATE_COLORS in src/types/farm.ts — same lifecycle
 * states, same hex per state, across the map overlay and badges/legends.
 * Night Observatory (T-901): routed onto colors.phase.* (spec §5.2).
 * `harvesting` is the ONE sanctioned gold status; `fruiting` previously
 * (mis)used the raw gold ramp and has moved to phase.fruiting (emerald).
 * `phase.*` tokens are flat (no light/dark ramp step per hue, unlike the old
 * primary/gold/terracotta ramps), so fill and stroke share the same hex here
 * — the two-tone fill/darker-stroke depth effect the ramp-based version had
 * is lost. Follow-up: if that depth read is wanted back, the token layer
 * would need a `phase.*.stroke` (darkened) companion set; out of scope here
 * (would touch theme.ts, owned by phase 1).
 *
 * Consolidation pass (T-901 shard NON-UI-CLEANUP): derived from
 * BLOCK_STATE_PHASE_KEYS (src/types/farm.ts — the canonical, frozen
 * BlockState -> PhaseKey map; read-only import, not re-declared here) rather
 * than a third hand-written state->colour table. One definition of "which
 * phase each block state means"; this file only decides fill===stroke.
 */
export const BLOCK_POLYGON_COLORS: Record<BlockState, { fill: string; stroke: string }> = Object.fromEntries(
  Object.entries(BLOCK_STATE_PHASE_KEYS).map(([state, key]) => [
    state,
    { fill: c.phase[key], stroke: c.phase[key] },
  ])
) as Record<BlockState, { fill: string; stroke: string }>;

/**
 * Color scheme for different boundary types. Categorical (drawing-mode
 * distinction), not a status — routed onto colors.bright.* per spec's
 * categorical-map rule, not colors.phase.* and not gold (farm boundaries
 * previously used the raw gold ramp, which spec §3 reserves for Harvesting
 * + chrome; moved to bright.terra to keep a warm, distinct hue without
 * spending gold budget).
 */
export const BOUNDARY_COLORS = {
  // Farm boundaries - warm terra for clear distinction from block (lapis)
  farm: {
    fill: c.bright.terra,
    stroke: c.terracotta[600], // deeper terracotta-ramp step for the outline
    fillOpacity: 0.15,
  },
  // Block boundaries - Lapis for active drawing
  block: {
    fill: c.bright.lapis,
    stroke: c.primary[600], // deeper lapis-ramp step for the outline
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
      // Night Observatory (T-901): `onAccent` is the one BREAKING semantic
      // change in spec §1.1 — it now means "dark text on a gold fill", not
      // "cream on a dark/saturated fill". This marker needs the latter
      // (a light dot visible against a satellite photo + lapis/gold stroke),
      // so it uses `onDark` (cream), not `onAccent` (would render near-black).
      'circle-color': c.onDark,
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
      // Night Observatory (T-901): `onAccent` is the one BREAKING semantic
      // change in spec §1.1 — it now means "dark text on a gold fill", not
      // "cream on a dark/saturated fill". This marker needs the latter
      // (a light dot visible against a satellite photo + lapis/gold stroke),
      // so it uses `onDark` (cream), not `onAccent` (would render near-black).
      'circle-color': c.onDark,
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
