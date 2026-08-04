/**
 * Reset Password — complete a password reset from the emailed link.
 *
 * PUBLIC route (registered in App.tsx alongside /login, /register,
 * /pending-activation) — the link mailed by `src/utils/email.py` points to
 * `{FRONTEND_URL}/reset-password?token=...`, and the visitor has no app JWT
 * at this point, so it cannot live behind ProtectedRoute.
 *
 * Backend contract (POST /api/v1/auth/reset-password, body {token,
 * newPassword}) — failure modes this page distinguishes rather than
 * collapsing into one generic error:
 *  - 400: token already used
 *  - 401: token invalid or expired
 *  - 422: password failed complexity validation
 * Password rules are mirrored client-side (src/models/user.py
 * UserCreate.validate_password) and shown up front, not only after a
 * rejected submission, so the user isn't bounced by a 422 they never saw
 * coming.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ShieldAlert } from 'lucide-react';
import { Button, Input, glassPanel } from '@a64core/shared';
import { authService } from '../../services/auth.service';

// Mirrors src/models/user.py UserCreate.validate_password exactly — keep
// these two in sync. Client-side enforcement here is a UX courtesy only;
// the backend is the actual source of truth and re-validates on submit.
const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character (!@#$%^&*)'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof passwordSchema>;

type ResetOutcome = 'used' | 'invalid' | 'validation' | 'transport' | null;

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Night Observatory is dark-only (T-901) — cream-on-transparent lockup is
  // correct unconditionally; see Login.tsx for the full note on why
  // `lockup_cosmos.svg` is unusable here (opaque background rect).
  const logoSrc = '/brand/lockup_transparent.svg';

  const [outcome, setOutcome] = useState<ResetOutcome>(null);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    // Guarded by the `!token` early return below at render time, but
    // handleSubmit only wires up when the form actually renders — token is
    // guaranteed non-null here. Narrow for TypeScript regardless.
    if (!token) return;

    setOutcome(null);
    setOutcomeMessage(null);
    setIsSubmitting(true);
    try {
      await authService.resetPassword(token, data.newPassword);
      navigate('/login?reset=success', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 400) {
          setOutcome('used');
        } else if (status === 401) {
          setOutcome('invalid');
        } else if (status === 422) {
          setOutcome('validation');
          const detail = err.response?.data?.detail;
          setOutcomeMessage(
            typeof detail === 'string'
              ? detail
              : 'Your new password didn’t meet the requirements below.'
          );
        } else {
          setOutcome('transport');
        }
      } else {
        setOutcome('transport');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // No token at all (bookmark, truncated link, direct navigation) — say so
  // rather than rendering a form that can never succeed.
  if (!token) {
    return (
      <PageWrapper>
        <PageContainer>
          <Card>
            <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>
            <IconWrap $tone="error" aria-hidden="true">
              <ShieldAlert size={28} strokeWidth={1.6} />
            </IconWrap>
            <Title>Reset Link Missing</Title>
            <Message role="alert" aria-live="assertive">
              This link is missing its reset token, so it can&rsquo;t be
              used to reset a password. Request a new link and use it
              directly from the email.
            </Message>
            <Button type="button" variant="primary" fullWidth onClick={() => navigate('/forgot-password')}>
              Request New Link
            </Button>
            <BackPrompt>
              <BackLink to="/login">Back to Sign In</BackLink>
            </BackPrompt>
          </Card>
        </PageContainer>
      </PageWrapper>
    );
  }

  const tokenDead = outcome === 'used' || outcome === 'invalid';

  return (
    <PageWrapper>
      <PageContainer>
        <Card>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>

          {tokenDead ? (
            <>
              <IconWrap $tone="error" aria-hidden="true">
                <ShieldAlert size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>{outcome === 'used' ? 'Link Already Used' : 'Link Invalid or Expired'}</Title>
              <Message role="alert" aria-live="assertive">
                {outcome === 'used'
                  ? 'This reset link has already been used. If you still need to change your password, request a new link.'
                  : 'This reset link is invalid or has expired. Request a new one to continue.'}
              </Message>
              <Button type="button" variant="primary" fullWidth onClick={() => navigate('/forgot-password')}>
                Request New Link
              </Button>
              <BackPrompt>
                <BackLink to="/login">Back to Sign In</BackLink>
              </BackPrompt>
            </>
          ) : (
            <>
              <Title>Reset Your Password</Title>
              <Subtitle>Choose a new password for your account.</Subtitle>

              {outcome === 'validation' && (
                <ErrorBanner role="alert" aria-live="assertive">{outcomeMessage}</ErrorBanner>
              )}
              {outcome === 'transport' && (
                <ErrorBanner role="alert" aria-live="assertive">
                  Something went wrong. Please try again in a moment.
                </ErrorBanner>
              )}

              <RequirementsList aria-label="Password requirements">
                <li>At least 8 characters</li>
                <li>One uppercase and one lowercase letter</li>
                <li>At least one number</li>
                <li>At least one special character (!@#$%^&amp;* etc.)</li>
              </RequirementsList>

              <Form onSubmit={handleSubmit(onSubmit)}>
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter your new password"
                  autoComplete="new-password"
                  error={errors.newPassword?.message}
                  fullWidth
                  {...register('newPassword')}
                />

                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  fullWidth
                  {...register('confirmPassword')}
                />

                <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                  {isSubmitting ? 'Resetting…' : 'Reset Password'}
                </Button>
              </Form>

              <BackPrompt>
                <BackLink to="/login">Back to Sign In</BackLink>
              </BackPrompt>
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
  max-width: 440px;
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

const IconWrap = styled.div<{ $tone: 'error' | 'success' }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ theme, $tone }) => ($tone === 'error' ? theme.colors.errorBg : theme.colors.successBg)};
  color: ${({ theme, $tone }) => ($tone === 'error' ? theme.colors.error : theme.colors.success)};
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

const Subtitle = styled.p`
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1.25rem 0;
`;

const Message = styled.p`
  font-size: 0.9375rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1.5rem 0;
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

const RequirementsList = styled.ul`
  text-align: left;
  list-style: none;
  margin: 0 0 1.25rem 0;
  padding: 0.75rem 1rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.8125rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.celeste};

  li::before {
    content: '\\2022';
    margin-right: 0.5rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  text-align: left;
`;

const BackPrompt = styled.p`
  text-align: center;
  margin-top: 1.5rem;
  margin-bottom: 0;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const BackLink = styled(Link)`
  color: ${({ theme }) => theme.colors.celeste};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }
`;
