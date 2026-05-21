import styled from 'styled-components';
import { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <InputWrapper $fullWidth={fullWidth}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <StyledInput ref={ref} id={inputId} $hasError={!!error} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} {...props} />
        {error && <ErrorText id={`${inputId}-error`} role="alert">{error}</ErrorText>}
      </InputWrapper>
    );
  }
);

Input.displayName = 'Input';

const InputWrapper = styled.div<{ $fullWidth: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const StyledInput = styled.input<{ $hasError: boolean }>`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme, $hasError }) =>
    $hasError ? theme.colors.status.danger : theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.colors.status.danger : theme.colors.accent.sage};
    box-shadow: 0 0 0 3px ${({ theme, $hasError }) =>
      $hasError ? `${theme.colors.status.danger}40` : `${theme.colors.accent.sage}40`};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
    opacity: 0.6;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

const ErrorText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.status.danger};
`;
