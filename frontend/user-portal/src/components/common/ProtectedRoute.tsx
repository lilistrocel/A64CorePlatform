import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect } from 'react';
import styled from 'styled-components';
import { Spinner } from '@a64core/shared';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // Load user data if authenticated but user not loaded
    if (isAuthenticated && !user && !isLoading) {
      loadUser();
    }
  }, [isAuthenticated, user, isLoading, loadUser]);

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
