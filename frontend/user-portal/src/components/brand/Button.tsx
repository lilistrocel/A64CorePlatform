/**
 * A20Core — Button.
 *
 * Canonical reference component. Demonstrates:
 *   - $-prefixed transient props (styled-components v6 convention)
 *   - Variant + size pattern
 *   - Sage primary / Slate ghost / Rust on-the-ask
 *   - Focus visible + reduced-motion friendly
 *
 * Variants:
 *   primary  — sage fill, light text         (default CTA)
 *   ghost    — transparent, slate text, hover lifts to Linen-soft
 *   subtle   — stone fill, ink text          (secondary actions)
 *   ask      — rust fill                     (RESERVED for The Ask / pricing)
 *   danger   — danger fill                   (destructive only)
 *
 * Sizes:
 *   sm   — 32px tall, 12px text
 *   md   — 40px tall, 14px text  (default)
 *   lg   — 48px tall, 16px text
 */

import styled, { css } from 'styled-components'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'subtle' | 'ask' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  $variant?: Variant
  $size?: Size
  $fullWidth?: boolean
}

const sizeStyles = ({ $size = 'md' }: ButtonProps) => {
  switch ($size) {
    case 'sm':
      return css`
        height: 32px;
        padding: 0 ${({ theme }) => theme.space['3']};
        font-size: ${({ theme }) => theme.fontSizes.bodySm};
      `
    case 'lg':
      return css`
        height: 48px;
        padding: 0 ${({ theme }) => theme.space['6']};
        font-size: ${({ theme }) => theme.fontSizes.bodyLg};
      `
    case 'md':
    default:
      return css`
        height: 40px;
        padding: 0 ${({ theme }) => theme.space['5']};
        font-size: ${({ theme }) => theme.fontSizes.bodyMd};
      `
  }
}

const variantStyles = ({ $variant = 'primary' }: ButtonProps) => {
  switch ($variant) {
    case 'primary':
      return css`
        background: ${({ theme }) => theme.colors.accent.sage};
        color: ${({ theme }) => theme.colors.text.onAccent};
        &:hover:not(:disabled)  { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
        &:active:not(:disabled) { background: ${({ theme }) => theme.colors.accent.sageDeep}; transform: translateY(1px); }
      `
    case 'ghost':
      return css`
        background: transparent;
        color: ${({ theme }) => theme.colors.text.primary};
        border: 1px solid ${({ theme }) => theme.colors.border.default};
        &:hover:not(:disabled)  { background: ${({ theme }) => theme.colors.surface.raised}; }
        &:active:not(:disabled) { background: ${({ theme }) => theme.colors.surface.sunken}; }
      `
    case 'subtle':
      return css`
        background: ${({ theme }) => theme.colors.surface.sunken};
        color: ${({ theme }) => theme.colors.text.primary};
        &:hover:not(:disabled)  { background: ${({ theme }) => theme.palette.stoneDeep}; }
      `
    case 'ask':
      return css`
        background: ${({ theme }) => theme.colors.accent.rust};
        color: ${({ theme }) => theme.colors.text.onAccent};
        &:hover:not(:disabled)  { background: ${({ theme }) => theme.colors.accent.rustDeep}; }
        &:focus-visible         { box-shadow: ${({ theme }) => theme.shadows.focusRust}; }
      `
    case 'danger':
      return css`
        background: ${({ theme }) => theme.colors.status.danger};
        color: ${({ theme }) => theme.colors.text.onAccent};
        &:hover:not(:disabled)  { filter: brightness(0.92); }
      `
  }
}

export const Button = styled.button<ButtonProps>`
  /* Layout */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space['2']};
  ${({ $fullWidth }) => $fullWidth && css`width: 100%;`}

  /* Type */
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  letter-spacing: 0;
  white-space: nowrap;

  /* Shape */
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  cursor: pointer;

  /* Motion */
  transition: background-color ${({ theme }) => theme.motion.duration.base}
              ${({ theme }) => theme.motion.easing.standard},
              transform     ${({ theme }) => theme.motion.duration.fast}
              ${({ theme }) => theme.motion.easing.standard};

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${sizeStyles}
  ${variantStyles}
`

Button.displayName = 'Button'
