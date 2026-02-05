/**
 * UnsavedChangesContext
 *
 * Provides a global context for tracking unsaved form changes.
 * Used by the sidebar/navigation to warn before navigating away from dirty forms.
 */

import { createContext, useState, useCallback, type ReactNode } from 'react';

export interface UnsavedChangesContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  pendingNavigation: string | null;
  setPendingNavigation: (path: string | null) => void;
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  checkNavigationAllowed: (path: string, onConfirm?: () => void) => boolean;
}

export const UnsavedChangesContext = createContext<UnsavedChangesContextType | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | null>(null);

  const confirmNavigation = useCallback(() => {
    setShowDialog(false);
    setIsDirty(false);
    if (onConfirmCallback) {
      onConfirmCallback();
      setOnConfirmCallback(null);
    }
    setPendingNavigation(null);
  }, [onConfirmCallback]);

  const cancelNavigation = useCallback(() => {
    setShowDialog(false);
    setPendingNavigation(null);
    setOnConfirmCallback(null);
  }, []);

  const checkNavigationAllowed = useCallback((path: string, onConfirm?: () => void): boolean => {
    if (!isDirty) {
      return true;
    }
    setPendingNavigation(path);
    setShowDialog(true);
    if (onConfirm) {
      setOnConfirmCallback(() => onConfirm);
    }
    return false;
  }, [isDirty]);

  return (
    <UnsavedChangesContext.Provider
      value={{
        isDirty,
        setIsDirty,
        pendingNavigation,
        setPendingNavigation,
        showDialog,
        setShowDialog,
        confirmNavigation,
        cancelNavigation,
        checkNavigationAllowed,
      }}
    >
      {children}
    </UnsavedChangesContext.Provider>
  );
}
