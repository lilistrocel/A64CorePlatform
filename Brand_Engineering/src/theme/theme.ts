/**
 * A20Core — styled-components theme assembly.
 *
 * Slate is light-first. A dark variant is provided for opt-in surfaces
 * (e.g. the on-call ops dashboard, map overlays at night) but is NOT
 * recommended as a global setting. Default `theme` export is light.
 *
 * Usage:
 *   import { ThemeProvider } from 'styled-components'
 *   import { theme } from '@/theme'
 *   <ThemeProvider theme={theme}> ... </ThemeProvider>
 */

import {
  palette,
  colorsLight,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  space,
  radii,
  shadows,
  motion,
  zIndices,
  breakpoints,
  media,
  layout,
  brandRule,
} from './tokens'

// ── Dark variant (rarely used; for night-ops surfaces only) ────────────
const colorsDark = {
  surface: {
    canvas: '#1A1916',           // deep warm ink — NOT pure black
    raised: '#252320',
    sunken: '#0F0E0C',
    overlay: 'rgba(15, 15, 15, 0.6)',
  },
  text: {
    primary: palette.linen,
    secondary: 'rgba(237, 234, 227, 0.72)',
    tertiary: 'rgba(237, 234, 227, 0.48)',
    inverse: palette.ink,
    onAccent: palette.linen,
  },
  border: {
    default: 'rgba(237, 234, 227, 0.12)',
    subtle: 'rgba(237, 234, 227, 0.06)',
    strong: 'rgba(237, 234, 227, 0.24)',
    accent: palette.sage,
  },
  accent: colorsLight.accent,
  status: colorsLight.status,
} as const

// ── The full theme shape ───────────────────────────────────────────────
export const buildTheme = (mode: 'light' | 'dark') => ({
  mode,
  palette,
  colors: mode === 'light' ? colorsLight : colorsDark,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  space,
  radii,
  shadows,
  motion,
  zIndices,
  breakpoints,
  media,
  layout,
  brandRule,
})

export const theme = buildTheme('light')
export const themeDark = buildTheme('dark')

export type AppTheme = ReturnType<typeof buildTheme>
