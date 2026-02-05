import React, { useEffect, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useToastStore } from '../../stores/toast.store';
import type { Toast, ToastType } from '../../stores/toast.store';

const slideIn = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
`;

const Container = styled.div`
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  width: 100%;
  pointer-events: none;

  @media (max-width: 480px) {
    top: 8px;
    right: 8px;
    left: 8px;
    max-width: none;
  }
`;

const getToastColors = (type: ToastType) => {
  switch (type) {
    case 'success':
      return { bg: '#f0fdf4', border: '#22c55e', text: '#15803d', icon: '#22c55e' };
    case 'error':
      return { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c', icon: '#ef4444' };
    case 'warning':
      return { bg: '#fffbeb', border: '#f59e0b', text: '#b45309', icon: '#f59e0b' };
    case 'info':
      return { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', icon: '#3b82f6' };
  }
};

const ToastItem = styled.div<{ $type: ToastType; $exiting: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid ${props => getToastColors(props.$type).border};
  background: ${props => getToastColors(props.$type).bg};
  color: ${props => getToastColors(props.$type).text};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  cursor: default;
  animation: ${props => props.$exiting
    ? css`${slideOut} 0.3s ease-in forwards`
    : css`${slideIn} 0.3s ease-out`
  };
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
`;

const ToastIcon = styled.span<{ $type: ToastType }>`
  flex-shrink: 0;
  font-size: 18px;
  margin-top: 1px;
  color: ${props => getToastColors(props.$type).icon};
`;

const ToastMessage = styled.div`
  flex: 1;
  font-weight: 500;
`;

const CloseButton = styled.button<{ $type: ToastType }>`
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  margin-top: -2px;
  color: ${props => getToastColors(props.$type).text};
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
`;

const getIcon = (type: ToastType) => {
  switch (type) {
    case 'success': return '\u2705';
    case 'error': return '\u274C';
    case 'warning': return '\u26A0\uFE0F';
    case 'info': return '\u2139\uFE0F';
  }
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

  return (
    <ToastItem
      $type={toast.type}
      $exiting={exiting}
      role="alert"
      aria-live="assertive"
    >
      <ToastIcon $type={toast.type}>{getIcon(toast.type)}</ToastIcon>
      <ToastMessage>{toast.message}</ToastMessage>
      <CloseButton $type={toast.type} onClick={handleClose} aria-label="Dismiss notification">
        &times;
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
