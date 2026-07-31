/**
 * Genetics Repo - Modal Shell
 *
 * Data-entry modal used across the genetics screens.
 *
 * Deliberately does NOT close on backdrop click — half-filled propagation and
 * observation forms are easy to lose to a stray click, so the X button (or
 * Cancel) is the only way out.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { glassPanel } from '@a64core/shared';

// Night Observatory (T-901 Phase 3, spec §4 "Modals/drawers"): glassPanel at
// blur 24px over an rgba(10,14,36,.6) scrim, 20px radius. Every genetics
// data-entry modal composes this shell, so retinting it here covers them all.
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  overflow-y: auto;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const Panel = styled.div<{ $width?: string }>`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  width: 100%;
  max-width: ${({ $width }) => $width ?? '620px'};
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 80px);
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.h2`
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const Subtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: 1.5;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: background 150ms, color 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const Body = styled.div`
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Footer = styled.div`
  padding: 16px 24px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

interface ModalProps {
  title: string;
  subtitle?: string;
  width?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, subtitle, width, onClose, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // The overlay stops mouse clicks reaching the page, but nothing stopped Tab
  // walking into the controls behind it — on the accession page that means
  // reaching the live status dropdown and mutating the record you are in the
  // middle of splitting. Trap focus inside the panel and lock body scroll.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Focus the first real control so keyboard users start inside the dialog.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends rather than letting focus escape to the page.
      if (e.shiftKey && (active === firstItem || !panel.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
    // Deliberately mount-only: re-running would steal focus mid-typing.
  }, []);

  return (
    <Overlay>
      <Panel
        ref={panelRef}
        $width={width}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /* Explicit marker for "a blocking modal is open". role=dialog is not
           usable for that test: the AI assistant panel is permanently mounted
           with role="dialog" (aria-modal="false"), so sniffing the role would
           always report a dialog and suppress every auto-opening tutorial. */
        data-blocking-modal="true"
      >
        <Header>
          <TitleWrap>
            <Title>{title}</Title>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
          </TitleWrap>
          <CloseButton type="button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </CloseButton>
        </Header>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Panel>
    </Overlay>
  );
}
