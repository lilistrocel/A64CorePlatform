import { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { authService } from '../../services/auth.service';
import {
  getCachedVerifyState,
  setCachedVerifyState,
  updateCachedVerifyDigits,
  clearMFAVerifyCache,
  getMFAVerifyCacheTimestamp,
  MFA_VERIFY_EXPIRY_MS,
} from '../../hooks/queries/useMFA';

type InputMode = 'totp' | 'backup';

interface LocationState {
  mfaToken?: string;
  email?: string;
}

export function MFAVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyMfa, mfaPendingToken, mfaPendingUserId, mfaRequired, clearMfaState, isLoading, error: storeError, loadUser } = useAuthStore();

  // Get MFA token from location state (legacy) OR from auth store OR from sessionStorage cache
  const state = location.state as LocationState | null;
  const cachedState = getCachedVerifyState();

  // Priority: location state > auth store > sessionStorage cache
  const mfaToken = state?.mfaToken || mfaPendingToken || cachedState?.token || null;
  const email = state?.email || cachedState?.email || null;
  const userId = mfaPendingUserId || cachedState?.userId || null;

  const [inputMode, setInputMode] = useState<InputMode>('totp');
  // Initialize digits from cache if available
  const [totpDigits, setTotpDigits] = useState<string[]>(
    cachedState?.digits?.length === 6 ? cachedState.digits : ['', '', '', '', '', '']
  );
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Feature #347: Detect mobile device for helper text
  useEffect(() => {
    const checkMobile = () => {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768;
    };
    setIsMobile(checkMobile());
  }, []);

  // Cache the MFA verify state to sessionStorage on mount and when token changes
  useEffect(() => {
    if (mfaToken && !isSessionExpired) {
      setCachedVerifyState(mfaToken, email, userId, totpDigits);
    }
  }, [mfaToken, email, userId]); // Don't include totpDigits here - we update separately

  // Check session expiry timer
  useEffect(() => {
    const cachedTimestamp = getMFAVerifyCacheTimestamp();
    if (!cachedTimestamp && !mfaToken) {
      // No cached state and no token from store - expired
      setIsSessionExpired(true);
      return;
    }

    if (cachedTimestamp) {
      const updateTimer = () => {
        const elapsed = Date.now() - cachedTimestamp;
        const remaining = Math.max(0, MFA_VERIFY_EXPIRY_MS - elapsed);
        setTimeRemaining(remaining);

        if (remaining === 0) {
          setIsSessionExpired(true);
          clearMFAVerifyCache();
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [mfaToken]);

  // Redirect to login if no MFA token and not showing expired state
  useEffect(() => {
    if (!mfaToken && !isSessionExpired && !cachedState) {
      navigate('/login', { replace: true });
    }
  }, [mfaToken, navigate, isSessionExpired, cachedState]);

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

    // Save digits to sessionStorage for restoration across app switches
    updateCachedVerifyDigits(newDigits);

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
      updateCachedVerifyDigits(newDigits);
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

      // Clear cached verify state on success
      clearMFAVerifyCache();
      clearMfaState();

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
    const emptyDigits = ['', '', '', '', '', ''];
    setTotpDigits(emptyDigits);
    updateCachedVerifyDigits(emptyDigits);
    setBackupCode('');
  };

  // Handle "Start over" - clear cache and return to login
  const handleStartOver = useCallback(() => {
    clearMFAVerifyCache();
    clearMfaState();
    navigate('/login', { replace: true });
  }, [clearMfaState, navigate]);

  // Format time remaining for display
  const formatTimeRemaining = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleBackupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow alphanumeric characters and hyphens, max 9 chars (XXXX-XXXX format)
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
    setBackupCode(value);
    setError(null);
  };

  const isCodeValid = inputMode === 'totp' ? getTotpCode().length === 6 : backupCode.length >= 8;

  // Show session expired UI with "Start over" button
  if (isSessionExpired || !mfaToken) {
    return (
      <PageWrapper>
        <VerifyContainer>
          <VerifyCard>
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            <ExpiredIcon>⏱️</ExpiredIcon>
            <Title>Session Expired</Title>
            <Subtitle>
              Your verification session has expired for security reasons.
              Please log in again to continue.
            </Subtitle>
            <StartOverButton onClick={handleStartOver}>
              <StartOverIcon>🔄</StartOverIcon>
              Start Over
            </StartOverButton>
            <BackToLogin to="/login">
              ← Back to login
            </BackToLogin>
          </VerifyCard>
        </VerifyContainer>
      </PageWrapper>
    );
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

          {/* Feature #347: Mobile helper text - reassure users they can switch apps */}
          {isMobile && inputMode === 'totp' && (
            <MobileReassuranceText>
              <MobileReassuranceIcon>💡</MobileReassuranceIcon>
              Your session is saved — you can safely switch to your authenticator app and return here
            </MobileReassuranceText>
          )}

          {/* Feature #347: Enhanced read-only email confirmation box */}
          {email && (
            <EmailConfirmationBox>
              <EmailConfirmIcon>👤</EmailConfirmIcon>
              <EmailConfirmDetails>
                <EmailConfirmLabel>Signing in as</EmailConfirmLabel>
                <EmailConfirmValue>{email}</EmailConfirmValue>
              </EmailConfirmDetails>
              <EmailConfirmCheck>✓</EmailConfirmCheck>
            </EmailConfirmationBox>
          )}

          {/* Session timer - show time remaining before expiry */}
          {timeRemaining !== null && timeRemaining > 0 && (
            <SessionTimer $warning={timeRemaining < 60000}>
              <SessionTimerIcon>{timeRemaining < 60000 ? '⚠️' : '⏱️'}</SessionTimerIcon>
              <SessionTimerText>
                Session expires in: <SessionTimerValue>{formatTimeRemaining(timeRemaining)}</SessionTimerValue>
              </SessionTimerText>
            </SessionTimer>
          )}

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
  padding: 0.5rem;

  @media (min-width: 360px) {
    padding: 0.75rem;
  }

  @media (min-width: 480px) {
    padding: 1rem;
  }

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const VerifyCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  padding: 1rem;
  width: 100%;
  max-width: 420px;

  @media (min-width: 360px) {
    padding: 1.25rem;
  }

  @media (min-width: 480px) {
    padding: 1.5rem;
  }

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 460px;
    border-radius: ${({ theme }) => theme.borderRadius.xl};
  }
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 0.5rem;

  @media (min-width: 360px) {
    margin-bottom: 0.75rem;
  }

  @media (min-width: 640px) {
    margin-bottom: 1rem;
  }
`;

const LogoImg = styled.img`
  height: 40px;
  width: auto;
  display: block;
  margin: 0 auto;

  @media (min-width: 360px) {
    height: 48px;
  }

  @media (min-width: 640px) {
    height: 60px;
  }
`;

const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: center;
  margin: 0 0 0.5rem 0;

  @media (min-width: 360px) {
    font-size: 1.375rem;
  }

  @media (min-width: 480px) {
    font-size: 1.5rem;
  }

  @media (min-width: 640px) {
    font-size: 1.75rem;
  }
`;

const Subtitle = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: 0 0 1rem 0;
  line-height: 1.5;

  @media (min-width: 360px) {
    font-size: 0.875rem;
    margin-bottom: 1.25rem;
  }

  @media (min-width: 480px) {
    margin-bottom: 1.5rem;
  }

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

// Feature #347: Enhanced email confirmation box (read-only display)
const EmailConfirmationBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin: 0 0 1rem 0;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  animation: fadeInSlide 0.3s ease-out;

  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const EmailConfirmIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: ${({ theme }) => theme.colors.primary[100]};
  border-radius: 50%;
  font-size: 1rem;
  flex-shrink: 0;
`;

const EmailConfirmDetails = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const EmailConfirmLabel = styled.span`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
`;

const EmailConfirmValue = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EmailConfirmCheck = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: #10b981;
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: bold;
  flex-shrink: 0;
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
  gap: 0.375rem;

  @media (min-width: 360px) {
    gap: 0.5rem;
  }

  @media (min-width: 480px) {
    gap: 0.625rem;
  }

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
  margin: 1rem 0;

  @media (min-width: 480px) {
    margin: 1.5rem 0;
  }
`;

const BackToLogin = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  /* Touch-friendly: min 44px height */
  min-height: 44px;
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
  margin: 0.75rem 0;

  @media (min-width: 480px) {
    margin: 1rem 0;
  }
`;

const PhoneIcon = styled.span`
  font-size: 2.5rem;

  @media (min-width: 360px) {
    font-size: 3rem;
  }
`;

const ShieldBadge = styled.span`
  position: absolute;
  font-size: 1.25rem;
  bottom: -0.25rem;
  right: calc(50% - 1.75rem);

  @media (min-width: 360px) {
    font-size: 1.5rem;
    right: calc(50% - 2rem);
  }
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
  /* Touch-friendly: min 48px x 48px on mobile (larger than standard 44px for fat-finger prevention) */
  width: 40px;
  height: 48px;
  font-size: 1.375rem;
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

  @media (min-width: 360px) {
    width: 44px;
    height: 52px;
    font-size: 1.5rem;
  }

  @media (min-width: 480px) {
    width: 48px;
    height: 56px;
    font-size: 1.625rem;
  }

  @media (min-width: 640px) {
    width: 52px;
    height: 60px;
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
  /* Touch-friendly: min 48px height */
  min-height: 48px;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.neutral[300] : theme.colors.primary[500]};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;

  @media (min-width: 360px) {
    font-size: 1rem;
    padding: 0.875rem 1.25rem;
  }

  @media (min-width: 480px) {
    padding: 0.875rem 1.5rem;
  }

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
  margin-top: 0.75rem;
  /* Touch-friendly: min 44px height for accessibility */
  min-height: 44px;
  padding: 0.625rem 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  @media (min-width: 480px) {
    margin-top: 1rem;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ToggleIcon = styled.span`
  font-size: 1rem;
`;

// Feature #346: Session state restoration styled components
const ExpiredIcon = styled.div`
  width: 70px;
  height: 70px;
  margin: 0.5rem auto 1rem;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
`;

const StartOverButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 48px;
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  background: ${({ theme }) => theme.colors.primary[500]};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 1rem;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const StartOverIcon = styled.span`
  font-size: 1.125rem;
`;

const SessionTimer = styled.div<{ $warning?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ $warning }) => $warning ? '#fef3c7' : '#f0f9ff'};
  border: 1px solid ${({ $warning }) => $warning ? '#f59e0b' : '#3b82f6'};
  font-size: 0.75rem;

  @media (min-width: 480px) {
    font-size: 0.8125rem;
  }
`;

const SessionTimerIcon = styled.span`
  font-size: 1rem;
`;

const SessionTimerText = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SessionTimerValue = styled.span`
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Feature #347: Mobile reassurance text for app switching
const MobileReassuranceText = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1rem 0;
  padding: 0.625rem 0.75rem;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #10b981;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  line-height: 1.4;
  animation: slideInFade 0.3s ease-out;

  @keyframes slideInFade {
    from {
      opacity: 0;
      transform: translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Only show on mobile devices */
  @media (min-width: 768px) {
    display: none;
  }
`;

const MobileReassuranceIcon = styled.span`
  font-size: 1rem;
  flex-shrink: 0;
`;
