/**
 * CashFlowStatementPage — T-060.10
 *
 * Route: /finance/cash-flow
 * Wrapped in <FinanceGate> (in App.tsx) + uses <FinanceReportPage> shell
 * with statementKind="range" (period start + end pickers).
 *
 * Responsibilities:
 *   - Fire useCashFlow against GET /api/v1/finance/reports/cash-flow.
 *     The CF backend does NOT accept compare_period_start / compare_period_end
 *     in a single request — confirmed by reading the endpoint signature.
 *     When compareMode !== 'none', two parallel useQuery calls are made:
 *     one for the primary period and one for the comparison period.
 *     This matches the BalanceSheetPage pattern (two parallel queries).
 *
 *   - Render the indirect-method CF layout:
 *       OPERATING ACTIVITIES
 *         Net Income (starting point)
 *         Adjustments for non-cash items
 *         Changes in working capital
 *         Net Cash from Operating Activities
 *       INVESTING ACTIVITIES
 *         (flat line list)
 *         Net Cash from Investing Activities
 *       FINANCING ACTIVITIES
 *         (flat line list)
 *         Net Cash from Financing Activities
 *       Net Change in Cash
 *       Cash & Equivalents — Beginning Balance
 *       Cash & Equivalents — Ending Balance
 *
 *   - Show a prominent red banner when `reconciliationDelta` is non-zero
 *     (i.e. netChangeInCash does not reconcile to cashAtEnd - cashAtBeginning
 *     within 0.01 AED). This is the cash-validator warning from T-060.5.
 *
 *   - Apply display.amountScale and display.negativeDisplay from the shell.
 *   - Show a comparative column when compareMode !== 'none' and
 *     comparePeriodStart is set (compare-period warning check is primary only).
 *   - Each account row is clickable → drill-down via openDrillDown.
 *
 * Drill-down decision: INLINE (not extracted).
 * Reason: BalanceSheetPage uses dateTo only; IS + CF use dateFrom + dateTo.
 * The shapes are structurally incompatible for a clean extraction. A shared
 * AccountLedgerDrillDown component can be extracted in a follow-up when the
 * BS drill-down is also updated to use a date range (Wave 2.5 scope).
 * TODO: extract when BS + IS + CF drill-down shapes converge.
 */

