import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { usePageVisibility } from '../../hooks/usePageVisibility';

// Login form sessionStorage caching constants
const LOGIN_EMAIL_CACHE_KEY = 'a64_login_email_cache';
const LOGIN_SESSION_START_KEY = 'a64_login_session_start';
const LOGIN_CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface LoginEmailCache {
  email: string;
  timestamp: number;
}

// Detect if we're on a mobile device
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768;
};

// Helper functions for login email caching
const getLoginEmailCache = (): string | null => {
  try {
    const cached = sessionStorage.getItem(LOGIN_EMAIL_CACHE_KEY);
    if (!cached) return null;

    const { email, timestamp }: LoginEmailCache = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired (30 minutes)
    if (now - timestamp > LOGIN_CACHE_EXPIRY_MS) {
      sessionStorage.removeItem(LOGIN_EMAIL_CACHE_KEY);
      return null;
    }

    return email;
  } catch {
    sessionStorage.removeItem(LOGIN_EMAIL_CACHE_KEY);
    return null;
  }
};

const setLoginEmailCache = (email: string): void => {
  try {
    const cache: LoginEmailCache = {
      email,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(LOGIN_EMAIL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
};

const clearLoginEmailCache = (): void => {
  try {
    sessionStorage.removeItem(LOGIN_EMAIL_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
};

// Session start timestamp for tracking elapsed time
const setSessionStartTime = (): void => {
  try {
    if (!sessionStorage.getItem(LOGIN_SESSION_START_KEY)) {
      sessionStorage.setItem(LOGIN_SESSION_START_KEY, Date.now().toString());
    }
  } catch {
    // Ignore storage errors
  }
};

const getSessionStartTime = (): number | null => {
  try {
    const start = sessionStorage.getItem(LOGIN_SESSION_START_KEY);
    return start ? parseInt(start, 10) : null;
  } catch {
    return null;
  }
};

const clearSessionStartTime = (): void => {
  try {
    sessionStorage.removeItem(LOGIN_SESSION_START_KEY);
  } catch {
    // Ignore
  }
};

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';
  const redirectTo = searchParams.get('redirect');
  const { login, isLoading, error, clearError, mfaRequired, mfaPendingToken, isAuthenticated } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  // Feature #347: Session preservation UX state
  const [showSessionPreserved, setShowSessionPreserved] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  // Debounce timer ref for sessionStorage caching
  const emailCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get cached email on initial load
  const cachedEmail = getLoginEmailCache();
  const wasRestored = Boolean(cachedEmail);

  // Feature #347: Initialize mobile detection and session tracking
  useEffect(() => {
    setIsMobile(isMobileDevice());
    setSessionStartTime();

    // Fade in after a short delay to prevent flash
    const fadeTimer = setTimeout(() => setIsRestoring(false), 100);

    // Smooth restore: show restored indicator if email was cached
    let preservedTimer: ReturnType<typeof setTimeout> | null = null;
    if (cachedEmail) {
      setShowSessionPreserved(true);
      // Hide indicator after 3 seconds
      preservedTimer = setTimeout(() => setShowSessionPreserved(false), 3000);
    }

    return () => {
      clearTimeout(fadeTimer);
      if (preservedTimer) clearTimeout(preservedTimer);
    };
  }, []);

  // Clear session on successful authentication
  useEffect(() => {
    if (isAuthenticated && !mfaRequired) {
      clearSessionStartTime();
    }
  }, [isAuthenticated, mfaRequired]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: cachedEmail || '',
      password: '',
    },
  });

  // Watch email field for debounced caching
  const emailValue = watch('email');

  // Debounced email caching - save email to sessionStorage after 500ms of no typing
  // SECURITY: Never store password in sessionStorage
  const debouncedCacheEmail = useCallback((email: string) => {
    if (emailCacheTimerRef.current) {
      clearTimeout(emailCacheTimerRef.current);
    }

    emailCacheTimerRef.current = setTimeout(() => {
      if (email && email.trim()) {
        setLoginEmailCache(email.trim());
      } else {
        clearLoginEmailCache();
      }
    }, 500);
  }, []);

  // Effect to cache email on change (debounced)
  useEffect(() => {
    debouncedCacheEmail(emailValue);

    // Cleanup timer on unmount
    return () => {
      if (emailCacheTimerRef.current) {
        clearTimeout(emailCacheTimerRef.current);
      }
    };
  }, [emailValue, debouncedCacheEmail]);

  // Feature #345: Handle page visibility changes for mobile app switching
  // Immediately persist state when user switches apps (no debounce delay)
  usePageVisibility({
    onHidden: useCallback(() => {
      // User is switching away (to authenticator app, etc.)
      // Immediately save email to sessionStorage (bypass debounce)
      if (emailValue && emailValue.trim()) {
        setLoginEmailCache(emailValue.trim());
      }
    }, [emailValue]),
    onVisible: useCallback(() => {
      // User returned - state was already restored from sessionStorage on mount
      // Nothing additional needed here since the form's defaultValues handles restoration
    }, []),
    onBfcacheRestore: useCallback(() => {
      // Page restored from Safari's bfcache - reload state from sessionStorage
      // This handles Safari iOS aggressive page unloading
      const freshCachedEmail = getLoginEmailCache();
      if (freshCachedEmail && freshCachedEmail !== emailValue) {
        setValue('email', freshCachedEmail);
      }
    }, [emailValue, setValue]),
  });

  // Redirect to MFA verification if required (after login detected MFA)
  useEffect(() => {
    if (mfaRequired && mfaPendingToken) {
      navigate('/mfa/verify', {
        state: {
          mfaToken: mfaPendingToken,
          email: loginEmail,
        },
        replace: true,
      });
    }
  }, [mfaRequired, mfaPendingToken, loginEmail, navigate]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated && !mfaRequired) {
      const destination = redirectTo ? decodeURIComponent(redirectTo) : '/dashboard';
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, mfaRequired, redirectTo, navigate]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      clearError();
      setLocalError(null);
      setLoginEmail(data.email);

      // Use auth store's login action which handles MFA detection
      await login(data);

      // Clear cached email after successful login (or MFA redirect)
      clearLoginEmailCache();

      // If no MFA required and authenticated, useEffect will handle redirect
      // If MFA required, the store sets mfaRequired=true and useEffect redirects to /mfa/verify
    } catch (err: any) {
      // Store already sets error for login failures
      // Only set local error if store didn't catch it
      if (!error) {
        const errorMessage = err.response?.data?.detail || 'Invalid email or password. Please try again.';
        setLocalError(typeof errorMessage === 'string' ? errorMessage : 'Invalid email or password. Please try again.');
      }
    }
  };

  const displayError = localError || error;
  const displayLoading = isLoading;

  return (
    <PageWrapper>
      <LoginContainer>
        <LoginCard>
          <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
          <Title>Welcome Back</Title>
          <Subtitle>Sign in to your account to continue</Subtitle>

          {sessionExpired && (
            <SessionExpiredBanner role="alert" aria-live="assertive">Your session has expired. Please sign in again.</SessionExpiredBanner>
          )}

          {displayError && <ErrorBanner role="alert" aria-live="assertive">{displayError}</ErrorBanner>}

          {/* Feature #347: Session preserved indicator */}
          {showSessionPreserved && wasRestored && (
            <SessionPreservedBanner role="status" aria-live="polite">
              <SessionPreservedIcon>✓</SessionPreservedIcon>
              <SessionPreservedText>
                Session restored — your email was remembered
              </SessionPreservedText>
            </SessionPreservedBanner>
          )}

          <LoginForm onSubmit={handleSubmit(onSubmit)} $isRestoring={isRestoring}>
            <Input
              label="Email"
              type="email"
              placeholder="your.email@example.com"
              error={errors.email?.message}
              fullWidth
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              fullWidth
              {...register('password')}
            />

            {/* Feature #347: Mobile helper text for MFA flow */}
            {isMobile && emailValue && (
              <MobileHelperText>
                <MobileHelperIcon>📱</MobileHelperIcon>
                You can safely switch to your authenticator app after signing in
              </MobileHelperText>
            )}

            <ForgotPasswordLink to="/forgot-password">
              Forgot password?
            </ForgotPasswordLink>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={displayLoading}
            >
              {displayLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </LoginForm>

          <RegisterPrompt>
            Don't have an account?{' '}
            <RegisterLink to="/register">Sign up</RegisterLink>
          </RegisterPrompt>
        </LoginCard>
      </LoginContainer>
    </PageWrapper>
  );
}

const PageWrapper = styled.div`
  width: 100vw;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
`;

const LoginContainer = styled.div`
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

const LoginCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 440px;
    border-radius: ${({ theme }) => theme.borderRadius.xl};
  }
`;

const Logo = styled.div`
  font-size: 1.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};
  text-align: center;
  margin-bottom: 0.75rem;

  @media (min-width: 640px) {
    font-size: 2.25rem;
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
    font-size: 1.875rem;
  }
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin: 0 0 1.5rem 0;

  @media (min-width: 640px) {
    font-size: 1rem;
    margin-bottom: 2rem;
  }
`;

const SessionExpiredBanner = styled.div`
  background: ${({ theme }) => `${theme.colors.warning}15`};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.warning};
  font-size: 0.875rem;
  text-align: center;
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

// Feature #347: Fade in animation for smooth restore
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const LoginForm = styled.form<{ $isRestoring?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: ${fadeIn} 0.3s ease-out;
  opacity: ${({ $isRestoring }) => ($isRestoring ? 0 : 1)};
  transition: opacity 0.2s ease-out;

  @media (min-width: 640px) {
    gap: 1.25rem;
  }
`;

// Feature #347: Session preserved indicator styles
const SessionPreservedBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #10b981;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: 1rem;
  animation: ${slideIn} 0.4s ease-out;
`;

const SessionPreservedIcon = styled.span`
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
`;

const SessionPreservedText = styled.span`
  font-size: 0.8125rem;
  color: #065f46;
  font-weight: 500;
`;

// Feature #347: Mobile helper text for MFA flow
const MobileHelperText = styled.p`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  line-height: 1.4;
  animation: ${fadeIn} 0.3s ease-out;

  @media (min-width: 768px) {
    display: none;
  }
`;

const MobileHelperIcon = styled.span`
  font-size: 0.875rem;
  flex-shrink: 0;
`;

const ForgotPasswordLink = styled(Link)`
  /* WCAG AA: primary.700 (#1976D2) provides 4.60:1 contrast with white background */
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: 0.875rem;
  text-decoration: none;
  align-self: flex-end;
  margin-top: -0.5rem;

  &:hover {
    text-decoration: underline;
  }
`;

const RegisterPrompt = styled.p`
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 0;
`;

const RegisterLink = styled(Link)`
  /* WCAG AA: primary.700 (#1976D2) provides 4.60:1 contrast with white background */
  color: ${({ theme }) => theme.colors.primary[700]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
