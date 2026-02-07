import { useState, useEffect, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@a64core/shared';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { BackupCodesModal } from '../../components/auth/BackupCodesModal';

interface MFASetupResponse {
  secret: string;
  qrCodeUri: string;
  qrCodeDataUrl: string | null;
  message: string;
}

interface MFAEnableResponse {
  enabled: boolean;
  backupCodes: string[];
  message: string;
}

export function MFASetupPage() {
  const navigate = useNavigate();
  const { user, loadUser } = useAuthStore();

  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'backup' | 'error'>('loading');
  const [setupData, setSetupData] = useState<MFASetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize MFA setup from /api/v1/auth/mfa/setup on mount (POST request)
  useEffect(() => {
    const fetchSetupData = async () => {
      try {
        setStep('loading');
        const response = await apiClient.post<MFASetupResponse>('/v1/auth/mfa/setup');
        setSetupData(response.data);
        setStep('scan');
      } catch (err: any) {
        const message = err.response?.data?.detail || 'Failed to initialize MFA setup';
        setError(message);
        setStep('error');
      }
    };

    fetchSetupData();
  }, []);

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

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiClient.post<MFAEnableResponse>('/v1/auth/mfa/enable', {
        totpCode: codeString,
      });

      if (response.data.enabled) {
        setBackupCodes(response.data.backupCodes);
        setStep('backup');
        // Reload user to update MFA status
        await loadUser();
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Invalid verification code. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    navigate('/settings');
  };

  const handleRetry = () => {
    setError(null);
    setStep('loading');
    window.location.reload();
  };

  if (step === 'loading') {
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
          <StepSection $active={step === 'scan' || step === 'verify'}>
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
                  disabled={getCodeString().length !== 6 || isSubmitting}
                  $loading={isSubmitting}
                >
                  {isSubmitting ? (
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
  padding: 1rem;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const SetupCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 520px;
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

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

const StepSection = styled.div<{ $active: boolean }>`
  display: flex;
  gap: 1rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
  background: ${({ $active, theme }) => $active ? theme.colors.neutral[50] : 'transparent'};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.neutral[200] : 'transparent'};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  opacity: ${({ $active }) => $active ? 1 : 0.6};
  transition: all 0.3s ease;

  @media (min-width: 640px) {
    padding: 1.5rem;
  }
`;

const StepNumber = styled.div`
  width: 32px;
  height: 32px;
  min-width: 32px;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.primary[500]} 0%, ${({ theme }) => theme.colors.primary[600]} 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  font-size: 0.875rem;
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.h3`
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 0.5rem 0;
`;

const StepDescription = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1rem 0;
`;

const QRCodeContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 1.5rem;
  background: white;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  margin-bottom: 1rem;
  border: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  position: relative;

  /* Decorative corner accents */
  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid ${({ theme }) => theme.colors.primary[500]};
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
  width: 180px;
  height: 180px;
  border-radius: ${({ theme }) => theme.borderRadius.md};

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
  margin-top: 1rem;
`;

const ManualEntryLabel = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 0.5rem 0;
`;

const SecretKeyBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem 1rem;
`;

const SecretKey = styled.code`
  flex: 1;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-all;
  letter-spacing: 2px;
  line-height: 1.5;
  user-select: all;

  @media (min-width: 640px) {
    font-size: 0.875rem;
    letter-spacing: 2.5px;
  }
`;

const CopySecretButton = styled.button<{ $copied?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: ${({ $copied, theme }) =>
    $copied ? theme.colors.success : theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

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
  gap: 0.5rem;

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
  width: 40px;
  height: 52px;
  font-size: 1.5rem;
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
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: white;
  background: ${({ disabled, theme }) =>
    disabled ? theme.colors.neutral[300] : `linear-gradient(135deg, ${theme.colors.primary[500]} 0%, ${theme.colors.primary[600]} 100%)`};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  box-shadow: ${({ disabled }) => disabled ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15), 0 3px 5px -1px rgba(0, 0, 0, 0.08);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  @media (min-width: 640px) {
    padding: 1rem 1.5rem;
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
  margin-top: 1rem;
  padding: 0.5rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }
`;
