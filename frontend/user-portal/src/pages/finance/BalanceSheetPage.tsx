/**
 * BalanceSheetPage — T-060.8
 *
 * Route: /finance/balance-sheet
 * Wrapped in <FinanceGate> (in App.tsx) + uses <FinanceReportPage> shell.
 *
 * Responsibilities:
 *   - Fire useQuery (and an optional parallel compare query) against
 *     GET /api/v1/finance/reports/balance-sheet.
 *   - Render the hierarchical account tree: Assets → Liabilities → Equity.
 *   - Apply display.amountScale and display.negativeDisplay from the shell.
 *   - Show a comparative column when filters.compareMode !== 'none'.
 *   - Show a warning badge when the accounting identity does not balance (Δ > 0.01).
 *   - Each leaf account row is clickable (and keyboard-accessible) and opens
 *     the drill-down modal via openDrillDown.
 *
 * The balance-sheet backend endpoint is single-snapshot only (no compare param).
 * When a comparative date is requested (filters.comparePeriodStart is set), we
 * fire a second parallel useQuery with compareAsOfDate as the snapshot date.
 *
 * Drill-down:
 *   Uses the JE list endpoint filtered by company + date to load all posted JEs
 *   up to asOfDate, then filters lines client-side by accountId. A dedicated
 *   BS drill-down endpoint is not yet built for this service version.
 */

import React, { useMemo, useCallback } from 'react';
import styled, { useTheme } from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { FinanceReportPage } from '../../components/finance/FinanceReportPage';
import { useBalanceSheet } from '../../hooks/queries/useFinanceReports';
import { useJournalEntries } from '../../hooks/queries/useJournalEntries';
import type {
  ReportFilters,
  DisplayOptions,
  AmountScale,
  NegativeDisplay,
  DrillDownPayload,
} from '../../components/finance/FinanceReportPage/types';
import type { BalanceSheetRow } from '../../services/financeReportsService';

// ─── Constants ────────────────────────────────────────────────────────────────

const BALANCE_TOLERANCE = 0.01;

const DRAWER_ORDER: { drawer: string; label: string }[] = [
  { drawer: 'assets', label: 'Assets' },
  { drawer: 'liabilities', label: 'Liabilities' },
  { drawer: 'equity', label: 'Equity' },
];

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatAmount(
  rawStr: string,
  scale: AmountScale,
  negativeDisplay: NegativeDisplay
): string {
  const n = parseFloat(rawStr);
  if (isNaN(n)) return '—';
  const scaled = Math.round(n / scale);
  const absStr = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(scaled));
  if (scaled < 0) {
    return negativeDisplay === 'parentheses' ? `(${absStr})` : `-${absStr}`;
  }
  return absStr;
}

function scaledLabel(scale: AmountScale): string {
  if (scale === 1) return 'AED';
  if (scale === 1000) return "AED '000";
  return "AED 'm";
}

function compareModeLabel(compareMode: string, compareDate: string): string {
  const d = compareDate || '—';
  if (compareMode === 'yoy') return `vs. ${d} (YoY)`;
  if (compareMode === 'previous') return `vs. ${d} (prior period)`;
  if (compareMode === 'custom') return `vs. ${d} (custom)`;
  return '';
}

function fmtDecimalRaw(n: number): string {
  if (n === 0) return '';
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function fmtRunning(n: number): string {
  const abs = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  if (n < 0) return `(${abs})`;
  return abs;
}

// ─── Styled components ────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow-x: auto;
  background: ${({ theme }) => theme.colors.surface};
`;

const BSTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
`;

const BSHead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[100]};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const BSHeadTh = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const BSHeadThRight = styled(BSHeadTh)`
  text-align: right;
`;

const SectionHeaderRow = styled.tr`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const SectionHeaderCell = styled.td`
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface DataRowProps {
  $isHeader: boolean;
  $isClickable: boolean;
}

const DataRow = styled.tr<DataRowProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  cursor: ${({ $isClickable }) => ($isClickable ? 'pointer' : 'default')};
  &:hover {
    background: ${({ theme, $isClickable }) =>
      $isClickable ? theme.colors.neutral[50] : 'transparent'};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: -2px;
  }
