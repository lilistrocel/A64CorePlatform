import styled from 'styled-components';
import { forwardRef, useId } from 'react';
import { glassControl, monoLabel } from '../../theme/mixins';

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
  gap: ${({ theme }) => theme.spacing.xs};
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
`;

const Label = styled.label`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const StyledInput = styled.input<{ $hasError: boolean }>`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-color: ${({ theme, $hasError }) =>
    $hasError ? theme.colors.error : theme.colors.glass.border};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  /* Gold focus ring (spec §4 Inputs) — errors keep the coral ring instead. */
  &:focus {
    outline: none;
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.colors.error : theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px ${({ $hasError }) =>
      $hasError ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    font-weight: 400;
  }
`;

const ErrorText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.error};
`;
