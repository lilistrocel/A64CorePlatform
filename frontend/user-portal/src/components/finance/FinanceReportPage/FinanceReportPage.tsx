/**
 * FinanceReportPage — Reusable shell for the three statutory statement pages
 * T-060.7 / T-060.7.1
 *
 * Owns:
 *   - Toolbar: company selector, period/date picker with quick-picks,
 *     "Compare to" dropdown (None / Previous period / Same period prior year / Custom),
 *     cost-centre multi-select (real array — all selected IDs forwarded to backend),
 *     negative-number toggle, scale toggle
 *   - Export buttons (PDF + Excel) with blob download + Content-Disposition parsing
 *   - Drill-down modal (X-button-close only — never on backdrop click)
 *
 * Does NOT own: the statement data query or table rendering.
 * Those are delegated to the consumer via the children render-prop.
 *
 * Usage (T-060.8/9/10):
 *
 *   <FinanceReportPage
 *     statement="balance-sheet"
 *     statementKind="snapshot"
 *     title="Balance Sheet"
 *   >
 *     {({ filters, display, openDrillDown }) => (
 *       <MyStatementTable filters={filters} display={display} onRowClick={openDrillDown} />
 *     )}
 *   </FinanceReportPage>
 *
 * The consumer converts `filters` camelCase keys → backend snake_case params.
 * For costCenterIds, use paramsSerializer: { indexes: null } (Axios v1) so each
 * ID becomes a separate ?cost_center_id=X query param.
 *
 * Compare mode resolved dates:
 *   - compareMode === 'none'     → comparePeriodStart/End are undefined
 *   - compareMode === 'previous' → QoQ: same duration immediately preceding
 *   - compareMode === 'yoy'      → same dates shifted back exactly 1 year (leap-safe)
 *   - compareMode === 'custom'   → user-entered comparePeriodStart/End
 *
 * For snapshot (Balance Sheet) + YoY: comparePeriodStart holds the compareAsOfDate.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../../stores/auth.store';
import { useFinanceCompanies } from '../../../hooks/queries/useFinanceCompanies';
import { useFinancePeriods } from '../../../hooks/queries/useTrialBalance';
import { useCostCenters } from '../../../hooks/queries/useCostCenters';
import { useToastStore } from '../../../stores/toast.store';
import { apiClient } from '../../../services/api';
import type {
  FinanceReportPageProps,
  ReportFilters,
  DisplayOptions,
  NegativeDisplay,
  AmountScale,
  DrillDownPayload,
  CompareMode,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type QuickPick = 'mtd' | 'qtd' | 'ytd' | 'last-closed' | 'custom';

// ─── Date helpers ────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function startOfQuarter(d: Date): string {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

function startOfYear(d: Date): string {
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

/**
 * Subtract exactly one calendar year from an ISO date string.
 * Handles leap years safely: Feb 29 → Feb 28 the previous year.
 * Does NOT use date-fns (not in project deps) — implements the same
 * logic: new Date with year−1, letting the JS Date constructor clamp
 * Feb 29 → Feb 28 when the target year is not a leap year.
 */
function subOneYear(isoDate: string): string {
  const d = new Date(isoDate);
  // Use UTC to avoid timezone shifts when only operating on the date part.
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  // Construct with year-1; JS Date clamps Feb 29 → Feb 28 automatically.
  const shifted = new Date(Date.UTC(year - 1, month, day));
  return shifted.toISOString().slice(0, 10);
}

// ─── Styled components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
  margin: 16px 0 24px;
`;

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const ToolbarCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 20px;
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
  min-width: 0;
`;

const ToolbarLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ToolbarSelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  min-width: 160px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }
`;

const ToolbarDateInput = styled.input`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  user-select: none;
  padding-bottom: 2px;
`;

// ─── Second toolbar row (display options + export) ────────────────────────────

const DisplayRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const DisplayChipGroup = styled.div`
  display: flex;
  gap: 6px;
`;

interface ChipProps {
  $active: boolean;
}

const Chip = styled.button<ChipProps>`
  padding: 5px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: 1.5px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] : theme.colors.textSecondary};
  transition: all 150ms ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ExportButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
