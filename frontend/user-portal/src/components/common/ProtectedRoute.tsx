import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Spinner } from '@a64core/shared';

// Routes allowed during MFA setup period (without full access)
const MFA_SETUP_ALLOWED_ROUTES = ['/mfa/setup', '/logout'];

// Routes that do not require a division to be selected.
// These are either global (profile, settings) or the selector page itself.
const DIVISION_EXEMPT_ROUTES = [
  '/profile',
  '/settings',
  '/select-division',
  '/admin',
];

function isDivisionExempt(pathname: string): boolean {
  return DIVISION_EXEMPT_ROUTES.some((route) => pathname.startsWith(route));
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading: authLoading, loadUser, user } = useAuthStore();
  const {
    currentDivision,
    availableDivisions,
    isLoading: divisionsLoading,
    error: divisionError,
    loadDivisions,
    setCurrentDivision,
  } = useDivisionStore();
  const location = useLocation();
  const [showMfaBanner, setShowMfaBanner] = useState(false);

  // Load user data if authenticated but user not yet loaded
  useEffect(() => {
    if (isAuthenticated && !user && !authLoading) {
      loadUser();
    }
  }, [isAuthenticated, user, authLoading, loadUser]);

  // Load available divisions when the user is authenticated and loaded.
  // The divisionError guard prevents an infinite retry loop when the API fails.
  useEffect(() => {
    if (isAuthenticated && user && availableDivisions.length === 0 && !divisionsLoading && !divisionError) {
      loadDivisions();
    }
  }, [isAuthenticated, user, availableDivisions.length, divisionsLoading, divisionError, loadDivisions]);

  // Auto-select if there is exactly one division available and none selected yet
  useEffect(() => {
    if (
      isAuthenticated &&
      user &&
      !currentDivision &&
      availableDivisions.length === 1 &&
      !divisionsLoading
    ) {
      setCurrentDivision(availableDivisions[0]).catch(() => {
        // Ignore — error is surfaced via the store
      });
    }
  }, [
    isAuthenticated,
    user,
    currentDivision,
    availableDivisions,
    divisionsLoading,
    setCurrentDivision,
  ]);

  // Show / hide the MFA banner
  useEffect(() => {
    if (user?.mfaSetupRequired && !user?.mfaEnabled) {
      setShowMfaBanner(true);
    } else {
      setShowMfaBanner(false);
    }
  }, [user?.mfaSetupRequired, user?.mfaEnabled]);

  // While user or divisions are still loading, show a full-page spinner.
  // Only block on the INITIAL division load (availableDivisions empty). Re-fetches
  // should NOT unmount children — otherwise DivisionSelector enters a mount/unmount
  // infinite loop because loadDivisions() toggles isLoading which toggles this flag.
  const isBootstrapping =
    authLoading ||
    (isAuthenticated && user && divisionsLoading && availableDivisions.length === 0 && !divisionError);

  if (isBootstrapping) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading...</LoadingText>
      </LoadingContainer>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = location.pathname + location.search;
    const loginUrl =
      redirectTo && redirectTo !== '/' && redirectTo !== '/dashboard'
        ? `/login?redirect=${encodeURIComponent(redirectTo)}`
        : '/login';
    return <Navigate to={loginUrl} replace />;
  }

  // ── MFA gate ──────────────────────────────────────────────────────────────
  if (user?.mfaSetupRequired && !user?.mfaEnabled) {
    const isAllowedRoute = MFA_SETUP_ALLOWED_ROUTES.some((route) =>
      location.pathname.startsWith(route)
    );

    if (!isAllowedRoute) {
      return <Navigate to="/mfa/setup" replace />;
    }
  }

  // ── Division gate ─────────────────────────────────────────────────────────
  // Only enforce the division gate after divisions have been fetched and the
  // user has more than one available (single-division is auto-selected above).
  if (
    user &&
    !currentDivision &&
    availableDivisions.length > 1 &&
    !isDivisionExempt(location.pathname)
  ) {
    return <Navigate to="/select-division" replace />;
  }

  // ── MFA setup banner (for /mfa/setup route) ───────────────────────────────
  if (showMfaBanner && location.pathname === '/mfa/setup') {
    return (
      <>
        <MfaSetupBanner role="alert" aria-live="polite">
          <BannerIcon>🔐</BannerIcon>
          <BannerText>
            Please set up two-factor authentication to continue using the platform.
          </BannerText>
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
