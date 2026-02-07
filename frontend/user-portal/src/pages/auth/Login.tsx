import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';

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

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      clearError();
      setLocalError(null);
      setLocalLoading(true);

      // First, check if MFA is required using direct axios call
      const response = await axios.post<any>('/api/v1/auth/login', data);

      // Check if MFA is required
      if (response.data.mfaRequired === true) {
        const mfaResponse = response.data as MFALoginResponse;
        // Redirect to MFA verification page with token
        navigate('/mfa/verify', {
          state: {
            mfaToken: mfaResponse.mfaToken,
            email: data.email,
          },
          replace: true,
        });
        return;
      }

      // No MFA required - use normal login flow
      await login(data);
      // Redirect to intended page if provided, otherwise dashboard
      const destination = redirectTo ? decodeURIComponent(redirectTo) : '/dashboard';
      navigate(destination);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Invalid email or password. Please try again.';
      setLocalError(typeof errorMessage === 'string' ? errorMessage : 'Invalid email or password. Please try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  const displayError = localError || error;
  const displayLoading = localLoading || isLoading;

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

          <LoginForm onSubmit={handleSubmit(onSubmit)}>
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

const LoginForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;

  @media (min-width: 640px) {
    gap: 1.25rem;
  }
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
