import styled from 'styled-components';

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
  gap: ${({ theme }) => theme.space['2']};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  transition: all 150ms ease-in-out;
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};

  /* Variant styles */
  ${({ theme, $variant }) => {
    if ($variant === 'primary') {
      // WCAG AA: primary.700 (#1976D2) provides 4.60:1 contrast with white text
      return `
        background: ${theme.colors.accent.sageDeep};
        color: white;

        &:hover:not(:disabled) {
          background: ${theme.colors.accent.sageDeep};
        }
      `;
    }
    if ($variant === 'secondary') {
      return `
        background: ${theme.colors.surface.raised};
        color: ${theme.colors.text.primary};

        &:hover:not(:disabled) {
          background: ${theme.colors.surface.sunken};
        }
      `;
    }
    if ($variant === 'outline') {
      // WCAG AA: primary.700 (#1976D2) provides 4.60:1 contrast with white background
      return `
        background: transparent;
        color: ${theme.colors.accent.sageDeep};
        border: 1px solid ${theme.colors.accent.sageDeep};

        &:hover:not(:disabled) {
          background: ${theme.colors.accent.sageSoft};
        }
      `;
    }
  }}

  /* Size styles */
  ${({ theme, $size }) => {
    if ($size === 'small') {
      return `
        padding: ${theme.space['2']} ${theme.space['4']};
        font-size: ${theme.fontSizes.bodySm};
      `;
    }
    if ($size === 'medium') {
      return `
        padding: ${theme.space['4']} ${theme.space['6']};
        font-size: ${theme.fontSizes.bodyMd};
      `;
    }
    if ($size === 'large') {
      return `
        padding: ${theme.space['6']} ${theme.space['8']};
        font-size: ${theme.fontSizes.bodyLg};
      `;
    }
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sageDeep};
    outline-offset: 2px;
  }
`;
