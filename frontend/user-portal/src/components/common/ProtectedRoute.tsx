import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '@a64core/shared';

// Routes allowed during MFA setup period (without full access)
const MFA_SETUP_ALLOWED_ROUTES = ['/mfa/setup', '/logout'];

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();
  const location = useLocation();
  const [showMfaBanner, setShowMfaBanner] = useState(false);

  useEffect(() => {
    // Load user data if authenticated but user not loaded
    if (isAuthenticated && !user && !isLoading) {
      loadUser();
    }
  }, [isAuthenticated, user, isLoading, loadUser]);

  // Check if MFA setup is required and show banner
  useEffect(() => {
    if (user?.mfaSetupRequired && !user?.mfaEnabled) {
      setShowMfaBanner(true);
    } else {
      setShowMfaBanner(false);
    }
  }, [user?.mfaSetupRequired, user?.mfaEnabled]);

  if (isLoading) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading...</LoadingText>
      </LoadingContainer>
    );
  }

  if (!isAuthenticated) {
    // Encode the current path + search params as redirect URL
    const redirectTo = location.pathname + location.search;
    const loginUrl = redirectTo && redirectTo !== '/' && redirectTo !== '/dashboard'
      ? `/login?redirect=${encodeURIComponent(redirectTo)}`
      : '/login';
    return <Navigate to={loginUrl} replace />;
  }

  // Check if MFA setup is required
  if (user?.mfaSetupRequired && !user?.mfaEnabled) {
    // Check if current route is allowed during MFA setup period
    const isAllowedRoute = MFA_SETUP_ALLOWED_ROUTES.some(route =>
      location.pathname.startsWith(route)
    );

    if (!isAllowedRoute) {
      // Redirect to MFA setup page
      return <Navigate to="/mfa/setup" replace />;
    }
  }

  // Show MFA setup banner if required (for allowed routes like /mfa/setup)
  if (showMfaBanner && location.pathname === '/mfa/setup') {
    return (
      <>
        <MfaSetupBanner role="alert" aria-live="polite">
          <BannerIcon>🔐</BannerIcon>
          <BannerText>Please set up two-factor authentication to continue using the platform.</BannerText>
        </MfaSetupBanner>
        <Outlet />
      </>
    );
  }

  return <Outlet />;
}

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MfaSetupBanner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const BannerIcon = styled.span`
  font-size: 1.25rem;
`;

const BannerText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  @media (min-width: 640px) {
    font-size: ${({ theme }) => theme.typography.fontSize.md};
  }
`;
