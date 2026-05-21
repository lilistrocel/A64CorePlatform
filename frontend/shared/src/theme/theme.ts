/**
 * A20Core — Shared theme (Slate identity).
 *
 * Self-contained copy of the Slate token assembly for the shared package.
 * The canonical source lives in frontend/user-portal/src/theme/.
 *
 * Keep in sync: if tokens.ts in user-portal changes, update this file too.
 */

// ── Palette ────────────────────────────────────────────────────────────
const palette = {
  linen: '#EDEAE3',
  linenSoft: '#F4F2EC',
  stone: '#DCD8CF',
  stoneDeep: '#CFC9BD',
  ink: '#0F0F0F',
  slate: '#4B4844',
  sage: '#0F6E56',
  sageDeep: '#0B5644',
  sageSoft: 'rgba(15, 110, 86, 0.10)',
  rust: '#B85C2A',
  rustDeep: '#9A4A20',
  success: '#0F6E56',
  warning: '#B8842A',
  danger: '#9E2A2A',
  info: '#4B4844',
  paper: '#FFFFFF',
  void: '#000000',
} as const;

const colorsLight = {
  surface: { canvas: palette.linen, raised: palette.linenSoft, sunken: palette.stone, overlay: 'rgba(15, 15, 15, 0.4)' },
  text: { primary: palette.ink, secondary: palette.slate, tertiary: 'rgba(75, 72, 68, 0.6)', inverse: palette.linen, onAccent: palette.linen },
  border: { default: palette.stoneDeep, subtle: palette.stone, strong: palette.slate, accent: palette.sage },
  accent: { sage: palette.sage, sageDeep: palette.sageDeep, sageSoft: palette.sageSoft, rust: palette.rust, rustDeep: palette.rustDeep },
  status: { success: palette.success, warning: palette.warning, danger: palette.danger, info: palette.info },
} as const;

const colorsDark = {
  surface: { canvas: '#1A1916', raised: '#252320', sunken: '#0F0E0C', overlay: 'rgba(15, 15, 15, 0.6)' },
  text: { primary: palette.linen, secondary: 'rgba(237, 234, 227, 0.72)', tertiary: 'rgba(237, 234, 227, 0.48)', inverse: palette.ink, onAccent: palette.linen },
  border: { default: 'rgba(237, 234, 227, 0.12)', subtle: 'rgba(237, 234, 227, 0.06)', strong: 'rgba(237, 234, 227, 0.24)', accent: palette.sage },
  accent: colorsLight.accent,
  status: colorsLight.status,
} as const;

// ── Token scales ───────────────────────────────────────────────────────
const fonts = { display: '"Playfair Display", "Times New Roman", Georgia, serif', body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace' } as const;
const fontSizes = { hero: '88px', displayLg: '64px', displayMd: '48px', displaySm: '36px', h1: '32px', h2: '24px', h3: '20px', h4: '18px', bodyLg: '18px', bodyMd: '16px', bodySm: '14px', caption: '13px', monoLg: '14px', monoMd: '12px', monoSm: '11px' } as const;
const fontWeights = { regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 } as const;
const lineHeights = { tight: 1.05, snug: 1.2, base: 1.55, loose: 1.7 } as const;
const letterSpacings = { tight: '-0.03em', base: '0', wide: '0.08em', wider: '0.12em' } as const;
const space = { '0': '0', px: '1px', '0.5': '2px', '1': '4px', '2': '8px', '3': '12px', '4': '16px', '5': '20px', '6': '24px', '8': '32px', '10': '40px', '12': '48px', '16': '64px', '20': '80px', '24': '96px', '32': '128px' } as const;
const radii = { none: '0', sm: '2px', md: '4px', lg: '8px', xl: '12px', pill: '999px' } as const;
const shadows = { none: 'none', xs: '0 1px 2px rgba(15, 15, 15, 0.04)', sm: '0 1px 3px rgba(15, 15, 15, 0.06), 0 1px 2px rgba(15, 15, 15, 0.04)', md: '0 4px 12px rgba(15, 15, 15, 0.08)', lg: '0 8px 24px rgba(15, 15, 15, 0.10)', focus: '0 0 0 3px rgba(15, 110, 86, 0.35)', focusRust: '0 0 0 3px rgba(184, 92, 42, 0.35)' } as const;
const motion = { duration: { instant: '0ms', fast: '120ms', base: '200ms', slow: '320ms', slower: '480ms' }, easing: { standard: 'cubic-bezier(0.4, 0, 0.2, 1)', enter: 'cubic-bezier(0, 0, 0.2, 1)', exit: 'cubic-bezier(0.4, 0, 1, 1)' } } as const;
const zIndices = { base: 0, dropdown: 1000, sticky: 1020, fixed: 1030, modalBackdrop: 1040, modal: 1050, popover: 1060, tooltip: 1070, toast: 1080 } as const;
const breakpoints = { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' } as const;
const media = { sm: '@media (min-width: 640px)', md: '@media (min-width: 768px)', lg: '@media (min-width: 1024px)', xl: '@media (min-width: 1280px)', '2xl': '@media (min-width: 1536px)', motionReduce: '@media (prefers-reduced-motion: reduce)' } as const;
const layout = { containerMax: '1440px', gutter: '24px', outerPadding: '40px', outerPaddingMobile: '16px', brandRuleHeight: '2px' } as const;
const brandRule = { sage: `2px solid ${palette.sage}`, rust: `2px solid ${palette.rust}` } as const;

// ── Theme assembly ─────────────────────────────────────────────────────
export const buildTheme = (mode: 'light' | 'dark') => ({
  mode,
  palette,
  colors: mode === 'light' ? colorsLight : colorsDark,
  fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, shadows, motion, zIndices, breakpoints, media, layout, brandRule,
});

export const theme = buildTheme('light');
export const themeDark = buildTheme('dark');

// Legacy aliases
export const lightTheme = theme;
export const darkTheme = themeDark;

export type AppTheme = ReturnType<typeof buildTheme>;
// Old name kept for backward compat
export type Theme = AppTheme;
