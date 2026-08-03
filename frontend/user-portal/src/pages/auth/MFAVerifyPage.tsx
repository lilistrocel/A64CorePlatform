import { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  KeyRound,
  Lightbulb,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unlock,
  User,
} from 'lucide-react';
import { Button, glassPanel } from '@a64core/shared';
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
import { usePageVisibility } from '../../hooks/usePageVisibility';

type InputMode = 'totp' | 'backup';

interface LocationState {
  mfaToken?: string;
  email?: string;
}

export function MFAVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyMfa, mfaPendingToken, mfaPendingUserId, mfaRequired, clearMfaState, isLoading, error: storeError, loadUser } = useAuthStore();
  // Night Observatory is dark-only (T-901) — the cream-on-transparent lockup
  // is now correct unconditionally; no more per-theme branch. Use the
  // `transparent` variant, not `lockup_cosmos.svg` — that one bakes in its
  // own opaque `#0E1330` background rect, which shows as a visible box seam
  // against this card's glassPanel gradient.
  const logoSrc = '/brand/lockup_transparent.svg';

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
  // Only create new cache if one doesn't already exist (to preserve timestamp for expiry)
  useEffect(() => {
    if (mfaToken && !isSessionExpired && !cachedState) {
      // Only cache if there's no existing cache (don't overwrite timestamp)
      setCachedVerifyState(mfaToken, email, userId, totpDigits);
    }
  }, [mfaToken, email, userId, isSessionExpired]); // Don't include totpDigits or cachedState

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

  // Feature #345: Handle page visibility changes for mobile app switching
  // Ensures state is preserved when user switches to authenticator app
  usePageVisibility({
    onHidden: useCallback(() => {
      // User switching to authenticator app - ensure digits are saved
      if (mfaToken && !isSessionExpired) {
        updateCachedVerifyDigits(totpDigits);
      }
    }, [mfaToken, isSessionExpired, totpDigits]),
    onVisible: useCallback(() => {
      // User returned from authenticator app
      // State was already restored from sessionStorage, nothing additional needed
    }, []),
    onBfcacheRestore: useCallback(() => {
      // Page restored from Safari's bfcache
      // Reload state from sessionStorage in case it was updated
      const freshState = getCachedVerifyState();
      if (freshState && freshState.digits) {
        setTotpDigits(freshState.digits);
      }
    }, []),
  });

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
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <ExpiredIcon><Clock size={28} strokeWidth={1.8} /></ExpiredIcon>
            <Title>Session Expired</Title>
            <Subtitle>
              Your verification session has expired for security reasons.
              Please log in again to continue.
            </Subtitle>
            <StartOverButton onClick={handleStartOver}>
              <StartOverIcon><RefreshCw size={16} strokeWidth={1.8} /></StartOverIcon>
              Start Over
            </StartOverButton>
            <BackToLogin to="/login">
              <ArrowLeft size={14} strokeWidth={1.8} /> Back to login
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
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            {isNoCodesRemaining ? (
              <WarningIcon><AlertTriangle size={28} strokeWidth={1.8} /></WarningIcon>
            ) : (
              <SuccessIcon><Check size={28} strokeWidth={2.2} /></SuccessIcon>
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
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>

          {/* Authenticator App Illustration */}
          <AuthenticatorIllustration>
            <PhoneIcon><Smartphone size={40} strokeWidth={1.5} /></PhoneIcon>
            <ShieldBadge><ShieldCheck size={20} strokeWidth={1.8} /></ShieldBadge>
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
              <MobileReassuranceIcon><Lightbulb size={14} strokeWidth={1.8} /></MobileReassuranceIcon>
              Your session is saved — you can safely switch to your authenticator app and return here
            </MobileReassuranceText>
          )}

          {/* Feature #347: Enhanced read-only email confirmation box */}
          {email && (
            <EmailConfirmationBox>
              <EmailConfirmIcon><User size={16} strokeWidth={1.8} /></EmailConfirmIcon>
              <EmailConfirmDetails>
                <EmailConfirmLabel>Signing in as</EmailConfirmLabel>
                <EmailConfirmValue>{email}</EmailConfirmValue>
              </EmailConfirmDetails>
              <EmailConfirmCheck><Check size={12} strokeWidth={2.5} /></EmailConfirmCheck>
            </EmailConfirmationBox>
          )}

          {/* Session timer - show time remaining before expiry */}
          {timeRemaining !== null && timeRemaining > 0 && (
            <SessionTimer $warning={timeRemaining < 60000}>
              <SessionTimerIcon>
                {timeRemaining < 60000
                  ? <AlertTriangle size={14} strokeWidth={1.8} />
                  : <Clock size={14} strokeWidth={1.8} />}
              </SessionTimerIcon>
              <SessionTimerText>
                Session expires in: <SessionTimerValue>{formatTimeRemaining(timeRemaining)}</SessionTimerValue>
              </SessionTimerText>
            </SessionTimer>
          )}

          {/* Lockout Timer Display */}
          {lockoutSeconds && (
            <LockoutBanner role="alert">
              <LockoutIcon><Clock size={16} strokeWidth={1.8} /></LockoutIcon>
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
                  <ButtonIcon><Lock size={15} strokeWidth={1.8} /></ButtonIcon>
                  Locked
                </>
              ) : (
                <>
                  <ButtonIcon><Unlock size={15} strokeWidth={1.8} /></ButtonIcon>
                  Verify
                </>
              )}
            </VerifyButton>
          </VerifyForm>

          <StyledToggleModeLink onClick={handleToggleMode}>
            {inputMode === 'totp' ? (
              <>
                <ToggleIcon><KeyRound size={14} strokeWidth={1.8} /></ToggleIcon>
                Use a backup code instead
              </>
            ) : (
              <>
                <ToggleIcon><Smartphone size={14} strokeWidth={1.8} /></ToggleIcon>
                Use authenticator app instead
              </>
            )}
          </StyledToggleModeLink>

          <Divider />

          <BackToLogin to="/login">
            <ArrowLeft size={14} strokeWidth={1.8} /> Back to login
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
  /* Night Observatory (spec §0/§7): auth screens carry no sidebar — the
     fixed Sky layer at the app shell is the entire backdrop here. */
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
  ${glassPanel}
  border-radius: 22px;
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
  /* Bounded responsive height. Capped so banner-shaped logo fits 440px card. */
  height: clamp(56px, 8vw, 120px);
  width: auto;
  display: block;
  margin: 0 auto;
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
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.info};
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
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 50%;
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
  background: ${({ theme }) => theme.colors.success};
  /* emerald fill — onDark (cream), not onAccent (gold-fill only, spec §1.1). */
  color: ${({ theme }) => theme.colors.onDark};
  border-radius: 50%;
  flex-shrink: 0;
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  text-align: center;
`;

const WarningBanner = styled.div`
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.warning};
  font-size: 0.875rem;
  text-align: center;
  font-weight: 500;
