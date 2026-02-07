import { useState, useEffect } from 'react';
import styled from 'styled-components';
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
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);

  // Redirect to login if no MFA token
  useEffect(() => {
    if (!mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [mfaToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const code = inputMode === 'totp' ? totpCode : backupCode;
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
      setError(typeof errorMessage === 'string' ? errorMessage : 'Invalid code. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleToggleMode = () => {
    setInputMode(mode => mode === 'totp' ? 'backup' : 'totp');
    setError(null);
    setTotpCode('');
    setBackupCode('');
  };

  const handleTotpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(value);
    setError(null);
  };

  const handleBackupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow alphanumeric characters and hyphens, max 9 chars (XXXX-XXXX format)
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
    setBackupCode(value);
    setError(null);
  };

  const isCodeValid = inputMode === 'totp' ? totpCode.length === 6 : backupCode.length >= 8;

  if (!mfaToken) {
    return null; // Will redirect
  }

  // Show warning message after successful login with backup code
  if (warningMessage) {
    return (
      <PageWrapper>
        <VerifyContainer>
          <VerifyCard>
            <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
            <WarningIcon>&#9888;</WarningIcon>
            <Title>Backup Code Warning</Title>
            <WarningBanner>
              {warningMessage}
            </WarningBanner>
            {backupCodesRemaining !== null && backupCodesRemaining <= 3 && (
              <BackupCodesInfo>
                You have <strong>{backupCodesRemaining}</strong> backup code{backupCodesRemaining !== 1 ? 's' : ''} remaining.
              </BackupCodesInfo>
            )}
            <Subtitle>
              Redirecting to dashboard... You can regenerate backup codes in Settings &gt; Security.
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
          <Title>Two-Factor Authentication</Title>
          <Subtitle>
            {inputMode === 'totp'
              ? 'Enter the 6-digit code from your authenticator app'
              : 'Enter one of your backup codes'}
          </Subtitle>

          {email && <EmailHint>Logging in as: {email}</EmailHint>}

          {error && <ErrorBanner role="alert" aria-live="assertive">{error}</ErrorBanner>}

          <VerifyForm onSubmit={handleSubmit}>
            {inputMode === 'totp' ? (
              <CodeInputContainer>
                <CodeLabel>Authentication Code</CodeLabel>
                <TotpInput
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={handleTotpChange}
                  autoFocus
                  autoComplete="one-time-code"
                  aria-label="6-digit verification code"
                />
              </CodeInputContainer>
            ) : (
              <CodeInputContainer>
                <CodeLabel>Backup Code</CodeLabel>
                <BackupInput
                  type="text"
                  maxLength={9}
                  placeholder="XXXX-XXXX"
                  value={backupCode}
                  onChange={handleBackupChange}
                  autoFocus
                  aria-label="8-character backup code"
                />
                <BackupCodeHint>
                  Enter an 8-character code in XXXX-XXXX format
                </BackupCodeHint>
              </CodeInputContainer>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={!isCodeValid || isSubmitting}
            >
              {isSubmitting ? 'Verifying...' : 'Verify'}
            </Button>
          </VerifyForm>

          <ToggleModeLink onClick={handleToggleMode}>
            {inputMode === 'totp'
              ? 'Use a backup code instead'
              : 'Use authenticator app instead'}
          </ToggleModeLink>

          <Divider />

          <BackToLogin to="/login">
            &larr; Back to login
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
