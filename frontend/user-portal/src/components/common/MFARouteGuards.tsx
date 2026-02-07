import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import styled from 'styled-components';
import { Spinner } from '@a64core/shared';

/**
 * MFAVerifyGuard - Route guard for /mfa/verify
 *
 * This is a semi-public route that requires:
 * 1. A pending MFA token (from login that requires MFA)
 * 2. User should NOT be fully authenticated yet
 *
 * If no MFA token exists, redirect to login.
 * If user is already authenticated, redirect to dashboard.
 */
export function MFAVerifyGuard() {
  const { isAuthenticated, mfaPendingToken, mfaRequired, isLoading } = useAuthStore();
  const location = useLocation();

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading...</LoadingText>
      </LoadingContainer>
    );
  }

  // If user is already fully authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // If no MFA token pending, redirect to login
  // The user needs to go through login flow first to get the MFA token
  if (!mfaPendingToken && !mfaRequired) {
    return <Navigate to="/login" replace />;
  }

  // User has pending MFA token - allow access to verify page
  return <Outlet />;
}

/**
 * MFASetupGuard - Route guard for /mfa/setup
 *
 * This is a protected route that allows:
 * 1. Authenticated users who have mfaSetupRequired=true
 * 2. Authenticated users who want to enable MFA (mfaEnabled=false)
 *
 * If user already has MFA enabled, redirect to settings (they can manage MFA there).
 * If user is not authenticated, redirect to login.
 */
export function MFASetupGuard() {
  const { isAuthenticated, user, isLoading, loadUser } = useAuthStore();
  const location = useLocation();

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Setting up MFA...</LoadingText>
      </LoadingContainer>
    );
  }

  // If not authenticated, redirect to login with current path as redirect
  if (!isAuthenticated) {
    const redirectTo = location.pathname + location.search;
    const loginUrl = `/login?redirect=${encodeURIComponent(redirectTo)}`;
    return <Navigate to={loginUrl} replace />;
  }

  // If user data hasn't loaded yet, show loading
  if (!user) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading user data...</LoadingText>
      </LoadingContainer>
    );
  }

  // If user already has MFA enabled (and mfaSetupRequired is false),
  // redirect to settings - they can manage MFA from there
  if (user.mfaEnabled && !user.mfaSetupRequired) {
    return <Navigate to="/settings" replace state={{ mfaAlreadyEnabled: true }} />;
  }

  // User is authenticated and needs to set up MFA - allow access
  return <Outlet />;
}

// Styled components
const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: ${({ theme }) => theme.spacing.lg};
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.primary[500]} 0%, ${({ theme }) => theme.colors.primary[700]} 100%);
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: white;
`;
