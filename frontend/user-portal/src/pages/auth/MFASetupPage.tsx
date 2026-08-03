import { useState, useRef, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Copy, Lock } from 'lucide-react';
import { Button, Card, glassPanel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { BackupCodesModal } from '../../components/auth/BackupCodesModal';
import {
  useMFASetup,
  useEnableMFA,
  clearMFASetupCache,
  getMFASetupCacheTimestamp,
  MFA_SETUP_EXPIRY_MS,
  type MFASetupResponse,
} from '../../hooks/queries/useMFA';
import { queryKeys } from '../../config/react-query.config';

export function MFASetupPage() {
  const navigate = useNavigate();
  const { user, loadUser, logout } = useAuthStore();
  // Night Observatory is dark-only (T-901) — the cream-on-transparent lockup
  // is now correct unconditionally; no more per-theme branch. Use the
  // `transparent` variant, not `lockup_cosmos.svg` — that one bakes in its
  // own opaque `#0E1330` background rect, which shows as a visible box seam
  // against this card's glassPanel gradient.
  const logoSrc = '/brand/lockup_transparent.svg';
  const queryClient = useQueryClient();

  // Forced-setup: account has mfaSetupRequired=true and not yet enabled.
  // In this state ProtectedRoute only allows /mfa/setup and /logout — so
  // any "back" / "cancel" path that targets /settings would loop infinitely.
  // We surface a "Sign Out" exit instead.
  const isForcedSetup = !!(user?.mfaSetupRequired && !user?.mfaEnabled);

  const exitSetup = async () => {
    if (isForcedSetup) {
      // Clean way out: sign out, return to /login.
      await logout();
      navigate('/login', { replace: true });
    } else {
      navigate('/settings');
    }
  };
  const exitLabel = isForcedSetup ? 'Sign Out' : 'Back to Settings';

  // Use React Query for MFA setup data
  // - 10-minute stale time (data is considered fresh, no refetches)
  // - refetchOnWindowFocus: false (no refetch when user tabs back)
  // - refetchOnMount: false (no refetch when component remounts)
  // - refetchOnReconnect: false (no refetch on network reconnect)
  // - Backed by sessionStorage for persistence across page visibility changes
  const {
    data: setupData,
    isLoading,
    isError,
    error: queryError,
    refetch,
  } = useMFASetup();

  // Use mutation for enabling MFA (clears cache on success)
  const enableMFAMutation = useEnableMFA();

  const [step, setStep] = useState<'scan' | 'backup' | 'error' | 'expired'>('scan');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(MFA_SETUP_EXPIRY_MS);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync query error state with component state
  useEffect(() => {
    if (isError && queryError) {
      const message = (queryError as any)?.response?.data?.detail || 'Failed to initialize MFA setup';
      setError(message);
      setStep('error');
    }
  }, [isError, queryError]);

  // Countdown timer effect
  useEffect(() => {
    if (!setupData || step === 'backup' || step === 'error' || step === 'expired') {
      return;
    }

    const updateTimer = () => {
      // Re-read the cache timestamp on each tick to detect changes
      const cacheTimestamp = getMFASetupCacheTimestamp();
      if (!cacheTimestamp) {
        // Cache was cleared, reset to full time
        setTimeRemaining(MFA_SETUP_EXPIRY_MS);
        return;
      }

      const elapsed = Date.now() - cacheTimestamp;
      const remaining = Math.max(0, MFA_SETUP_EXPIRY_MS - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0) {
        setStep('expired');
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [setupData, step]);

  // Format time remaining as MM:SS
  const formatTimeRemaining = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle regenerating QR code after expiry
  const handleRegenerateCode = () => {
    clearMFASetupCache();
    queryClient.removeQueries({ queryKey: queryKeys.mfa.setup() });
    setError(null);
    setStep('scan');
    setTimeRemaining(MFA_SETUP_EXPIRY_MS);
    setTotpCode(['', '', '', '', '', '']);
    refetch();
  };

  const getCodeString = () => totpCode.join('');

  const handleDigitChange = (index: number, value: string) => {
    // Only accept single digit
    const digit = value.replace(/\D/g, '').slice(-1);

    const newCode = [...totpCode];
    newCode[index] = digit;
    setTotpCode(newCode);
    setError(null);

    // Auto-focus next input when digit entered
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace to go to previous input
    if (e.key === 'Backspace' && !totpCode[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
    // Handle arrow keys
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
      const newCode = [...totpCode];
      for (let i = 0; i < 6; i++) {
        newCode[i] = pastedData[i] || '';
      }
      setTotpCode(newCode);
      // Focus last filled digit or first empty
      const lastFilledIndex = Math.min(pastedData.length - 1, 5);
      digitRefs.current[lastFilledIndex]?.focus();
    }
  };

  const handleCopySecret = async () => {
    if (setupData?.secret) {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = async () => {
    const codeString = getCodeString();
    if (codeString.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setError(null);

    try {
      // Use the mutation which handles cache clearing automatically
      const result = await enableMFAMutation.mutateAsync(codeString);

      if (result.enabled) {
        setBackupCodes(result.backupCodes);
        setStep('backup');
        // Reload user to update MFA status
        await loadUser();
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Invalid verification code. Please try again.';
      setError(message);
    }
  };

  const handleFinish = () => {
    // Cache already cleared by mutation, just navigate
    navigate('/settings');
  };

  const handleRetry = () => {
    // Clear both sessionStorage and React Query cache
    clearMFASetupCache();
    queryClient.removeQueries({ queryKey: queryKeys.mfa.setup() });
    setError(null);
    setStep('scan');
    // Refetch fresh data
    refetch();
  };

  // Show loading state for initial fetch only
  if (isLoading) {
    return (
      <PageWrapper>
        <SetupContainer>
          <SetupCard>
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <Title>Setting Up Two-Factor Authentication</Title>
            <LoadingSpinner>
              <SpinnerIcon />
              <LoadingText>Generating your secure key...</LoadingText>
            </LoadingSpinner>
          </SetupCard>
        </SetupContainer>
      </PageWrapper>
    );
  }

  if (step === 'error') {
    return (
      <PageWrapper>
        <SetupContainer>
          <SetupCard>
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <Title>Setup Failed</Title>
            <ErrorBanner>{error}</ErrorBanner>
            <ButtonGroup>
              <Button variant="primary" onClick={handleRetry}>
                Try Again
              </Button>
              <Button variant="secondary" onClick={exitSetup}>
                {exitLabel}
              </Button>
            </ButtonGroup>
          </SetupCard>
        </SetupContainer>
      </PageWrapper>
    );
  }

  if (step === 'expired') {
    return (
      <PageWrapper>
        <SetupContainer>
          <SetupCard>
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <ExpiredIcon><Clock size={28} strokeWidth={1.8} /></ExpiredIcon>
            <Title>Session Expired</Title>
            <Subtitle>
              Your MFA setup session has expired for security reasons.
              Please generate a new QR code to continue.
            </Subtitle>
            <ButtonGroup>
              <Button variant="primary" onClick={handleRegenerateCode}>
                Generate New Code
              </Button>
              <Button variant="secondary" onClick={exitSetup}>
                {exitLabel}
              </Button>
            </ButtonGroup>
          </SetupCard>
        </SetupContainer>
      </PageWrapper>
    );
  }

  if (step === 'backup') {
    return (
      <PageWrapper>
        <SetupContainer>
          <SetupCard>
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <SuccessIcon><Check size={28} strokeWidth={2.2} /></SuccessIcon>
            <Title>MFA Enabled Successfully!</Title>
            <Subtitle>Your account is now protected with two-factor authentication.</Subtitle>
          </SetupCard>
        </SetupContainer>
        <BackupCodesModal
          isOpen={true}
          onClose={handleFinish}
          backupCodes={backupCodes}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <SetupContainer>
        <SetupCard>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
          <Title>Set Up Two-Factor Authentication</Title>
          <Subtitle>Scan the QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</Subtitle>

          {/* Session timeout indicator */}
          <SessionTimer $warning={timeRemaining < 2 * 60 * 1000}>
            <TimerIcon><Clock size={14} strokeWidth={1.8} /></TimerIcon>
            <TimerText>
              Session expires in <TimerValue>{formatTimeRemaining(timeRemaining)}</TimerValue>
            </TimerText>
          </SessionTimer>

          {/* Step 1: QR Code Display */}
          <StepSection $active={step === 'scan'}>
            <StepNumber>1</StepNumber>
            <StepContent>
              <StepTitle>Scan QR Code</StepTitle>

              {setupData?.qrCodeDataUrl ? (
                <QRCodeContainer>
                  <QRCodeImage src={setupData.qrCodeDataUrl} alt="MFA QR Code" />
                </QRCodeContainer>
              ) : (
                <QRCodePlaceholder>
                  <QRCodeFallback>
                    Unable to display QR code. Please use manual entry below.
                  </QRCodeFallback>
                </QRCodePlaceholder>
              )}

              <ManualEntrySection>
                <ManualEntryLabel>Can't scan? Enter this key manually:</ManualEntryLabel>
                <SecretKeyBox>
                  <SecretKey>{setupData?.secret}</SecretKey>
                  <CopySecretButton onClick={handleCopySecret} $copied={copied}>
                    {copied ? (
                      <>
                        <CopyIcon><Check size={14} strokeWidth={2.2} /></CopyIcon>
                        Copied!
                      </>
                    ) : (
                      <>
                        <CopyIcon><Copy size={14} strokeWidth={1.8} /></CopyIcon>
                        Copy
                      </>
                    )}
                  </CopySecretButton>
                </SecretKeyBox>
              </ManualEntrySection>
            </StepContent>
          </StepSection>

          {/* Step 2: Verification */}
          <StepSection $active={step === 'scan'}>
            <StepNumber>2</StepNumber>
            <StepContent>
              <StepTitle>Enter Verification Code</StepTitle>
              <StepDescription>Enter the 6-digit code from your authenticator app to verify setup.</StepDescription>

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <VerificationForm onSubmit={(e) => { e.preventDefault(); handleVerify(); }}>
                <DigitInputContainer onPaste={handlePaste}>
                  {totpCode.map((digit, index) => (
                    <DigitInput
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
                    />
                  ))}
                </DigitInputContainer>
                <VerifyButton
                  type="submit"
                  disabled={getCodeString().length !== 6 || enableMFAMutation.isPending}
                  $loading={enableMFAMutation.isPending}
                >
                  {enableMFAMutation.isPending ? (
                    <>
                      <ButtonSpinner />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <LockIcon><Lock size={16} strokeWidth={1.8} /></LockIcon>
                      Verify & Enable MFA
                    </>
                  )}
                </VerifyButton>
              </VerificationForm>
            </StepContent>
          </StepSection>

          <CancelLink onClick={exitSetup}>
            {isForcedSetup ? 'Sign out and continue later' : 'Cancel Setup'}
          </CancelLink>
        </SetupCard>
      </SetupContainer>
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

const SetupContainer = styled.div`
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

const SetupCard = styled.div`
  ${glassPanel}
  border-radius: 22px;
  padding: 1rem;
  width: 100%;
  max-width: 480px;

  @media (min-width: 360px) {
    padding: 1.25rem;
  }

  @media (min-width: 480px) {
    padding: 1.5rem;
  }

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 520px;
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

const LoadingSpinner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 0;
`;

const SpinnerIcon = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.celeste};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.p`
  margin-top: 1rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
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
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  color: ${({ theme }) => theme.colors.gold[800]};
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const WarningIcon = styled.span`
  font-size: 1.25rem;
`;

const SuccessIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: ${({ theme }) => theme.colors.success};
  /* emerald fill — onDark (cream), not onAccent (that's reserved for gold
     fills per spec §1.1's breaking onAccent-meaning change). */
  color: ${({ theme }) => theme.colors.onDark};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ExpiredIcon = styled.div`
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

const SessionTimer = styled.div<{ $warning: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  background: ${({ $warning, theme }) =>
    $warning ? theme.colors.warningBg : theme.colors.glass.base};
  border: 1px solid ${({ $warning, theme }) =>
    $warning ? theme.colors.warning : theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.8125rem;
  color: ${({ $warning, theme }) =>
    $warning ? theme.colors.warning : theme.colors.celeste};
  transition: all 0.3s ease;

  @media (min-width: 640px) {
    font-size: 0.875rem;
  }
`;

const TimerIcon = styled.span`
  display: flex;
`;

const TimerText = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const TimerValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

const StepSection = styled.div<{ $active: boolean }>`
  display: flex;
  gap: 0.75rem;
  padding: 0.875rem;
  margin-bottom: 0.75rem;
  background: ${({ $active, theme }) => $active ? theme.colors.glass.base : 'transparent'};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.glass.border : 'transparent'};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  opacity: ${({ $active }) => $active ? 1 : 0.6};
  transition: all 0.3s ease;

  @media (min-width: 360px) {
    padding: 1rem;
    gap: 0.875rem;
  }

  @media (min-width: 480px) {
    padding: 1.25rem;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  @media (min-width: 640px) {
    padding: 1.5rem;
  }
`;

const StepNumber = styled.div`
  width: 28px;
  height: 28px;
  min-width: 28px;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.primary[500]} 0%, ${({ theme }) => theme.colors.primary[600]} 100%);
  /* lapis fill — onDark (cream), not onAccent (gold-fill only, spec §1.1). */
  color: ${({ theme }) => theme.colors.onDark};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-size: 0.75rem;
  box-shadow: 0 2px 4px ${({ theme }) => theme.colors.primary[500]}4D;

  @media (min-width: 360px) {
    width: 32px;
    height: 32px;
    min-width: 32px;
    font-size: 0.875rem;
  }
`;

const StepContent = styled.div`
  flex: 1;
  min-width: 0; /* Allow flex shrinking */
`;

const StepTitle = styled.h3`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 0.375rem 0;

  @media (min-width: 360px) {
    font-size: 1rem;
    margin: 0 0 0.5rem 0;
  }
`;

const StepDescription = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 0.75rem 0;
  line-height: 1.4;

  @media (min-width: 360px) {
    font-size: 0.875rem;
    margin: 0 0 1rem 0;
  }
`;

const QRCodeContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 1rem;
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  margin-bottom: 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.glass.border};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  position: relative;

  @media (min-width: 360px) {
    padding: 1.25rem;
    margin-bottom: 1rem;
  }

  @media (min-width: 480px) {
    padding: 1.5rem;
  }

  /* Decorative corner accents */
  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid ${({ theme }) => theme.colors.primary[500]};

    @media (min-width: 360px) {
      width: 20px;
      height: 20px;
      border-width: 3px;
    }
  }

  &::before {
    top: -2px;
    left: -2px;
    border-right: none;
    border-bottom: none;
    border-radius: ${({ theme }) => theme.borderRadius.lg} 0 0 0;
  }

  &::after {
    bottom: -2px;
    right: -2px;
    border-left: none;
    border-top: none;
    border-radius: 0 0 ${({ theme }) => theme.borderRadius.lg} 0;
  }
`;

const QRCodeImage = styled.img`
  width: 140px;
  height: 140px;
  max-width: 200px;
  border-radius: ${({ theme }) => theme.borderRadius.md};

  @media (min-width: 360px) {
    width: 160px;
    height: 160px;
  }

  @media (min-width: 480px) {
    width: 180px;
    height: 180px;
  }

  @media (min-width: 640px) {
    width: 200px;
    height: 200px;
  }
`;

const QRCodePlaceholder = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: 1rem;
`;

const QRCodeFallback = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  text-align: center;
`;

const ManualEntrySection = styled.div`
  margin-top: 0.75rem;

  @media (min-width: 360px) {
    margin-top: 1rem;
  }
`;

const ManualEntryLabel = styled.p`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 0.5rem 0;

  @media (min-width: 360px) {
    font-size: 0.75rem;
  }
`;

const SecretKeyBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: ${({ theme }) => theme.colors.cosmosDeep};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.625rem 0.75rem;

  @media (min-width: 360px) {
    padding: 0.75rem;
    gap: 0.625rem;
  }

  @media (min-width: 480px) {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }
`;

const SecretKey = styled.code`
  flex: 1;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-all;
  letter-spacing: 1px;
  line-height: 1.6;
  user-select: all;
  text-align: center;

  @media (min-width: 360px) {
    font-size: 0.75rem;
    letter-spacing: 1.5px;
  }

  @media (min-width: 480px) {
    font-size: 0.8125rem;
    letter-spacing: 2px;
    text-align: left;
  }

  @media (min-width: 640px) {
    font-size: 0.875rem;
    letter-spacing: 2.5px;
  }
`;

const CopySecretButton = styled.button<{ $copied?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  background: ${({ $copied, theme }) =>
    $copied ? theme.colors.success : theme.colors.primary[500]};
  /* emerald/lapis fill — onDark (cream), not onAccent (gold-fill only). */
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  /* Touch-friendly: min 44px height for accessibility */
  min-height: 44px;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  width: 100%;

  @media (min-width: 480px) {
    width: auto;
    min-height: 36px;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
  }

  &:hover {
    background: ${({ $copied, theme }) =>
      $copied ? theme.colors.success : theme.colors.primary[600]};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const CopyIcon = styled.span`
  display: flex;
`;

const VerificationForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const DigitInputContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.25rem;

  @media (min-width: 360px) {
    gap: 0.375rem;
  }

  @media (min-width: 480px) {
    gap: 0.5rem;
  }

  @media (min-width: 640px) {
    gap: 0.75rem;
  }
`;

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const DigitInput = styled.input<{ $filled: boolean; $error: boolean }>`
  /* Touch-friendly: min 44px for both dimensions */
  width: 36px;
  height: 44px;
  font-size: 1.25rem;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: center;
  border: 2px solid ${({ $error, $filled, theme }) =>
    $error ? theme.colors.error :
    $filled ? theme.colors.bright.lapis : theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $filled, theme }) =>
    $filled ? theme.colors.glass.hi : theme.colors.glass.base};
  transition: all 0.2s ease;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};

  @media (min-width: 360px) {
    width: 40px;
    height: 48px;
    font-size: 1.375rem;
  }

  @media (min-width: 480px) {
    width: 44px;
    height: 52px;
    font-size: 1.5rem;
  }

  @media (min-width: 640px) {
    width: 52px;
    height: 64px;
    font-size: 1.75rem;
  }

  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) =>
      $error ? theme.colors.error : theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px ${({ $error, theme }) =>
      $error ? 'rgba(240, 138, 112, 0.15)' : 'rgba(220, 185, 79, 0.15)'};
    animation: ${pulse} 0.3s ease;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  /* Hide spinner controls in number inputs */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

// The primary-CTA gold treatment (spec §4 Buttons) — this is the one gold
// budget item on the "scan" step (a custom button rather than the shared
// <Button> because it composes a spinner/lock-icon child layout).
const VerifyButton = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  /* Touch-friendly: min 44px height */
  min-height: 48px;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: ${({ disabled, theme }) => disabled ? theme.colors.muted : theme.colors.onAccent};
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.glass.base : `linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]})`};
  border: 1px solid ${({ disabled, theme }) => disabled ? theme.colors.glass.border : 'transparent'};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  box-shadow: ${({ disabled }) => disabled ? 'none' : '0 4px 14px rgba(4, 6, 18, 0.35)'};

  @media (min-width: 360px) {
    font-size: 0.9375rem;
    padding: 0.875rem 1.25rem;
  }

  @media (min-width: 480px) {
    font-size: 1rem;
    padding: 0.875rem 1.5rem;
  }

  @media (min-width: 640px) {
    padding: 1rem 1.5rem;
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
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

const LockIcon = styled.span`
  display: flex;
`;

const CancelLink = styled.button`
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 0.75rem;
  /* Touch-friendly: min 44px height */
  min-height: 44px;
  padding: 0.75rem 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  @media (min-width: 480px) {
    margin-top: 1rem;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }
`;
