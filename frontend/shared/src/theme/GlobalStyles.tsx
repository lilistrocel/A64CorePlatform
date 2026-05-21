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
    overflow-x: hidden;
  }

  body {
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: ${({ theme }) => theme.fontSizes.bodyMd};
    font-weight: ${({ theme }) => theme.fontWeights.regular};
    line-height: ${({ theme }) => theme.lineHeights.base};
    color: ${({ theme }) => theme.colors.text.primary};
    background-color: ${({ theme }) => theme.colors.surface.canvas};
    width: 100%;
    min-height: 100vh;
    overflow-x: hidden;
  }

  #root {
    width: 100%;
    min-height: 100vh;
    overflow-x: hidden;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    line-height: ${({ theme }) => theme.lineHeights.snug};
  }

  h1 { font-size: ${({ theme }) => theme.fontSizes.displaySm}; }
  h2 { font-size: ${({ theme }) => theme.fontSizes.h1}; }
  h3 { font-size: ${({ theme }) => theme.fontSizes.h2}; }
  h4 { font-size: ${({ theme }) => theme.fontSizes.h4}; }
  h5 { font-size: ${({ theme }) => theme.fontSizes.bodyLg}; }
  h6 { font-size: ${({ theme }) => theme.fontSizes.bodyMd}; }

  /* Global focus-visible styles for accessibility */
  a:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
    border-radius: 2px;
  }

  a {
    color: ${({ theme }) => theme.colors.accent.sage};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  button {
    font-family: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }

  select:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 1px;
  }

  textarea:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 1px;
  }

  input, textarea, select {
    font-family: inherit;
  }
`;
