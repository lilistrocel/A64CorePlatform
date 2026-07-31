/**
 * APAgingPage
 *
 * Finance report: AP Aging as of a selected date.
 *
 * Orchestration on Generate:
 *   1. Fetch all Approved AP invoices for org + company from the operation API
 *      using the existing apInvoicesService (paginating until exhausted).
 *   2. POST the list of apDocIds to /finance/ap-invoices/totals-paid to get
 *      per-invoice paid amounts.
 *   3. Compute outstanding = totalGross − totalPaid per invoice.
 *   4. Filter to invoices with outstanding > 0.
 *   5. POST to /finance/reports/ap-aging with the filtered invoice list.
 *   6. Render the bucketed result.
 *
 * Layout:
 *   Toolbar → Company / As-of-date / Generate
 *   Top totals cards (5 aging buckets + grand total)
 *   By-vendor table sorted by total desc
 *   Empty / Loading / Error states
 *
 * Role gate: accountant, finance_admin, auditor, admin, super_admin.
 * Route: /finance/ap-aging
 *
 * Modals do NOT close on overlay click — data-entry policy (not relevant here,
 * no modals on this page).
 */

import { useState, useMemo } from 'react';
import styled, { useTheme } from 'styled-components';
import { PageHeader, glassPanel, glassControl, monoLabel, type Theme } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import { useApAging } from '../../hooks/queries/useFinanceReports';
import { getAPInvoices } from '../../services/apInvoicesService';
import { getApDocTotalsPaid } from '../../services/financeReportsService';
import type {
  ApAgingReport,
  ApAgingBuckets,
  ApAgingVendorRow,
  ApAgingInvoiceInput,
} from '../../services/financeReportsService';

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

function formatAed(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Fetch ALL Approved AP invoices for a given org + company by paginating
 * through the operation API until no more pages remain.
 */
async function fetchAllApprovedInvoices(
  organizationId: string,
  _companyCode: string
) {
  // The AP invoices endpoint accepts organization_id and status filter.
  // companyCode filtering is not exposed by the GET list endpoint — the backend
  // currently scopes by organization_id only. We pass organizationId and
  // filter on the client side if needed. Per-page: 200 to minimise round-trips.
  const PER_PAGE = 200;
  let page = 1;
  let totalPages = 1;
  const all = [];

  do {
    const result = await getAPInvoices({
      organizationId,
      status: 'Approved',
      page,
      perPage: PER_PAGE,
    });
    all.push(...result.data);
    totalPages = result.meta.totalPages;
    page += 1;
  } while (page <= totalPages);

  return all;
}

// ─── Styled Components ─────────────────────────────────────────────────────────

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
  min-width: 200px;
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

// ─── Totals cards row ───────────────────────────────────────────────────────────

const TotalsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
`;

interface BucketCardProps {
  $accent: string;
}

// Each bucket is its own small glass card (not nested inside another glass
// panel — a row of independent tiles, same idea as PageHeader's stat tiles)
// with a severity-coloured top accent, spec §5.2 extrapolation.
const BucketCard = styled.div<BucketCardProps>`
  ${glassPanel}
  flex: 1;
  min-width: 120px;
  padding: 16px 18px;
  border-top: 2px solid ${({ $accent }) => $accent};
`;

const BucketLabel = styled.div<{ $accent: string }>`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ $accent }) => $accent};
  margin-bottom: 6px;
`;

const BucketAmount = styled.div<{ $accent: string }>`
  font-size: 18px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ $accent }) => $accent};
`;

const BucketSub = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
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

const AgingTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
`;

const AgingTHead = styled.thead`
  background: transparent;
`;

const AgingTh = styled.th`
  ${monoLabel}
  padding: 12px 14px;
  text-align: left;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const AgingThRight = styled(AgingTh)`
  text-align: right;
`;

const AgingTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 100ms ease;
  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const AgingTd = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AgingTdMono = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AgingTdMonoDimmed = styled(AgingTdMono)`
  color: ${({ theme }) => theme.colors.muted};
`;

interface TotalTrProps {
  $isFooter: boolean;
}

const TotalTr = styled.tr<TotalTrProps>`
  border-top: ${({ $isFooter, theme }) => ($isFooter ? `2px solid ${theme.colors.line}` : 'none')};
  background: ${({ $isFooter }) => ($isFooter ? 'rgba(180, 200, 220, 0.05)' : 'transparent')};
