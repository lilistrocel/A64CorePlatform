/**
 * IncomeStatementPage — T-060.9
 *
 * Route: /finance/income-statement
 * Wrapped in <FinanceGate> (in App.tsx) + uses <FinanceReportPage> shell
 * with statementKind="range" (period start + end pickers).
 *
 * Responsibilities:
 *   - Fire a single useQuery against GET /api/v1/finance/reports/income-statement.
 *     The IS endpoint accepts compare_period_start / compare_period_end in the
 *     SAME request and returns `primary` + optional `comparison` in one response.
 *     No second parallel query is needed.
 *   - Render the IS hierarchy: REVENUE → COST_OF_SALES → OPERATING_COST →
 *     OTHER_INCOME → NON_OPERATING → TAXATION.
 *   - Show subtotals at each level: Total Revenue, Gross Profit, EBIT,
 *     Net Income — computed by the backend and surfaced via `subtotals`.
 *   - Apply display.amountScale and display.negativeDisplay from the shell.
 *   - Show a comparative column when filters.compareMode !== 'none' and
 *     comparePeriodStart is set.
 *   - Each leaf account row is clickable and opens the drill-down modal.
 *
 * Sign convention (mirroring backend):
 *   Revenue + Other Income have a credit-natural balance → positive = income.
 *   Expense drawers (COST_OF_SALES, OPERATING_COST, NON_OPERATING, TAXATION)
 *   have a debit-natural balance → positive = cost.
 *   The backend's `subtotals.costOfSales` is therefore a POSITIVE number
 *   representing a cost. We render expense subtotals in parentheses to make
 *   the subtractive nature explicit (matching the negativeFormat convention
 *   applied to a synthetic negative value). For individual account rows we
 *   render the balance as-is and let the section heading provide context.
 */

