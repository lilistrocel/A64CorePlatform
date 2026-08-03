/**
 * Pending Activation — shared "account is not active" screen
 *
 * Shown whenever a login attempt resolves to the 403 pending_activation
 * outcome, set on the `pendingActivation` store flag by either login path
 * in auth.store.ts:
 *  - cfAccessLogin(): a Cloudflare Access identity was recognized but the
 *    account was just JIT-provisioned (login_via_cf_access) and awaits
 *    admin approval, or already existed and isn't active.
 *  - login() (password path): the account exists and the password was
 *    correct, but isActive is false — most commonly an admin deactivated it.
 *
 * Both cases render identically and deliberately avoid guessing which one
 * applies (the backend doesn't distinguish them either, so this UI would be
 * lying if it did). There is nothing actionable here beyond signing back
 * out; an administrator must enable the account from User Management
 * before the user can proceed.
 *
 * This is a PUBLIC route (registered in App.tsx alongside /login and
 * /register) — the visitor is, by definition, not authenticated with our
 * app JWT yet, so it cannot live behind ProtectedRoute.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Clock } from 'lucide-react';
import { Button, glassPanel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';

export function PendingActivation() {
  const navigate = useNavigate();
  const { pendingActivation, pendingActivationEmail, logout, isLoading } = useAuthStore();
  // Night Observatory is dark-only (T-901) — the cream-on-transparent lockup
  // is correct unconditionally. Use the `transparent` variant, not
  // `lockup_cosmos.svg` — that one bakes in its own opaque `#0E1330`
  // background rect, which shows as a visible box seam against this card's
  // glassPanel gradient.
  const logoSrc = '/brand/lockup_transparent.svg';

  // Guard against landing here directly (bookmark, back-button, stale link)
  // without an actual pending-activation outcome in the store.
  useEffect(() => {
    if (!pendingActivation) {
      navigate('/login', { replace: true });
    }
  }, [pendingActivation, navigate]);

  const handleSignOut = async () => {
    // logout() is Cloudflare-aware: when this outcome came from cfAccessLogin(),
    // it navigates to /cdn-cgi/access/logout afterward so the visitor doesn't
    // silently land right back here on the next visit. When it came from a
    // rejected password login instead, no app tokens were ever issued, so
    // logout() is a no-op beyond clearing local flags — safe either way.
    await logout();
  };

  if (!pendingActivation) {
    return null;
  }

  return (
    <PageWrapper>
      <PageContainer>
        <Card>
          <Logo><LogoImg src={logoSrc} alt="A20Core" /></Logo>

          <IconWrap aria-hidden="true">
            <Clock size={28} strokeWidth={1.6} />
          </IconWrap>

          <Title>Account Not Active</Title>

          <Message role="status" aria-live="polite">
            This account isn&rsquo;t active right now. An administrator
            needs to enable it before you can sign in.
          </Message>

          {pendingActivationEmail && (
            <EmailChip>{pendingActivationEmail}</EmailChip>
          )}

          <Hint>
            Contact your organization&rsquo;s administrator and ask them to
            enable your account from User Management. Once enabled, sign in
            again to continue.
          </Hint>

          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={isLoading}
            onClick={handleSignOut}
          >
            {isLoading ? 'Signing out…' : 'Sign Out'}
          </Button>
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
  background: ${({ theme }) => theme.colors.warningBg};
  color: ${({ theme }) => theme.colors.warning};
  margin: 0 auto 1rem;
`;

const Title = styled.h1`
  font-size: 1.375rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 0.75rem 0;
`;

const Message = styled.p`
  font-size: 0.9375rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 1rem 0;
`;

const EmailChip = styled.div`
  display: inline-block;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.celeste};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.375rem 0.75rem;
  margin: 0 0 1.25rem 0;
`;

const Hint = styled.p`
  font-size: 0.8125rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 1.5rem 0;
`;
