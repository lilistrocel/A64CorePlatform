/**
 * A20Core — Slate Design Tokens
 *
 * Source of truth for the visual language. Two layers:
 *   1. `palette` — raw brand colors (linen, stone, ink, slate, sage, rust).
 *   2. semantic groups (surface, text, border, accent, status) — what
 *      product code should reach for in 99% of cases.
 *
 * AI coding agents: prefer semantic tokens. Reach into `palette` only when
 * you are defining a new semantic token, never inside a component.
 */

// ─── 1. Palette ──────────────────────────────────────────────────────────
export const palette = {
  // Surfaces / canvas
  linen: '#EDEAE3',          // primary canvas — the warm-grey paper feel
  linenSoft: '#F4F2EC',      // lifted variant for hover / contrast cards
  stone: '#DCD8CF',          // secondary surface, dividers, structural blocks
  stoneDeep: '#CFC9BD',      // borders, table rules

  // Text
  ink: '#0F0F0F',            // near-black, primary text
  slate: '#4B4844',          // secondary text, captions, metadata

  // Accents
  sage: '#0F6E56',           // chromatic accent — agriculturally rooted forest green
  sageDeep: '#0B5644',       // hover / pressed state for sage
  sageSoft: 'rgba(15, 110, 86, 0.10)', // tinted background (KPI chip, pill bg)
  rust: '#B85C2A',           // rare warm accent — RESERVED for "The Ask" / pricing
  rustDeep: '#9A4A20',

  // Status (functional, used sparingly)
  success: '#0F6E56',        // alias of sage
  warning: '#B8842A',        // ochre, warm, harmonises with linen
  danger: '#9E2A2A',         // brick red, NEVER pure red
  info: '#4B4844',           // alias of slate — info is muted, not blue

  // True extremes (use sparingly — Slate avoids pure white/black)
  paper: '#FFFFFF',
  void: '#000000',
} as const

// ─── 2. Semantic colors (light) ─────────────────────────────────────────
export const colorsLight = {
  surface: {
    canvas: palette.linen,         // page background
    raised: palette.linenSoft,     // cards on canvas
    sunken: palette.stone,         // wells, inputs
    overlay: 'rgba(15, 15, 15, 0.4)',
  },
  text: {
    primary: palette.ink,          // headlines, body
    secondary: palette.slate,      // captions, helper text
    tertiary: 'rgba(75, 72, 68, 0.6)',
    inverse: palette.linen,        // on dark surfaces (rare)
    onAccent: palette.linen,       // text on sage/rust fills
  },
  border: {
    default: palette.stoneDeep,
    subtle: palette.stone,
    strong: palette.slate,
    accent: palette.sage,
  },
  accent: {
    sage: palette.sage,
    sageDeep: palette.sageDeep,
    sageSoft: palette.sageSoft,
    rust: palette.rust,            // USE WITH CARE — see AGENTS.md §3
    rustDeep: palette.rustDeep,
  },
  status: {
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    info: palette.info,
  },
} as const

// ─── 3. Typography ──────────────────────────────────────────────────────
export const fonts = {
  display: '"Playfair Display", "Times New Roman", Georgia, serif',
  body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const

/**
 * Type scale. Web-friendly translation of the deck spec
 * (deck uses 88-120pt for hero; here we top out at 96px).
 * Values are pixels — use `${rem(48)}` helper in styled-components if you prefer rem.
 */
export const fontSizes = {
  // Display (Playfair)
  hero: '88px',          // big landing / cover numbers
  displayLg: '64px',
  displayMd: '48px',
  displaySm: '36px',
  // Headings (Playfair OR Inter — see AGENTS.md §4)
  h1: '32px',
  h2: '24px',
  h3: '20px',
  h4: '18px',
  // Body (Inter)
  bodyLg: '18px',
  bodyMd: '16px',        // base
  bodySm: '14px',
  caption: '13px',
  // Mono (IBM Plex Mono)
  monoLg: '14px',
  monoMd: '12px',
  monoSm: '11px',
} as const

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
} as const

export const lineHeights = {
  tight: 1.05,           // display / hero
  snug: 1.2,             // headings
  base: 1.55,            // body
  loose: 1.7,            // long-form reading
} as const

export const letterSpacings = {
  tight: '-0.03em',      // display headlines
  base: '0',
  wide: '0.08em',        // mono labels
  wider: '0.12em',       // mono chips, ALL CAPS metadata
} as const

// ─── 4. Spacing (4px base) ──────────────────────────────────────────────
export const space = {
  '0': '0',
  px: '1px',
  '0.5': '2px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',           // gutter
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
  '32': '128px',
} as const

// ─── 5. Radii (editorial = minimal) ─────────────────────────────────────
export const radii = {
  none: '0',
  sm: '2px',
  md: '4px',
  lg: '8px',
  xl: '12px',
  pill: '999px',
} as const

// ─── 6. Shadows (subtle, ink-tinted) ────────────────────────────────────
export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(15, 15, 15, 0.04)',
  sm: '0 1px 3px rgba(15, 15, 15, 0.06), 0 1px 2px rgba(15, 15, 15, 0.04)',
  md: '0 4px 12px rgba(15, 15, 15, 0.08)',
  lg: '0 8px 24px rgba(15, 15, 15, 0.10)',
  // Focus ring — accessibility primitive
  focus: '0 0 0 3px rgba(15, 110, 86, 0.35)',
  focusRust: '0 0 0 3px rgba(184, 92, 42, 0.35)',
} as const

// ─── 7. Motion ──────────────────────────────────────────────────────────
export const motion = {
  duration: {
    instant: '0ms',
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
    slower: '480ms',
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

// ─── 8. Z-index scale ───────────────────────────────────────────────────
export const zIndices = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  toast: 1080,
} as const

// ─── 9. Breakpoints & container ─────────────────────────────────────────
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  // Legacy semantic aliases used by pre-Slate components.
  // Slate canonical names are sm/md/lg/xl — prefer those in new code.
  mobile: '640px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1280px',
} as const

export const media = {
  sm: `@media (min-width: ${breakpoints.sm})`,
  md: `@media (min-width: ${breakpoints.md})`,
  lg: `@media (min-width: ${breakpoints.lg})`,
  xl: `@media (min-width: ${breakpoints.xl})`,
  '2xl': `@media (min-width: ${breakpoints['2xl']})`,
  motionReduce: '@media (prefers-reduced-motion: reduce)',
} as const

export const layout = {
  containerMax: '1440px',
  gutter: space['6'],            // 24px gutter
  outerPadding: space['10'],     // 40px page padding on lg+
  outerPaddingMobile: space['4'],
  brandRuleHeight: '2px',        // the canonical 2px Sage top rule
} as const

// ─── 10. Brand‑rule helper (the 2px Sage line that anchors every page) ──
export const brandRule = {
  sage: `${layout.brandRuleHeight} solid ${palette.sage}`,
  rust: `${layout.brandRuleHeight} solid ${palette.rust}`, // The Ask only
} as const
