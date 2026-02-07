import { useState, useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { authService } from '../../services/auth.service';

type InputMode = 'totp' | 'backup';

interface LocationState {
  mfaToken?: string;
  email?: string;
}

export function MFAVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyMfa, mfaPendingToken, mfaRequired, clearMfaState, isLoading, error: storeError, loadUser } = useAuthStore();

  // Get MFA token from location state (legacy) OR from auth store (new approach)
  const state = location.state as LocationState | null;
  const mfaToken = state?.mfaToken || mfaPendingToken;
  const email = state?.email;

  const [inputMode, setInputMode] = useState<InputMode>('totp');
  const [totpDigits, setTotpDigits] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect to login if no MFA token
  useEffect(() => {
    if (!mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [mfaToken, navigate]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds && lockoutSeconds > 0) {
      const timer = setInterval(() => {
        setLockoutSeconds(prev => {
          if (prev && prev > 1) return prev - 1;
          return null;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutSeconds]);

  // Focus first digit on mount
  useEffect(() => {
    if (inputMode === 'totp') {
      digitRefs.current[0]?.focus();
    }
  }, [inputMode]);

  const getTotpCode = () => totpDigits.join('');

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...totpDigits];
    newDigits[index] = digit;
    setTotpDigits(newDigits);
    setError(null);

    // Auto-focus next input when digit entered
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !totpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length > 0) {
      const newDigits = [...totpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pastedData[i] || '';
      }
      setTotpDigits(newDigits);
      const lastFilledIndex = Math.min(pastedData.length - 1, 5);
      digitRefs.current[lastFilledIndex]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const code = inputMode === 'totp' ? getTotpCode() : backupCode;
      const response = await authService.verifyMfa(mfaToken!, code);

      // Check for backup code warning
      if (response.warning) {
        setWarningMessage(response.warning);
        setBackupCodesRemaining(response.backupCodesRemaining);
        // Show warning briefly before redirecting
        setTimeout(async () => {
          await loadUser();
          navigate('/dashboard', { replace: true });
        }, 3000);
      } else {
        await loadUser();
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Invalid code. Please try again.';
      const errorString = typeof errorMessage === 'string' ? errorMessage : 'Invalid code. Please try again.';
      setError(errorString);
      setIsSubmitting(false);

      // Check for lockout (rate limit) - extract seconds from error message
      const lockoutMatch = errorString.match(/(\d+)\s*(?:seconds?|s)/i);
      if (lockoutMatch || errorString.toLowerCase().includes('locked') || errorString.toLowerCase().includes('too many')) {
        const seconds = lockoutMatch ? parseInt(lockoutMatch[1], 10) : 30;
        setLockoutSeconds(seconds);
      }
    }
  };

  const handleToggleMode = () => {
    setInputMode(mode => mode === 'totp' ? 'backup' : 'totp');
    setError(null);
    setTotpDigits(['', '', '', '', '', '']);
    setBackupCode('');
  };

  const handleBackupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow alphanumeric characters and hyphens, max 9 chars (XXXX-XXXX format)
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
    setBackupCode(value);
    setError(null);
  };

  const isCodeValid = inputMode === 'totp' ? getTotpCode().length === 6 : backupCode.length >= 8;

  if (!mfaToken) {
    return null; // Will redirect
  }

  // Feature #335: Show message after successful login with backup code
  // Differentiate between success (codes remaining) and warning (no codes remaining)
  if (warningMessage) {
    const isNoCodesRemaining = backupCodesRemaining === 0;
    return (
      <PageWrapper>
        <VerifyContainer>
          <VerifyCard>
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            {isNoCodesRemaining ? (
              <WarningIcon>&#9888;</WarningIcon>
            ) : (
              <SuccessIcon>&#10003;</SuccessIcon>
            )}
            <Title>{isNoCodesRemaining ? 'No Backup Codes Remaining' : 'Backup Code Accepted'}</Title>
            {isNoCodesRemaining ? (
              <WarningBanner>
                {warningMessage}
              </WarningBanner>
            ) : (
              <SuccessBanner>
                {warningMessage}
              </SuccessBanner>
            )}
            <Subtitle>
              Redirecting to dashboard... {isNoCodesRemaining
                ? 'Contact your admin or regenerate backup codes in Settings > Security.'
                : 'You can regenerate backup codes in Settings > Security.'}
            </Subtitle>
            <Button
              variant="primary"
              fullWidth
              onClick={async () => {
                await loadUser();
                navigate('/dashboard', { replace: true });
              }}
            >
              Continue to Dashboard
            </Button>
          </VerifyCard>
        </VerifyContainer>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <VerifyContainer>
        <VerifyCard>
          <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>

          {/* Authenticator App Illustration */}
          <AuthenticatorIllustration>
            <PhoneIcon>📱</PhoneIcon>
            <ShieldBadge>🔐</ShieldBadge>
          </AuthenticatorIllustration>

          <Title>Two-Factor Authentication</Title>
          <Subtitle>
            {inputMode === 'totp'
              ? 'Enter the 6-digit code from your authenticator app'
              : 'Enter one of your backup codes'}
          </Subtitle>

          {email && <EmailHint>Logging in as: {email}</EmailHint>}

          {/* Lockout Timer Display */}
          {lockoutSeconds && (
            <LockoutBanner role="alert">
              <LockoutIcon>⏱️</LockoutIcon>
              <LockoutText>
                Too many attempts. Please wait <LockoutTimer>{lockoutSeconds}</LockoutTimer> seconds.
              </LockoutText>
            </LockoutBanner>
          )}

          {error && !lockoutSeconds && <ErrorBanner role="alert" aria-live="assertive">{error}</ErrorBanner>}

          <VerifyForm onSubmit={handleSubmit}>
            {inputMode === 'totp' ? (
              <CodeInputContainer>
                <CodeLabel>Authentication Code</CodeLabel>
                <DigitInputContainer onPaste={handlePaste}>
                  {totpDigits.map((digit, index) => (
                    <StyledDigitInput
                      key={index}
                      ref={(el) => { digitRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(index, e)}
                      aria-label={`Digit ${index + 1} of 6`}
                      $filled={!!digit}
                      $error={!!error}
                      $locked={!!lockoutSeconds}
                      disabled={!!lockoutSeconds}
                    />
                  ))}
                </DigitInputContainer>
              </CodeInputContainer>
            ) : (
              <CodeInputContainer>
                <CodeLabel>Backup Code</CodeLabel>
                <StyledBackupInput
                  type="text"
                  maxLength={9}
                  placeholder="XXXX-XXXX"
                  value={backupCode}
                  onChange={handleBackupChange}
                  autoFocus
                  aria-label="8-character backup code"
                  $error={!!error}
                />
                <BackupCodeHint>
                  Enter an 8-character code in XXXX-XXXX format
                </BackupCodeHint>
              </CodeInputContainer>
            )}

            <VerifyButton
              type="submit"
              disabled={!isCodeValid || isSubmitting || !!lockoutSeconds}
              $loading={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <ButtonSpinner />
                  Verifying...
                </>
              ) : lockoutSeconds ? (
                <>
                  <ButtonIcon>🔒</ButtonIcon>
                  Locked
                </>
              ) : (
                <>
                  <ButtonIcon>🔓</ButtonIcon>
                  Verify
                </>
              )}
            </VerifyButton>
          </VerifyForm>

          <StyledToggleModeLink onClick={handleToggleMode}>
            {inputMode === 'totp' ? (
              <>
                <ToggleIcon>🔑</ToggleIcon>
                Use a backup code instead
              </>
            ) : (
              <>
                <ToggleIcon>📱</ToggleIcon>
                Use authenticator app instead
              </>
            )}
          </StyledToggleModeLink>

          <Divider />

          <BackToLogin to="/login">
            ← Back to login
          </BackToLogin>
        </VerifyCard>
      </VerifyContainer>
    </PageWrapper>
  );
}

// Styled Components
const PageWrapper = styled.div`
  width: 100vw;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
`;

const VerifyContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.primary[500]} 0%, ${({ theme }) => theme.colors.primary[700]} 100%);
  padding: 1rem;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const VerifyCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  padding: 1.5rem;
  width: 100%;
  max-width: 420px;

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 460px;
    border-radius: ${({ theme }) => theme.borderRadius.xl};
  }
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 0.75rem;

  @media (min-width: 640px) {
    margin-bottom: 1rem;
  }
