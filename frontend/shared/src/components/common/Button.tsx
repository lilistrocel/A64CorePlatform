import styled from 'styled-components';

// Night Observatory (T-901 Phase 2, spec §4 "Buttons"). Prop API is FROZEN —
// 250+ files across the app consume this component. The spec's four-way
// primary/secondary/ghost/destructive vocabulary maps onto the three
// existing variant values: 'outline' takes the "ghost" treatment (transparent,
// celeste text/border) since that is the closest existing semantic match, and
// no 'destructive' variant exists here to reskin (0 call sites use it) — a
// future call site needing a coral-tinted destructive button composes it
// locally rather than widening this shared prop union.
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

// Internal interface for styled-components with transient props
interface StyledButtonProps {
  $variant: 'primary' | 'secondary' | 'outline';
  $size: 'small' | 'medium' | 'large';
  $fullWidth: boolean;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <StyledButton $variant={variant} $size={size} $fullWidth={fullWidth} {...props}>
      {children}
    </StyledButton>
  );
}

const StyledButton = styled.button<StyledButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  border: 1px solid transparent;
  border-radius: 11px;
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: 700;
  transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, color 150ms ease;
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};

  /* Variant styles — spec §4 "Buttons" */
  ${({ theme, $variant }) => {
    if ($variant === 'primary') {
      // The ONE primary-CTA gold budget item wherever this variant is used
      // (spec §3) — gold gradient fill, cosmos (onAccent) text.
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
        color: ${theme.colors.onAccent};
        box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
        }
      `;
    }
    if ($variant === 'secondary') {
      // Inlined glassControl recipe (mixins.ts) — the mixin composes inside a
      // styled-components `css` tag, not a plain string branch like this one.
      return `
        background: ${theme.colors.glass.base};
        border-color: ${theme.colors.glass.border};
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: ${theme.colors.textPrimary};

        &:hover:not(:disabled) {
          background: ${theme.colors.glass.hi};
          transform: translateY(-1px);
        }
      `;
    }
    if ($variant === 'outline') {
      // "Ghost" treatment (spec §4): transparent, celeste text/border.
      return `
        background: transparent;
        color: ${theme.colors.celeste};
        border-color: ${theme.colors.glass.border};

        &:hover:not(:disabled) {
          background: rgba(180, 200, 220, 0.07);
          color: ${theme.colors.textPrimary};
        }
      `;
    }
  }}

  /* Size styles */
  ${({ theme, $size }) => {
    if ($size === 'small') {
      return `
        padding: ${theme.spacing.sm} ${theme.spacing.md};
        font-size: ${theme.typography.fontSize.sm};
      `;
    }
    if ($size === 'medium') {
      return `
        padding: 0.75rem 1.25rem;
        font-size: ${theme.typography.fontSize.base};
      `;
    }
    if ($size === 'large') {
      return `
        padding: ${theme.spacing.lg} ${theme.spacing.xl};
        font-size: ${theme.typography.fontSize.lg};
      `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover:not(:disabled) {
      transform: none;
    }
  }
`;
