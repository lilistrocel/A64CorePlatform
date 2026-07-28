/**
 * A20Core — MetricChip.
 *
 * The small ALL-CAPS mono pills used in headers, footers and tags:
 *   V0.8.1 LIVE  ·  4 FARMS  ·  5,047,318 KG TRACKED
 *
 * Use sparingly — they are page furniture, not content. One mono row
 * per slide / page, max.
 */

import styled, { css } from 'styled-components'

type Tone = 'neutral' | 'sage' | 'rust' | 'success' | 'warning' | 'danger'

interface MetricChipProps {
  $tone?: Tone
  $variant?: 'flat' | 'outline'
}

const toneStyles = ({ $tone = 'neutral', $variant = 'flat' }: MetricChipProps) => {
  const colorMap: Record<Tone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: 'transparent', fg: 'inherit', border: 'currentColor' },
    sage:    { bg: 'transparent', fg: 'sage',    border: 'sage' },
    rust:    { bg: 'transparent', fg: 'rust',    border: 'rust' },
    success: { bg: 'transparent', fg: 'success', border: 'success' },
    warning: { bg: 'transparent', fg: 'warning', border: 'warning' },
    danger:  { bg: 'transparent', fg: 'danger',  border: 'danger' },
  }
  const c = colorMap[$tone]
  return css`
    color: ${({ theme }) =>
      c.fg === 'sage'    ? theme.colors.accent.sage
      : c.fg === 'rust'  ? theme.colors.accent.rust
      : c.fg === 'success' ? theme.colors.status.success
      : c.fg === 'warning' ? theme.colors.status.warning
      : c.fg === 'danger'  ? theme.colors.status.danger
      : theme.colors.text.secondary};
    ${$variant === 'outline' &&
      css`
        border: 1px solid ${({ theme }) =>
          c.border === 'sage' ? theme.colors.accent.sage
          : c.border === 'rust' ? theme.colors.accent.rust
          : theme.colors.border.default};
        padding: 2px ${({ theme }) => theme.space['2']};
        border-radius: ${({ theme }) => theme.radii.sm};
      `}
  `
}

export const MetricChip = styled.span<MetricChipProps>`
  display: inline-flex;
  align-items: center;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.monoSm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  letter-spacing: ${({ theme }) => theme.letterSpacings.wider};
  text-transform: uppercase;
  white-space: nowrap;
  ${toneStyles}
`

MetricChip.displayName = 'MetricChip'

/**
 * The horizontal row of MetricChips separated by mono middle-dots.
 *
 *   <MetricRow>
 *     <MetricChip>V0.8.1 LIVE</MetricChip>
 *     <MetricChip>4 FARMS</MetricChip>
 *     <MetricChip $tone="sage">5,047,318 KG TRACKED</MetricChip>
 *   </MetricRow>
 */
export const MetricRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['4']};

  & > ${MetricChip} + ${MetricChip}::before {
    content: '·';
    margin-right: ${({ theme }) => theme.space['4']};
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`