`;

interface NameCellProps {
  $indentLevel: number;
  $isHeader: boolean;
}

const NameCell = styled.td<NameCellProps>`
  padding: 10px 16px;
  padding-left: ${({ $indentLevel }) => 16 + $indentLevel * 20}px;
  font-size: 13px;
  font-weight: ${({ $isHeader }) => ($isHeader ? '600' : '400')};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AmountCell = styled.td`
  padding: 10px 16px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
`;

const SectionTotalRow = styled.tr`
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.neutral[50]};
`;

const SectionTotalCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SectionTotalAmountCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  border-bottom: 3px double ${({ theme }) => theme.colors.neutral[300]};
`;

const PLRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  background: ${({ theme }) => theme.colors.primary[50]};
`;

const PLNameCell = styled.td`
  padding: 10px 16px 10px 36px;
  font-size: 13px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PLAmountCell = styled.td`
  padding: 10px 16px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
  white-space: nowrap;
`;

interface IdentityRowProps {
  $imbalanced: boolean;
}

const IdentityRow = styled.tr<IdentityRowProps>`
  border-top: 3px double ${({ theme }) => theme.colors.neutral[400]};
  background: ${({ $imbalanced, theme }) => ($imbalanced ? theme.colors.errorBg : 'transparent')};
`;

const IdentityCell = styled.td`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

interface IdentityAmountCellProps {
  $imbalanced: boolean;
}

const IdentityAmountCell = styled.td<IdentityAmountCellProps>`
  padding: 13px 16px;
  font-size: 14px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ $imbalanced, theme }) => ($imbalanced ? theme.colors.error : 'inherit')};
  white-space: nowrap;
`;

const ImbalanceLabel = styled.span`
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.error};
  margin-top: 2px;
`;

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

const WarningBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.gold[800]};
  font-size: 13px;
  margin-bottom: 16px;
`;

const AccessDenied = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

// ─── Drill-down styled components ────────────────────────────────────────────

const DrillTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 500px;
`;

const DrillTHead = styled.thead`
  background: ${({ theme }) => theme.colors.neutral[100]};
`;

const DrillTh = styled.th`
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const DrillThRight = styled(DrillTh)`
  text-align: right;
`;

const DrillTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const DrillTd = styled.td`
  padding: 9px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DrillTdMono = styled.td`
  padding: 9px 14px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
`;