`;

interface ExportButtonProps {
  $variant: 'pdf' | 'xlsx';
}

const ExportButton = styled.button<ExportButtonProps>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
  border: 1.5px solid
    ${({ $variant, theme }) =>
      $variant === 'pdf'
        ? theme.colors.error
        : theme.colors.primary[500]};
  background: transparent;
  color: ${({ $variant, theme }) =>
    $variant === 'pdf' ? theme.colors.error : theme.colors.primary[500]};
  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) =>
      $variant === 'pdf' ? theme.colors.errorBg : theme.colors.primary[50]};
  }
  &:focus-visible {
    outline: 2px solid
      ${({ $variant, theme }) =>
        $variant === 'pdf' ? theme.colors.error : theme.colors.primary[500]};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Cost-centre multi-select chips ──────────────────────────────────────────

const CostCenterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const CostCenterChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 36px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  padding: 4px 8px;
  background: ${({ theme }) => theme.colors.background};
  max-width: 280px;
  cursor: pointer;
  position: relative;
`;

interface SelectedChipProps {
  $isSelected: boolean;
}

const CCChip = styled.button<SelectedChipProps>`
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid
    ${({ $isSelected, theme }) =>
      $isSelected ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $isSelected, theme }) =>
    $isSelected ? theme.colors.primary[500] : 'transparent'};
  color: ${({ $isSelected, theme }) => ($isSelected ? theme.colors.onAccent : 'inherit')};
  white-space: nowrap;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 1px;
  }
`;

// ─── Custom compare date row ──────────────────────────────────────────────────

const CustomDateRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-top: 4px;
`;

// ─── Modal ────────────────────────────────────────────────────────────────────

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`;

const ModalPanel = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(59, 44, 24, 0.15);
  width: 90vw;
  max-width: 860px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 17px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ModalCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 20px;
  line-height: 1;
  font-family: inherit;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
`;

// ─── Spinner (inline, minimal) ────────────────────────────────────────────────

const SpinnerSvg = styled.svg`
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