import React, { useMemo, useCallback } from 'react';
import styled, { useTheme } from 'styled-components';
import { glassPanel, monoLabel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { FinanceReportPage } from '../../components/finance/FinanceReportPage';
import { useIncomeStatement } from '../../hooks/queries/useFinanceReports';
import { useJournalEntries } from '../../hooks/queries/useJournalEntries';
import type {
  ReportFilters,
  DisplayOptions,
  AmountScale,
  NegativeDisplay,
  DrillDownPayload,
} from '../../components/finance/FinanceReportPage/types';
import type {
  IncomeStatementAccount,
  IncomeStatementSection,
  IncomeStatementSubtotals,
} from '../../services/financeReportsService';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * IS drawer order + display labels.
 * Values match the backend DrawerEnum string values exactly.
 */
const IS_DRAWER_ORDER: { drawer: string; label: string }[] = [
  { drawer: 'revenue', label: 'Revenue' },
  { drawer: 'cost_of_sales', label: 'Cost of Sales' },
  { drawer: 'operating_cost', label: 'Operating Costs' },
  { drawer: 'other_income', label: 'Other Income' },
  { drawer: 'non_operating', label: 'Non-Operating' },
  { drawer: 'taxation', label: 'Taxation' },
];

/**
 * Drawers whose totals are COSTS/DEDUCTIONS (positive balance = expense).
 * These are displayed in parentheses at the subtotal line to show they are
 * subtractive from income.
 */
const COST_DRAWERS = new Set([
  'cost_of_sales',
  'operating_cost',
  'non_operating',
  'taxation',
]);

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

/**
 * For expense-type subtotals, render positive values in parentheses to
 * communicate their subtractive nature in the IS cascade.
 */
function formatCostSubtotal(
  rawStr: string,
  scale: AmountScale
): string {
  const n = parseFloat(rawStr);
  if (isNaN(n)) return '—';
  if (n === 0) return '—';
  const scaled = Math.round(n / scale);
  const absStr = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(scaled));
  // Positive expense = a real cost → show in parentheses.
  // Negative expense = a credit back (unusual) → show as positive number.
  return scaled > 0 ? `(${absStr})` : absStr;
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
    // If the compare period is a full calendar year, show just the year.
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

function formatPercent(rawStr: string | null): string {
  if (rawStr === null || rawStr === undefined) return '—';
  const n = parseFloat(rawStr);
  if (isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
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

const ISTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
`;

const ISHead = styled.thead`
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 1;
`;

const ISHeadTh = styled.th`
  ${monoLabel}
  padding: 12px 16px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const ISHeadThRight = styled(ISHeadTh)`
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

interface DataRowProps {
  $isHeader: boolean;
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
  border-top: 2px solid ${({ theme }) => theme.colors.line};
  background: rgba(180, 200, 220, 0.04);
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
  border-bottom: 3px double ${({ theme }) => theme.colors.line};
`;

// Debit/credit — here, profit/loss — polarity, spec judgment call: the
// pre-redesign ramp (emerald[600]/terracotta[600], then primary[700] for
// this row specifically) read as illegible dark-on-dark against Cosmos Ink.
// Moved to `bright.*` (brightened for this ground): bright.emerald for a
// gain, bright.coral for a loss. Mirrors PnlStatementTable's Gross
// Profit/Operating Profit convention — the ONLY cells in this statement that
// carry polarity colour are the three bottom-line subtotals (Gross Profit,
// EBIT, Net Income); ordinary revenue/cost line items and section totals
// stay neutral (same precedent as PnlStatementTable's breakdown rows).
interface PolarityProps {
  $positive?: boolean;
  $negative?: boolean;
}

/** Highlighted subtotal rows: Gross Profit, EBIT. */
const SubtotalRow = styled.tr`
  background: rgba(180, 200, 220, 0.06);
  border-top: 2px solid ${({ theme }) => theme.colors.line};
`;

const SubtotalCell = styled.td`
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SubtotalAmountCell = styled.td<PolarityProps>`
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

/** Gross Margin % row — secondary styling, italic. */
const MarginRow = styled.tr`
  background: transparent;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const MarginCell = styled.td`
  padding: 8px 16px 8px 36px;
  font-size: 12px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
`;

const MarginAmountCell = styled.td`
  padding: 8px 16px;
  font-size: 12px;
  font-style: italic;
  text-align: right;
  color: ${({ theme }) => theme.colors.celeste};
  white-space: nowrap;
`;

/** Net Income footer row — bold double-underline. */
const NetIncomeRow = styled.tr`
  border-top: 3px double ${({ theme }) => theme.colors.line};
  background: transparent;
`;

const NetIncomeCell = styled.td`
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const NetIncomeAmountCell = styled.td<PolarityProps>`
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

interface DrillDownContentProps {
  organizationId: string;
  companyCode: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Renders a chronological ledger for a single account over the IS period.
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

// ─── Indent level helper ──────────────────────────────────────────────────────

function buildIndentMap(rows: IncomeStatementAccount[]): Map<string, number> {
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

// ─── IncomeStatementContent (inner component, can call hooks freely) ──────────

interface IncomeStatementContentProps {
  filters: ReportFilters;
  display: DisplayOptions;
  openDrillDown: (payload: DrillDownPayload) => void;
}

function IncomeStatementContent({
  filters,
  display,
  openDrillDown,
}: IncomeStatementContentProps) {
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

  // Determine if a comparison column is requested.
  const hasCompare =
    compareMode !== 'none' && !!comparePeriodStart && !!comparePeriodEnd;

  // Build the single query params object. Including compare params here causes
  // the backend to return the `comparison` subtree in the same response.
  const queryParams = useMemo(
    () => ({
      organizationId,
      companyCode,
      periodStart: periodStart ?? '',
      periodEnd: periodEnd ?? '',
      comparePeriodStart: hasCompare ? comparePeriodStart : undefined,
      comparePeriodEnd: hasCompare ? comparePeriodEnd : undefined,
      includeVoided,
      costCenterIds,
    }),
    [
      organizationId,
      companyCode,
      periodStart,
      periodEnd,
      hasCompare,
      comparePeriodStart,
      comparePeriodEnd,
      includeVoided,
      costCenterIds,
    ]
  );

  const {
    data: report,
    isLoading,
    isError,
    error: errorObj,
  } = useIncomeStatement(
    queryParams,
    !!organizationId && !!companyCode && !!periodStart && !!periodEnd
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
        Select a company above to view the Income Statement.
      </EmptyState>
    );
  }

  if (!periodStart || !periodEnd) {
    return (
      <EmptyState>
        Select a period range above to view the Income Statement.
      </EmptyState>
    );
  }

  if (isLoading) {
    return (
      <LoadingOverlay aria-live="polite">Loading Income Statement…</LoadingOverlay>
    );
  }

  if (isError) {
    const err = errorObj as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = err?.response?.data?.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : (err?.message ?? 'Failed to load Income Statement. Please try again.');
    return <ErrorBanner role="alert">{msg}</ErrorBanner>;
  }

  if (!report) {
    return (
      <EmptyState>
        No Income Statement data available for the selected company and period.
      </EmptyState>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const primary = report.primary;
  const comparison = report.comparison ?? null;

  // Build section lookup maps for both periods.
  const primarySectionMap = new Map<string, IncomeStatementSection>(
    primary.sections.map((s) => [s.drawer, s])
  );
  const compareSectionMap = new Map<string, IncomeStatementSection>(
    comparison?.sections.map((s) => [s.drawer, s]) ?? []
  );

  // All accounts across all sections — needed for indent map.
  const allPrimaryAccounts: IncomeStatementAccount[] = primary.sections.flatMap(
    (s) => s.rows
  );
  const indentMap = buildIndentMap(allPrimaryAccounts);

  // Build compare balance map for individual account rows.
  const compareBalanceMap = new Map<string, string>();
  if (comparison) {
    for (const section of comparison.sections) {
      for (const row of section.rows) {
        compareBalanceMap.set(row.accountId, row.balance);
      }
    }
  }

  const colCount = hasCompare ? 3 : 2;
  const amountHeader = `Amount (${scaledLabel(amountScale)})`;
  const compareColLabel = hasCompare
    ? compareColumnLabel(
        compareMode,
        comparePeriodStart ?? '',
        comparePeriodEnd ?? ''
      )
    : '';

  const fmt = (val: string) => formatAmount(val, amountScale, negativeDisplay);
  const subtotals: IncomeStatementSubtotals = primary.subtotals;
  const compareSubtotals: IncomeStatementSubtotals | undefined =
    comparison?.subtotals;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {report.warnings.map((w, i) => (
        <WarningBanner key={i} role="alert">
          {w}
        </WarningBanner>
      ))}

      <TableWrapper>
        <ISTable
          role="table"
          aria-label={`Income Statement ${periodStart} to ${periodEnd}`}
        >
          <ISHead>
            <tr>
              <ISHeadTh scope="col">Account</ISHeadTh>
              <ISHeadThRight scope="col">{amountHeader}</ISHeadThRight>
              {hasCompare && (
                <ISHeadThRight scope="col">{compareColLabel}</ISHeadThRight>
              )}
            </tr>
          </ISHead>
          <tbody>

            {/* ── REVENUE section ── */}
            {(() => {
              const section = primarySectionMap.get('revenue');
              if (!section || section.rows.length === 0) return null;
              return (
                <React.Fragment key="revenue">
                  <SectionHeaderRow>
                    <SectionHeaderCell colSpan={colCount}>Revenue</SectionHeaderCell>
                  </SectionHeaderRow>
                  {section.rows.map((row) => {
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
                          {row.accountNumber} {row.accountName}
                        </NameCell>
                        <AmountCell>{fmt(row.balance)}</AmountCell>
                        {hasCompare && (
                          <AmountCell>
                            {(() => {
                              const v = compareBalanceMap.get(row.accountId);
                              return v !== undefined ? fmt(v) : '—';
                            })()}
                          </AmountCell>
                        )}
                      </DataRow>
                    );
                  })}
                  <SectionTotalRow>
                    <SectionTotalCell>Total Revenue</SectionTotalCell>
                    <SectionTotalAmountCell>
                      {fmt(subtotals.revenue)}
                    </SectionTotalAmountCell>
                    {hasCompare && (
                      <SectionTotalAmountCell>
                        {compareSubtotals ? fmt(compareSubtotals.revenue) : '—'}
                      </SectionTotalAmountCell>
                    )}
                  </SectionTotalRow>
                </React.Fragment>
              );
            })()}

            {/* ── COST_OF_SALES section ── */}
            {(() => {
              const section = primarySectionMap.get('cost_of_sales');
              if (!section || section.rows.length === 0) return null;
              return (
                <React.Fragment key="cost_of_sales">
                  <SectionHeaderRow>
                    <SectionHeaderCell colSpan={colCount}>
                      Cost of Sales
                    </SectionHeaderCell>
                  </SectionHeaderRow>
                  {section.rows.map((row) => {
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
                          {row.accountNumber} {row.accountName}
                        </NameCell>
                        <AmountCell>{fmt(row.balance)}</AmountCell>
                        {hasCompare && (
                          <AmountCell>
                            {(() => {
                              const v = compareBalanceMap.get(row.accountId);
                              return v !== undefined ? fmt(v) : '—';
                            })()}
                          </AmountCell>
                        )}
                      </DataRow>
                    );
                  })}
                  {/* COGS subtotal then Gross Profit */}
                  <SectionTotalRow>
                    <SectionTotalCell>Total Cost of Sales</SectionTotalCell>
                    <SectionTotalAmountCell>
                      {formatCostSubtotal(subtotals.costOfSales, amountScale)}
                    </SectionTotalAmountCell>
                    {hasCompare && (
                      <SectionTotalAmountCell>
                        {compareSubtotals
                          ? formatCostSubtotal(compareSubtotals.costOfSales, amountScale)
                          : '—'}
                      </SectionTotalAmountCell>
                    )}
                  </SectionTotalRow>
                  <SubtotalRow>
                    <SubtotalCell>Gross Profit</SubtotalCell>
                    <SubtotalAmountCell
                      $positive={parseFloat(subtotals.grossProfit) >= 0}
                      $negative={parseFloat(subtotals.grossProfit) < 0}
                    >
                      {fmt(subtotals.grossProfit)}
                    </SubtotalAmountCell>
                    {hasCompare && (
                      <SubtotalAmountCell
                        $positive={!!compareSubtotals && parseFloat(compareSubtotals.grossProfit) >= 0}
                        $negative={!!compareSubtotals && parseFloat(compareSubtotals.grossProfit) < 0}
                      >
                        {compareSubtotals ? fmt(compareSubtotals.grossProfit) : '—'}
                      </SubtotalAmountCell>
                    )}
                  </SubtotalRow>
                  <MarginRow>
                    <MarginCell colSpan={1}>Gross Margin %</MarginCell>
                    <MarginAmountCell>
                      {formatPercent(subtotals.grossMarginPercent)}
                    </MarginAmountCell>
                    {hasCompare && (
                      <MarginAmountCell>
                        {compareSubtotals
                          ? formatPercent(compareSubtotals.grossMarginPercent)
                          : '—'}
                      </MarginAmountCell>
                    )}
                  </MarginRow>
                </React.Fragment>
              );
            })()}

            {/* ── OPERATING_COST section ── */}
            {(() => {
              const section = primarySectionMap.get('operating_cost');
              if (!section || section.rows.length === 0) return null;
              return (
                <React.Fragment key="operating_cost">
                  <SectionHeaderRow>
                    <SectionHeaderCell colSpan={colCount}>
                      Operating Costs
                    </SectionHeaderCell>
                  </SectionHeaderRow>
                  {section.rows.map((row) => {
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
                          {row.accountNumber} {row.accountName}
                        </NameCell>
                        <AmountCell>{fmt(row.balance)}</AmountCell>
                        {hasCompare && (
                          <AmountCell>
                            {(() => {
                              const v = compareBalanceMap.get(row.accountId);
                              return v !== undefined ? fmt(v) : '—';
                            })()}
                          </AmountCell>
                        )}
                      </DataRow>
                    );
                  })}
                  <SectionTotalRow>
                    <SectionTotalCell>Total Operating Costs</SectionTotalCell>
                    <SectionTotalAmountCell>
                      {formatCostSubtotal(subtotals.operatingCost, amountScale)}
                    </SectionTotalAmountCell>
                    {hasCompare && (
                      <SectionTotalAmountCell>
                        {compareSubtotals
                          ? formatCostSubtotal(compareSubtotals.operatingCost, amountScale)
                          : '—'}
                      </SectionTotalAmountCell>
                    )}
                  </SectionTotalRow>
                  <SubtotalRow>
                    <SubtotalCell>Operating Income (EBIT)</SubtotalCell>
                    <SubtotalAmountCell
                      $positive={parseFloat(subtotals.operatingIncome) >= 0}
                      $negative={parseFloat(subtotals.operatingIncome) < 0}
                    >
                      {fmt(subtotals.operatingIncome)}
                    </SubtotalAmountCell>
                    {hasCompare && (
                      <SubtotalAmountCell
                        $positive={!!compareSubtotals && parseFloat(compareSubtotals.operatingIncome) >= 0}
                        $negative={!!compareSubtotals && parseFloat(compareSubtotals.operatingIncome) < 0}
                      >
                        {compareSubtotals
                          ? fmt(compareSubtotals.operatingIncome)
                          : '—'}
                      </SubtotalAmountCell>
                    )}
                  </SubtotalRow>
                </React.Fragment>
              );
            })()}

            {/* ── Remaining drawers: OTHER_INCOME, NON_OPERATING, TAXATION ── */}
            {IS_DRAWER_ORDER.filter((d) =>
              ['other_income', 'non_operating', 'taxation'].includes(d.drawer)
            ).map(({ drawer, label }) => {
              const section = primarySectionMap.get(drawer);
              if (!section || section.rows.length === 0) return null;
              const isCost = COST_DRAWERS.has(drawer);

              return (
                <React.Fragment key={drawer}>
                  <SectionHeaderRow>
                    <SectionHeaderCell colSpan={colCount}>{label}</SectionHeaderCell>
                  </SectionHeaderRow>
                  {section.rows.map((row) => {
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
                          {row.accountNumber} {row.accountName}
                        </NameCell>
                        <AmountCell>{fmt(row.balance)}</AmountCell>
                        {hasCompare && (
                          <AmountCell>
                            {(() => {
                              const v = compareBalanceMap.get(row.accountId);
                              return v !== undefined ? fmt(v) : '—';
                            })()}
                          </AmountCell>
                        )}
                      </DataRow>
                    );
                  })}
                  <SectionTotalRow>
                    <SectionTotalCell>Total {label}</SectionTotalCell>
                    <SectionTotalAmountCell>
                      {isCost
                        ? formatCostSubtotal(section.total, amountScale)
                        : fmt(section.total)}
                    </SectionTotalAmountCell>
                    {hasCompare && (
                      <SectionTotalAmountCell>
                        {(() => {
                          const compareSection = compareSectionMap.get(drawer);
                          if (!compareSection) return '—';
                          return isCost
                            ? formatCostSubtotal(compareSection.total, amountScale)
                            : fmt(compareSection.total);
                        })()}
                      </SectionTotalAmountCell>
                    )}
                  </SectionTotalRow>
                </React.Fragment>
              );
            })}

          </tbody>
          <tfoot>
            {/* Net Income footer row */}
            <NetIncomeRow>
              <NetIncomeCell>Net Income</NetIncomeCell>
              <NetIncomeAmountCell
                $positive={parseFloat(subtotals.netIncome) >= 0}
                $negative={parseFloat(subtotals.netIncome) < 0}
              >
                {fmt(subtotals.netIncome)}
              </NetIncomeAmountCell>
              {hasCompare && (
                <NetIncomeAmountCell
                  $positive={!!compareSubtotals && parseFloat(compareSubtotals.netIncome) >= 0}
                  $negative={!!compareSubtotals && parseFloat(compareSubtotals.netIncome) < 0}
                >
                  {compareSubtotals ? fmt(compareSubtotals.netIncome) : '—'}
                </NetIncomeAmountCell>
              )}
            </NetIncomeRow>
          </tfoot>
        </ISTable>
      </TableWrapper>
    </>
  );
}

// ─── IncomeStatementPage ──────────────────────────────────────────────────────

/**
 * IncomeStatementPage
 *
 * Named export — lazy-loaded in App.tsx:
 *   const IncomeStatementPage = lazy(() =>
 *     import('./pages/finance/IncomeStatementPage').then(
 *       m => ({ default: m.IncomeStatementPage })
 *     )
 *   );
 */
export function IncomeStatementPage() {
  const { user } = useAuthStore();

  if (!READ_ROLES.has(user?.role ?? '')) {
    return (
      <AccessDenied>
        You don't have permission to view the Income Statement.
      </AccessDenied>
    );
  }

  return (
    <FinanceReportPage
      statement="income-statement"
      statementKind="range"
      title="Income Statement"
    >
      {({ filters, display, openDrillDown }) => (
        <IncomeStatementContent
          filters={filters}
          display={display}
          openDrillDown={openDrillDown}
        />
      )}
    </FinanceReportPage>
  );
}