const DrillStatusCell = styled.div`
  padding: 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

// ─── AccountLedgerDrillDown ───────────────────────────────────────────────────

interface DrillDownContentProps {
  organizationId: string;
  companyCode: string;
  accountId: string;
  accountName: string;
  asOfDate: string;
}

/**
 * Renders a chronological ledger for a single account up to asOfDate.
 *
 * Fetches all posted JEs for the company up to asOfDate (size=500, v1 YAGNI
 * limit), then filters lines client-side by accountId to build a running balance.
 */
function AccountLedgerDrillDown({
  organizationId,
  companyCode,
  accountId,
  accountName,
  asOfDate,
}: DrillDownContentProps) {
  const theme = useTheme();
  const { data, isLoading, isError } = useJournalEntries({
    organizationId,
    companyCode,
    dateTo: asOfDate,
    status: 'posted',
    size: 500,
  });

  type LedgerLine = {
    key: string;
    jeDate: string;
    jeNumber: string;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
  };

  const lines = useMemo<LedgerLine[]>(() => {
    if (!data?.items) return [];

    const sorted = [...data.items].sort((a, b) =>
      a.jeDate < b.jeDate ? -1 : a.jeDate > b.jeDate ? 1 : 0
    );

    const result: LedgerLine[] = [];
    let running = 0;

    for (const je of sorted) {
      for (const line of je.lines ?? []) {
        if (line.accountId !== accountId) continue;
        const dr = parseFloat(String(line.debit ?? 0)) || 0;
        const cr = parseFloat(String(line.credit ?? 0)) || 0;
        running += dr - cr;
        result.push({
          key: `${je.jeId}-${line.jeLineId}`,
          jeDate: je.jeDate,
          jeNumber: je.jeNumber,
          description:
            line.description ?? je.description ?? je.sourceEventType ?? '—',
          debit: dr,
          credit: cr,
          runningBalance: running,
        });
      }
    }
    return result;
  }, [data, accountId]);

  if (isLoading) {
    return <DrillStatusCell aria-live="polite">Loading transactions…</DrillStatusCell>;
  }

  if (isError) {
    return (
      <DrillStatusCell role="alert">
        Failed to load transactions. Please close and try again.
      </DrillStatusCell>
    );
  }

  if (lines.length === 0) {
    return (
      <DrillStatusCell>
        No posted journal entry lines found for {accountName} up to {asOfDate}.
      </DrillStatusCell>
    );
  }

  return (
    <DrillTable role="table" aria-label={`Ledger for ${accountName}`}>
      <DrillTHead>
        <tr>
          <DrillTh scope="col">Date</DrillTh>
          <DrillTh scope="col">JE Number</DrillTh>
          <DrillTh scope="col">Description</DrillTh>
          <DrillThRight scope="col">Debit (AED)</DrillThRight>
          <DrillThRight scope="col">Credit (AED)</DrillThRight>
          <DrillThRight scope="col">Balance (AED)</DrillThRight>
        </tr>
      </DrillTHead>
      <tbody>
        {lines.map((ln) => (
          <DrillTr key={ln.key}>
            <DrillTd>{ln.jeDate}</DrillTd>
            <DrillTd style={{ fontFamily: theme.typography.fontFamily.mono, fontSize: 12 }}>
              {ln.jeNumber}
            </DrillTd>
            <DrillTd>{ln.description}</DrillTd>
            <DrillTdMono>{fmtDecimalRaw(ln.debit)}</DrillTdMono>
            <DrillTdMono>{fmtDecimalRaw(ln.credit)}</DrillTdMono>
            <DrillTdMono style={{ fontWeight: 600 }}>
              {fmtRunning(ln.runningBalance)}
            </DrillTdMono>
          </DrillTr>
        ))}
      </tbody>
    </DrillTable>
  );
}

// ─── Indent level helper ──────────────────────────────────────────────────────

function buildIndentMap(rows: BalanceSheetRow[]): Map<string, number> {
  const parentOf = new Map<string, string | null>(
    rows.map((r) => [r.accountId, r.parentAccountId])
  );
  const result = new Map<string, number>();
  for (const r of rows) {
    let level = 0;
    let cur: string | null = r.parentAccountId;
    let guard = 0;
    while (cur !== null && cur !== undefined && guard < 10) {
      level++;
      cur = parentOf.get(cur) ?? null;
      guard++;
    }
    result.set(r.accountId, Math.min(level, 3));
  }
  return result;
}

// ─── BalanceSheetContent (inner component, can call hooks freely) ─────────────

interface BalanceSheetContentProps {
  filters: ReportFilters;
  display: DisplayOptions;
  openDrillDown: (payload: DrillDownPayload) => void;
}

function BalanceSheetContent({
  filters,
  display,
  openDrillDown,
}: BalanceSheetContentProps) {
  const {
    organizationId,
    companyCode,
    asOfDate,
    costCenterIds,
    compareMode,
    comparePeriodStart,
    includeVoided,
  } = filters;

  const amountScale: AmountScale = display.amountScale;
  const negativeDisplay: NegativeDisplay = display.negativeDisplay;

  // Primary balance sheet query.
  const primaryParams = useMemo(
    () => ({ organizationId, companyCode, asOfDate, includeVoided, costCenterIds }),
    [organizationId, companyCode, asOfDate, includeVoided, costCenterIds]
  );

  const {
    data: primaryReport,
    isLoading: primaryLoading,
    isError: primaryError,
    error: primaryErrorObj,
  } = useBalanceSheet(primaryParams, !!organizationId && !!companyCode);

  // Comparative date — for snapshot BS, stored in comparePeriodStart.
  const compareAsOfDate =
    compareMode !== 'none' && comparePeriodStart ? comparePeriodStart : undefined;

  const compareParams = useMemo(
    () => ({
      organizationId,
      companyCode,
      asOfDate: compareAsOfDate,
      includeVoided,
      costCenterIds,
    }),
    [organizationId, companyCode, compareAsOfDate, includeVoided, costCenterIds]
  );

  const { data: compareReport, isLoading: compareLoading } = useBalanceSheet(
    compareParams,
    !!compareAsOfDate && !!organizationId && !!companyCode
  );

  // Build drill-down callback (stable across renders via useCallback).
  const handleRowClick = useCallback(
    (accountId: string, accountName: string) => {
      openDrillDown({
        title: accountName,
        content: (
          <AccountLedgerDrillDown
            organizationId={organizationId}
            companyCode={companyCode}
            accountId={accountId}
            accountName={accountName}
            asOfDate={asOfDate ?? new Date().toISOString().slice(0, 10)}
          />
        ),
      });
    },
    [openDrillDown, organizationId, companyCode, asOfDate]
  );

  // ── Guard states ────────────────────────────────────────────────────────────

  if (!organizationId || !companyCode) {
    return (
      <EmptyState>Select a company above to view the Balance Sheet.</EmptyState>
    );
  }

  if (primaryLoading) {
    return (
      <LoadingOverlay aria-live="polite">Loading Balance Sheet…</LoadingOverlay>
    );
  }

  if (primaryError) {
    const err = primaryErrorObj as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = err?.response?.data?.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : (err?.message ?? 'Failed to load Balance Sheet. Please try again.');
    return <ErrorBanner role="alert">{msg}</ErrorBanner>;
  }

  if (!primaryReport) {
    return (
      <EmptyState>
        No Balance Sheet data available for the selected company and date.
      </EmptyState>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const indentMap = buildIndentMap(primaryReport.rows);

  const byDrawer = new Map<string, BalanceSheetRow[]>();
  for (const row of primaryReport.rows) {
    const group = byDrawer.get(row.drawer) ?? [];
    group.push(row);
    byDrawer.set(row.drawer, group);
  }

  const compareBalanceMap = new Map<string, string>();
  if (compareReport) {
    for (const r of compareReport.rows) {
      compareBalanceMap.set(r.accountId, r.balance);
    }
  }

  // Accounting identity check — use backend-computed delta for precision.
  const balanceDelta = parseFloat(primaryReport.totals.balanceDelta);
  const isImbalanced = Math.abs(balanceDelta) > BALANCE_TOLERANCE;

  const hasCompare = compareMode !== 'none' && !!compareAsOfDate;
  const compareColLabel = hasCompare
    ? compareModeLabel(compareMode, compareAsOfDate ?? '')
    : '';
  const colCount = hasCompare ? 3 : 2;
  const amountHeader = `Amount (${scaledLabel(amountScale)})`;

  const fmt = (val: string) => formatAmount(val, amountScale, negativeDisplay);

  const fmtCompare = (accountId: string): string => {
    if (compareLoading) return '…';
    const val = compareBalanceMap.get(accountId);
    return val !== undefined ? fmt(val) : '—';
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {primaryReport.warnings.map((w, i) => (
        <WarningBanner key={i} role="alert">
          {w}
        </WarningBanner>
      ))}

      <TableWrapper>
        <BSTable
          role="table"
          aria-label={`Balance Sheet as of ${primaryReport.asOfDate}`}
        >
          <BSHead>
            <tr>
              <BSHeadTh scope="col">Account</BSHeadTh>
              <BSHeadThRight scope="col">{amountHeader}</BSHeadThRight>
              {hasCompare && (
                <BSHeadThRight scope="col">{compareColLabel}</BSHeadThRight>
              )}
            </tr>
          </BSHead>
          <tbody>
            {DRAWER_ORDER.map(({ drawer, label }) => {
              const drawerRows = byDrawer.get(drawer) ?? [];
              if (drawerRows.length === 0) return null;

              let drawerTotal = '0';
              if (drawer === 'assets') {
                drawerTotal = primaryReport.totals.totalAssets;
              } else if (drawer === 'liabilities') {
                drawerTotal = primaryReport.totals.totalLiabilities;
              } else if (drawer === 'equity') {
                drawerTotal = primaryReport.totals.totalEquity;
              }

              let compareDrawerTotal: string | undefined;
              if (hasCompare && compareReport) {
                if (drawer === 'assets') {
                  compareDrawerTotal = compareReport.totals.totalAssets;
                } else if (drawer === 'liabilities') {
                  compareDrawerTotal = compareReport.totals.totalLiabilities;
                } else if (drawer === 'equity') {
                  compareDrawerTotal = compareReport.totals.totalEquity;
                }
              }

              return (
                <React.Fragment key={drawer}>
                  <SectionHeaderRow>
                    <SectionHeaderCell colSpan={colCount}>{label}</SectionHeaderCell>
                  </SectionHeaderRow>

                  {drawerRows.map((row) => {
                    const indent = indentMap.get(row.accountId) ?? 0;
                    const isLeaf = !row.isHeader;

                    return (
                      <DataRow
                        key={row.accountId}
                        $isHeader={row.isHeader}
                        $isClickable={isLeaf}
                        onClick={
                          isLeaf
                            ? () => handleRowClick(row.accountId, row.accountName)
                            : undefined
                        }
                        onKeyDown={
                          isLeaf
                            ? (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleRowClick(row.accountId, row.accountName);
                                }
                              }
                            : undefined
                        }
                        tabIndex={isLeaf ? 0 : undefined}
                        role={isLeaf ? 'button' : undefined}
                        aria-label={
                          isLeaf
                            ? `${row.accountName}, ${fmt(row.balance)} — click to view ledger`
                            : undefined
                        }
                      >
                        <NameCell $indentLevel={indent} $isHeader={row.isHeader}>
                          {row.accountNumber}{' '}
                          {row.accountName}
                        </NameCell>
                        <AmountCell>{fmt(row.balance)}</AmountCell>
                        {hasCompare && (
                          <AmountCell>{fmtCompare(row.accountId)}</AmountCell>
                        )}
                      </DataRow>
                    );
                  })}

                  {/* Synthetic Current Year P/(L) row inside equity section */}
                  {drawer === 'equity' && (
                    <PLRow>
                      <PLNameCell colSpan={1}>
                        Current Year Profit / (Loss) — live
                      </PLNameCell>
                      <PLAmountCell>
                        {fmt(primaryReport.currentYearProfitLoss)}
                      </PLAmountCell>
                      {hasCompare && (
                        <PLAmountCell>
                          {compareLoading
                            ? '…'
                            : compareReport
                            ? fmt(compareReport.currentYearProfitLoss)
                            : '—'}
                        </PLAmountCell>
                      )}
                    </PLRow>
                  )}

                  <SectionTotalRow>
                    <SectionTotalCell>Total {label}</SectionTotalCell>
                    <SectionTotalAmountCell>
                      {fmt(drawerTotal)}
                    </SectionTotalAmountCell>
                    {hasCompare && (
                      <SectionTotalAmountCell>
                        {compareLoading
                          ? '…'
                          : compareDrawerTotal !== undefined
                          ? fmt(compareDrawerTotal)
                          : '—'}
                      </SectionTotalAmountCell>
                    )}
                  </SectionTotalRow>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            {/* Accounting identity row */}
            <IdentityRow $imbalanced={isImbalanced}>
              <IdentityCell>
                Total Assets = Total Liabilities + Total Equity
                {isImbalanced && (
                  <ImbalanceLabel>
                    Books out of balance (delta:{' '}
                    {formatAmount(primaryReport.totals.balanceDelta, 1, 'minus')}{' '}
                    AED). Investigate unbalanced JEs.
                  </ImbalanceLabel>
                )}
              </IdentityCell>
              <IdentityAmountCell $imbalanced={isImbalanced}>
                {fmt(primaryReport.totals.totalAssets)}
              </IdentityAmountCell>
              {hasCompare && (
                <IdentityAmountCell $imbalanced={false}>
                  {compareLoading
                    ? '…'
                    : compareReport
                    ? fmt(compareReport.totals.totalAssets)
                    : '—'}
                </IdentityAmountCell>
              )}
            </IdentityRow>
          </tfoot>
        </BSTable>
      </TableWrapper>
    </>
  );
}

// ─── BalanceSheetPage ─────────────────────────────────────────────────────────

/**
 * BalanceSheetPage
 *
 * Named export — lazy-loaded in App.tsx:
 *   const BalanceSheetPage = lazy(() =>
 *     import('./pages/finance/BalanceSheetPage').then(m => ({ default: m.BalanceSheetPage }))
 *   );
 */
export function BalanceSheetPage() {
  const { user } = useAuthStore();

  if (!READ_ROLES.has(user?.role ?? '')) {
    return (
      <AccessDenied>
        You don't have permission to view the Balance Sheet.
      </AccessDenied>
    );
  }

  return (
    <FinanceReportPage
      statement="balance-sheet"
      statementKind="snapshot"
      title="Balance Sheet"
    >
      {({ filters, display, openDrillDown }) => (
        <BalanceSheetContent
          filters={filters}
          display={display}
          openDrillDown={openDrillDown}
        />
      )}
    </FinanceReportPage>
  );
}
