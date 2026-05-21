/**
 * A20Core — Recharts theming adapter.
 *
 * Recharts doesn't ship a real theme system, so we expose three things:
 *   1. `chartPalette` — categorical color list, derived from Slate accents.
 *   2. `axisDefaults` — props you spread onto XAxis / YAxis to inherit Slate.
 *   3. `tooltipDefaults` — props for the <Tooltip /> component.
 *
 * Usage:
 *   import { chartPalette, axisDefaults, tooltipDefaults } from '@/theme'
 *
 *   <LineChart data={data}>
 *     <XAxis dataKey="day" {...axisDefaults} />
 *     <YAxis {...axisDefaults} />
 *     <Tooltip {...tooltipDefaults} />
 *     <Line dataKey="yield" stroke={chartPalette[0]} strokeWidth={2} dot={false} />
 *   </LineChart>
 */

import { palette } from './tokens'

/**
 * Categorical palette — order matters; agents should consume in sequence.
 * Sage leads (the brand chromatic accent), then ink-on-stone shades, then
 * Rust as the highlight color when 5+ series are needed.
 */
export const chartPalette = [
  palette.sage,          // #0F6E56  — primary series
  palette.slate,         // #4B4844  — secondary series (high contrast vs sage)
  palette.sageDeep,      // #0B5644  — third series
  palette.warning,       // #B8842A  — ochre, fourth series
  palette.rust,          // #B85C2A  — RESERVED for highlight (e.g. "ASK" line)
  '#2A5E7E',             // muted indigo — extension color for >5 series only
] as const

/**
 * Axis defaults — spread onto XAxis / YAxis.
 * Uses CSS variables so themes flip cleanly in dark mode.
 */
export const axisDefaults = {
  stroke: palette.stoneDeep,
  tick: { fill: palette.slate, fontSize: 12, fontFamily: 'Inter, sans-serif' },
  tickLine: { stroke: palette.stoneDeep },
  axisLine: { stroke: palette.stoneDeep },
} as const

/**
 * Tooltip defaults — Slate-styled, minimal chrome.
 */
export const tooltipDefaults = {
  cursor: { stroke: palette.slate, strokeDasharray: '3 3' },
  contentStyle: {
    background: palette.linenSoft,
    border: `1px solid ${palette.stoneDeep}`,
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(15, 15, 15, 0.08)',
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    color: palette.ink,
    padding: '8px 12px',
  },
  labelStyle: {
    color: palette.slate,
    fontSize: 11,
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  itemStyle: { color: palette.ink, fontWeight: 500 },
} as const

/**
 * Bundle for ergonomics — agents can `import { rechartsTheme }` and get it all.
 */
export const rechartsTheme = {
  palette: chartPalette,
  axis: axisDefaults,
  tooltip: tooltipDefaults,

  /** CartesianGrid props — call as `<CartesianGrid {...rechartsTheme.grid} />` */
  grid: {
    stroke: palette.stone,
    strokeDasharray: '2 4',
    vertical: false,           // editorial charts hide vertical grid by default
  },
  /** Legend defaults */
  legend: {
    wrapperStyle: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
      color: palette.slate,
    },
    iconType: 'circle' as const,
    iconSize: 8,
  },
} as const
