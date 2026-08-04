/**
 * Forgot Password — request a password-reset email.
 *
 * PUBLIC route (registered in App.tsx alongside /login, /register,
 * /pending-activation) — linked from Login.tsx's "Forgot password?" link,
 * reachable while signed out, which is the entire point.
 *
 * Anti-enumeration (CRITICAL — do not "improve" this):
 * POST /api/v1/auth/request-password-reset always returns 200, whether or
 * not the address is registered, specifically so this UI cannot be used to
 * discover which emails exist in the system. This page therefore shows the
 * exact same neutral confirmation on every successful submission and never
 * branches copy on the response body. Only transport failures (network
 * down, 5xx) get a distinct — but still account-existence-blind — error
 * banner, since those say nothing about the address either.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Mail } from 'lucide-react';
import { Button, Input, glassPanel } from '@a64core/shared';
import { authService } from '../../services/auth.service';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export function ForgotPassword() {
  // Night Observatory is dark-only (T-901) — cream-on-transparent lockup is
  // correct unconditionally. Use the `transparent` variant, not
  // `lockup_cosmos.svg` — that one bakes in its own opaque `#0E1330`
  // background rect, which shows as a visible box seam against this card's
  // glassPanel gradient (see Login.tsx for the same note).
  const logoSrc = '/brand/lockup_transparent.svg';

  const [submitted, setSubmitted] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setTransportError(null);
    setIsSubmitting(true);
    try {
      await authService.requestPasswordReset(data.email);
      // Always the same confirmation, regardless of whether the address
      // was known — do not read/branch on the response body here.
      setSubmitted(true);
    } catch (err: unknown) {
      // A genuine transport failure (network down, 5xx). This says nothing
      // about the address's existence — the request never reached the
      // point where that would be decided — so a distinct error banner
      // here does not weaken the anti-enumeration property.
      if (axios.isAxiosError(err) && !err.response) {
        setTransportError('Network error. Please check your connection and try again.');
      } else {
        setTransportError('Something went wrong. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <PageContainer>
        <Card>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>

          {submitted ? (
            <>
              <IconWrap aria-hidden="true">
                <Mail size={28} strokeWidth={1.6} />
              </IconWrap>
              <Title>Check Your Email</Title>
              <Message role="status" aria-live="polite">
                If that address is registered, a reset link is on its way.
                It may take a few minutes to arrive — check your spam
                folder if you don&rsquo;t see it.
              </Message>
              <BackLink to="/login">Back to Sign In</BackLink>
            </>
          ) : (
            <>
              <Title>Forgot Password?</Title>
              <Subtitle>
                Enter the email address on your account and we&rsquo;ll send
                you a link to reset your password.
              </Subtitle>

              {transportError && (
                <ErrorBanner role="alert" aria-live="assertive">{transportError}</ErrorBanner>
              )}

              <Form onSubmit={handleSubmit(onSubmit)}>
                <Input
                  label="Email"
                  type="email"
                  placeholder="your.email@example.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  fullWidth
                  {...register('email')}
                />

                <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                  {isSubmitting ? 'Sending…' : 'Send Reset Link'}
                </Button>
              </Form>

              <BackPrompt>
                Remembered your password? <BackLink to="/login">Sign in</BackLink>
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

const IconWrap = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.successBg};
  color: ${({ theme }) => theme.colors.success};
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
  margin: 0 0 1.5rem 0;
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
