/**
 * A20Core — styled-components theme augmentation (shared package).
 *
 * The shared package is consumed by user-portal which provides the
 * full Slate ThemeProvider at runtime. This declaration keeps TS happy
 * inside the shared package by using a structural subset of AppTheme.
 *
 * NOTE: The authoritative augmentation lives in
 * frontend/user-portal/src/styled.d.ts and
 * frontend/user-portal/src/theme/styled.d.ts
 */

import 'styled-components';

// Minimal structural interface matching the Slate AppTheme shape.
// If the shared package gains its own build step, replace this with
// a direct import of AppTheme from the published theme package.
declare module 'styled-components' {
  export interface DefaultTheme {
    mode: 'light' | 'dark';
    colors: {
      surface: { canvas: string; raised: string; sunken: string; overlay: string };
      text: { primary: string; secondary: string; tertiary: string; inverse: string; onAccent: string };
      border: { default: string; subtle: string; strong: string; accent: string };
      accent: { sage: string; sageDeep: string; sageSoft: string; rust: string; rustDeep: string };
      status: { success: string; warning: string; danger: string; info: string };
    };
    fonts: { display: string; body: string; mono: string };
    fontSizes: {
      hero: string; displayLg: string; displayMd: string; displaySm: string;
      h1: string; h2: string; h3: string; h4: string;
      bodyLg: string; bodyMd: string; bodySm: string; caption: string;
      monoLg: string; monoMd: string; monoSm: string;
    };
    fontWeights: { regular: number; medium: number; semibold: number; bold: number; black: number };
    lineHeights: { tight: number; snug: number; base: number; loose: number };
    letterSpacings: { tight: string; base: string; wide: string; wider: string };
    space: { [key: string]: string };
    radii: { none: string; sm: string; md: string; lg: string; xl: string; pill: string };
    shadows: { none: string; xs: string; sm: string; md: string; lg: string; focus: string; focusRust: string };
    motion: {
      duration: { instant: string; fast: string; base: string; slow: string; slower: string };
      easing: { standard: string; enter: string; exit: string };
    };
    zIndices: { base: number; dropdown: number; sticky: number; fixed: number; modalBackdrop: number; modal: number; popover: number; tooltip: number; toast: number };
    breakpoints: { sm: string; md: string; lg: string; xl: string; '2xl': string };
    media: { sm: string; md: string; lg: string; xl: string; '2xl': string; motionReduce: string };
    layout: { containerMax: string; gutter: string; outerPadding: string; outerPaddingMobile: string; brandRuleHeight: string };
    brandRule: { sage: string; rust: string };
    palette: Record<string, string>;
  }
}
