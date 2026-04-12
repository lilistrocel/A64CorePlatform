// Shared design tokens (non-color values are identical across themes)
const sharedTokens = {
  typography: {
    fontFamily: {
      primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      mono: "'JetBrains Mono', 'Courier New', monospace",
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

// Primary palette (Blue) — same in both themes
const primaryPalette = {
  50: '#e3f2fd',
  100: '#bbdefb',
  200: '#90caf9',
  300: '#64b5f6',
  400: '#42a5f5',
  500: '#2196f3',  // Main brand color
  600: '#1e88e5',
  700: '#1976d2',
  800: '#1565c0',
  900: '#0d47a1',
};

// Secondary palette (Purple) — same in both themes
const secondaryPalette = {
  50: '#f3e5f5',
  100: '#e1bee7',
  500: '#9c27b0',
  700: '#7b1fa2',
  900: '#4a148c',
};

// Semantic colors — same in both themes
const semanticColors = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// ─── Light Theme ─────────────────────────────────────────────────────────────

export const lightTheme = {
  ...sharedTokens,
  colors: {
    primary: primaryPalette,
    secondary: secondaryPalette,

    // Neutral palette — light grays
    neutral: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#eeeeee',
      300: '#e0e0e0',
      400: '#bdbdbd',
      500: '#9e9e9e',
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121',
    },

    ...semanticColors,

    // Background & surface
    background: '#ffffff',
    surface: '#f5f5f5',

    // Text
    textPrimary: '#212121',
    textSecondary: '#616161',
    textDisabled: '#9e9e9e',
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
};

// ─── Dark Theme ──────────────────────────────────────────────────────────────

export const darkTheme = {
  ...sharedTokens,
  colors: {
    primary: primaryPalette,
    secondary: secondaryPalette,

    // Neutral palette — dark grays (inverted scale for dark mode)
    neutral: {
      50: '#1a1a1a',   // Darkest surface (was lightest)
      100: '#242424',
      200: '#2e2e2e',
      300: '#3a3a3a',
      400: '#4a4a4a',
      500: '#6b6b6b',
      600: '#8a8a8a',
      700: '#a3a3a3',
      800: '#d4d4d4',
      900: '#f5f5f5',  // Lightest text (was darkest)
    },

    ...semanticColors,

    // Background & surface
    background: '#121212',
    surface: '#1e1e1e',

    // Text
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textDisabled: '#6b6b6b',
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
  },
};

// Default export (light theme) preserved for backward compatibility
export const theme = lightTheme;

export type Theme = typeof lightTheme;
