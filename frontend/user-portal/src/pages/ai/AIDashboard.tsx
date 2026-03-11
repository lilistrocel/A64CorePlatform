/**
 * AIDashboard Page
 *
 * Page wrapper for the AI Operations Dashboard.
 * Fetches the latest automated farm inspection report and displays it via
 * AIDashboardView. Admins can trigger a new report via the "Run Inspection"
 * button; all users can refresh the current report.
 */

import styled from 'styled-components';
import { RefreshCw, Play } from 'lucide-react';
import { useAIDashboard } from '../../hooks/farm/useAIDashboard';
import { AIDashboardView } from '../../components/ai/AIDashboardView';
import { useAuthStore } from '../../stores/auth.store';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${({ theme }) => theme.spacing.lg};
  gap: ${({ theme }) => theme.spacing.lg};
  min-height: 100%;
  background: ${({ theme }) => theme.colors.neutral[50]};

  @media (max-width: 768px) {
    padding: ${({ theme }) => theme.spacing.md};
  }
`;

const PageHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
  line-height: 1.25;
`;

const PageSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// ----- Button base -----

interface ActionButtonProps {
  $variant: 'primary' | 'secondary';
}

const ActionButton = styled.button<ActionButtonProps>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background-color 150ms ease-in-out, opacity 150ms ease-in-out;
  border: 1px solid transparent;

  ${({ theme, $variant }) =>
    $variant === 'primary'
      ? `
    background: ${theme.colors.primary[500]};
    color: #fff;
    &:hover:not(:disabled) { background: ${theme.colors.primary[700] ?? theme.colors.primary[500]}; }
  `
      : `
    background: transparent;
    color: ${theme.colors.primary[500]};
    border-color: ${theme.colors.primary[500]};
    &:hover:not(:disabled) { background: ${theme.colors.primary[50] ?? '#e3f2fd'}; }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// ----- Error alert -----

const ErrorAlert = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: #ffebee;
  border: 1px solid #ef9a9a;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: #c62828;
`;

// ----- Loading skeleton -----

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AIDashboard() {
  const { report, loading, generating, error, refresh, generate } = useAIDashboard();
  const user = useAuthStore((state) => state.user);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isActionDisabled = loading || generating;

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <PageTitle>AI Operations Dashboard</PageTitle>
          <PageSubtitle>
            Automated farm inspection reports — generated every 4 hours
          </PageSubtitle>
        </div>

        <HeaderActions>
          <ActionButton
            $variant="secondary"
            onClick={refresh}
            disabled={isActionDisabled}
            aria-label="Refresh inspection report"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </ActionButton>

          {isAdmin && (
            <ActionButton
              $variant="primary"
              onClick={generate}
              disabled={isActionDisabled}
              aria-label="Run a new inspection report"
            >
              <Play size={16} aria-hidden="true" />
              Run Inspection
            </ActionButton>
          )}
        </HeaderActions>
      </PageHeader>

      {/* API error */}
      {error && !loading && (
        <ErrorAlert role="alert">
          <span>{error}</span>
        </ErrorAlert>
      )}

      {/* Initial loading state */}
      {loading && !report && (
        <LoadingContainer role="status" aria-live="polite">
          Loading inspection report...
        </LoadingContainer>
      )}

      {/* Main dashboard view — shown once loading is complete */}
      {!loading && (
        <AIDashboardView report={report} generating={generating} />
      )}
    </PageContainer>
  );
}
