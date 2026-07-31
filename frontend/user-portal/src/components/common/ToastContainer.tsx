import React, { useEffect, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToastStore } from '../../stores/toast.store';
import type { Toast, ToastType } from '../../stores/toast.store';
import type { Theme } from '@a64core/shared';

// Night Observatory (T-901 Phase 2, spec deliverable D / \u00A74 "Toasts") \u2014 small
// glass chips bottom-right with a phase-coloured edge bar: emerald-b success,
// coral-b error, gold-b warning, celeste info.

const slideIn = keyframes`
  from {
    transform: translateY(12px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(12px);
    opacity: 0;
  }
`;

const Container = styled.div`
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: 420px;
  width: 100%;
  pointer-events: none;

  @media (max-width: 480px) {
    bottom: 8px;
    right: 8px;
    left: 8px;
    max-width: none;
  }
`;

// Toast edge-bar colour is the phase-status colour per type; text/icon stay
// on the shell's normal text tokens (cream/celeste) rather than tinting the
// whole chip, since the mockup's toast pattern is a glass chip with a
// coloured accent bar \u2014 not a tinted-background alert banner.
const getToastAccent = (type: ToastType, theme: Theme) => {
  switch (type) {
    case 'success':
      return theme.colors.phase.fruiting; // emerald-b
    case 'error':
      return theme.colors.phase.quarantined; // coral-b \u2014 the only red
    case 'warning':
      return theme.colors.phase.harvesting; // gold-b
    case 'info':
      return theme.colors.celeste;
  }
};

const ToastItem = styled.div<{ $type: ToastType; $exiting: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-left: 3px solid ${(props) => getToastAccent(props.$type, props.theme)};
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5), inset 0 1px 0 ${({ theme }) => theme.colors.glass.shine};
  color: ${({ theme }) => theme.colors.textPrimary};
  pointer-events: auto;
  cursor: default;
  animation: ${(props) => (props.$exiting
    ? css`${slideOut} 0.3s ease-in forwards`
    : css`${slideIn} 0.3s ease-out`
  )};
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ToastIcon = styled.span<{ $type: ToastType }>`
  flex-shrink: 0;
  display: flex;
  margin-top: 1px;
  color: ${(props) => getToastAccent(props.$type, props.theme)};
`;

const ToastMessage = styled.div`
  flex: 1;
  font-weight: 500;
`;

const CloseButton = styled.button`
  flex-shrink: 0;
  display: flex;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: 1px;
  color: ${({ theme }) => theme.colors.muted};
  transition: color 0.2s;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

const TOAST_ICONS: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

interface ToastItemWrapperProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItemWrapper: React.FC<ToastItemWrapperProps> = ({ toast, onRemove }) => {
  const [exiting, setExiting] = useState(false);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const remaining = toast.duration - (Date.now() - toast.createdAt);
      if (remaining > 300) {
        const timer = setTimeout(() => {
          setExiting(true);
        }, remaining - 300); // Start exit animation 300ms before removal
        return () => clearTimeout(timer);
      }
    }
  }, [toast]);

  const Icon = TOAST_ICONS[toast.type];

  return (
    <ToastItem
      $type={toast.type}
      $exiting={exiting}
      role="alert"
      aria-live="assertive"
    >
      <ToastIcon $type={toast.type}>
        <Icon size={18} strokeWidth={1.8} />
      </ToastIcon>
      <ToastMessage>{toast.message}</ToastMessage>
      <CloseButton onClick={handleClose} aria-label="Dismiss notification">
        <X size={16} strokeWidth={1.8} />
      </CloseButton>
    </ToastItem>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <Container>
      {toasts.map((toast) => (
        <ToastItemWrapper key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </Container>
  );
};
