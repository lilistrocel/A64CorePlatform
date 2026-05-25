/**
 * Finance Report Shell — Shared TypeScript Types (T-060.7 / T-060.7.1)
 *
 * These types are used by:
 *   - FinanceReportPage shell (this task)
 *   - BalanceSheetPage     (T-060.8)
 *   - IncomeStatementPage  (T-060.9)
 *   - CashFlowStatementPage (T-060.10)
 *
 * Param names mirror the backend query-param names exactly so they can be
 * passed through to Axios without transformation.
 */

import type React from 'react';

// ─── Statement identity ───────────────────────────────────────────────────────

/**
 * The three statutory statement slugs accepted by the export endpoint.
 * Must match backend _VALID_STATEMENTS exactly.
 */
export type StatementSlug = 'balance-sheet' | 'income-statement' | 'cash-flow';

/**
 * Controls whether the date picker shows a single snapshot date (Balance
 * Sheet) or a start+end range (Income Statement, Cash Flow Statement).
 */
export type StatementKind = 'snapshot' | 'range';

// ─── Comparative mode ─────────────────────────────────────────────────────────

/**
 * Discriminator for which comparative period the user has selected.
 *
 *   'none'     — no comparative column (default)
 *   'previous' — QoQ: same duration immediately preceding the selected period
 *   'yoy'      — YoY: same date range shifted back exactly one year (via subYears)
 *   'custom'   — user-supplied comparePeriodStart / comparePeriodEnd
 *
 * The shell resolves this into concrete date strings and exposes them in
 * ReportFilters so consumers never need to recompute them.
 */
export type CompareMode = 'none' | 'previous' | 'yoy' | 'custom';

// ─── Filter state passed to the consuming page ────────────────────────────────

/**
 * The current resolved filter values. The shell builds this from its
 * toolbar state and passes it to the consumer via render-prop so the
 * consumer can drive its own useQuery without reaching into shell state.
 *
 * Param names match backend snake_case query params after the consumer
 * converts camelCase → snake_case when building the Axios params object.
 * The shell intentionally exposes camelCase here for TypeScript ergonomics.
 */
export interface ReportFilters {
  /** Required — always available (resolved from auth store). */
  organizationId: string;
  /** Required — selected company code. Empty string while loading. */
  companyCode: string;

  // ── Balance Sheet (statementKind === 'snapshot') ──
  /**
   * ISO date string (YYYY-MM-DD). Populated for snapshot statements.
   * Backend param: as_of_date
   */
  asOfDate?: string;

  // ── Income Statement / Cash Flow (statementKind === 'range') ──
  /**
   * ISO date string. Populated for range statements.
   * Backend param: period_start
   */
  periodStart?: string;
  /**
   * ISO date string. Populated for range statements.
   * Backend param: period_end
   */
  periodEnd?: string;

  // ── Comparative period (all three statements) ──
  /**
   * Which compare mode is active. Consumers use this to build a column
   * header label: e.g. 'previous' → "vs. Q4 2025", 'yoy' → "vs. Q1 2025 (YoY)".
   */
  compareMode: CompareMode;

  /**
   * ISO date string.
   * For snapshot: the as-of date of the comparative period (compareAsOfDate).
   * For range: start of the comparative range.
   * Populated when compareMode !== 'none'.
   * Backend param: compare_period_start (or as_of_date for snapshots — consumer maps)
   */
  comparePeriodStart?: string;
  /**
   * ISO date string. End of the comparative range.
   * Populated when compareMode !== 'none' and statementKind === 'range'.
   * Backend param: compare_period_end
   */
  comparePeriodEnd?: string;

  // ── Shared optional ──
  /**
   * Array of cost-centre IDs. Empty array means no filter.
   * Backend accepts repeated query params: ?cost_center_id=A&cost_center_id=B
   * Consumer must serialise with paramsSerializer: { indexes: null } (Axios v1)
   * or use URLSearchParams to build repeated keys.
   * Backend param: cost_center_id (repeated)
   */
  costCenterIds: string[];
  /**
   * Include voided journal entries. Backend param: include_voided
   */
  includeVoided: boolean;
}

// ─── Display helpers passed to the consumer ───────────────────────────────────

/**
 * How negative numbers are rendered. Display-only — the shell exposes this
 * value; the consuming page applies it to its formatted cells.
 *   'parentheses' → (1,234.56)   [default, accounting convention]
 *   'minus'       → -1,234.56
 */
export type NegativeDisplay = 'parentheses' | 'minus';

/**
 * Scale divisor for monetary amounts.
 *   1         → raw AED amounts
 *   1_000     → amounts in thousands (AED '000)
 *   1_000_000 → amounts in millions (AED '000,000)
 */
export type AmountScale = 1 | 1000 | 1000000;

/** Display helpers passed through the render-prop to the consumer. */
export interface DisplayOptions {
  negativeDisplay: NegativeDisplay;
  amountScale: AmountScale;
  /**
   * The active compare mode. Mirrors filters.compareMode for convenience
   * so consumers don't need to destructure filters just for display logic.
   */
  compareMode: CompareMode;
}

// ─── Drill-down modal ─────────────────────────────────────────────────────────

/**
 * Payload the consuming page passes to openDrillDown().
 * The shell only cares about title — content is an opaque ReactNode from
 * the consumer.
 */
export interface DrillDownPayload {
  /** Modal heading — e.g. account name or line label. */
  title: string;
  /** React content to render inside the modal body. Consumer-supplied. */
  content: React.ReactNode;
}

// ─── Render-prop bag ──────────────────────────────────────────────────────────

/**
 * All values the shell exposes to its children render-prop.
 * T-060.8/9/10 destructure this to wire their tables.
 */
export interface FinanceReportRenderProps {
  /** Current resolved filter values. Pass these to useQuery. */
  filters: ReportFilters;
  /** Display options for number formatting. */
  display: DisplayOptions;
  /**
   * Open the drill-down modal. Call this when a line item is clicked.
   * Example:
   *   openDrillDown({ title: 'Cash & Cash Equivalents', content: <LedgerLines /> })
   */
  openDrillDown: (payload: DrillDownPayload) => void;
}

// ─── Shell props ──────────────────────────────────────────────────────────────

export interface FinanceReportPageProps {
  /** Statement slug — drives export endpoint path and picker shape. */
  statement: StatementSlug;
  /**
   * 'snapshot' → single date picker (Balance Sheet).
   * 'range'    → start + end date pickers (IS / Cash Flow).
   */
  statementKind: StatementKind;
  /** Page heading rendered at the top of the shell. */
  title: string;
  /**
   * Render-prop pattern. The consumer (T-060.8/9/10) renders the report
   * table here. It receives filters and display options so it can drive
   * its own useQuery and format its cells consistently.
   */
  children: (props: FinanceReportRenderProps) => React.ReactNode;
}
