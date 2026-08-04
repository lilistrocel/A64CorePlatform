import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Check, Cloud, Smartphone } from 'lucide-react';
import { Button, Input, glassPanel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { authService, type CfAccessStatusResponse } from '../../services/auth.service';

// Cloudflare Access is a tunnel/edge feature — the box itself always
// bypasses it on plain http://localhost (this file's own break-glass path,
// mirroring the backend's `_is_local_request` discriminator). Used only to
// decide whether the password form should still render under
// CF_ACCESS_EXCLUSIVE; never used as a security boundary client-side.
const isLocalHost = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

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
  const passwordResetSuccess = searchParams.get('reset') === 'success';
  const redirectTo = searchParams.get('redirect');
  const {
    login,
    isLoading,
    error,
    clearError,
    mfaRequired,
    mfaPendingToken,
    isAuthenticated,
    cfAccessLogin,
    pendingActivation,
  } = useAuthStore();
  // The lockup ships as separate cream/cosmos-text SVGs plus a `transparent`
  // variant (cream-coloured content, no background rect). `lockup_cosmos.svg`
  // is NOT transparent — it bakes in its own opaque `#0E1330` background
  // rectangle, which shows as a visible box seam against this card's
  // glassPanel gradient / the Night Observatory Sky layer behind it. Use the
  // transparent lockup so the logo composites onto the glass card instead of
  // sitting in its own tile. Night Observatory is dark-only (T-901), so the
  // cream-on-transparent lockup is correct unconditionally; the theme-mode
  // branch that used to pick between cosmos/cream is gone with light mode.
  const logoSrc = '/brand/lockup_transparent.svg';
  const [localError, setLocalError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  // Cloudflare Access — status is fetched once (authService memoizes the
  // network call across every caller, including ProtectedRoute).
  const [cfStatus, setCfStatus] = useState<CfAccessStatusResponse | null>(null);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);

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

  // Redirect to the pending-activation screen once a Cloudflare Access
  // exchange recognizes the identity but the account awaits admin approval.
  useEffect(() => {
    if (pendingActivation) {
      navigate('/pending-activation', { replace: true });
    }
  }, [pendingActivation, navigate]);

  // Fetch Cloudflare Access status once on mount. Failure just leaves the
  // button hidden (fail-closed) — password login remains fully usable.
  useEffect(() => {
    let cancelled = false;
    authService
      .cfAccessStatus()
      .then((status) => {
        if (!cancelled) setCfStatus(status);
      })
      .catch(() => {
        if (!cancelled) setCfStatus({ enabled: false, exclusive: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCfAccessLogin = async () => {
    setCfError(null);
    setCfLoading(true);
    try {
      await cfAccessLogin();
      // Success (including the MFA-challenge and pending-activation
      // branches) is handled entirely by the effects above, watching
      // isAuthenticated / mfaRequired / pendingActivation.
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setCfError('No active Cloudflare Access session was found. Sign in through Cloudflare first, then try again.');
      } else if (status === 404) {
        setCfError('Cloudflare Access is not enabled for this deployment.');
      } else {
        setCfError('Unable to sign in with Cloudflare Access. Please try again or use your password below.');
      }
    } finally {
      setCfLoading(false);
    }
  };

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

  // Cloudflare Access rendering rules (spec: frontend scope):
  //  - Button shows whenever the deployment has it enabled.
  //  - The password form is hidden entirely only once BOTH exclusive mode is
  //    on AND the page was actually served through Cloudflare — the local
  //    break-glass form must keep working on http://localhost regardless of
  //    the exclusive flag.
  const showCfButton = cfStatus?.enabled === true;
  const hidePasswordForm = cfStatus?.exclusive === true && !isLocalHost();

  return (
    <PageWrapper>
      <LoginContainer>
        <LoginCard>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
          <Tagline>Order, born from many.</Tagline>
          <Title>Welcome Back</Title>
          <Subtitle>Sign in to your account to continue</Subtitle>

          {sessionExpired && (
            <SessionExpiredBanner role="alert" aria-live="assertive">Your session has expired. Please sign in again.</SessionExpiredBanner>
          )}

          {passwordResetSuccess && (
            <PasswordResetSuccessBanner role="status" aria-live="polite">
              Your password has been reset. Sign in with your new password.
            </PasswordResetSuccessBanner>
          )}

          {displayError && <ErrorBanner role="alert" aria-live="assertive">{displayError}</ErrorBanner>}

          {/* Feature #347: Session preserved indicator */}
          {showSessionPreserved && wasRestored && (
            <SessionPreservedBanner role="status" aria-live="polite">
              <SessionPreservedIcon><Check size={12} strokeWidth={2.5} /></SessionPreservedIcon>
              <SessionPreservedText>
                Session restored — your email was remembered
              </SessionPreservedText>
            </SessionPreservedBanner>
          )}

          {showCfButton && (
            <>
              {cfError && <ErrorBanner role="alert" aria-live="assertive">{cfError}</ErrorBanner>}
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={displayLoading}
                aria-label="Sign in with Cloudflare Access"
                onClick={handleCfAccessLogin}
              >
                <Cloud size={18} strokeWidth={1.8} />
                {cfLoading ? 'Connecting…' : 'Sign in with Cloudflare Access'}
              </Button>

              {!hidePasswordForm && (
                <Divider role="separator" aria-orientation="horizontal">
                  <DividerLine />
                  <DividerText>or</DividerText>
                  <DividerLine />
                </Divider>
              )}
            </>
          )}

          {!hidePasswordForm && (
            <>
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
                    <MobileHelperIcon><Smartphone size={14} strokeWidth={1.8} /></MobileHelperIcon>
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
            </>
          )}
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
  /* Night Observatory (spec §0/§7): auth screens carry no sidebar, so the
     fixed Sky layer mounted at the app shell IS the entire backdrop here —
     no opaque/gradient ground on top of it. */
  padding: 1rem;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const LoginCard = styled.div`
  ${glassPanel}
  border-radius: 22px;
  padding: 1.5rem;
  width: 100%;
  max-width: 400px;

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 440px;
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
  /* Bounded responsive height. Logo is banner-shaped (~2.9:1), so a
     200px height gives ~580px width — overflows a 440px card.
     Capped at 120px to keep width ≤ 350px on desktop. */
  height: clamp(56px, 8vw, 120px);
  width: auto;
  display: block;
  margin: 0 auto;
`;

// Night Observatory (spec §0/§6.1 shard note): the app's ONE Fraunces
// italic accent outside empty states — editorial-only, never on UI controls.
const Tagline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.celeste};
  text-align: center;
  margin: 0 0 1.25rem 0;

  @media (min-width: 640px) {
    font-size: 1.0625rem;
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
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.warning};
  font-size: 0.875rem;
  text-align: center;
`;

// Shown after a successful /reset-password submission redirects here with
// ?reset=success (see ResetPassword.tsx). Success-toned, distinct from the
// warning-toned SessionExpiredBanner above.
const PasswordResetSuccessBanner = styled.div`
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid ${({ theme }) => theme.colors.success};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.success};
  font-size: 0.875rem;
  text-align: center;
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

// Divider between the Cloudflare Access button and the password form.
const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.25rem 0;
`;

const DividerLine = styled.span`
  flex: 1;
  height: 1px;
  background: ${({ theme }) => theme.colors.line};
`;

const DividerText = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
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
  background: ${({ theme }) => theme.colors.successBg};
  border: 1px solid ${({ theme }) => theme.colors.success};
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
  background: ${({ theme }) => theme.colors.success};
  /* success/emerald fill — onDark (cream), NOT onAccent (that's reserved for
     gold fills per spec §1.1's breaking onAccent-meaning change). */
  color: ${({ theme }) => theme.colors.onDark};
  border-radius: 50%;
  flex-shrink: 0;
`;

const SessionPreservedText = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.bright.emerald};
  font-weight: 500;
`;

// Feature #347: Mobile helper text for MFA flow
const MobileHelperText = styled.p`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: ${({ theme }) => theme.colors.cosmosDeep};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  line-height: 1.4;
  animation: ${fadeIn} 0.3s ease-out;

  @media (min-width: 768px) {
    display: none;
  }
`;

const MobileHelperIcon = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.celeste};
`;

// Secondary-emphasis link (spec §3: "Secondary emphasis is celeste, never
// gold" — this is not one of the gold-budget items).
const ForgotPasswordLink = styled(Link)`
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.875rem;
  text-decoration: none;
  align-self: flex-end;
  margin-top: -0.5rem;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }
`;

const RegisterPrompt = styled.p`
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 0;
`;

const RegisterLink = styled(Link)`
  color: ${({ theme }) => theme.colors.celeste};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }
`;