`;

const LogoImg = styled.img`
  height: 48px;
  width: auto;
  display: block;
  margin: 0 auto;

  @media (min-width: 640px) {
    height: 60px;
  }
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: center;
  margin: 0 0 0.5rem 0;

  @media (min-width: 640px) {
    font-size: 1.75rem;
  }
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: 0 0 1.5rem 0;
  line-height: 1.5;

  @media (min-width: 640px) {
    font-size: 1rem;
    margin-bottom: 2rem;
  }
`;

const EmailHint = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: 0 0 1rem 0;
  padding: 0.5rem;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => `${theme.colors.error}10`};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  text-align: center;
`;

const WarningBanner = styled.div`
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  color: #92400e;
  font-size: 0.875rem;
  text-align: center;
  font-weight: 500;
`;

const WarningIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: #f59e0b;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
`;

const SuccessIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: ${({ theme }) => theme.colors.success || '#10b981'};
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
`;

const SuccessBanner = styled.div`
  background: ${({ theme }) => `${theme.colors.success || '#10b981'}10`};
  border: 1px solid ${({ theme }) => theme.colors.success || '#10b981'};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.success || '#059669'};
  font-size: 0.875rem;
  text-align: center;
  font-weight: 500;
`;

const BackupCodesInfo = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: center;
  margin: 0 0 1rem 0;
