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
  gap: ${({ theme }) => theme.spacing.sm};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  transition: all 150ms ease-in-out;
  cursor: pointer;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};

  /* Variant styles */
  ${({ theme, $variant }) => {
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.primary[500]};
        color: white;

        &:hover:not(:disabled) {
          background: ${theme.colors.primary[700]};
        }
      `;
    }
    if ($variant === 'secondary') {
      return `
        background: ${theme.colors.neutral[100]};
        color: ${theme.colors.textPrimary};

        &:hover:not(:disabled) {
          background: ${theme.colors.neutral[200]};
        }
      `;
    }
    if ($variant === 'outline') {
      return `
        background: transparent;
        color: ${theme.colors.primary[500]};
        border: 1px solid ${theme.colors.primary[500]};

        &:hover:not(:disabled) {
          background: ${theme.colors.primary[50]};
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
        padding: ${theme.spacing.md} ${theme.spacing.lg};
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
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;