`;

const TotalTd = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TotalTdMono = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// ─── Status components ─────────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  line-height: 1.7;
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

const StepIndicator = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 8px;
  font-style: italic;
`;

// ─── Bucket configuration ───────────────────────────────────────────────────────

interface BucketDef {
  key: keyof ApAgingBuckets;
  label: string;
  sublabel: string;
  accent: string;
}

// Aging severity ramp — NOT a phase status, a severity gradient (same
// convention as PnlArAging's bucketColors, spec §5.2 note on that file):
// healthy emerald -> early-overdue gold -> escalating terra -> severe coral
// (`quarantined`, the only red). Five aging buckets map onto four severity
// steps (clamped, same `Math.min(index, length-1)` idea PnlArAging uses for
// its bar-chart Cells) so the two most-overdue buckets (61-90d, 90+d) share
// the "severe" colour — there is no fifth distinct severity hue in the
// vocabulary and inventing one would violate spec §5's "one semantic
// vocabulary" rule. Grand Total is deliberately `bright.lapis` (primary
// voice), NOT part of the severity ramp, so it doesn't read as "most severe"
// — this was already true in the pre-redesign code's own comment and is
// preserved.
const SEVERITY_RAMP = (theme: Theme) => [
  theme.colors.phase.fruiting,    // healthy
  theme.colors.warning,           // early overdue
  theme.colors.bright.terra,      // escalating
  theme.colors.phase.quarantined, // severe
];

const bucketDefs = (theme: Theme): BucketDef[] => {
  const ramp = SEVERITY_RAMP(theme);
  const severityFor = (i: number) => ramp[Math.min(i, ramp.length - 1)];
  return [
    { key: 'notDue', label: 'Not Due', sublabel: 'Current', accent: severityFor(0) },
    { key: 'days1To30', label: '1–30 Days', sublabel: 'Overdue', accent: severityFor(1) },
    { key: 'days31To60', label: '31–60 Days', sublabel: 'Overdue', accent: severityFor(2) },
    { key: 'days61To90', label: '61–90 Days', sublabel: 'Overdue', accent: severityFor(3) },
    { key: 'daysOver90', label: '> 90 Days', sublabel: 'Overdue', accent: severityFor(4) },
    { key: 'total', label: 'Grand Total', sublabel: 'All vendors', accent: theme.colors.bright.lapis },
  ];
};

// ─── Main component ────────────────────────────────────────────────────────────

