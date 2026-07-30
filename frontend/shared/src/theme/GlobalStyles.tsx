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
    /* colors.canvas (not colors.background) — this is what makes Fresco
       Cream / Cosmos Ink the dominant ~65% page ground per brand contract
       §3. colors.background is reserved for raised panels/cards sitting
       above the canvas. */
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

  /* Global focus-visible styles for accessibility */
  a:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
    border-radius: 2px;
  }

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

  button:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }

  select:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 1px;
  }

  textarea:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 1px;
  }

  input, textarea, select {
    font-family: inherit;
  }
`;
