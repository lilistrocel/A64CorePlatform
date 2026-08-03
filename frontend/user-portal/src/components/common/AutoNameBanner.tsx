/**
 * AutoNameBanner — dismissible nudge for accounts whose first/last name was
 * auto-derived rather than entered by a human (e.g. a Cloudflare Access
 * JIT-provisioned account gets a name guessed from the email local-part,
 * so "lilistrocel@..." becomes firstName="Lilistrocel" / lastName the same).
 *
 * Purely cosmetic — never blocks navigation, never a modal. The backing
 * `user.nameAutoDerived` flag clears itself server-side the instant the
 * user edits either name field via PATCH /api/v1/auth/me (see Profile.tsx),
 * so this banner simply stops rendering on the next user refresh. The only
 * client-side state is the "I've seen this, stop showing it" dismissal,
 * persisted per-user so it doesn't reappear on every page load once
 * dismissed, mirroring the localStorage-per-userId pattern MainLayout uses
 * for sidebar group state.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { SquarePen, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

const dismissKey = (userId: string) => `autoNameBanner.dismissed.${userId}`;

export function AutoNameBanner() {
  const { user } = useAuthStore();

  const navigate = useNavigate();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!user?.userId) return false;
    try {
      return localStorage.getItem(dismissKey(user.userId)) === 'true';
    } catch {
      // Storage unavailable (quota/private mode) — fail open, show the banner.
      return false;
    }
  });

  // Renders nothing in the common case (name was entered by a human, or the
  // banner was already dismissed), so callers can mount it unconditionally.
  if (!user?.nameAutoDerived || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(user.userId), 'true');
    } catch {
      // Non-fatal — worst case the banner reappears next load.
    }
  };

  const handleFixName = () => {
    // ?focus=name tells Profile.tsx to auto-enter edit mode and focus the
    // First Name field, so the fields are easy to find on arrival rather
    // than requiring the user to hunt for the "Edit Profile" button.
    navigate('/profile?focus=name');
  };

  return (
    <Banner role="status" aria-live="polite">
      <BannerIcon aria-hidden="true">
        <SquarePen size={18} strokeWidth={1.8} />
      </BannerIcon>
      <BannerText>
        Your name was auto-filled from your email address.{' '}
        <BannerLink type="button" onClick={handleFixName}>
          Set your real name
        </BannerLink>
      </BannerText>
      <DismissButton
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss name reminder"
      >
        <X size={16} strokeWidth={1.8} />
      </DismissButton>
    </Banner>
  );
}

// Info semantics (spec: same "phase colour = text, phase tint = background"
// rule as FinanceUnreachableBanner/RoleBadge) — this is a friendly cosmetic
// nudge, not a warning or error, so it uses the lapis/info ramp rather than
// the gold-b warning ramp.
const Banner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.info};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.md} 0;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  @media (min-width: 1024px) {
    margin: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.lg} 0;
  }
`;

const BannerIcon = styled.span`
  display: flex;
  flex-shrink: 0;
`;

const BannerText = styled.span`
  flex: 1;
`;

const BannerLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.bright.lapis};
  text-decoration: underline;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const DismissButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.bright.lapis};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.14);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;