`;

const VerifyForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const CodeInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const CodeLabel = styled.label`
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DigitInputContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;

  @media (min-width: 640px) {
    gap: 0.75rem;
  }
`;

const DigitInput = styled.input`
  width: 40px;
  height: 52px;
  font-size: 1.5rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 0.2s ease;

  @media (min-width: 640px) {
    width: 48px;
    height: 58px;
    font-size: 1.75rem;
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[300]};
  }
`;

const TotpInput = styled.input`
  width: 100%;
  padding: 1rem;
  font-size: 1.75rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[300]};
    letter-spacing: 0.75rem;
  }
`;

const BackupInput = styled.input`
  width: 100%;
  padding: 1rem;
  font-size: 1.5rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 0.25rem;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[300]};
    letter-spacing: 0.25rem;
  }
`;

const BackupCodeHint = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: 0;
`;

const ToggleModeLink = styled.button`
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 1rem;
  padding: 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
    text-decoration: underline;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  margin: 1.5rem 0;
`;

const BackToLogin = styled(Link)`
  display: block;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
    text-decoration: underline;
  }
`;

// Additional styled components for enhanced MFA UI (Feature #335)
const AuthenticatorIllustration = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  margin: 1rem 0;
`;

const PhoneIcon = styled.span`
  font-size: 3rem;
`;

const ShieldBadge = styled.span`
  position: absolute;
  font-size: 1.5rem;
  bottom: -0.25rem;
  right: calc(50% - 2rem);
`;

const LockoutBanner = styled.div`
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const LockoutIcon = styled.span`
  font-size: 1.25rem;
`;

const LockoutText = styled.span`
  color: #92400e;
  font-size: 0.875rem;
`;

const LockoutTimer = styled.span`
  font-weight: bold;
  color: #92400e;
`;

const StyledDigitInput = styled.input<{ $filled?: boolean; $error?: boolean; $locked?: boolean }>`
  width: 40px;
  height: 52px;
  font-size: 1.5rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  border: 2px solid ${({ $error, $filled, $locked, theme }) =>
    $locked ? theme.colors.neutral[400] :
    $error ? theme.colors.error :
    $filled ? theme.colors.primary[500] : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $locked, theme }) =>
    $locked ? theme.colors.neutral[100] : theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 0.2s ease;
  opacity: ${({ $locked }) => $locked ? 0.6 : 1};

  @media (min-width: 640px) {
    width: 48px;
    height: 58px;
    font-size: 1.75rem;
  }

  &:focus {
    outline: none;
    border-color: ${({ $error, $locked, theme }) =>
      $locked ? theme.colors.neutral[400] :
      $error ? theme.colors.error : theme.colors.primary[500]};
    box-shadow: ${({ $locked }) => $locked ? 'none' : '0 0 0 3px rgba(59, 130, 246, 0.2)'};
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const StyledBackupInput = styled.input<{ $error?: boolean }>`
  width: 100%;
  padding: 1rem;
  font-size: 1.5rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 0.25rem;
  border: 2px solid ${({ $error, theme }) =>
    $error ? theme.colors.error : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) =>
      $error ? theme.colors.error : theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ $error, theme }) =>
      $error ? 'rgba(239, 68, 68, 0.2)' : theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[300]};
    letter-spacing: 0.25rem;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const VerifyButton = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.neutral[300] : theme.colors.primary[500]};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const ButtonSpinner = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const ButtonIcon = styled.span`
  font-size: 1rem;
`;

const StyledToggleModeLink = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  text-align: center;
  margin-top: 1rem;
  padding: 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ToggleIcon = styled.span`
  font-size: 1rem;
`;
