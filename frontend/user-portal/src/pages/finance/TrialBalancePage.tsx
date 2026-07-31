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
import styled, { useTheme } from 'styled-components';
import { PageHeader, glassPanel, glassControl, monoLabel } from '@a64core/shared';
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

// Page floor stays transparent — the sky shows through; only cards/panels below get glass.
const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

// ─── Toolbar ───────────────────────────────────────────────────────────────────

const ToolbarCard = styled.div`
  ${glassPanel}
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
  ${monoLabel}
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ToolbarSelect = styled.select`
  ${glassControl}
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 180px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ToolbarDateInput = styled.input`
  ${glassControl}
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  user-select: none;
  padding-bottom: 2px;
`;

// This page's one primary CTA — spec §4 Buttons: gold gradient + onAccent
// (cosmos) text. Was `primary[500]` (lapis) + `onAccent`, the exact
// onAccent-on-non-gold bug the redesign flags — "Generate" is this page's
// single primary action, so it earns the gold treatment (spec §3), which
// makes onAccent correct again (dark text on a genuinely gold fill).
const GenerateButton = styled.button`
  padding: 10px 22px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 150ms ease, box-shadow 150ms ease;
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

// ─── Display toggles bar ───────────────────────────────────────────────────────

const DisplayToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ─── Report panel (meta bar + table, one glass layer) ──────────────────────────

const ReportPanel = styled.div`
  ${glassPanel}
  overflow: hidden;
`;

const ReportMetaBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ReportMetaTitle = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// ─── Table ─────────────────────────────────────────────────────────────────────
// Dense table, spec §4: transparent rows/header, Space Mono uppercase celeste
// column headers, `line` row dividers. Already sits inside ReportPanel — no
// per-row glass.

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const TBTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
`;

const TBTHead = styled.thead`
  background: transparent;
`;

const TBTh = styled.th`
  ${monoLabel}
  padding: 12px 16px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const TBThRight = styled(TBTh)`
  text-align: right;
`;

// ─── Drawer group separator row ────────────────────────────────────────────────

const DrawerHeaderRow = styled.tr`
  background: rgba(180, 200, 220, 0.05);
  border-top: 2px solid ${({ theme }) => theme.colors.line};
`;

const DrawerHeaderCell = styled.td`
  ${monoLabel}
  padding: 8px 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
`;

// ─── Data rows ─────────────────────────────────────────────────────────────────

const TBTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 100ms ease;
  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const TBTd = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TBTdMono = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AccountNumberCell = styled.td`
  padding: 11px 16px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
`;

// ─── Footer totals row ─────────────────────────────────────────────────────────

interface TotalRowProps {
  $outOfBalance: boolean;
}

const TotalsTRow = styled.tr<TotalRowProps>`
  border-top: 2px solid ${({ $outOfBalance, theme }) =>
    $outOfBalance ? theme.colors.error : theme.colors.line};
  background: ${({ $outOfBalance, theme }) =>
    $outOfBalance ? theme.colors.errorBg : 'transparent'};
`;

const TotalsTd = styled.td`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TotalsTdMono = styled.td<TotalRowProps>`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ $outOfBalance, theme }) => ($outOfBalance ? theme.colors.error : 'inherit')};
`;

const OutOfBalanceLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.error};
  display: block;
  margin-top: 2px;
`;

// ─── Status components ─────────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  line-height: 1.6;
`;

// Empty-state headline, spec §4/§9: Fraunces italic celeste.
const EmptyTitle = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 18px;
  font-weight: 400;
  margin-bottom: 6px;
  color: ${({ theme }) => theme.colors.celeste};
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

// "Includes voided JEs" is a report-data qualifier, not a document status —
// uses the generic `warning` semantic token (gold-b), which is distinct from
// `secondary` chrome gold (spec §1.1: warning is its own named hue, not
// subject to the gold-discipline budget in §3).
const VoidedIncludedPill = styled.span`
  ${monoLabel}
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 99px;
  background: ${({ theme }) => theme.colors.warningBg};
  color: ${({ theme }) => theme.colors.warning};
  border: 1px solid rgba(232, 200, 106, 0.45);
  font-weight: 700;
`;

// ─── Main component ────────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const theme = useTheme();
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
      <PageHeader
        breadcrumb="FINANCE · GENERAL LEDGER"
        title="Trial Balance"
        description="A summary of all GL account balances as of a selected date. Debit and Credit totals must be equal — an imbalance indicates a data integrity issue."
      />

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
          <EmptyTitle>No report generated yet</EmptyTitle>
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

          {visibleAccounts.length === 0 ? (
            <ReportPanel>
              <ReportMetaBar>
                <ReportMetaTitle>
                  Trial Balance — {report.companyCode}
                </ReportMetaTitle>
                <span>As of <strong>{report.asOfDate}</strong></span>
              </ReportMetaBar>
              <EmptyState>
                No accounts with activity found for the selected period.
                {!showZeroBalances && ' Try enabling "Show zero-balance accounts".'}
              </EmptyState>
            </ReportPanel>
          ) : (
            <ReportPanel>
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
                              <TBTd style={{ fontSize: 12, color: theme.colors.muted }}>
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
            </ReportPanel>
          )}
        </>
      )}
    </PageContainer>
  );
}