function Spinner() {
  return (
    <SpinnerSvg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle
        cx="7" cy="7" r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="20"
        strokeDashoffset="8"
      />
    </SpinnerSvg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinanceReportPage({
  statement,
  statementKind,
  title,
  children,
}: FinanceReportPageProps) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const organizationId = useMemo<string>(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  // ── Companies ────────────────────────────────────────────────────────────────

  const { data: companiesData } = useFinanceCompanies(organizationId || null);
  const companies = companiesData ?? [];

  const [selectedCompanyCode, setSelectedCompanyCode] = useState('');
  const effectiveCompanyCode = selectedCompanyCode || (companies[0]?.companyCode ?? '');

  // ── Periods (for quick-picks + last-closed) ───────────────────────────────────

  const { data: periods = [] } = useFinancePeriods(organizationId, effectiveCompanyCode);

  // ── Cost centres ──────────────────────────────────────────────────────────────

  const { data: costCentersData = [] } = useCostCenters(organizationId || null);
  const activeCostCenters = useMemo(
    () => costCentersData.filter((cc) => cc.isActive),
    [costCentersData]
  );
  const [selectedCostCenterIds, setSelectedCostCenterIds] = useState<string[]>([]);

  const toggleCostCenter = useCallback((id: string) => {
    setSelectedCostCenterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // ── Date / period state ────────────────────────────────────────────────────────

  const today = todayIso();
  const now = new Date();

  // Snapshot (Balance Sheet): single as-of date
  const [asOfDate, setAsOfDate] = useState(today);

  // Range (IS / Cash Flow): start + end
  const [periodStart, setPeriodStart] = useState(startOfMonth(now));
  const [periodEnd, setPeriodEnd] = useState(today);

  const [activeQuickPick, setActiveQuickPick] = useState<QuickPick>('mtd');

  // ── Quick-pick handlers ────────────────────────────────────────────────────────

  const applyQuickPick = useCallback(
    (pick: QuickPick) => {
      setActiveQuickPick(pick);
      const d = new Date();
      if (pick === 'mtd') {
        setPeriodStart(startOfMonth(d));
        setPeriodEnd(todayIso());
        setAsOfDate(todayIso());
      } else if (pick === 'qtd') {
        setPeriodStart(startOfQuarter(d));
        setPeriodEnd(todayIso());
        setAsOfDate(todayIso());
      } else if (pick === 'ytd') {
        setPeriodStart(startOfYear(d));
        setPeriodEnd(todayIso());
        setAsOfDate(todayIso());
      } else if (pick === 'last-closed') {
        // Find the most-recently closed period
        const lastClosed = [...periods]
          .filter((p) => p.isClosed)
          .sort((a, b) => (a.endDate > b.endDate ? -1 : 1))[0];
        if (lastClosed) {
          setPeriodStart(lastClosed.startDate);
          setPeriodEnd(lastClosed.endDate);
          setAsOfDate(lastClosed.endDate);
        }
      }
      // 'custom' → user edits dates directly, no auto-set
    },
    [periods]
  );

  // ── Other filter state ────────────────────────────────────────────────────────

  const [includeVoided, setIncludeVoided] = useState(false);

  // ── Compare mode — replaces the boolean toggle ────────────────────────────────

  // Default is 'none' — comparative is explicitly opt-in.
  const [compareMode, setCompareMode] = useState<CompareMode>('none');

  // User-supplied dates for 'custom' mode only.
  const [customCompareStart, setCustomCompareStart] = useState('');
  const [customCompareEnd, setCustomCompareEnd] = useState('');

  // ── Display options ────────────────────────────────────────────────────────────

  const [negativeDisplay, setNegativeDisplay] = useState<NegativeDisplay>('parentheses');
  const [amountScale, setAmountScale] = useState<AmountScale>(1);

  // ── Resolved comparative dates ────────────────────────────────────────────────
  //
  // These are derived, not stored — always computed from the primary period + compareMode.
  // Consumers read them from filters.comparePeriodStart / filters.comparePeriodEnd.
  //
  // Snapshot (Balance Sheet) conventions:
  //   'yoy'     → compareAsOfDate = asOfDate − 1 year (stored in comparePeriodStart)
  //   'previous'→ not meaningful for a snapshot — treated same as 'none' (no compare)
  //
  // Range (IS / Cash Flow) conventions:
  //   'previous'→ QoQ: [periodStart − duration − 1 day … periodStart − 1 day]
  //   'yoy'     → YoY: [subOneYear(periodStart) … subOneYear(periodEnd)]
  //   'custom'  → [customCompareStart … customCompareEnd]

  const resolvedCompare = useMemo<{
    comparePeriodStart?: string;
    comparePeriodEnd?: string;
  }>(() => {
    if (compareMode === 'none') return {};

    if (statementKind === 'snapshot') {
      // Only YoY makes accounting sense for a snapshot balance sheet.
      // 'previous' is ignored (there is no prior "same duration" for a point-in-time statement).
      if (compareMode === 'yoy' && asOfDate) {
        return { comparePeriodStart: subOneYear(asOfDate) };
      }
      if (compareMode === 'custom' && customCompareStart) {
        return { comparePeriodStart: customCompareStart };
      }
      return {};
    }

    // statementKind === 'range'
    if (compareMode === 'previous' && periodStart && periodEnd) {
      // QoQ: shift start/end back by the same duration, with 1-day gap.
      const startMs = new Date(periodStart).getTime();
      const endMs = new Date(periodEnd).getTime();
      const durationMs = endMs - startMs;
      const compareEnd = new Date(startMs - 1).toISOString().slice(0, 10);
      const compareStart = new Date(startMs - durationMs - 1).toISOString().slice(0, 10);
      return { comparePeriodStart: compareStart, comparePeriodEnd: compareEnd };
    }

    if (compareMode === 'yoy' && periodStart && periodEnd) {
      // YoY: shift both endpoints back exactly one year (leap-safe).
      return {
        comparePeriodStart: subOneYear(periodStart),
        comparePeriodEnd: subOneYear(periodEnd),
      };
    }

    if (compareMode === 'custom') {
      const result: { comparePeriodStart?: string; comparePeriodEnd?: string } = {};
      if (customCompareStart) result.comparePeriodStart = customCompareStart;
      if (customCompareEnd) result.comparePeriodEnd = customCompareEnd;
      return result;
    }

    return {};
  }, [compareMode, statementKind, asOfDate, periodStart, periodEnd, customCompareStart, customCompareEnd]);

  // ── Resolved filters (render-prop output) ────────────────────────────────────────

  const filters = useMemo<ReportFilters>(() => {
    const base: ReportFilters = {
      organizationId,
      companyCode: effectiveCompanyCode,
      includeVoided,
      costCenterIds: selectedCostCenterIds,
      compareMode,
      ...resolvedCompare,
    };

    if (statementKind === 'snapshot') {
      base.asOfDate = asOfDate;
    } else {
      base.periodStart = periodStart;
      base.periodEnd = periodEnd;
    }

    return base;
  }, [
    organizationId,
    effectiveCompanyCode,
    includeVoided,
    selectedCostCenterIds,
    compareMode,
    resolvedCompare,
    statementKind,
    asOfDate,
    periodStart,
    periodEnd,
  ]);

  const display = useMemo<DisplayOptions>(
    () => ({ negativeDisplay, amountScale, compareMode }),
    [negativeDisplay, amountScale, compareMode]
  );

  // ── Export ────────────────────────────────────────────────────────────────────

  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'xlsx' | null>(null);

  const handleExport = useCallback(
    async (fmt: 'pdf' | 'xlsx') => {
      if (exportingFormat) return; // already in progress
      setExportingFormat(fmt);

      try {
        // Build query params mirroring the current filter state.
        // Param names match backend snake_case exactly.
        //
        // For cost_center_id we use URLSearchParams directly so each ID
        // becomes a separate repeated key: ?cost_center_id=A&cost_center_id=B
        // (Axios paramsSerializer config is per-instance and the global apiClient
        // does not set one — building URLSearchParams here is more explicit and
        // avoids mutating the shared client).
        const searchParams = new URLSearchParams();
        searchParams.set('format', fmt);
        searchParams.set('organization_id', organizationId);
        searchParams.set('company_code', effectiveCompanyCode);
        searchParams.set('include_voided', String(includeVoided));

        if (statementKind === 'snapshot') {
          if (asOfDate) searchParams.set('as_of_date', asOfDate);
        } else {
          if (periodStart) searchParams.set('period_start', periodStart);
          if (periodEnd) searchParams.set('period_end', periodEnd);
        }

        if (filters.comparePeriodStart) {
          searchParams.set('compare_period_start', filters.comparePeriodStart);
        }
        if (filters.comparePeriodEnd) {
          searchParams.set('compare_period_end', filters.comparePeriodEnd);
        }

        // Repeated keys for cost centre multi-select
        for (const id of selectedCostCenterIds) {
          searchParams.append('cost_center_id', id);
        }

        const response = await apiClient.get<Blob>(
          `/v1/finance/reports/export/${statement}?${searchParams.toString()}`,
          { responseType: 'blob' }
        );

        // Parse filename from Content-Disposition header.
        // Server sends: attachment; filename="balance-sheet_2026-05-24_A001.pdf"
        const disposition: string =
          (response.headers as Record<string, string>)['content-disposition'] ?? '';
        let filename = `${statement}.${fmt}`;
        const filenameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)["']?/);
        if (filenameMatch?.[1]) {
          filename = filenameMatch[1].trim();
        }

        // Trigger browser download
        const url = URL.createObjectURL(response.data);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : `Failed to export ${fmt.toUpperCase()}. Please try again.`;
        addToast('error', msg, 6000);
      } finally {
        setExportingFormat(null);
      }
    },
    [
      exportingFormat,
      organizationId,
      effectiveCompanyCode,
      includeVoided,
      statementKind,
      asOfDate,
      periodStart,
      periodEnd,
      statement,
      filters.comparePeriodStart,
      filters.comparePeriodEnd,
      selectedCostCenterIds,
      addToast,
    ]
  );

  // ── Drill-down modal ──────────────────────────────────────────────────────────

  const [drillDown, setDrillDown] = useState<DrillDownPayload | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const openDrillDown = useCallback((payload: DrillDownPayload) => {
    setDrillDown(payload);
  }, []);

  const closeDrillDown = useCallback(() => {
    setDrillDown(null);
  }, []);

  // Focus the close button when the modal opens (accessibility: focus trap start)
  useEffect(() => {
    if (drillDown) {
      closeButtonRef.current?.focus();
    }
  }, [drillDown]);

  // Keyboard: close modal on Escape
  useEffect(() => {
    if (!drillDown) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrillDown();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drillDown, closeDrillDown]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageTitle>{title}</PageTitle>
      <Divider />

      {/* ── Toolbar ── */}
      <ToolbarCard>
        <ToolbarRow>
          {/* Company */}
          <ToolbarField>
            <ToolbarLabel htmlFor="frp-company">Company</ToolbarLabel>
            <ToolbarSelect
              id="frp-company"
              value={effectiveCompanyCode}
              onChange={(e) => setSelectedCompanyCode(e.target.value)}
              aria-label="Select company"
            >
              {companies.map((c) => (
                <option key={c.companyCode} value={c.companyCode}>
                  {c.companyCode} — {c.legalName}
                </option>
              ))}
              {companies.length === 0 && <option value="">No companies</option>}
            </ToolbarSelect>
          </ToolbarField>

          {/* Quick-picks (range only) */}
          {statementKind === 'range' && (
            <ToolbarField>
              <ToolbarLabel as="span">Quick Select</ToolbarLabel>
              <DisplayChipGroup role="group" aria-label="Period quick-select">
                {(
                  [
                    ['mtd', 'MTD'],
                    ['qtd', 'QTD'],
                    ['ytd', 'YTD'],
                    ['last-closed', 'Last Closed'],
                    ['custom', 'Custom'],
                  ] as [QuickPick, string][]
                ).map(([key, label]) => (
                  <Chip
                    key={key}
                    type="button"
                    $active={activeQuickPick === key}
                    onClick={() => applyQuickPick(key)}
                    aria-pressed={activeQuickPick === key}
                  >
                    {label}
                  </Chip>
                ))}
              </DisplayChipGroup>
            </ToolbarField>
          )}

          {/* Date picker(s) */}
          {statementKind === 'snapshot' ? (
            <ToolbarField>
              <ToolbarLabel htmlFor="frp-as-of-date">As of Date</ToolbarLabel>
              <ToolbarDateInput
                id="frp-as-of-date"
                type="date"
                value={asOfDate}
                max={today}
                onChange={(e) => {
                  setAsOfDate(e.target.value);
                  setActiveQuickPick('custom');
                }}
                aria-label="As of date"
              />
            </ToolbarField>
          ) : (
            <>
              <ToolbarField>
                <ToolbarLabel htmlFor="frp-period-start">From</ToolbarLabel>
                <ToolbarDateInput
                  id="frp-period-start"
                  type="date"
                  value={periodStart}
                  max={periodEnd || today}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    setActiveQuickPick('custom');
                  }}
                  aria-label="Period start date"
                />
              </ToolbarField>
              <ToolbarField>
                <ToolbarLabel htmlFor="frp-period-end">To</ToolbarLabel>
                <ToolbarDateInput
                  id="frp-period-end"
                  type="date"
                  value={periodEnd}
                  min={periodStart}
                  max={today}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value);
                    setActiveQuickPick('custom');
                  }}
                  aria-label="Period end date"
                />
              </ToolbarField>
            </>
          )}

          {/* Compare to dropdown — replaces the previous boolean toggle */}
          <ToolbarField>
            <ToolbarLabel htmlFor="frp-compare-mode">Compare to</ToolbarLabel>
            <ToolbarSelect
              id="frp-compare-mode"
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value as CompareMode)}
              aria-label="Select comparative period"
            >
              <option value="none">None</option>
              <option value="previous">Previous period</option>
              <option value="yoy">Same period prior year</option>
              <option value="custom">Custom…</option>
            </ToolbarSelect>
          </ToolbarField>

          {/* Custom compare date inputs — only visible when compareMode === 'custom' */}
          {compareMode === 'custom' && (
            statementKind === 'snapshot' ? (
              <ToolbarField>
                <ToolbarLabel htmlFor="frp-compare-as-of">Compare as of</ToolbarLabel>
                <ToolbarDateInput
                  id="frp-compare-as-of"
                  type="date"
                  value={customCompareStart}
                  onChange={(e) => setCustomCompareStart(e.target.value)}
                  aria-label="Comparative as-of date"
                />
              </ToolbarField>
            ) : (
              <ToolbarField>
                <ToolbarLabel as="span">Compare range</ToolbarLabel>
                <CustomDateRow>
                  <ToolbarDateInput
                    type="date"
                    value={customCompareStart}
                    onChange={(e) => setCustomCompareStart(e.target.value)}
                    aria-label="Comparative period start date"
                  />
                  <span style={{ fontSize: 13, color: 'inherit', paddingBottom: 8 }}>to</span>
                  <ToolbarDateInput
                    type="date"
                    value={customCompareEnd}
                    min={customCompareStart}
                    onChange={(e) => setCustomCompareEnd(e.target.value)}
                    aria-label="Comparative period end date"
                  />
                </CustomDateRow>
              </ToolbarField>
            )
          )}

          {/* Include voided */}
          <ToolbarField>
            <ToolbarLabel as="span">Options</ToolbarLabel>
            <ToggleLabel>
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={(e) => setIncludeVoided(e.target.checked)}
                aria-label="Include voided journal entries"
              />
              Include voided JEs
            </ToggleLabel>
          </ToolbarField>

          {/* Cost-centre multi-select */}
          {activeCostCenters.length > 0 && (
            <CostCenterContainer>
              <ToolbarLabel as="span" id="frp-cc-label">
                Cost Centre
              </ToolbarLabel>
              <CostCenterChips
                role="group"
                aria-labelledby="frp-cc-label"
                aria-label="Cost centre filter"
              >
                {activeCostCenters.map((cc) => (
                  <CCChip
                    key={cc.costCenterId}
                    type="button"
                    $isSelected={selectedCostCenterIds.includes(cc.costCenterId)}
                    onClick={() => toggleCostCenter(cc.costCenterId)}
                    aria-pressed={selectedCostCenterIds.includes(cc.costCenterId)}
                    title={cc.name}
                  >
                    {cc.name}
                  </CCChip>
                ))}
              </CostCenterChips>
            </CostCenterContainer>
          )}
        </ToolbarRow>

        {/* Second row: display options + export */}
        <DisplayRow>
          {/* Negative number display */}
          <ToolbarField>
            <ToolbarLabel as="span">Negatives</ToolbarLabel>
            <DisplayChipGroup role="group" aria-label="Negative number display">
              <Chip
                type="button"
                $active={negativeDisplay === 'parentheses'}
                onClick={() => setNegativeDisplay('parentheses')}
                aria-pressed={negativeDisplay === 'parentheses'}
              >
                (1,234)
              </Chip>
              <Chip
                type="button"
                $active={negativeDisplay === 'minus'}
                onClick={() => setNegativeDisplay('minus')}
                aria-pressed={negativeDisplay === 'minus'}
              >
                -1,234
              </Chip>
            </DisplayChipGroup>
          </ToolbarField>

          {/* Scale */}
          <ToolbarField>
            <ToolbarLabel as="span">Scale</ToolbarLabel>
            <DisplayChipGroup role="group" aria-label="Amount scale">
              {([1, 1000, 1000000] as AmountScale[]).map((scale) => (
                <Chip
                  key={scale}
                  type="button"
                  $active={amountScale === scale}
                  onClick={() => setAmountScale(scale)}
                  aria-pressed={amountScale === scale}
                >
                  {scale === 1 ? 'AED' : scale === 1000 ? "AED '000" : "AED 'm"}
                </Chip>
              ))}
            </DisplayChipGroup>
          </ToolbarField>

          {/* Export buttons */}
          <ExportButtonGroup>
            <ExportButton
              type="button"
              $variant="pdf"
              onClick={() => handleExport('pdf')}
              disabled={exportingFormat !== null || !effectiveCompanyCode}
              aria-busy={exportingFormat === 'pdf'}
              aria-label="Export as PDF"
            >
              {exportingFormat === 'pdf' ? <Spinner /> : null}
              Export PDF
            </ExportButton>
            <ExportButton
              type="button"
              $variant="xlsx"
              onClick={() => handleExport('xlsx')}
              disabled={exportingFormat !== null || !effectiveCompanyCode}
              aria-busy={exportingFormat === 'xlsx'}
              aria-label="Export as Excel"
            >
              {exportingFormat === 'xlsx' ? <Spinner /> : null}
              Export Excel
            </ExportButton>
          </ExportButtonGroup>
        </DisplayRow>
      </ToolbarCard>

      {/* ── Consumer renders its statement table here ── */}
      {children({ filters, display, openDrillDown })}

      {/* ── Drill-down modal ── */}
      {drillDown && (
        <ModalBackdrop
          role="dialog"
          aria-modal="true"
          aria-labelledby="frp-modal-title"
          // CRITICAL: Modal MUST NOT close on backdrop click (project-wide rule).
          // onClick intentionally absent on backdrop.
        >
          <ModalPanel>
            <ModalHeader>
              <ModalTitle id="frp-modal-title">{drillDown.title}</ModalTitle>
              <ModalCloseButton
                ref={closeButtonRef}
                type="button"
                onClick={closeDrillDown}
                aria-label="Close drill-down"
              >
                &#x2715;
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>{drillDown.content}</ModalBody>
          </ModalPanel>
        </ModalBackdrop>
      )}
    </PageContainer>
  );
}
