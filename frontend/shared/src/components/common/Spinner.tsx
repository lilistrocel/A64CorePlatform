import styled, { keyframes } from 'styled-components';

export interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export function Spinner({ size = 'medium', color }: SpinnerProps) {
  return <StyledSpinner size={size} color={color} />;
}

const spin = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const StyledSpinner = styled.div<SpinnerProps>`
  /* Gold is reserved (spec §3) — a loading spinner is not on the gold-budget
     list, so the default accent is celeste (secondary emphasis), not gold. */
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme, color }) => color || theme.colors.celeste};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 1.6s;
  }

  ${({ size }) => {
    if (size === 'small') {
      return 'width: 16px; height: 16px; border-width: 2px;';
    }
    if (size === 'medium') {
      return 'width: 32px; height: 32px; border-width: 3px;';
    }
    if (size === 'large') {
      return 'width: 48px; height: 48px; border-width: 4px;';
    }
  }}
`;
