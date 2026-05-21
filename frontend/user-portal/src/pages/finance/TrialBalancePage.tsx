/**
 * TrialBalancePage
 *
 * Finance report: Trial Balance as of a selected date.
 * User selects company, as-of-date (default today), optional period, and
 * whether to include voided JEs. Clicking "Generate" fires the query.
 *
 * Table layout:
 *   Account Number | Account Name | Drawer | Total Debit | Total Credit
 *   Grouped visually by drawer (section header row per drawer group).
 *   Zero-balance accounts hidden by default; toggle shows them all.
 *   Footer totals row — highlighted red if DR ≠ CR (out-of-balance warning).
 *
 * Role gating: accountant, finance_admin, auditor, admin, super_admin.
 * Route: /finance/trial-balance
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X, never on backdrop click.)
 * No modals on this page.
 */

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import { useTrialBalance, useFinancePeriods } from '../../hooks/queries/useTrialBalance';
import type { GetTrialBalanceParams } from '../../services/trialBalanceService';
import type { TrialBalanceAccount } from '../../services/trialBalanceService';

// ─── Role gate ─────────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function isZeroBalance(acc: TrialBalanceAccount): boolean {
  return (
    parseFloat(acc.totalDebit || '0') === 0 &&
    parseFloat(acc.totalCredit || '0') === 0 &&
    parseFloat(acc.balance || '0') === 0
  );
}

// ─── Styled components ─────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 4px;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 24px;
  line-height: 1.55;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.surface.sunken};
  margin-bottom: 24px;
`;

// ─── Toolbar ───────────────────────────────────────────────────────────────────

const ToolbarCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 24px;
`;

const ToolbarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
`;

const ToolbarField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const ToolbarLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const ToolbarSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  min-width: 180px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const ToolbarDateInput = styled.input`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  user-select: none;
  padding-bottom: 2px;
`;

const GenerateButton = styled.button`
  padding: 10px 22px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Display toggles bar ───────────────────────────────────────────────────────

const DisplayToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

// ─── Report meta header ────────────────────────────────────────────────────────

const ReportMetaBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 10px 10px 0 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const ReportMetaTitle = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-top: none;
  border-radius: 0 0 12px 12px;
  overflow-x: auto;
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const TBTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
`;

const TBTHead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const TBTh = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface.sunken};
  white-space: nowrap;
`;

const TBThRight = styled(TBTh)`
  text-align: right;
`;

// ─── Drawer group separator row ────────────────────────────────────────────────

const DrawerHeaderRow = styled.tr`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-top: 2px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const DrawerHeaderCell = styled.td`
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

// ─── Data rows ─────────────────────────────────────────────────────────────────

const TBTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const TBTd = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const TBTdMono = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const AccountNumberCell = styled.td`
  padding: 11px 16px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

// ─── Footer totals row ─────────────────────────────────────────────────────────

interface TotalRowProps {
  $outOfBalance: boolean;
}

const TotalsTRow = styled.tr<TotalRowProps>`
  border-top: 3px double ${({ $outOfBalance }) =>
    $outOfBalance ? '#9E2A2A' : '#d1d5db'};
  background: ${({ $outOfBalance }) =>
    $outOfBalance ? 'rgba(158,42,42,0.06)' : 'transparent'};
`;

const TotalsTd = styled.td`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const TotalsTdMono = styled.td<TotalRowProps>`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  color: ${({ $outOfBalance }) => ($outOfBalance ? '#9E2A2A' : 'inherit')};
`;

const OutOfBalanceLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: #9E2A2A;
  display: block;
  margin-top: 2px;
`;

// ─── Status components ─────────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.status.danger || 'rgba(158,42,42,0.06)'};
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

const VoidedIncludedPill = styled.span`
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 99px;
  background: rgba(184,132,42,0.10);
  color: #B8842A;
  font-weight: 600;
