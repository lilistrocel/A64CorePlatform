/**
 * Verify Email — confirm an address using the token mailed at registration.
 *
 * PUBLIC route (registered in App.tsx alongside /login, /register,
 * /pending-activation) — the link mailed by `src/utils/email.py` points to
 * `{FRONTEND_URL}/verify-email?token=...`, and the visitor may not have an
 * app session at all when they click it, so this cannot live behind
 * ProtectedRoute.
 *
 * StrictMode double-invoke guard (CRITICAL — do not remove):
 * React 18 StrictMode intentionally double-invokes effects in development.
 * The verify-email token is single-use — a second call against the same
 * token would hit the backend's "already used" (400) branch and this page
 * would misreport a fresh, valid link as already-verified. `calledRef`
 * below ensures the network call fires exactly once per mount regardless
 * of how many times the effect body itself runs.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import axios from 'axios';
import { CheckCircle2, XCircle, MailCheck, ShieldAlert } from 'lucide-react';
import { Button, glassPanel } from '@a64core/shared';
import { authService } from '../../services/auth.service';

type VerifyState = 'pending' | 'success' | 'alreadyVerified' | 'invalid' | 'missingToken' | 'error';

export function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Night Observatory is dark-only (T-901) — cream-on-transparent lockup is
  // correct unconditionally; see Login.tsx for the full note on why
  // `lockup_cosmos.svg` is unusable here (opaque background rect).
  const logoSrc = '/brand/lockup_transparent.svg';

  const [state, setState] = useState<VerifyState>(token ? 'pending' : 'missingToken');
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    if (calledRef.current) return;
    calledRef.current = true;

    authService
      .verifyEmail(token)
      .then(() => {
        setState('success');
      })
      .catch((err: unknown) => {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 400) {
            // Already used — most commonly because the address was already
            // verified (e.g. a second click, or the link was opened twice).
            // Not an alarming outcome; the page below deliberately does not
            // present this as an error.
            setState('alreadyVerified');
          } else if (status === 401) {
            setState('invalid');
          } else {
            setState('error');
          }
        } else {
          setState('error');
        }
      });
  }, [token]);

  return (
    <PageWrapper>
      <PageContainer>
        <Card>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>

          {state === 'pending' && (
            <>
              <IconWrap $tone="neutral" aria-hidden="true">
                <MailCheck size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Verifying Your Email</Title>
              <Message role="status" aria-live="polite">
                Hold on a moment while we confirm your email address…
              </Message>
            </>
          )}

          {state === 'success' && (
            <>
              <IconWrap $tone="success" aria-hidden="true">
                <CheckCircle2 size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Email Verified</Title>
              <Message role="status" aria-live="polite">
                Your email address has been confirmed. You&rsquo;re all set.
              </Message>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
                Continue to Sign In
              </Button>
            </>
          )}

          {state === 'alreadyVerified' && (
            <>
              <IconWrap $tone="success" aria-hidden="true">
                <CheckCircle2 size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Already Verified</Title>
              <Message role="status" aria-live="polite">
                This email address has already been verified — there&rsquo;s
                nothing more to do here.
              </Message>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
                Continue to Sign In
              </Button>
            </>
          )}

          {state === 'invalid' && (
            <>
              <IconWrap $tone="error" aria-hidden="true">
                <ShieldAlert size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Link Invalid or Expired</Title>
              <Message role="alert" aria-live="assertive">
                This verification link is invalid or has expired. Sign in
                and request a new verification email from your account
                settings.
              </Message>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
                Go to Sign In
              </Button>
            </>
          )}

          {state === 'missingToken' && (
            <>
              <IconWrap $tone="error" aria-hidden="true">
                <ShieldAlert size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Verification Link Incomplete</Title>
              <Message role="alert" aria-live="assertive">
                This link is missing its verification token, so it
                can&rsquo;t confirm your email. Open the link directly from
                the email we sent you, or sign in and request a new one.
              </Message>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
                Go to Sign In
              </Button>
            </>
          )}

          {state === 'error' && (
            <>
              <IconWrap $tone="error" aria-hidden="true">
                <XCircle size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Something Went Wrong</Title>
              <Message role="alert" aria-live="assertive">
                We couldn&rsquo;t verify your email right now. Please try
                again in a moment.
              </Message>
              <Button type="button" variant="secondary" fullWidth onClick={() => navigate('/login')}>
                Back to Sign In
              </Button>
            </>
          )}
        </Card>
      </PageContainer>
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

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const Card = styled.div`
  ${glassPanel}
  border-radius: 22px;
  padding: 1.5rem;
  width: 100%;
  max-width: 420px;
  text-align: center;

  @media (min-width: 640px) {
    padding: 2rem;
  }
`;

const Logo = styled.div`
  margin-bottom: 1rem;
`;

const LogoImg = styled.img`
  height: clamp(48px, 7vw, 96px);
  width: auto;
  display: block;
  margin: 0 auto;
`;

const IconWrap = styled.div<{ $tone: 'success' | 'error' | 'neutral' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ theme, $tone }) => {
    if ($tone === 'success') return theme.colors.successBg;
    if ($tone === 'error') return theme.colors.errorBg;
    return theme.colors.glass.base;
  }};
  color: ${({ theme, $tone }) => {
    if ($tone === 'success') return theme.colors.success;
    if ($tone === 'error') return theme.colors.error;
    return theme.colors.celeste;
  }};
  margin: 0 auto 1rem;
`;

const Title = styled.h1`
  font-size: 1.375rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 0.75rem 0;

  @media (min-width: 640px) {
    font-size: 1.625rem;
  }
`;

const Message = styled.p`
  font-size: 0.9375rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1.5rem 0;
`;