import React, { useMemo, useCallback } from 'react';
import styled, { useTheme } from 'styled-components';
import { glassPanel, monoLabel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { FinanceReportPage } from '../../components/finance/FinanceReportPage';
import { useCashFlow } from '../../hooks/queries/useFinanceReports';
import { useJournalEntries } from '../../hooks/queries/useJournalEntries';
import type {
  ReportFilters,
  DisplayOptions,
  AmountScale,
  NegativeDisplay,
  DrillDownPayload,
} from '../../components/finance/FinanceReportPage/types';
import type {
  CashFlowReport,
  CashFlowLine,
} from '../../services/financeReportsService';

// ─── Constants ────────────────────────────────────────────────────────────────

const RECONCILE_TOLERANCE = 0.01;

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

/**
 * Column header label for the comparison period column.
 * For range statements we show start–end dates.
 */
function compareColumnLabel(
  compareMode: string,
  compareStart: string,
  compareEnd: string
): string {
  const start = compareStart || '—';
  const end = compareEnd || '—';

  if (compareMode === 'yoy') {
    if (start.endsWith('-01-01') && end.endsWith('-12-31')) {
      return `vs. ${start.slice(0, 4)} (YoY)`;
    }
    return `vs. ${start}—${end} (YoY)`;
  }
  if (compareMode === 'previous') {
    return `vs. ${start}—${end}`;
  }
  if (compareMode === 'custom') {
    return `vs. ${start}—${end} (custom)`;
  }
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

// Dense statement table — spec §4 "Tables": one glass panel wraps the whole
// table, transparent header/rows, Space Mono uppercase celeste column
// headers, `line` row dividers, hover rgba(180,200,220,.05).
const TableWrapper = styled.div`
  ${glassPanel}
  overflow-x: auto;
`;

const CFTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
`;

const CFHead = styled.thead`
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 1;
`;

const CFHeadTh = styled.th`
  ${monoLabel}
  padding: 12px 16px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const CFHeadThRight = styled(CFHeadTh)`
  text-align: right;
`;

const SectionHeaderRow = styled.tr`
  background: transparent;
  border-top: 2px solid ${({ theme }) => theme.colors.line};
`;

const SectionHeaderCell = styled.td`
  ${monoLabel}
  padding: 10px 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
`;

const SubSectionHeaderRow = styled.tr`
  background: transparent;
`;

const SubSectionHeaderCell = styled.td`
  padding: 8px 16px 8px 32px;
  font-size: 12px;
  font-weight: 600;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
`;

interface DataRowProps {
  $isClickable: boolean;
}

const DataRow = styled.tr<DataRowProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  cursor: ${({ $isClickable }) => ($isClickable ? 'pointer' : 'default')};
  &:hover {
    background: ${({ $isClickable }) => ($isClickable ? 'rgba(180, 200, 220, 0.05)' : 'transparent')};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: -2px;
  }
`;

const NameCell = styled.td<{ $indentLevel: number }>`
  padding: 10px 16px;
  padding-left: ${({ $indentLevel }) => 16 + $indentLevel * 20}px;
  font-size: 13px;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StartingLineRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const StartingLineCell = styled.td`
  padding: 10px 16px 10px 32px;
  font-size: 13px;
  font-weight: 500;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
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
  border-top: 2px solid ${({ theme }) => theme.colors.line};
  background: rgba(180, 200, 220, 0.04);
`;

const SectionTotalCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Debit/credit — here, "Net Cash from X Activities" — polarity, spec
// judgment call: these three section totals (and Net Change in Cash below)
// are genuine profit/loss-shaped figures that can go negative (a net cash
// outflow), unlike BalanceSheetPage/IncomeStatementPage section totals
// which are typically framed as absolute costs. bright.emerald for a net
// inflow, bright.coral for a net outflow.
interface PolarityProps {
  $positive?: boolean;
  $negative?: boolean;
}

const SectionTotalAmountCell = styled.td<PolarityProps>`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme, $positive, $negative }) => {
    if ($positive) return theme.colors.bright.emerald;
    if ($negative) return theme.colors.bright.coral;
    return theme.colors.textPrimary;
  }};
  white-space: nowrap;
  border-bottom: 3px double ${({ theme }) => theme.colors.line};
`;

const SubtotalRow = styled.tr`
  background: rgba(180, 200, 220, 0.04);
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const SubtotalCell = styled.td`
  padding: 9px 16px 9px 32px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
`;

const SubtotalAmountCell = styled.td`
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.celeste};
  white-space: nowrap;
`;

/** Net Change in Cash footer row — bold double-underline. */
const NetChangeRow = styled.tr`
  border-top: 3px double ${({ theme }) => theme.colors.line};
  background: transparent;
`;

const NetChangeCell = styled.td`
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const NetChangeAmountCell = styled.td<PolarityProps>`
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme, $positive, $negative }) => {
    if ($positive) return theme.colors.bright.emerald;
    if ($negative) return theme.colors.bright.coral;
    return theme.colors.textPrimary;
  }};
  white-space: nowrap;
`;

const CashBalanceRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(180, 200, 220, 0.04);
`;

const CashBalanceCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CashBalanceAmountCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
`;

const ClosingCashRow = styled.tr`
  border-top: 2px solid ${({ theme }) => theme.colors.line};
  background: rgba(180, 200, 220, 0.06);
`;

const ClosingCashCell = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ClosingCashAmountCell = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  border-bottom: 3px double ${({ theme }) => theme.colors.line};
`;

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  line-height: 1.6;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

/**
 * Cash-validator warning banner — rendered prominently when
 * reconciliationDelta is non-zero. Mirrors the accounting-identity
 * warning pattern from BalanceSheetPage (coral-tinted glass banner, never
 * solid red, per spec §4 destructive/error treatment).
 */
const ReconcileWarningBanner = styled.div`
  padding: 14px 18px;
  background: rgba(240, 138, 112, 0.14);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1.5px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 14px;
  }
