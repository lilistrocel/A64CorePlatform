/**
 * A20Core — BrandRule.
 *
 * The 2px Sage horizontal line that anchors the top of every page section
 * in the Slate identity. Reserve the Rust variant for ONLY one element per
 * deliverable (the call-to-action / pricing / The Ask).
 *
 * Use as a sibling above your <Header> or as a top border on full-width
 * page containers.
 */

import styled, { css } from 'styled-components'

interface BrandRuleProps {
  $tone?: 'sage' | 'rust'
  $width?: 'full' | 'contained'
}

export const BrandRule = styled.div<BrandRuleProps>`
  height: ${({ theme }) => theme.layout.brandRuleHeight};
  background: ${({ theme, $tone = 'sage' }) =>
    $tone === 'rust' ? theme.colors.accent.rust : theme.colors.accent.sage};

  ${({ $width = 'full' }) =>
    $width === 'contained' &&
    css`
      max-width: ${({ theme }) => theme.layout.containerMax};
      margin-left: auto;
      margin-right: auto;
    `}
`

BrandRule.displayName = 'BrandRule'