`;

const WarningIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: ${({ theme }) => theme.colors.warning};
  /* gold-b (warning) fill is light — cosmos (onAccent) text stays correct here. */
  color: ${({ theme }) => theme.colors.onAccent};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SuccessIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: ${({ theme }) => theme.colors.success};
  /* emerald fill — onDark (cream), not onAccent (gold-fill only, spec §1.1). */
  color: ${({ theme }) => theme.colors.onDark};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SuccessBanner = styled.div`
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid ${({ theme }) => theme.colors.success};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.bright.emerald};
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin: 1rem 0;

  @media (min-width: 480px) {
    margin: 1.5rem 0;
  }
`;

const BackToLogin = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  /* Touch-friendly: min 44px height */
  min-height: 44px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.875rem;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
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
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
`;

const ShieldBadge = styled.span`
  position: absolute;
  display: flex;
  color: ${({ theme }) => theme.colors.bright.emerald};
  bottom: -0.25rem;
  right: calc(50% - 1.75rem);

  @media (min-width: 360px) {
    right: calc(50% - 2rem);
  }
`;

const LockoutBanner = styled.div`
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const LockoutIcon = styled.span`
  display: flex;
  color: ${({ theme }) => theme.colors.warning};
`;

const LockoutText = styled.span`
  color: ${({ theme }) => theme.colors.warning};
  font-size: 0.875rem;