`;

// Uses the semantic `warning` token directly (bright.gold's warning/toast
// twin — see mixins.ts note — NOT the decorative CTA gold).
const WarningBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.warning};
  font-size: 13px;
  margin-bottom: 16px;
`;

const AccessDenied = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`;

// ─── Drill-down styled components ────────────────────────────────────────────
// Rendered inside the FinanceReportPage shell's own glass modal — these stay
// unfilled/transparent so they don't add a second glass layer (spec §2).

const DrillTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 500px;
`;

const DrillTHead = styled.thead`
  background: transparent;
`;

const DrillTh = styled.th`
  ${monoLabel}
  padding: 10px 14px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const DrillThRight = styled(DrillTh)`
  text-align: right;
`;

const DrillTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  &:hover {
    background: rgba(180, 200, 220, 0.05);
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
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
`;

// ─── AccountLedgerDrillDown ───────────────────────────────────────────────────
// TODO: extract shared component when BS + IS + CF drill-down shapes converge.
// BS currently uses dateTo only; IS + CF use dateFrom + dateTo.

interface DrillDownContentProps {
  organizationId: string;
  companyCode: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Renders a chronological ledger for a single account over the CF period.
 *
 * Fetches all posted JEs for the company in [periodStart, periodEnd] (size=500,
 * v1 YAGNI limit), then filters lines client-side by accountId.
 */
function AccountLedgerDrillDown({
  organizationId,
  companyCode,
  accountId,
  accountName,
  periodStart,
  periodEnd,
}: DrillDownContentProps) {
  const theme = useTheme();
  const { data, isLoading, isError } = useJournalEntries({
    organizationId,
    companyCode,
    dateFrom: periodStart,
    dateTo: periodEnd,
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
        No posted journal entry lines found for {accountName} between {periodStart}{' '}
        and {periodEnd}.
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

// ─── CashFlowLineRows — shared row renderer ───────────────────────────────────

interface CashFlowLineRowsProps {
  lines: CashFlowLine[];
  indentLevel: number;
  fmt: (val: string) => string;
  hasCompare: boolean;
  compareMap: Map<string, string>;
  onRowClick: (accountId: string, accountName: string) => void;
}

/**
 * Renders a list of CashFlowLine rows with optional compare column.
 * Each row is keyboard-accessible and calls onRowClick on activation.
 */
function CashFlowLineRows({
  lines,
  indentLevel,
  fmt,
  hasCompare,
  compareMap,
  onRowClick,
}: CashFlowLineRowsProps) {
  if (lines.length === 0) return null;

  return (
    <>
      {lines.map((line) => (
        <DataRow
          key={line.accountId}
          $isClickable
          onClick={() => onRowClick(line.accountId, line.accountName)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(line.accountId, line.accountName);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`${line.accountName}, ${fmt(line.contribution)} — click to view ledger`}
        >
          <NameCell $indentLevel={indentLevel}>
            {line.accountNumber} {line.accountName}
          </NameCell>
          <AmountCell>{fmt(line.contribution)}</AmountCell>
          {hasCompare && (
            <AmountCell>
              {(() => {
                const v = compareMap.get(line.accountId);
                return v !== undefined ? fmt(v) : '—';
              })()}
            </AmountCell>
          )}
        </DataRow>
      ))}
    </>
  );
}

// ─── CashFlowStatementContent (inner component, can call hooks freely) ────────

interface CashFlowStatementContentProps {
  filters: ReportFilters;
  display: DisplayOptions;
  openDrillDown: (payload: DrillDownPayload) => void;
}

function CashFlowStatementContent({
  filters,
  display,
  openDrillDown,
}: CashFlowStatementContentProps) {
  const {
    organizationId,
    companyCode,
    periodStart,
    periodEnd,
    costCenterIds,
    compareMode,
    comparePeriodStart,
    comparePeriodEnd,
    includeVoided,
  } = filters;

  const amountScale: AmountScale = display.amountScale;
  const negativeDisplay: NegativeDisplay = display.negativeDisplay;

  const hasCompare =
    compareMode !== 'none' && !!comparePeriodStart && !!comparePeriodEnd;

  // Primary period query params.
  const primaryParams = useMemo(
    () => ({
      organizationId,
      companyCode,
      periodStart: periodStart ?? '',
      periodEnd: periodEnd ?? '',
      includeVoided,
      costCenterIds,
    }),
    [organizationId, companyCode, periodStart, periodEnd, includeVoided, costCenterIds]
  );

  // Compare period query params — only used when hasCompare.
  // The CF backend does not accept compare params in a single call, so we
  // fire a separate query (same pattern as BalanceSheetPage).
  const compareParams = useMemo(
    () => ({
      organizationId,
      companyCode,
      periodStart: comparePeriodStart ?? '',
      periodEnd: comparePeriodEnd ?? '',
      includeVoided,
      costCenterIds,
    }),
    [
      organizationId,
      companyCode,
      comparePeriodStart,
      comparePeriodEnd,
      includeVoided,
      costCenterIds,
    ]
  );

  const isParamReady = !!organizationId && !!companyCode && !!periodStart && !!periodEnd;

  const {
    data: primaryReport,
    isLoading: primaryLoading,
    isError: primaryError,
    error: primaryErrorObj,
  } = useCashFlow(primaryParams, isParamReady);

  const {
    data: compareReport,
    isLoading: compareLoading,
  } = useCashFlow(
    compareParams,
    hasCompare && isParamReady && !!comparePeriodStart && !!comparePeriodEnd
  );

  // Build drill-down callback.
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
            periodStart={periodStart ?? new Date().toISOString().slice(0, 10)}
            periodEnd={periodEnd ?? new Date().toISOString().slice(0, 10)}
          />
        ),
      });
    },
    [openDrillDown, organizationId, companyCode, periodStart, periodEnd]
  );

  // ── Guard states ────────────────────────────────────────────────────────────

  if (!organizationId || !companyCode) {
    return (
      <EmptyState>
        Select a company above to view the Cash Flow Statement.
      </EmptyState>
    );
  }

  if (!periodStart || !periodEnd) {
    return (
      <EmptyState>
        Select a period range above to view the Cash Flow Statement.
      </EmptyState>
    );
  }

  if (primaryLoading || (hasCompare && compareLoading)) {
    return (
      <LoadingOverlay aria-live="polite">Loading Cash Flow Statement…</LoadingOverlay>
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
        : (err?.message ?? 'Failed to load Cash Flow Statement. Please try again.');
    return <ErrorBanner role="alert">{msg}</ErrorBanner>;
  }

  if (!primaryReport) {
    return (
      <EmptyState>
        No Cash Flow data available for the selected company and period.
      </EmptyState>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const fmt = (val: string) => formatAmount(val, amountScale, negativeDisplay);

  const colCount = hasCompare ? 3 : 2;
  const amountHeader = `Amount (${scaledLabel(amountScale)})`;
  const compareColLabel = hasCompare
    ? compareColumnLabel(compareMode, comparePeriodStart ?? '', comparePeriodEnd ?? '')
    : '';

  // Check reconciliation delta for cash-validator warning.
  const reconcileDelta = parseFloat(primaryReport.reconciliationDelta);
  const hasReconcileWarning = Math.abs(reconcileDelta) > RECONCILE_TOLERANCE;

  // Build compare lookup maps — keyed by accountId.
  // For line contributions:
  const compareNonCashMap = new Map<string, string>(
    (compareReport?.operating.nonCashAdjustments ?? []).map((l) => [
      l.accountId,
      l.contribution,
    ])
  );
  const compareWorkingCapMap = new Map<string, string>(
    (compareReport?.operating.workingCapitalChanges ?? []).map((l) => [
      l.accountId,
      l.contribution,
    ])
  );
  const compareInvestingMap = new Map<string, string>(
    (compareReport?.investing.items ?? []).map((l) => [l.accountId, l.contribution])
  );
  const compareFinancingMap = new Map<string, string>(
    (compareReport?.financing.items ?? []).map((l) => [l.accountId, l.contribution])
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Cash-validator reconciliation warning — red, prominent */}
      {hasReconcileWarning && (
        <ReconcileWarningBanner role="alert" aria-live="polite">
          <strong>Cash flow statement does not reconcile.</strong>
          Net change in cash ({fmt(primaryReport.netChangeInCash)}) does not equal
          the actual cash account delta ({fmt(primaryReport.cashDelta)}).
          {' '}Delta = {fmt(primaryReport.reconciliationDelta)} AED.
          {' '}This typically indicates a missing posting or an account with
          {' '}cashFlowCategory=&apos;none&apos; that should have been classified.
          {' '}Review the Chart of Accounts cashFlowCategory assignments to resolve.
        </ReconcileWarningBanner>
      )}

      {/* Other backend warnings (e.g. partially unclassified accounts) */}
      {primaryReport.warnings
        .filter((w) => !w.includes('does not reconcile'))
        .map((w, i) => (
          <WarningBanner key={i} role="alert">
            {w}
          </WarningBanner>
        ))}

      <TableWrapper>
        <CFTable
          role="table"
          aria-label={`Cash Flow Statement ${periodStart} to ${periodEnd}`}
        >
          <CFHead>
            <tr>
              <CFHeadTh scope="col">Item</CFHeadTh>
              <CFHeadThRight scope="col">{amountHeader}</CFHeadThRight>
              {hasCompare && (
                <CFHeadThRight scope="col">{compareColLabel}</CFHeadThRight>
              )}
            </tr>
          </CFHead>
          <tbody>

            {/* ══ OPERATING ACTIVITIES ══ */}
            <SectionHeaderRow>
              <SectionHeaderCell colSpan={colCount}>
                Operating Activities
              </SectionHeaderCell>
            </SectionHeaderRow>

            {/* Net Income — starting point of the indirect method */}
            <StartingLineRow>
              <StartingLineCell colSpan={1}>
                Net Income (starting point)
              </StartingLineCell>
              <AmountCell>{fmt(primaryReport.operating.netIncome)}</AmountCell>
              {hasCompare && (
                <AmountCell>
                  {compareReport ? fmt(compareReport.operating.netIncome) : '—'}
                </AmountCell>
              )}
            </StartingLineRow>

            {/* Non-cash adjustments sub-section */}
            {primaryReport.operating.nonCashAdjustments.length > 0 && (
              <>
                <SubSectionHeaderRow>
                  <SubSectionHeaderCell colSpan={colCount}>
                    Adjustments for non-cash items:
                  </SubSectionHeaderCell>
                </SubSectionHeaderRow>
                <CashFlowLineRows
                  lines={primaryReport.operating.nonCashAdjustments}
                  indentLevel={2}
                  fmt={fmt}
                  hasCompare={hasCompare}
                  compareMap={compareNonCashMap}
                  onRowClick={handleRowClick}
                />
                <SubtotalRow>
                  <SubtotalCell>Total non-cash adjustments</SubtotalCell>
                  <SubtotalAmountCell>
                    {fmt(primaryReport.operating.nonCashAdjustmentsTotal)}
                  </SubtotalAmountCell>
                  {hasCompare && (
                    <SubtotalAmountCell>
                      {compareReport
                        ? fmt(compareReport.operating.nonCashAdjustmentsTotal)
                        : '—'}
                    </SubtotalAmountCell>
                  )}
                </SubtotalRow>
              </>
            )}

            {/* Working capital changes sub-section */}
            {primaryReport.operating.workingCapitalChanges.length > 0 && (
              <>
                <SubSectionHeaderRow>
                  <SubSectionHeaderCell colSpan={colCount}>
                    Changes in working capital:
                  </SubSectionHeaderCell>
                </SubSectionHeaderRow>
                <CashFlowLineRows
                  lines={primaryReport.operating.workingCapitalChanges}
                  indentLevel={2}
                  fmt={fmt}
                  hasCompare={hasCompare}
                  compareMap={compareWorkingCapMap}
                  onRowClick={handleRowClick}
                />
                <SubtotalRow>
                  <SubtotalCell>Total working capital changes</SubtotalCell>
                  <SubtotalAmountCell>
                    {fmt(primaryReport.operating.workingCapitalChangesTotal)}
                  </SubtotalAmountCell>
                  {hasCompare && (
                    <SubtotalAmountCell>
                      {compareReport
                        ? fmt(compareReport.operating.workingCapitalChangesTotal)
                        : '—'}
                    </SubtotalAmountCell>
                  )}
                </SubtotalRow>
              </>
            )}

            {/* Operating section total */}
            <SectionTotalRow>
              <SectionTotalCell>Net Cash from Operating Activities</SectionTotalCell>
              <SectionTotalAmountCell
                $positive={parseFloat(primaryReport.operating.total) >= 0}
                $negative={parseFloat(primaryReport.operating.total) < 0}
              >
                {fmt(primaryReport.operating.total)}
              </SectionTotalAmountCell>
              {hasCompare && (
                <SectionTotalAmountCell
                  $positive={!!compareReport && parseFloat(compareReport.operating.total) >= 0}
                  $negative={!!compareReport && parseFloat(compareReport.operating.total) < 0}
                >
                  {compareReport ? fmt(compareReport.operating.total) : '—'}
                </SectionTotalAmountCell>
              )}
            </SectionTotalRow>

            {/* ══ INVESTING ACTIVITIES ══ */}
            <SectionHeaderRow>
              <SectionHeaderCell colSpan={colCount}>
                Investing Activities
              </SectionHeaderCell>
            </SectionHeaderRow>

            {primaryReport.investing.items.length === 0 ? (
              <DataRow $isClickable={false}>
                <NameCell $indentLevel={1}
                  colSpan={colCount}
                  style={{ color: 'inherit', fontStyle: 'italic', opacity: 0.6 }}
                >
                  No investing activity for this period.
                </NameCell>
              </DataRow>
            ) : (
              <CashFlowLineRows
                lines={primaryReport.investing.items}
                indentLevel={1}
                fmt={fmt}
                hasCompare={hasCompare}
                compareMap={compareInvestingMap}
                onRowClick={handleRowClick}
              />
            )}

            <SectionTotalRow>
              <SectionTotalCell>Net Cash from Investing Activities</SectionTotalCell>
              <SectionTotalAmountCell
                $positive={parseFloat(primaryReport.investing.total) >= 0}
                $negative={parseFloat(primaryReport.investing.total) < 0}
              >
                {fmt(primaryReport.investing.total)}
              </SectionTotalAmountCell>
              {hasCompare && (
                <SectionTotalAmountCell
                  $positive={!!compareReport && parseFloat(compareReport.investing.total) >= 0}
                  $negative={!!compareReport && parseFloat(compareReport.investing.total) < 0}
                >
                  {compareReport ? fmt(compareReport.investing.total) : '—'}
                </SectionTotalAmountCell>
              )}
            </SectionTotalRow>

            {/* ══ FINANCING ACTIVITIES ══ */}
            <SectionHeaderRow>
              <SectionHeaderCell colSpan={colCount}>
                Financing Activities
              </SectionHeaderCell>
            </SectionHeaderRow>

            {primaryReport.financing.items.length === 0 ? (
              <DataRow $isClickable={false}>
                <NameCell $indentLevel={1}
                  colSpan={colCount}
                  style={{ color: 'inherit', fontStyle: 'italic', opacity: 0.6 }}
                >
                  No financing activity for this period.
                </NameCell>
              </DataRow>
            ) : (
              <CashFlowLineRows
                lines={primaryReport.financing.items}
                indentLevel={1}
                fmt={fmt}
                hasCompare={hasCompare}
                compareMap={compareFinancingMap}
                onRowClick={handleRowClick}
              />
            )}

            <SectionTotalRow>
              <SectionTotalCell>Net Cash from Financing Activities</SectionTotalCell>
              <SectionTotalAmountCell
                $positive={parseFloat(primaryReport.financing.total) >= 0}
                $negative={parseFloat(primaryReport.financing.total) < 0}
              >
                {fmt(primaryReport.financing.total)}
              </SectionTotalAmountCell>
              {hasCompare && (
                <SectionTotalAmountCell
                  $positive={!!compareReport && parseFloat(compareReport.financing.total) >= 0}
                  $negative={!!compareReport && parseFloat(compareReport.financing.total) < 0}
                >
                  {compareReport ? fmt(compareReport.financing.total) : '—'}
                </SectionTotalAmountCell>
              )}
            </SectionTotalRow>

          </tbody>
          <tfoot>

            {/* ══ NET CHANGE IN CASH ══ */}
            <NetChangeRow>
              <NetChangeCell>Net Change in Cash</NetChangeCell>
              <NetChangeAmountCell
                $positive={parseFloat(primaryReport.netChangeInCash) >= 0}
                $negative={parseFloat(primaryReport.netChangeInCash) < 0}
              >
                {fmt(primaryReport.netChangeInCash)}
              </NetChangeAmountCell>
              {hasCompare && (
                <NetChangeAmountCell
                  $positive={!!compareReport && parseFloat(compareReport.netChangeInCash) >= 0}
                  $negative={!!compareReport && parseFloat(compareReport.netChangeInCash) < 0}
                >
                  {compareReport ? fmt(compareReport.netChangeInCash) : '—'}
                </NetChangeAmountCell>
              )}
            </NetChangeRow>

            {/* Cash beginning balance */}
            <CashBalanceRow>
              <CashBalanceCell>
                Cash & Equivalents — Beginning Balance
              </CashBalanceCell>
              <CashBalanceAmountCell>
                {fmt(primaryReport.cashAtBeginning)}
              </CashBalanceAmountCell>
              {hasCompare && (
                <CashBalanceAmountCell>
                  {compareReport ? fmt(compareReport.cashAtBeginning) : '—'}
                </CashBalanceAmountCell>
              )}
            </CashBalanceRow>

            {/* Cash ending balance — double-underlined */}
            <ClosingCashRow>
              <ClosingCashCell>
                Cash & Equivalents — Ending Balance
              </ClosingCashCell>
              <ClosingCashAmountCell>
                {fmt(primaryReport.cashAtEnd)}
              </ClosingCashAmountCell>
              {hasCompare && (
                <ClosingCashAmountCell>
                  {compareReport ? fmt(compareReport.cashAtEnd) : '—'}
                </ClosingCashAmountCell>
              )}
            </ClosingCashRow>

          </tfoot>
        </CFTable>
      </TableWrapper>
    </>
  );
}

// ─── CashFlowStatementPage ────────────────────────────────────────────────────

/**
 * CashFlowStatementPage
 *
 * Named export — lazy-loaded in App.tsx:
 *   const CashFlowStatementPage = lazy(() =>
 *     import('./pages/finance/CashFlowStatementPage').then(
 *       m => ({ default: m.CashFlowStatementPage })
 *     )
 *   );
 */
export function CashFlowStatementPage() {
  const { user } = useAuthStore();

  if (!READ_ROLES.has(user?.role ?? '')) {
    return (
      <AccessDenied>
        You don&apos;t have permission to view the Cash Flow Statement.
      </AccessDenied>
    );
  }

  return (
    <FinanceReportPage
      statement="cash-flow"
      statementKind="range"
      title="Cash Flow Statement"
    >
      {({ filters, display, openDrillDown }) => (
        <CashFlowStatementContent
          filters={filters}
          display={display}
          openDrillDown={openDrillDown}
        />
      )}
    </FinanceReportPage>
  );
}
