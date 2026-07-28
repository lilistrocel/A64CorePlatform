/**
 * A20Core — Global styles.
 *
 * Mount once at the app root, INSIDE the ThemeProvider:
 *
 *   <ThemeProvider theme={theme}>
 *     <GlobalStyles />
 *     <App />
 *   </ThemeProvider>
 *
 * Includes:
 *   - Modern CSS reset (Josh Comeau / Andy Bell hybrid)
 *   - Web font loading (Playfair Display, Inter, IBM Plex Mono via Google Fonts)
 *   - Base typography rules
 *   - color-scheme + selection styles
 */

import { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
  /* ── Web fonts ─────────────────────────────────────────────────────── */
  /* For best CLS/perf, also add this <link> to index.html:
     <link rel="preconnect" href="https://fonts.googleapis.com">
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
     <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  */

  /* ── Reset ─────────────────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }
  * { margin: 0; }
  html, body, #root { height: 100%; }

  html {
    color-scheme: light;           /* Slate is light-first */
    -webkit-text-size-adjust: 100%;
    -moz-tab-size: 4;
    tab-size: 4;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: ${({ theme }) => theme.fontSizes.bodyMd};
    font-weight: ${({ theme }) => theme.fontWeights.regular};
    line-height: ${({ theme }) => theme.lineHeights.base};
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.surface.canvas};
    min-height: 100%;
  }

  /* ── Base typography ───────────────────────────────────────────────── */
  /* Display heads use Playfair. Body heads can also be Playfair, but Inter is
     acceptable for in-app headings where editorial weight is overkill. */
  h1, h2, h3, h4, h5, h6 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    line-height: ${({ theme }) => theme.lineHeights.snug};
    letter-spacing: ${({ theme }) => theme.letterSpacings.tight};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  h1 { font-size: ${({ theme }) => theme.fontSizes.h1}; }
  h2 { font-size: ${({ theme }) => theme.fontSizes.h2}; }
  h3 { font-size: ${({ theme }) => theme.fontSizes.h3}; }
  h4 { font-size: ${({ theme }) => theme.fontSizes.h4}; }

  p { max-width: 72ch; }            /* readable line length, easy to override */

  a {
    color: ${({ theme }) => theme.colors.accent.sage};
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color ${({ theme }) => theme.motion.duration.base}
                ${({ theme }) => theme.motion.easing.standard};
  }
  a:hover {
    border-bottom-color: ${({ theme }) => theme.colors.accent.sage};
  }

  /* Code / mono / kbd */
  code, kbd, samp, pre {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.9em;
  }

  /* Forms inherit type — don't let browsers fall back to Times */
  input, button, textarea, select { font: inherit; color: inherit; }

  /* Buttons — strip default chrome, components add their own */
  button { background: none; border: none; padding: 0; cursor: pointer; }

  /* Images / media — responsive by default */
  img, picture, video, canvas, svg { display: block; max-width: 100%; }

  /* Selection — sage tint instead of OS blue */
  ::selection {
    background: ${({ theme }) => theme.colors.accent.sageSoft};
    color: ${({ theme }) => theme.colors.text.primary};
  }

  /* Scrollbar (webkit) — quietly themed, never decorative */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border.default};
    border-radius: ${({ theme }) => theme.radii.pill};
  }
  ::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.colors.border.strong};
  }

  /* Focus — sage ring, accessible across all elements */
  :focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadows.focus};
    border-radius: ${({ theme }) => theme.radii.md};
  }

  /* Reduced motion */
  ${({ theme }) => theme.media.motionReduce} {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`
