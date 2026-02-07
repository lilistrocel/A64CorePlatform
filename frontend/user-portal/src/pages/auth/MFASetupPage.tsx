import { useState, useRef, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@a64core/shared';
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
  const { loadUser } = useAuthStore();
  const queryClient = useQueryClient();

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

    const cacheTimestamp = getMFASetupCacheTimestamp();
    if (!cacheTimestamp) {
      return;
    }

    const updateTimer = () => {
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
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
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
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            <Title>Setup Failed</Title>
            <ErrorBanner>{error}</ErrorBanner>
            <ButtonGroup>
              <Button variant="primary" onClick={handleRetry}>
                Try Again
              </Button>
              <Button variant="secondary" onClick={() => navigate('/settings')}>
                Back to Settings
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
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            <ExpiredIcon>⏱️</ExpiredIcon>
            <Title>Session Expired</Title>
            <Subtitle>
              Your MFA setup session has expired for security reasons.
              Please generate a new QR code to continue.
            </Subtitle>
            <ButtonGroup>
              <Button variant="primary" onClick={handleRegenerateCode}>
                Generate New Code
              </Button>
              <Button variant="secondary" onClick={() => navigate('/settings')}>
                Back to Settings
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
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            <SuccessIcon>&#10003;</SuccessIcon>
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
          <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
          <Title>Set Up Two-Factor Authentication</Title>
          <Subtitle>Scan the QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</Subtitle>

          {/* Session timeout indicator */}
          <SessionTimer $warning={timeRemaining < 2 * 60 * 1000}>
            <TimerIcon>⏱️</TimerIcon>
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
                        <CopyIcon>✓</CopyIcon>
                        Copied!
                      </>
                    ) : (
                      <>
                        <CopyIcon>📋</CopyIcon>
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
                      <LockIcon>🔐</LockIcon>
                      Verify & Enable MFA
                    </>
                  )}
                </VerifyButton>
              </VerificationForm>
            </StepContent>
          </StepSection>

          <CancelLink onClick={() => navigate('/settings')}>
            Cancel Setup
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

const SetupCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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

const LoadingSpinner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 0;
`;

const SpinnerIcon = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.neutral[200]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
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
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  color: #92400e;
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
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
`;

const ExpiredIcon = styled.div`
  width: 60px;
  height: 60px;
  margin: 0 auto 1rem;
  background: ${({ theme }) => theme.colors.warning || '#F59E0B'};
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
`;

const SessionTimer = styled.div<{ $warning: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  background: ${({ $warning, theme }) =>
    $warning ? 'rgba(245, 158, 11, 0.1)' : theme.colors.neutral[50]};
  border: 1px solid ${({ $warning, theme }) =>
    $warning ? 'rgba(245, 158, 11, 0.3)' : theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.8125rem;
  color: ${({ $warning, theme }) =>
    $warning ? '#92400e' : theme.colors.textSecondary};
  transition: all 0.3s ease;

  @media (min-width: 640px) {
    font-size: 0.875rem;
  }
`;

const TimerIcon = styled.span`
  font-size: 1rem;
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
  background: ${({ $active, theme }) => $active ? theme.colors.neutral[50] : 'transparent'};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.neutral[200] : 'transparent'};
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
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-size: 0.75rem;
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);

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
  background: white;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  margin-bottom: 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
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
  background: ${({ theme }) => theme.colors.neutral[100]};
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
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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
  color: white;
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
  font-size: 0.875rem;
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
    $filled ? theme.colors.primary[500] : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $filled, theme }) =>
    $filled ? theme.colors.primary[50] : theme.colors.background};
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
      $error ? theme.colors.error : theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ $error, theme }) =>
      $error ? `${theme.colors.error}20` : theme.colors.primary[100]};
    animation: ${pulse} 0.3s ease;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.neutral[300]};
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
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: white;
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.neutral[300] : `linear-gradient(135deg, ${theme.colors.primary[500]} 0%, ${theme.colors.primary[600]} 100%)`};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  box-shadow: ${({ disabled }) => disabled ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'};

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
    box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15), 0 3px 5px -1px rgba(0, 0, 0, 0.08);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
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

const LockIcon = styled.span`
  font-size: 1.125rem;
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
