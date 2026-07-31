import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    width: 100%;
    height: 100%;
    /* Reason: do NOT set overflow-x:hidden here. Per CSS spec, setting one
       axis to a non-visible value promotes the other to 'auto', which makes
       this element a scroll container and breaks position:sticky on
       descendants (e.g. the layout sidebar). Clip horizontal overflow at
       the actual layout boundary instead (see LayoutContainer). */
  }

  body {
    font-family: ${({ theme }) => theme.typography.fontFamily.primary};
    font-size: ${({ theme }) => theme.typography.fontSize.base};
    font-weight: ${({ theme }) => theme.typography.fontWeight.regular};
    line-height: ${({ theme }) => theme.typography.lineHeight.normal};
    color: ${({ theme }) => theme.colors.textPrimary};
    /* colors.canvas (not colors.background) — cosmos-deep, the page floor
       UNDER the Sky layer (spec §7). colors.background is the opaque raised
       surface reserved for panels/menus/tooltips sitting above the canvas;
       most in-page surfaces are the translucent colors.surface (glass)
       instead, letting the Sky show through. */
    background-color: ${({ theme }) => theme.colors.canvas};
    width: 100%;
    min-height: 100vh;
  }

  /* Metadata / data — Space Mono, per brand contract §4. */
  code, pre, kbd, samp, time {
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  }

  #root {
    width: 100%;
    min-height: 100vh;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
    line-height: ${({ theme }) => theme.typography.lineHeight.tight};
  }

  h1 { font-size: ${({ theme }) => theme.typography.fontSize['4xl']}; }
  h2 { font-size: ${({ theme }) => theme.typography.fontSize['3xl']}; }
  h3 { font-size: ${({ theme }) => theme.typography.fontSize['2xl']}; }
  h4 { font-size: ${({ theme }) => theme.typography.fontSize.xl}; }
  h5 { font-size: ${({ theme }) => theme.typography.fontSize.lg}; }
  h6 { font-size: ${({ theme }) => theme.typography.fontSize.base}; }

  /* Global focus-visible styles — Night Observatory spec §9: "gold focus
     ring on every interactive element; no default blue focus." Ring colour
     is secondary[500] (gold-hi) with a soft glow halo, matching the
     mockup's input-focus treatment (border-color: gold-hi; box-shadow:
     0 0 0 3px rgba(220,185,79,.15)) generalised to :focus-visible on any
     element. */
  a:focus-visible,
  button:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  input:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    border-radius: 2px;
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  /* Link colour stays primary (lapis) — gold is reserved (spec §3: logo,
     active nav, stat numerals, thread, primary CTA, focus rings, section
     underline, Harvesting phase). "Gold is not a link colour." */
  a {
    color: ${({ theme }) => theme.colors.primary[500]};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  button {
    font-family: inherit;
    line-height: inherit;
    cursor: pointer;
    -webkit-font-smoothing: inherit;
    -moz-osx-font-smoothing: inherit;
  }

  input, textarea, select {
    font-family: inherit;
  }

  /* Thin scrollbars, cosmosHi thumb (spec §9) */
  * {
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.colors.cosmosHi} transparent;
  }

  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  *::-webkit-scrollbar-thumb {
    background-color: ${({ theme }) => theme.colors.cosmosHi};
    border-radius: 99px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  /* Honour prefers-reduced-motion globally (spec §9 / §2). Mixins in
     mixins.ts already guard their own lift/glow transitions; this is the
     app-wide floor for anything that composes CSS transitions/animations
     without going through a mixin. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
