/**
 * FinanceReportPage public exports — T-060.7 / T-060.7.1
 *
 * Import the shell:
 *   import { FinanceReportPage } from '../../components/finance/FinanceReportPage';
 *
 * Import the types (for T-060.8/9/10):
 *   import type { ReportFilters, DisplayOptions, FinanceReportRenderProps }
 *     from '../../components/finance/FinanceReportPage/types';
 */
export { FinanceReportPage } from './FinanceReportPage';
export type {
  ReportFilters,
  DisplayOptions,
  FinanceReportRenderProps,
  FinanceReportPageProps,
  DrillDownPayload,
  StatementSlug,
  StatementKind,
  CompareMode,
  NegativeDisplay,
  AmountScale,
} from './types';
