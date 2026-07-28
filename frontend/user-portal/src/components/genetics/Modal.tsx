/**
 * Genetics Repo - Modal Shell
 *
 * Data-entry modal used across the genetics screens.
 *
 * Deliberately does NOT close on backdrop click — half-filled propagation and
 * observation forms are easy to lose to a stray click, so the X button (or
 * Cancel) is the only way out.
 */

import type { ReactNode } from 'react';
import styled from 'styled-components';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  overflow-y: auto;
  z-index: ${({ theme }) => theme.zIndex.modal};
`;

const Panel = styled.div<{ $width?: string }>`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.xl};
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const Subtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  line-height: 1.5;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textPrimary};
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
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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

export function Modal({ title, subtitle, width, onClose, children, footer }: ModalProps) {
  return (
    <Overlay>
      <Panel $width={width} role="dialog" aria-modal="true" aria-label={title}>
        <Header>
          <TitleWrap>
            <Title>{title}</Title>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
          </TitleWrap>
          <CloseButton type="button" onClick={onClose} aria-label="Close">
            ×
          </CloseButton>
        </Header>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Panel>
    </Overlay>
  );
}