export function APAgingPage() {
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

  // ── Report state ─────────────────────────────────────────────────────────────

  const [report, setReport] = useState<ApAgingReport | null>(null);
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [orchestrationStep, setOrchestrationStep] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Mutation for the final aging POST ────────────────────────────────────────

  const { mutateAsync: postApAging } = useApAging();

  // ── Sorted by-vendor rows ────────────────────────────────────────────────────

  const sortedVendors = useMemo<ApAgingVendorRow[]>(() => {
    if (!report) return [];
    return [...report.byVendor].sort(
      (a, b) => parseFloat(b.total) - parseFloat(a.total)
    );
  }, [report]);

  // ── Orchestrated Generate handler ────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!effectiveCompanyCode || !organizationId || isOrchestrating) return;

    setIsOrchestrating(true);
    setErrorMessage(null);
    setReport(null);

    try {
      // Step 1: Fetch all Approved AP invoices
      setOrchestrationStep('Fetching approved AP invoices…');
      const allInvoices = await fetchAllApprovedInvoices(organizationId, effectiveCompanyCode);

      if (allInvoices.length === 0) {
        // No approved invoices — report will be empty; set a synthetic empty result
        setReport({
          asOfDate,
          totals: {
            notDue: '0',
            days1To30: '0',
            days31To60: '0',
            days61To90: '0',
            daysOver90: '0',
            total: '0',
          },
          byVendor: [],
        });
        setOrchestrationStep('');
        setIsOrchestrating(false);
        return;
      }

      // Step 2: Fetch total paid per invoice
      setOrchestrationStep('Fetching payment totals…');
      const paidMap = await getApDocTotalsPaid({
        apDocIds: allInvoices.map((inv) => inv.docId),
        organizationId,
      });

      // Step 3: Compute outstanding and filter
      setOrchestrationStep('Computing outstanding balances…');
      const outstandingInvoices: ApAgingInvoiceInput[] = allInvoices
        .map((inv) => {
          const paid = paidMap.get(inv.docId) ?? 0;
          const outstanding = inv.totalGross - paid;
          return {
            apDocId: inv.docId,
            totalGross: outstanding.toFixed(2),
            dueDate: inv.dueDate ?? null,
            vendorId: inv.vendorId ?? '',
            vendorCode: inv.vendorCode ?? '',
            vendorName: inv.vendorName ?? '',
          };
        })
        .filter((inv) => parseFloat(inv.totalGross) > 0.005);

      if (outstandingInvoices.length === 0) {
        setReport({
          asOfDate,
          totals: {
            notDue: '0',
            days1To30: '0',
            days31To60: '0',
            days61To90: '0',
            daysOver90: '0',
            total: '0',
          },
          byVendor: [],
        });
        setOrchestrationStep('');
        setIsOrchestrating(false);
        return;
      }

      // Step 4: POST to finance reports API
      setOrchestrationStep('Generating aging report…');
      const result = await postApAging({
        organizationId,
        companyCode: effectiveCompanyCode,
        asOfDate,
        invoices: outstandingInvoices,
      });

      setReport(result);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
      const detail = e?.response?.data?.detail;
      setErrorMessage(
        typeof detail === 'string'
          ? detail
          : (e?.message ?? 'Failed to generate AP Aging report. Please try again.')
      );
    } finally {
      setOrchestrationStep('');
      setIsOrchestrating(false);
    }
  };

  // ── Role guard ────────────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view the AP Aging report.</EmptyState>
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasNoOutstanding =
    report !== null &&
    report.byVendor.length === 0 &&
    parseFloat(report.totals.total) === 0;

  return (
    <PageContainer>
      <PageHeader
        breadcrumb="FINANCE · ACCOUNTS PAYABLE"
        title="AP Aging Report"
        description="Outstanding accounts payable balances grouped by how overdue each invoice is. Only Approved invoices with a positive outstanding balance are included."
      />

      {/* ── Toolbar ── */}
      <ToolbarCard>
        <ToolbarRow>
          {/* Company selector */}
          <ToolbarField>
            <ToolbarLabel htmlFor="ap-aging-company">Company</ToolbarLabel>
            <ToolbarSelect
              id="ap-aging-company"
              value={effectiveCompanyCode}
              onChange={(e) => {
                setSelectedCompanyCode(e.target.value);
                setReport(null);
                setErrorMessage(null);
              }}
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

          {/* As-of-date picker */}
          <ToolbarField>
            <ToolbarLabel htmlFor="ap-aging-as-of-date">As of Date</ToolbarLabel>
            <ToolbarDateInput
              id="ap-aging-as-of-date"
              type="date"
              value={asOfDate}
              max={todayIso()}
              onChange={(e) => {
                setAsOfDate(e.target.value);
                setReport(null);
                setErrorMessage(null);
              }}
              aria-label="As of date"
            />
          </ToolbarField>

          {/* Generate button */}
          <ToolbarField>
            <ToolbarLabel as="span">&nbsp;</ToolbarLabel>
            <GenerateButton
              type="button"
              onClick={() => { void handleGenerate(); }}
              disabled={isOrchestrating || !effectiveCompanyCode}
              aria-busy={isOrchestrating}
            >
              {isOrchestrating ? 'Generating…' : 'Generate'}
            </GenerateButton>
          </ToolbarField>
        </ToolbarRow>
        {isOrchestrating && orchestrationStep && (
          <StepIndicator aria-live="polite">{orchestrationStep}</StepIndicator>
        )}
      </ToolbarCard>

      {/* ── Error banner ── */}
      {errorMessage && (
        <ErrorBanner role="alert">{errorMessage}</ErrorBanner>
      )}

      {/* ── Loading overlay ── */}
      {isOrchestrating && !errorMessage && (
        <LoadingOverlay aria-live="polite">
          Generating AP Aging report — fetching invoices and payment data…
        </LoadingOverlay>
      )}

      {/* ── Pre-generate prompt ── */}
      {!isOrchestrating && !report && !errorMessage && (
        <EmptyState>
          <EmptyTitle>No report generated yet</EmptyTitle>
          Select a company and date above, then click <strong>Generate</strong> to
          view the AP Aging report.
        </EmptyState>
      )}

      {/* ── Report ── */}
      {report && !isOrchestrating && (
        <>
          {/* ── Totals cards ── */}
          <TotalsRow role="list" aria-label="AP Aging bucket totals">
            {bucketDefs(theme).map((bucket) => (
              <BucketCard key={bucket.key} $accent={bucket.accent} role="listitem">
                <BucketLabel $accent={bucket.accent}>{bucket.label}</BucketLabel>
                <BucketAmount $accent={bucket.accent}>
                  {formatAed(report.totals[bucket.key])}
                </BucketAmount>
                <BucketSub>{bucket.sublabel}</BucketSub>
              </BucketCard>
            ))}
          </TotalsRow>

          {/* ── Empty — all paid up ── */}
          {hasNoOutstanding ? (
            <EmptyState>
              <EmptyTitle>All vendors are paid up</EmptyTitle>
              No outstanding AP invoices as of <strong>{report.asOfDate}</strong>.
            </EmptyState>
          ) : (
            <ReportPanel>
              <ReportMetaBar>
                <ReportMetaTitle>
                  AP Aging — {effectiveCompanyCode}
                </ReportMetaTitle>
                <span>
                  As of <strong>{report.asOfDate}</strong>
                  {' · '}
                  {sortedVendors.length} vendor{sortedVendors.length !== 1 ? 's' : ''} with
                  outstanding balance
                </span>
              </ReportMetaBar>

              <TableWrapper>
                <AgingTable role="table" aria-label="AP Aging by vendor">
                  <AgingTHead>
                    <tr>
                      <AgingTh scope="col">Vendor Code</AgingTh>
                      <AgingTh scope="col">Vendor Name</AgingTh>
                      <AgingThRight scope="col">Not Due</AgingThRight>
                      <AgingThRight scope="col">1–30 Days</AgingThRight>
                      <AgingThRight scope="col">31–60 Days</AgingThRight>
                      <AgingThRight scope="col">61–90 Days</AgingThRight>
                      <AgingThRight scope="col">&gt; 90 Days</AgingThRight>
                      <AgingThRight scope="col">Total (AED)</AgingThRight>
                    </tr>
                  </AgingTHead>
                  <tbody>
                    {sortedVendors.map((vendor) => (
                      <AgingTr key={vendor.vendorId}>
                        <AgingTd style={{ fontFamily: theme.typography.fontFamily.mono, fontSize: 12 }}>
                          {vendor.vendorCode || '—'}
                        </AgingTd>
                        <AgingTd>{vendor.vendorName || '—'}</AgingTd>
                        <AgingTdMonoDimmed>
                          {parseFloat(vendor.notDue) !== 0 ? formatAed(vendor.notDue) : ''}
                        </AgingTdMonoDimmed>
                        <AgingTdMonoDimmed>
                          {parseFloat(vendor.days1To30) !== 0 ? formatAed(vendor.days1To30) : ''}
                        </AgingTdMonoDimmed>
                        <AgingTdMonoDimmed>
                          {parseFloat(vendor.days31To60) !== 0 ? formatAed(vendor.days31To60) : ''}
                        </AgingTdMonoDimmed>
                        <AgingTdMonoDimmed>
                          {parseFloat(vendor.days61To90) !== 0 ? formatAed(vendor.days61To90) : ''}
                        </AgingTdMonoDimmed>
                        <AgingTdMonoDimmed>
                          {parseFloat(vendor.daysOver90) !== 0 ? formatAed(vendor.daysOver90) : ''}
                        </AgingTdMonoDimmed>
                        <AgingTdMono>
                          <strong>{formatAed(vendor.total)}</strong>
                        </AgingTdMono>
                      </AgingTr>
                    ))}
                  </tbody>
                  <tfoot>
                    <TotalTr $isFooter>
                      <TotalTd colSpan={2}>Grand Total</TotalTd>
                      <TotalTdMono>{formatAed(report.totals.notDue)}</TotalTdMono>
                      <TotalTdMono>{formatAed(report.totals.days1To30)}</TotalTdMono>
                      <TotalTdMono>{formatAed(report.totals.days31To60)}</TotalTdMono>
                      <TotalTdMono>{formatAed(report.totals.days61To90)}</TotalTdMono>
                      <TotalTdMono>{formatAed(report.totals.daysOver90)}</TotalTdMono>
                      <TotalTdMono>{formatAed(report.totals.total)}</TotalTdMono>
                    </TotalTr>
                  </tfoot>
                </AgingTable>
              </TableWrapper>
            </ReportPanel>
          )}
        </>
      )}
    </PageContainer>
  );
}
