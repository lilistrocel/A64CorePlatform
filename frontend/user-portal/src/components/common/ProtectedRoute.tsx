import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect } from 'react';
import styled from 'styled-components';
import { Spinner } from '@a64core/shared';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();

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
    return <Navigate to="/login" replace />;
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
