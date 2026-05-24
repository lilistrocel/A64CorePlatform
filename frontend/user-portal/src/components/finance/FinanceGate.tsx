/**
 * FinanceGate — Wave 0 (T-059.3)
 *
 * Wraps a route element with a runtime check on the per-tenant
 * `modules.finance.enabled` capability. When finance is disabled for
 * this tenant, navigates back to /dashboard instead of rendering the
 * finance page. While capabilities are still loading we render null so
 * the page never flashes a finance form to a tenant that shouldn't see it.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCapabilities } from '../../hooks/useCapabilities';

interface FinanceGateProps {
  children: ReactNode;
}

export function FinanceGate({ children }: FinanceGateProps) {
  const { data, isLoading } = useCapabilities();

  if (isLoading && !data) {
    // Reason: avoid flashing a finance page before we know whether it
    // should be visible. ProtectedRoute already kicked off /auth/me, so
    // this window is usually <100ms.
    return null;
  }

  const enabled = data?.modules.finance.enabled ?? false;
  if (!enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