`;

const LockoutTimer = styled.span`
  font-weight: bold;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.warning};
`;

const StyledDigitInput = styled.input<{ $filled?: boolean; $error?: boolean; $locked?: boolean }>`
  /* Touch-friendly: min 48px x 48px on mobile (larger than standard 44px for fat-finger prevention) */
  width: 40px;
  height: 48px;
  font-size: 1.375rem;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: center;
  border: 2px solid ${({ $error, $filled, $locked, theme }) =>
    $locked ? theme.colors.glass.border :
    $error ? theme.colors.error :
    $filled ? theme.colors.bright.lapis : theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $locked, $filled, theme }) =>
    $locked ? theme.colors.cosmosDeep : $filled ? theme.colors.glass.hi : theme.colors.glass.base};
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
      $locked ? theme.colors.glass.border :
      $error ? theme.colors.error : theme.colors.secondary[500]};
    box-shadow: ${({ $locked, $error }) =>
      $locked ? 'none' : $error ? '0 0 0 3px rgba(240, 138, 112, 0.15)' : '0 0 0 3px rgba(220, 185, 79, 0.15)'};
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const StyledBackupInput = styled.input<{ $error?: boolean }>`
  width: 100%;
  padding: 1rem;
  font-size: 1.5rem;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: center;
  letter-spacing: 0.25rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 2px solid ${({ $error, theme }) =>
    $error ? theme.colors.error : theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) =>
      $error ? theme.colors.error : theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px ${({ $error }) =>
      $error ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)'};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    letter-spacing: 0.25rem;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

// The primary-CTA gold treatment (spec §4 Buttons) — this is the one gold
// budget item on the verify screen.
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
  font-weight: 700;
  color: ${({ disabled, theme }) => disabled ? theme.colors.muted : theme.colors.onAccent};
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.glass.base : `linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]})`};
  border: 1px solid ${({ disabled, theme }) => disabled ? theme.colors.glass.border : 'transparent'};
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
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const ButtonSpinner = styled.span`
  width: 18px;
  height: 18px;
  border: 2px solid ${({ theme }) => theme.colors.onAccent}4D;
  border-top-color: ${({ theme }) => theme.colors.onAccent};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const ButtonIcon = styled.span`
  display: flex;
`;

// Secondary-emphasis control (spec §3: "Secondary emphasis is celeste, never gold").
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
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  @media (min-width: 480px) {
    margin-top: 1rem;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ToggleIcon = styled.span`
  display: flex;
`;

// Feature #346: Session state restoration styled components
const ExpiredIcon = styled.div`
  width: 70px;
  height: 70px;
  margin: 0.5rem auto 1rem;
  /* Status semantics ("expired") — the warning phase colour, not the rare
     chrome gold ramp (spec §3 gold-discipline budget). */
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.onAccent};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(232, 200, 106, 0.3);
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
  /* lapis fill — onDark (cream), not onAccent (gold-fill only, spec §1.1). */
  color: ${({ theme }) => theme.colors.onDark};
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
  display: flex;
`;

const SessionTimer = styled.div<{ $warning?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ $warning, theme }) => $warning ? theme.colors.warningBg : theme.colors.infoBg};
  border: 1px solid ${({ $warning, theme }) => $warning ? theme.colors.warning : theme.colors.info};
  font-size: 0.75rem;

  @media (min-width: 480px) {
    font-size: 0.8125rem;
  }
`;

const SessionTimerIcon = styled.span`
  display: flex;
`;

const SessionTimerText = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SessionTimerValue = styled.span`
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Feature #347: Mobile reassurance text for app switching. An informational
// tip, not a success confirmation — infoBg/lapis-b, not the success/emerald
// tint (that stays reserved for the actual "backup code accepted" state).
const MobileReassuranceText = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1rem 0;
  padding: 0.625rem 0.75rem;
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.info};
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
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.info};
`;
