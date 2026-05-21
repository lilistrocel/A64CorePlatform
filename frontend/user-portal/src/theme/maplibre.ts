/**
 * A20Core — MapLibre GL style adapter.
 *
 * Returns a MapLibre style spec that matches Slate. Designed to overlay
 * react-map-gl + @turf/turf + @mapbox/mapbox-gl-draw without color clashes.
 *
 * Usage:
 *   import { slateMapStyle } from '@/theme'
 *   <Map mapStyle={slateMapStyle()} initialViewState={...} />
 *
 * The function form lets you swap tile sources (e.g. switch to your own
 * tile server) at runtime without losing the Slate colors.
 */

import { palette } from './tokens'

// Lightweight ambient namespace so this file compiles without an explicit
// `maplibre-gl` import. In a real app that imports `maplibre-gl`, the real
// types take precedence over this fallback.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace maplibregl {
  // Minimal shape — enough to type the helpers below. Real maplibre-gl
  // types are a superset of this and remain compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface StyleSpecification { version: number; name?: string; layers: any[]; [k: string]: any }
}

interface MapStyleOptions {
  /** Tile URL template. Default: free OSM raster tiles. */
  tileUrl?: string
  /** Tile source attribution. */
  attribution?: string
  /** Optional vector source (overrides raster) */
  vectorTileUrl?: string
}

const DEFAULT_OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/**
 * Slate-tinted raster style. The OSM tiles are visually overlaid with a
 * Linen-tone fade via a low-opacity raster fade and a background layer
 * underneath — same approach used in the deck's map visuals.
 */
export const slateMapStyle = (options: MapStyleOptions = {}): maplibregl.StyleSpecification => {
  const tileUrl = options.tileUrl ?? DEFAULT_OSM_TILES
  const attribution = options.attribution ?? DEFAULT_ATTRIBUTION

  return {
    version: 8,
    name: 'A20Core Slate',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'raster-tiles': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': palette.linen },
      },
      {
        id: 'osm-raster',
        type: 'raster',
        source: 'raster-tiles',
        paint: {
          'raster-opacity': 0.55,
          'raster-saturation': -0.45,
          'raster-contrast': -0.05,
          'raster-brightness-max': 0.95,
        },
      },
    ],
  }
}

/**
 * Dark variant — for ops night view. Inverts the canvas to deep ink.
 */
export const mapStyleDark = (options: MapStyleOptions = {}): maplibregl.StyleSpecification => {
  const base = slateMapStyle(options)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers = base.layers.map((l: any) => {
    if (l.id === 'background' && l.type === 'background') {
      return { ...l, paint: { 'background-color': '#1A1916' } }
    }
    if (l.id === 'osm-raster' && l.type === 'raster') {
      return {
        ...l,
        paint: {
          'raster-opacity': 0.4,
          'raster-saturation': -0.6,
          'raster-contrast': 0.1,
          'raster-brightness-max': 0.6,
        },
      }
    }
    return l
  })
  return { ...base, name: 'A20Core Slate (Dark)', layers }
}

/**
 * Convenience: feature paint properties for @turf-generated GeoJSON layers.
 * Spread onto a `<Layer>` of type 'fill' or 'circle' to get brand-correct
 * colors out of the box.
 */
export const mapLayerStyles = {
  // A field / parcel polygon fill
  parcelFill: {
    'fill-color': palette.sage,
    'fill-opacity': 0.15,
    'fill-outline-color': palette.sage,
  },
  // The active / selected parcel
  parcelActive: {
    'fill-color': palette.sage,
    'fill-opacity': 0.3,
    'fill-outline-color': palette.sageDeep,
  },
  // A warning / flagged parcel
  parcelWarning: {
    'fill-color': palette.warning,
    'fill-opacity': 0.18,
  },
  // Sensor / asset point
  sensorPoint: {
    'circle-color': palette.sage,
    'circle-radius': 5,
    'circle-stroke-color': palette.linen,
    'circle-stroke-width': 2,
  },
} as const
