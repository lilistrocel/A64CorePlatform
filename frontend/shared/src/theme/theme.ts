// Shared design tokens (non-color values are identical across themes)
//
// A20Core — "A New Renaissance" rebrand (2026-07-30).
// Source of truth: Docs/2-Working-Progress/a20core-rebrand-spec.md
// Brand contract: Brand_Engineering/Brand/A20Core_BRAND.md
//
// Token *shape* is preserved from the pre-rebrand theme so the ~7,000 existing
// `theme.colors.*` call sites across the app keep compiling. Only values
// change, plus the additive NEW tokens called out in the spec §2.
const sharedTokens = {
  typography: {
    fontFamily: {
      primary: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "'Space Mono', ui-monospace, 'Courier New', monospace",
      // NEW — Fraunces, editorial accent ONLY (login/auth tagline). Never on
      // body, labels, table text or controls — see brand contract §4.
      display: "'Fraunces', Georgia, serif",
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
    },
    fontWeight: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
  },

  borderRadius: {
    none: '0',
    sm: '0.25rem',   // 4px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
    full: '9999px',
  },

  breakpoints: {
    mobile: '320px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1440px',
  },

  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1050,
    modal: 1100,
    popover: 1200,
    tooltip: 1300,
    notification: 1400,
  },
};

// ─── Categorical ramps (spec §2) ───────────────────────────────────────────
// Same values in both themes — these are the brand's chromatic voices, not
// ground tokens, so they do not invert for dark mode.

// Lapis — primary / info. "Wisdom/cosmic" per brand contract §3.
const lapisPalette = {
  50: '#EDF1FB',
  100: '#D6DFF5',
  200: '#AEC0EB',
  300: '#7E9BDC',
  400: '#4E72C4',
  500: '#20419A',
  600: '#1B3785',
  700: '#162C6B',
  800: '#112252',
  900: '#0C1839',
};

// Renaissance Gold — secondary / warning. Rare and meaningful (brand §1.4) —
// reserve for the active nav item, one primary CTA per view, genuine
// highlight badges. Ordinary interactive colour is `primary` (lapis).
const goldPalette = {
  50: '#FBF4E2',
  100: '#F5E7BF',
  200: '#EBD494',
  300: '#DCB94F', // gold-hi
  400: '#CFA83F',
  500: '#C29A33',
  600: '#A6822A',
  700: '#856820',
  800: '#634D18',
  900: '#42330F',
};

// Emerald — success. "Life/growth" per brand contract §3.
const emeraldPalette = {
  50: '#E8F5EE',
  100: '#C7E7D6',
  200: '#92CFAF',
  300: '#5AB486',
  400: '#2F9C68',
  500: '#1B8A5A',
  600: '#16744B',
  700: '#125C3C',
  800: '#0D452D',
  900: '#092E1E',
};

// Terracotta — error. "Earth/humanity" per brand contract §3. Warm
// red-orange, not fire-engine red — destructive UI should reach for
// [600]/[700], not [500], so "Delete" still carries weight.
const terracottaPalette = {
  50: '#FBF0EA',
  100: '#F5DACB',
  200: '#E9B296',
  300: '#D98A63',
  400: '#CD6D3E',
  500: '#C15A2C',
  600: '#A44A24',
  700: '#833A1C',
  800: '#622C15',
  900: '#411D0E',
};

// Semantic colors — same in both themes.
// success→emerald, error→terracotta, warning→gold, info→lapis (spec §1).
// primary and info are both Lapis, deliberately (mirrors the old blue theme,
// which had primary and info both Material blue).
const semanticColors = {
  success: emeraldPalette[500],
  warning: goldPalette[500],
  error: terracottaPalette[500],
  info: lapisPalette[500],
};

// ─── Light Theme (Fresco Cream) ─────────────────────────────────────────────

const neutralLight = {
  50: '#FAF3E2',
  100: '#F1E6CC',
  200: '#E6D9BC',
  300: '#D4C6A6',
  400: '#B3A98F',
  500: '#8C8471',
  600: '#6E6858',
  700: '#5C564A', // slate
  800: '#3A362C',
  900: '#1B1A14', // ink
};

export const lightTheme = {
  ...sharedTokens,
  colors: {
    primary: lapisPalette,
    secondary: goldPalette,
    neutral: neutralLight,

    // NEW — standalone categorical ramps for non-semantic use (badges,
    // charts, category dots) that don't map to a success/warning/error/info
    // state. Values identical to the semantic ramps above.
    lapis: lapisPalette,
    gold: goldPalette,
    emerald: emeraldPalette,
    terracotta: terracottaPalette,

    ...semanticColors,

    // Ground tokens (spec §2 table)
    canvas: '#F1E6CC',     // NEW — page ground, Fresco Cream. Dominant ~65% surface.
    background: '#FAF3E2', // raised panel/card ground — Cream Hi
    surface: '#EDE0C2',    // recessed ground

    // Semantic status background tints
    successBg: '#E8F5EE',
    warningBg: '#FBF4E2',
    errorBg: '#FBF0EA',
    infoBg: '#EDF1FB',

    // Text
    textPrimary: '#1B1A14',   // Ink
    textSecondary: '#5C564A', // Slate
    textDisabled: '#8C8471',

    // NEW
    onAccent: '#FAF3E2', // text/icon on primary/secondary/error fills — never pure white
    border: '#D4C6A6',   // hairline — neutral[300]
  },

  // Warm (brown-tinted, not pure black) shadows — keys unchanged.
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(59, 44, 24, 0.08)',
    md: '0 4px 6px -1px rgba(59, 44, 24, 0.14)',
    lg: '0 10px 15px -3px rgba(59, 44, 24, 0.16)',
    xl: '0 20px 25px -5px rgba(59, 44, 24, 0.18)',
  },
};

// ─── Dark Theme (Cosmos Ink) ────────────────────────────────────────────────

const neutralDark = {
  50: '#0E1330',
  100: '#161C42',
  200: '#1E2650',
  300: '#2A3363',
  400: '#3D4776',
  500: '#7C7A86',
  600: '#9A9689',
  700: '#BDB49C',
  800: '#DCD2B8',
  900: '#F1E6CC',
};

export const darkTheme = {
  ...sharedTokens,
  colors: {
    primary: lapisPalette,
    secondary: goldPalette,
    neutral: neutralDark,

    // NEW — standalone categorical ramps (identical values to light theme;
    // these are brand chromatic voices, not grounds, so they don't invert).
    lapis: lapisPalette,
    gold: goldPalette,
    emerald: emeraldPalette,
    terracotta: terracottaPalette,

    ...semanticColors,

    // Ground tokens (spec §2 table)
    canvas: '#0E1330',     // NEW — page ground, Cosmos Ink
    background: '#161C42', // raised panel/card ground
    surface: '#1E2650',    // recessed ground

    // Semantic status background tints
    successBg: '#0D452D',
    warningBg: '#634D18',
    errorBg: '#622C15',
    infoBg: '#112252',

    // Text
    textPrimary: '#F1E6CC',   // Cream
    textSecondary: '#A8A08C', // warm muted
    textDisabled: '#6E6A5C',

    // NEW
    onAccent: '#FAF3E2', // text/icon on primary/secondary/error fills — never pure white
    border: '#2A3363',   // hairline
  },

  // Warm (brown-tinted, not pure black) shadows — keys unchanged.
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.45)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.55)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.65)',
  },
};

// Default export (light theme) preserved for backward compatibility
export const theme = lightTheme;

export type Theme = typeof lightTheme;
