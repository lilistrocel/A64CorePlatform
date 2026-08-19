import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { ShieldAlert } from 'lucide-react';
import { Spinner } from '@a64core/shared';
import { authService } from '../../services/auth.service';

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

// Routes where the super_admin org-less redirect should NOT fire.
// These must include the wizard itself and other pre-org-assignment pages.
const TENANT_SETUP_EXEMPT_ROUTES = [
  '/admin/tenant-setup',
  '/profile',
  '/settings',
  '/logout',
];

function isDivisionExempt(pathname: string): boolean {
  return DIVISION_EXEMPT_ROUTES.some((route) => pathname.startsWith(route));
}

interface ProtectedRouteProps {
  /**
   * Route-level role gate. When provided, `user.role` must be one of these
   * values or a "not authorized" view renders instead of the Outlet.
   *
   * This is defense-in-depth ONLY — the server independently re-checks
   * authorization on every request (`require_admin` / `require_super_admin`
   * / `can_change_role` in `src/middleware/permissions.py`) and is the real
   * security boundary. This prop exists so the UI stops advertising and
   * rendering screens/actions a role has no business seeing, not to secure
   * anything by itself.
   */
  allowedRoles?: string[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps = {}) {
  const {
    isAuthenticated,
    isLoading: authLoading,
    loadUser,
    user,
    pendingActivation,
    cfAccessLogin,
  } = useAuthStore();
  const {
    currentDivision,
    availableDivisions,
    isLoading: divisionsLoading,
    hasFetchedOnce: divisionsFetched,
    error: divisionError,
    loadDivisions,
    setCurrentDivision,
  } = useDivisionStore();
  const location = useLocation();
  const [showMfaBanner, setShowMfaBanner] = useState(false);

  // ── Cloudflare Access exchange (T-attempted once per mount) ─────────────
  // Guarded by a ref so a 401/404 (no CF session / CF Access disabled) can
  // never loop: the ref flips true right before the single attempt fires,
  // so re-renders (including the isAuthenticated flip on success) never
  // re-trigger it. Leaving the protected area (unmounting this route) and
  // coming back allows exactly one fresh attempt on the new mount.
  const cfAttemptedRef = useRef(false);
  const [cfAttempting, setCfAttempting] = useState(false);

  useEffect(() => {
    if (cfAttemptedRef.current || isAuthenticated) return;
    cfAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const status = await authService.cfAccessStatus();
        if (cancelled || !status.enabled) return;
        setCfAttempting(true);
        await cfAccessLogin();
      } catch {
        // Expected: no CF session (401), CF Access disabled (404), or the
        // account is pending activation (surfaced via the pendingActivation
        // store flag, handled below) — fall through to the normal /login
        // redirect.
      } finally {
        if (!cancelled) setCfAttempting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, cfAccessLogin]);

  // Load user data if authenticated but user not yet loaded
  useEffect(() => {
    if (isAuthenticated && !user && !authLoading) {
      loadUser();
    }
  }, [isAuthenticated, user, authLoading, loadUser]);

  // Load available divisions exactly once per session after auth.
  // Gated on hasFetchedOnce (not length === 0) so a legitimate [] response
  // from the API (user with no division access) doesn't loop.
  useEffect(() => {
    if (isAuthenticated && user && !divisionsFetched && !divisionsLoading) {
      loadDivisions();
    }
  }, [isAuthenticated, user, divisionsFetched, divisionsLoading, loadDivisions]);

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
  // Only block on the INITIAL division load (before hasFetchedOnce flips true).
  // Re-fetches should NOT unmount children — otherwise DivisionSelector enters a
  // mount/unmount infinite loop because loadDivisions() toggles isLoading which
  // toggles this flag.
  const isBootstrapping =
    authLoading ||
    cfAttempting ||
    (isAuthenticated && user && divisionsLoading && !divisionsFetched);

  if (isBootstrapping) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading...</LoadingText>
      </LoadingContainer>
    );
  }

  if (!isAuthenticated) {
    // The CF exchange recognized the identity but the account is awaiting
    // admin approval — send them to the informational screen instead of the
    // normal login form.
    if (pendingActivation) {
      return <Navigate to="/pending-activation" replace />;
    }

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

  // ── Tenant setup gate (super_admin only) ─────────────────────────────────
  // If the user is a super_admin with no organization assigned, redirect to the
  // Tenant Setup Wizard. This fires after auth is fully loaded.
  // Non-super-admins without an org see a toast (handled in MainLayout/components)
  // and are NOT redirected here — they cannot fix themselves.
  if (
    user &&
    user.role === 'super_admin' &&
    !user.organizationId &&
    !TENANT_SETUP_EXEMPT_ROUTES.some((r) => location.pathname.startsWith(r))
  ) {
    return <Navigate to="/admin/tenant-setup" replace />;
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

  // ── Role gate (route-level) ────────────────────────────────────────────────
  // See ProtectedRouteProps.allowedRoles above — UI-only courtesy, not the
  // security boundary.
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <NotAuthorized />;
  }

  // ── MFA setup banner (for /mfa/setup route) ───────────────────────────────
  if (showMfaBanner && location.pathname === '/mfa/setup') {
    return (
      <>
        <MfaSetupBanner role="alert" aria-live="polite">
          <BannerIcon><ShieldAlert size={20} strokeWidth={1.8} /></BannerIcon>
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

// Clean "you can't be here" view for a role-gated route — an explicit,
// accessible message rather than a blank screen or a crash. Rendered inside
// whatever chrome the matched route tree already provides (e.g. inside
// MainLayout for /admin/* routes, standalone for full-screen routes like /ai).
function NotAuthorized() {
  return (
    <NotAuthorizedContainer role="alert">
      <ShieldAlert size={40} strokeWidth={1.6} />
      <NotAuthorizedTitle>Not authorized</NotAuthorizedTitle>
      <NotAuthorizedText>
        Your account does not have permission to view this page.
      </NotAuthorizedText>
      <NotAuthorizedLink to="/dashboard">Back to dashboard</NotAuthorizedLink>
    </NotAuthorizedContainer>
  );
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

// Status semantics ("action required") — the warning phase colour, not the
// rare chrome gold ramp (spec §3 gold-discipline budget).
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
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.onAccent};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const BannerIcon = styled.span`
  display: flex;
`;

const BannerText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  @media (min-width: 640px) {
    font-size: ${({ theme }) => theme.typography.fontSize.base};
  }
`;

const NotAuthorizedContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: 60vh;
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const NotAuthorizedTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const NotAuthorizedText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  max-width: 32rem;
  margin: 0;
`;

const NotAuthorizedLink = styled(Link)`
  margin-top: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.secondary[500]};

  &:hover {
    text-decoration: underline;
  }
`;
