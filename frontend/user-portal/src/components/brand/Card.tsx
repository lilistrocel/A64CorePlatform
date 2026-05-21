/**
 * A20Core — Card.
 *
 * Editorial card surface. The Slate language is restrained — cards are
 * flat by default; elevate only when an interaction needs lifting.
 *
 * Variants:
 *   plain    — no border, just spacing      (use inside a section grid)
 *   bordered — 1px stone border             (default — most-used)
 *   raised   — subtle shadow                (interactive / clickable cards)
 *   accent   — 2px Sage top rule            (key dashboards / KPI cards)
 */

import styled, { css } from 'styled-components'

interface CardProps {
  $variant?: 'plain' | 'bordered' | 'raised' | 'accent'
  $padding?: 'sm' | 'md' | 'lg'
  $interactive?: boolean
}

const paddingStyles = ({ $padding = 'md' }: CardProps) => {
  if ($padding === 'sm') return css`padding: ${({ theme }) => theme.space['4']};`
  if ($padding === 'lg') return css`padding: ${({ theme }) => theme.space['8']};`
  return css`padding: ${({ theme }) => theme.space['6']};`
}

const variantStyles = ({ $variant = 'bordered' }: CardProps) => {
  if ($variant === 'plain') return css`background: ${({ theme }) => theme.colors.surface.raised};`
  if ($variant === 'raised')
    return css`
      background: ${({ theme }) => theme.colors.surface.raised};
      box-shadow: ${({ theme }) => theme.shadows.sm};
    `
  if ($variant === 'accent')
    return css`
      background: ${({ theme }) => theme.colors.surface.raised};
      border: 1px solid ${({ theme }) => theme.colors.border.default};
      border-top: ${({ theme }) => theme.brandRule.sage};
    `
  // bordered (default)
  return css`
    background: ${({ theme }) => theme.colors.surface.raised};
    border: 1px solid ${({ theme }) => theme.colors.border.default};
  `
}

export const Card = styled.div<CardProps>`
  border-radius: ${({ theme }) => theme.radii.md};
  ${paddingStyles}
  ${variantStyles}

  ${({ $interactive }) =>
    $interactive &&
    css`
      cursor: pointer;
      transition: box-shadow ${({ theme }) => theme.motion.duration.base}
                  ${({ theme }) => theme.motion.easing.standard};
      &:hover { box-shadow: ${({ theme }) => theme.shadows.md}; }
    `}
`

Card.displayName = 'Card'