`;

// ─── Main component ────────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const { user } = useAuthStore();

  const organizationId = useMemo<string>(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');

  // ── Companies fetch ──────────────────────────────────────────────────────────

  const { data: companiesData, isLoading: companiesLoading } = useFinanceCompanies(
    organizationId || null
  );
  const companies = companiesData ?? [];

  // ── Toolbar state ────────────────────────────────────────────────────────────

  const [selectedCompanyCode, setSelectedCompanyCode] = useState('');
  const effectiveCompanyCode = selectedCompanyCode || (companies[0]?.companyCode ?? '');

  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);

  // ── Display options ──────────────────────────────────────────────────────────

  const [showZeroBalances, setShowZeroBalances] = useState(false);

  // ── Periods fetch ────────────────────────────────────────────────────────────

  const { data: periods = [] } = useFinancePeriods(organizationId, effectiveCompanyCode);

  // ── Generate trigger ─────────────────────────────────────────────────────────

  // The query only fires when the user clicks "Generate". `queryEnabled` is set to
  // true on the first click and stays true — subsequent clicks with the same params
  // hit the TanStack Query cache (staleTime: 0 means the cache entry is immediately
  // stale, so TanStack Query re-fetches on focus/mount anyway). When params change
  // the query key changes and TanStack Query fires a fresh fetch automatically.
  const [queryEnabled, setQueryEnabled] = useState(false);

  // Build stable params object for the query.
  const queryParams = useMemo<GetTrialBalanceParams>(
    () => ({
      organizationId,
      companyCode: effectiveCompanyCode,
      asOfDate: asOfDate || undefined,
      periodId: selectedPeriodId || undefined,
      includeVoided,
    }),
    [organizationId, effectiveCompanyCode, asOfDate, selectedPeriodId, includeVoided]
  );

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    error: reportErrorObj,
    refetch,
  } = useTrialBalance(queryParams, queryEnabled);

  const handleGenerate = () => {
    if (queryEnabled) {
      // Already enabled: force a re-fetch even if params haven't changed.
      refetch();
    } else {
      setQueryEnabled(true);
    }
  };

  // ── Report data processing ───────────────────────────────────────────────────

  const allAccounts = report?.accounts ?? [];

  const visibleAccounts = useMemo(
    () => (showZeroBalances ? allAccounts : allAccounts.filter((a) => !isZeroBalance(a))),
    [allAccounts, showZeroBalances]
  );

  // Group visible accounts by drawer
  const byDrawer = useMemo<Map<string, TrialBalanceAccount[]>>(() => {
    const map = new Map<string, TrialBalanceAccount[]>();
    for (const acc of visibleAccounts) {
      const group = map.get(acc.drawer) ?? [];
      group.push(acc);
      map.set(acc.drawer, group);
    }
    return map;
  }, [visibleAccounts]);

  const drawers = Array.from(byDrawer.keys());

  // Totals
  const totalDR = parseFloat(report?.totals.totalDebit ?? '0');
  const totalCR = parseFloat(report?.totals.totalCredit ?? '0');
  const outOfBalance = report !== undefined && Math.abs(totalDR - totalCR) > 0.01;

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view the Trial Balance.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId || companiesLoading) {
    return (
      <PageContainer>
        <EmptyState>Loading…</EmptyState>
      </PageContainer>
    );
  }

  // ── Error message from backend ────────────────────────────────────────────────

  const reportErrorMessage = reportError
    ? (() => {
        const err = reportErrorObj as {
          response?: { data?: { detail?: unknown }; status?: number };
          message?: string;
        };
        const detail = err?.response?.data?.detail;
        return typeof detail === 'string'
          ? detail
          : (err?.message ?? 'Failed to generate trial balance. Please try again.');
      })()
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageTitle>Trial Balance</PageTitle>
      <PageSubtitle>
        A summary of all GL account balances as of a selected date. Debit and Credit totals
        must be equal — an imbalance indicates a data integrity issue.
      </PageSubtitle>
      <Divider />

      {/* ── Toolbar ── */}
      <ToolbarCard>
        <ToolbarRow>
          {/* Company selector */}
          <ToolbarField>
            <ToolbarLabel htmlFor="tb-company">Company</ToolbarLabel>
            <ToolbarSelect
              id="tb-company"
              value={effectiveCompanyCode}
              onChange={(e) => {
                setSelectedCompanyCode(e.target.value);
                setQueryEnabled(false);
              }}
              aria-label="Select company"
            >
              {companies.map((c) => (
                <option key={c.companyCode} value={c.companyCode}>
                  {c.companyCode} — {c.legalName}
                </option>
              ))}
              {companies.length === 0 && (
                <option value="">No companies</option>
              )}
            </ToolbarSelect>
          </ToolbarField>

          {/* As-of-date picker */}
          <ToolbarField>
            <ToolbarLabel htmlFor="tb-as-of-date">As of Date</ToolbarLabel>
            <ToolbarDateInput
              id="tb-as-of-date"
              type="date"
              value={asOfDate}
              max={todayIso()}
              onChange={(e) => {
                setAsOfDate(e.target.value);
                setQueryEnabled(false);
              }}
              aria-label="As of date"
            />
          </ToolbarField>

          {/* Period picker (optional) */}
          {periods.length > 0 && (
            <ToolbarField>
              <ToolbarLabel htmlFor="tb-period">Period (optional)</ToolbarLabel>
              <ToolbarSelect
                id="tb-period"
                value={selectedPeriodId}
                onChange={(e) => {
                  setSelectedPeriodId(e.target.value);
                  // Auto-set as-of-date to period end date when period is selected
                  if (e.target.value) {
                    const chosen = periods.find((p) => p.periodId === e.target.value);
                    if (chosen) setAsOfDate(chosen.endDate);
                  }
                  setQueryEnabled(false);
                }}
                aria-label="Select period"
              >
                <option value="">— No specific period —</option>
                {periods.map((p) => (
                  <option key={p.periodId} value={p.periodId}>
                    {p.periodName}
                    {p.isCurrent ? ' (Current)' : ''}
                    {p.isClosed ? ' (Closed)' : ''}
                  </option>
                ))}
              </ToolbarSelect>
            </ToolbarField>
          )}

          {/* Include voided toggle */}
          <ToolbarField>
            <ToolbarLabel as="span">Options</ToolbarLabel>
            <ToggleRow>
              <input
                type="checkbox"
                id="tb-include-voided"
                checked={includeVoided}
                onChange={(e) => {
                  setIncludeVoided(e.target.checked);
                  setQueryEnabled(false);
                }}
                aria-label="Include voided journal entries"
              />
              Include voided JEs
            </ToggleRow>
          </ToolbarField>

          {/* Generate button */}
          <GenerateButton
            type="button"
            onClick={handleGenerate}
            disabled={reportLoading || !effectiveCompanyCode}
            aria-busy={reportLoading}
          >
            {reportLoading ? 'Generating…' : 'Generate'}
          </GenerateButton>
        </ToolbarRow>
      </ToolbarCard>

      {/* ── Error banner ── */}
      {reportErrorMessage && (
        <ErrorBanner role="alert">{reportErrorMessage}</ErrorBanner>
      )}

      {/* ── Loading ── */}
      {reportLoading && (
        <LoadingOverlay aria-live="polite">Generating trial balance…</LoadingOverlay>
      )}

      {/* ── Empty before first generate ── */}
      {!queryEnabled && !report && !reportLoading && !reportError && (
        <EmptyState>
          Select a company and date above, then click <strong>Generate</strong> to view
          the trial balance.
        </EmptyState>
      )}

      {/* ── Report ── */}
      {report && !reportLoading && (
        <>
          {/* ── Display toggle bar ── */}
          <DisplayToggleRow>
            <ToggleRow>
              <input
                type="checkbox"
                id="tb-show-zero"
                checked={showZeroBalances}
                onChange={(e) => setShowZeroBalances(e.target.checked)}
                aria-label="Show zero-balance accounts"
              />
              Show zero-balance accounts
            </ToggleRow>
            {report.includesVoided && (
              <VoidedIncludedPill>Includes voided JEs</VoidedIncludedPill>
            )}
          </DisplayToggleRow>

          {/* ── Report meta header ── */}
          <ReportMetaBar>
            <ReportMetaTitle>
              Trial Balance — {report.companyCode}
            </ReportMetaTitle>
            <span>
              As of <strong>{report.asOfDate}</strong>
              {report.periodId ? ` · Period ${report.periodId}` : ''}
              {' · '}
              Generated{' '}
              {new Date(report.generatedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </ReportMetaBar>

          {visibleAccounts.length === 0 ? (
            <TableWrapper>
              <EmptyState>
                No accounts with activity found for the selected period.
                {!showZeroBalances && ' Try enabling "Show zero-balance accounts".'}
              </EmptyState>
            </TableWrapper>
          ) : (
            <TableWrapper>
              <TBTable role="table" aria-label="Trial Balance">
                <TBTHead>
                  <tr>
                    <TBTh scope="col">Account Number</TBTh>
                    <TBTh scope="col">Account Name</TBTh>
                    <TBTh scope="col">Drawer</TBTh>
                    <TBThRight scope="col">Total Debit (AED)</TBThRight>
                    <TBThRight scope="col">Total Credit (AED)</TBThRight>
                  </tr>
                </TBTHead>
                <tbody>
                  {drawers.map((drawer) => {
                    const accounts = byDrawer.get(drawer) ?? [];
                    return (
                      <>
                        {/* Drawer section header */}
                        <DrawerHeaderRow key={`drawer-${drawer}`}>
                          <DrawerHeaderCell colSpan={5}>
                            {drawer}
                          </DrawerHeaderCell>
                        </DrawerHeaderRow>

                        {/* Account rows */}
                        {accounts.map((acc) => (
                          <TBTr key={acc.accountId}>
                            <AccountNumberCell>{acc.accountNumber}</AccountNumberCell>
                            <TBTd>{acc.accountName}</TBTd>
                            <TBTd style={{ fontSize: 12, color: '#4B4844' }}>
                              {acc.drawer}
                            </TBTd>
                            <TBTdMono>
                              {parseFloat(acc.totalDebit) !== 0
                                ? formatNumber(acc.totalDebit)
                                : ''}
                            </TBTdMono>
                            <TBTdMono>
                              {parseFloat(acc.totalCredit) !== 0
                                ? formatNumber(acc.totalCredit)
                                : ''}
                            </TBTdMono>
                          </TBTr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <TotalsTRow $outOfBalance={outOfBalance}>
                    <TotalsTd colSpan={3}>
                      Totals
                      {outOfBalance && (
                        <OutOfBalanceLabel>
                          Books out of balance — contact administrator.
                        </OutOfBalanceLabel>
                      )}
                    </TotalsTd>
                    <TotalsTdMono $outOfBalance={outOfBalance}>
                      {formatNumber(report.totals.totalDebit)}
                    </TotalsTdMono>
                    <TotalsTdMono $outOfBalance={outOfBalance}>
                      {formatNumber(report.totals.totalCredit)}
                    </TotalsTdMono>
                  </TotalsTRow>
                </tfoot>
              </TBTable>
            </TableWrapper>
          )}
        </>
      )}
    </PageContainer>
  );
}
