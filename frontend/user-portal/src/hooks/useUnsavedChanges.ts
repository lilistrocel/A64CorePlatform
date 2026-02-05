/**
 * useUnsavedChanges Hook
 *
 * Tracks unsaved changes in forms and warns users before navigating away.
 * Works with BrowserRouter (no data router required).
 *
 * Features:
 * - Warns on browser tab close/refresh via beforeunload
 * - Provides a dirty state tracker
 * - Integrates with UnsavedChangesContext for navigation interception
 */

import { useEffect, useCallback, useContext } from 'react';
import { UnsavedChangesContext } from '../contexts/UnsavedChangesContext';

export function useUnsavedChanges(isDirty: boolean) {
  const context = useContext(UnsavedChangesContext);

  // Register dirty state with context
  useEffect(() => {
    if (context) {
      context.setIsDirty(isDirty);
    }
    return () => {
      if (context) {
        context.setIsDirty(false);
      }
    };
  }, [isDirty, context]);

  // Handle browser beforeunload (tab close, refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    if (isDirty) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  return { isDirty };
}

export default useUnsavedChanges;
