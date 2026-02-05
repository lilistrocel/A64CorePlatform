import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 5000
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message, duration = 5000) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const toast: Toast = { id, type, message, duration, createdAt: Date.now() };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions for use outside React components (e.g., API interceptors)
export const showToast = (type: ToastType, message: string, duration?: number) => {
  return useToastStore.getState().addToast(type, message, duration);
};

export const showErrorToast = (message: string, duration?: number) => {
  return showToast('error', message, duration);
};

export const showSuccessToast = (message: string, duration?: number) => {
  return showToast('success', message, duration);
};

export const showWarningToast = (message: string, duration?: number) => {
  return showToast('warning', message, duration);
};

export const showInfoToast = (message: string, duration?: number) => {
  return showToast('info', message, duration);
};
