// Shared design tokens (non-color values are identical across themes)
//
// A20Core — "Night Observatory" redesign (2026-07-30), Phase 1/4 (Foundation).
// Source of truth: Docs/2-Working-Progress/night-observatory-spec.md
// Visual ground truth: Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html
// Predecessor: Docs/2-Working-Progress/a20core-rebrand-spec.md (cream tokenization, T-900)
//
// Token *shape* is preserved from the pre-redesign theme so the ~7,000 existing
// `theme.colors.*` call sites across the app keep compiling. Only DARK theme
// values change (this redesign is dark-first/dark-only); LIGHT theme is now
// dead code (see below) but is kept structurally identical (same key shape)
// so `Theme = typeof lightTheme` stays honest for every consumer.
const sharedTokens = {
  typography: {
    fontFamily: {
      primary: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "'Space Mono', ui-monospace, 'Courier New', monospace",
      // Fraunces, editorial accent ONLY — italic is the only face used in the
      // Night Observatory system (empty-state headlines, section-header last
      // word). Never on body, labels, table text or controls.
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

// ─── Light theme ramps (A20Core "A New Renaissance" — now dead code) ──────
// Preserved verbatim from the pre-Night-Observatory pass. Not used at
// runtime (`export const theme = darkTheme` below) but kept so the light
// theme still type-checks and stays structurally identical to darkTheme.

const lapisPaletteLight = {
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

const goldPaletteLight = {
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

const emeraldPaletteLight = {
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

const terracottaPaletteLight = {
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

const semanticColorsLight = {
  success: emeraldPaletteLight[500],
  warning: goldPaletteLight[500],
  error: terracottaPaletteLight[500],
  info: lapisPaletteLight[500],
};

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
    primary: lapisPaletteLight,
    secondary: goldPaletteLight,
    neutral: neutralLight,

    lapis: lapisPaletteLight,
    gold: goldPaletteLight,
    emerald: emeraldPaletteLight,
    terracotta: terracottaPaletteLight,

    ...semanticColorsLight,

    canvas: '#F1E6CC',
    background: '#FAF3E2',
    surface: '#EDE0C2',

    successBg: '#E8F5EE',
    warningBg: '#FBF4E2',
    errorBg: '#FBF0EA',
    infoBg: '#EDF1FB',

    textPrimary: '#1B1A14',
    textSecondary: '#5C564A',
    textDisabled: '#8C8471',

    onAccent: '#FAF3E2',
    border: '#D4C6A6',

    // ─── Night Observatory additive keys (kept for shape parity; dead code
    // in the light theme since dark is the only active mode). Values are
    // cream-appropriate approximations, not tuned/verified visually — if a
    // future light mode ships, these need a real design pass. ──────────────
    celeste: '#4A6C8C',      // cool slate-blue, readable on cream
    muted: '#8C8471',        // == neutral[500]
    line: 'rgba(59, 44, 24, 0.14)', // ink-based hairline
    onDark: '#FAF3E2',       // == onAccent — cream on saturated fills

    // cosmos*/glass*/bright*/phase* are fixed Night Observatory brand hues
    // and glass-over-a-dark-sky recipes, not adaptive ground tokens — the
    // dark theme's literal values are kept here unchanged where the token is
    // hue-fixed (cosmos*, phase 'harvesting' gold etc.), and toned down for
    // legibility-on-cream where the token was explicitly "brightened for
    // dark ground" (bright.*, phase.*, glass.*).
    cosmos: '#0E1330',
    cosmosDeep: '#0A0E24',
    cosmosHi: '#171D40',

    glass: {
      base: 'rgba(241, 230, 204, 0.55)',
      hi: 'rgba(250, 243, 226, 0.65)',
      border: 'rgba(59, 44, 24, 0.14)',
      shine: 'rgba(27, 26, 20, 0.05)',
      opaque: 'rgba(250, 243, 226, 0.92)',
    },

    bright: {
      lapis: '#3A5BC0',
      emerald: '#1B8A5A',
      gold: '#A6822A',
      terra: '#A44A24',
      laurel: '#8A9268',
      lavender: '#8F6B9C',
      verdi: '#2E8880',
      coral: '#C15A2C',
      rose: '#B98F72',
    },

    phase: {
      empty: '#6E6858',
      preparing: '#4A6C8C',
      inoculated: '#3A5BC0',
      colonizing: '#8A9268',
      fruitingInit: '#A44A24',
      fruiting: '#1B8A5A',
      harvesting: '#A6822A',
      resting: '#8F6B9C',
      cleaning: '#2E8880',
      maintenance: '#B98F72',
      quarantined: '#C15A2C',
      decommissioned: '#8C8471',
    },
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(59, 44, 24, 0.08)',
    md: '0 4px 6px -1px rgba(59, 44, 24, 0.14)',
    lg: '0 10px 15px -3px rgba(59, 44, 24, 0.16)',
    xl: '0 20px 25px -5px rgba(59, 44, 24, 0.18)',
  },
};

// ─── Dark theme ramps ("Night Observatory" — the active theme) ────────────
// Spec §1.1: primary re-centred on lapis-b #6B8AE0 at 500; secondary
// re-centred on gold-hi #DCB94F at 500. These are NEW ramps (not shared with
// the light theme's lapis/gold palettes) because the 500-step anchor moves.

const lapisPaletteDark = {
  50: '#EEF2FC',
  100: '#DCE4F8',
  200: '#B9CAF0',
  300: '#96AFE8',
  400: '#7E9CE4',
  500: '#6B8AE0', // lapis-b
  600: '#5470C4',
  700: '#3F58A0',
  800: '#2C3F78',
  900: '#1C2952',
};

const goldPaletteDark = {
  50: '#FBF3DE',
  100: '#F6E7C0',
  200: '#EEDA9C',
  300: '#E5CD7C',
  400: '#E0C363',
  500: '#DCB94F', // gold-hi
  600: '#B89A3E',
  700: '#8F7830',
  800: '#6B5A24',
  900: '#453B18',
};

// Standalone categorical ramp — anchored on emerald-b (== `success`).
const emeraldPaletteDark = {
  50: '#E3FBF0',
  100: '#C4F5DE',
  200: '#98E9C0',
  300: '#6EDDA8',
  400: '#5CD79E',
  500: '#54D39B', // emerald-b
  600: '#3EAE7D',
  700: '#2D8861',
  800: '#1F6448',
  900: '#14432F',
};

// Standalone categorical ramp — key name kept for shape parity, but Night
// Observatory has no true red; this ramp is anchored on coral-b (== `error`),
// the "only red" per spec §5.1 (quarantined).
const terracottaPaletteDark = {
  50: '#FDECE7',
  100: '#FBD8CE',
  200: '#F7B6A0',
  300: '#F49E85',
  400: '#F19278',
  500: '#F08A70', // coral-b
  600: '#CC6E55',
  700: '#A2543F',
  800: '#793D2E',
  900: '#52281F',
};

// Semantic colors — spec §1.1. NOTE: unlike the old theme, warning is NOT
// goldPaletteDark[500] — gold-hi (#DCB94F, UI chrome gold) and gold-b
// (#E8C86A, the warning/harvesting status gold) are two distinct named
// hues in the brief. info === primary[500] (both lapis-b), same convention
// as before.
const semanticColorsDark = {
  success: '#54D39B', // emerald-b
  warning: '#E8C86A', // gold-b
  error: '#F08A70',   // coral-b
  info: '#6B8AE0',    // lapis-b == lapisPaletteDark[500]
};

// Spec §1.1 — cosmos→cream scale, given verbatim.
const neutralDark = {
  50: '#0A0E24',
  100: '#0E1330',
  200: '#171D40',
  300: '#252D58',
  400: '#3A4066',
  500: '#5A5F7D',
  600: '#7E86A6',
  700: '#8B90AC',
  800: '#B4C8DC',
  900: '#FAF3E2',
};

export const darkTheme = {
  ...sharedTokens,
  colors: {
    primary: lapisPaletteDark,
    secondary: goldPaletteDark,
    neutral: neutralDark,

    lapis: lapisPaletteDark,
    gold: goldPaletteDark,
    emerald: emeraldPaletteDark,
    terracotta: terracottaPaletteDark,

    ...semanticColorsDark,

    // Ground tokens — spec §1.1
    canvas: '#0A0E24',     // cosmos-deep — page floor, under the sky layer
    background: '#171D40', // cosmos-hi — OPAQUE raised surface (menus, tooltips, dropdowns, popovers)
    surface: 'rgba(23, 29, 64, 0.42)', // glass — translucent panel ground

    // Semantic status background tints — phase colour at 16% over
    // transparent (spec §1.1 / §4 badge pattern).
    successBg: 'rgba(84, 211, 155, 0.16)',  // emerald-b 16%
    warningBg: 'rgba(232, 200, 106, 0.16)', // gold-b 16%
    errorBg: 'rgba(240, 138, 112, 0.16)',   // coral-b 16%
    infoBg: 'rgba(107, 138, 224, 0.16)',    // lapis-b 16%

    // Text
    textPrimary: '#FAF3E2',   // cream-hi
    textSecondary: '#B4C8DC', // celeste
    textDisabled: '#8B90AC',  // muted

    // BREAKING SEMANTIC CHANGE (spec §1.1): onAccent now means "text on a
    // GOLD fill" and is therefore dark (cosmos), not cream. The primary
    // button is a gold gradient and needs dark text. Any existing call site
    // using onAccent on a lapis/coral/emerald fill needs `onDark` instead —
    // this is NOT fixed here; see the Phase 1 report for the call-site count.
    onAccent: '#0E1330', // cosmos
    border: 'rgba(180, 200, 220, 0.14)', // line

    // ─── Night Observatory additive keys (spec §1.2) ───────────────────
    celeste: '#B4C8DC',
    muted: '#8B90AC',
    line: 'rgba(180, 200, 220, 0.14)',
    onDark: '#FAF3E2', // text on lapis/coral/emerald fills

    cosmos: '#0E1330',
    cosmosDeep: '#0A0E24',
    cosmosHi: '#171D40',

    glass: {
      base: 'rgba(23, 29, 64, 0.42)',
      hi: 'rgba(37, 45, 88, 0.5)',
      border: 'rgba(180, 200, 220, 0.18)',
      shine: 'rgba(250, 243, 226, 0.07)',
      opaque: 'rgba(23, 29, 64, 0.85)', // backdrop-filter fallback
    },

    bright: {
      lapis: '#6B8AE0',
      emerald: '#54D39B',
      gold: '#E8C86A',
      terra: '#E8935F',
      laurel: '#C9CBA4',
      lavender: '#C3A0CF',
      verdi: '#57C4BC',
      coral: '#F08A70',
      rose: '#EDD1BE',
    },

    // Spec §5.1 — room-phase colour map, the single semantic vocabulary
    // (same status = same colour in every context: badge, card edge, filter
    // pill, chart legend, progress segment). §5.2 extrapolates these onto
    // ~8 other status vocabularies app-wide — see the spec, not per-module
    // variants.
    phase: {
      empty: '#7E86A6',          // quiet slate-blue
      preparing: '#B4C8DC',      // celeste — dawn sky
      inoculated: '#6B8AE0',     // lapis-b
      colonizing: '#C9CBA4',     // laurel-b
      fruitingInit: '#E8935F',   // terra-b
      fruiting: '#54D39B',       // emerald-b
      harvesting: '#E8C86A',     // gold-b — the ONE gold status; reserved for the literal harvest phase
      resting: '#C3A0CF',        // lavender-b
      cleaning: '#57C4BC',       // verdi-b
      maintenance: '#EDD1BE',    // rose-b
      quarantined: '#F08A70',    // coral-b — the only red; may pulse subtly
      decommissioned: '#5A5F7D', // dim, no glow
    },
  },

  // Deep-space shadows — already dark-appropriate (rgba over near-black),
  // left unchanged; not part of the frozen token surface (spec §1).
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.45)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.55)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.65)',
  },
};

// Dark is the default and only mode for now (Night Observatory redesign
// brief). lightTheme is kept as dead code for a possible future light
// variant — see frontend/user-portal/src/stores/theme.store.ts.
export const theme = darkTheme;

export type Theme = typeof lightTheme;

// The frozen set of room/status phase keys (spec §5). Used by
// `phaseBadge()` in mixins.ts and by any consumer building a phase→colour
// lookup outside the theme object itself.
export type PhaseKey = keyof typeof darkTheme.colors.phase;
