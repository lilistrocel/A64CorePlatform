import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';

// Validation schema
const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function Register() {
  const navigate = useNavigate();
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      clearError();
      await registerUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      });
      navigate('/dashboard');
    } catch (err) {
      // Error is handled by the store
    }
  };

  return (
    <PageWrapper>
      <RegisterContainer>
        <RegisterCard>
          <Logo><LogoImg src="/a64logo_dark.png" alt="A64 Core" /></Logo>
          <Title>Create Account</Title>
          <Subtitle>Join us to get started with your ERP platform</Subtitle>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <RegisterForm onSubmit={handleSubmit(onSubmit)}>
            <FormRow>
              <Input
                label="First Name"
                type="text"
                placeholder="John"
                error={errors.firstName?.message}
                fullWidth
                {...register('firstName')}
              />

              <Input
                label="Last Name"
                type="text"
                placeholder="Doe"
                error={errors.lastName?.message}
                fullWidth
                {...register('lastName')}
              />
            </FormRow>

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
              placeholder="Create a strong password"
              error={errors.password?.message}
              fullWidth
              {...register('password')}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              error={errors.confirmPassword?.message}
              fullWidth
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </RegisterForm>

          <LoginPrompt>
            Already have an account?{' '}
            <LoginLink to="/login">Sign in</LoginLink>
          </LoginPrompt>
        </RegisterCard>
      </RegisterContainer>
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

const RegisterContainer = styled.div`
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

const RegisterCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;

  @media (min-width: 640px) {
    padding: 2rem;
    max-width: 540px;
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

const RegisterForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;

  @media (min-width: 640px) {
    gap: 1.25rem;
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;

  @media (min-width: 640px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const LoginPrompt = styled.p`
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 0;
`;

const LoginLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary[500]};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;
