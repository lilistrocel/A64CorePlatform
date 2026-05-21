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
import styled from 'styled-components';
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
  min-width: 200px;
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

// ─── Totals cards row ───────────────────────────────────────────────────────────

const TotalsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
`;

interface BucketCardProps {
  $color: string;
  $textColor: string;
}

const BucketCard = styled.div<BucketCardProps>`
  flex: 1;
  min-width: 120px;
  padding: 16px 18px;
  border-radius: 12px;
  background: ${({ $color }) => $color};
  border: 1px solid rgba(0, 0, 0, 0.06);
`;

const BucketLabel = styled.div<{ $textColor: string }>`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ $textColor }) => $textColor};
  margin-bottom: 6px;
  opacity: 0.8;
`;

const BucketAmount = styled.div<{ $textColor: string }>`
  font-size: 18px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  color: ${({ $textColor }) => $textColor};
`;

const BucketSub = styled.div<{ $textColor: string }>`
  font-size: 11px;
  color: ${({ $textColor }) => $textColor};
  margin-top: 2px;
  opacity: 0.65;
`;

// ─── Report meta bar ───────────────────────────────────────────────────────────

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

const AgingTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
`;

const AgingTHead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const AgingTh = styled.th`
  padding: 12px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface.sunken};
  white-space: nowrap;
`;

const AgingThRight = styled(AgingTh)`
  text-align: right;
`;

const AgingTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const AgingTd = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const AgingTdMono = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const AgingTdMonoDimmed = styled(AgingTdMono)`
  color: ${({ theme }) => theme.colors.text.secondary};
`;

interface TotalTrProps {
  $isFooter: boolean;
}

const TotalTr = styled.tr<TotalTrProps>`
  border-top: ${({ $isFooter }) => ($isFooter ? '3px double #d1d5db' : 'none')};
  background: ${({ $isFooter, theme }) =>
    $isFooter ? theme.colors.surface.canvas : 'transparent'};
`;

const TotalTd = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const TotalTdMono = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  color: ${({ theme }) => theme.colors.text.primary};
`;

// ─── Status components ─────────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 60px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  line-height: 1.7;
`;

const LoadingOverlay = styled.div`
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.status.danger || '#fef2f2'};
  color: ${({ theme }) => theme.colors.status.danger || '#9E2A2A'};
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 20px;
`;

const StepIndicator = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 8px;
  font-style: italic;
`;

// ─── Bucket configuration ───────────────────────────────────────────────────────

interface BucketDef {
  key: keyof ApAgingBuckets;
  label: string;
  sublabel: string;
  bg: string;
  text: string;
}

const BUCKET_DEFS: BucketDef[] = [
  {
    key: 'notDue',
    label: 'Not Due',
    sublabel: 'Current',
    bg: '#f0fdf4',
    text: '#166534',
  },
  {
    key: 'days1To30',
    label: '1–30 Days',
    sublabel: 'Overdue',
    bg: '#fefce8',
    text: '#854d0e',
  },
  {
    key: 'days31To60',
    label: '31–60 Days',
    sublabel: 'Overdue',
    bg: '#fff7ed',
    text: '#c2410c',
  },
  {
    key: 'days61To90',
    label: '61–90 Days',
    sublabel: 'Overdue',
    bg: '#fef2f2',
    text: '#b91c1c',
  },
  {
    key: 'daysOver90',
    label: '> 90 Days',
    sublabel: 'Overdue',
    bg: '#4c0519',
    text: '#fce7f3',
  },
  {
    key: 'total',
    label: 'Grand Total',
    sublabel: 'All vendors',
    bg: '#1e3a5f',
    text: 'rgba(15,110,86,0.08)',
  },
];

// ─── Main component ────────────────────────────────────────────────────────────

export function APAgingPage() {
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
      <PageTitle>AP Aging Report</PageTitle>
      <PageSubtitle>
        Outstanding accounts payable balances grouped by how overdue each invoice is.
        Only Approved invoices with a positive outstanding balance are included.
      </PageSubtitle>
      <Divider />

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
          Select a company and date above, then click <strong>Generate</strong> to
          view the AP Aging report.
        </EmptyState>
      )}

      {/* ── Report ── */}
      {report && !isOrchestrating && (
        <>
          {/* ── Totals cards ── */}
          <TotalsRow role="list" aria-label="AP Aging bucket totals">
            {BUCKET_DEFS.map((bucket) => (
              <BucketCard
                key={bucket.key}
                $color={bucket.bg}
                $textColor={bucket.text}
                role="listitem"
              >
                <BucketLabel $textColor={bucket.text}>{bucket.label}</BucketLabel>
                <BucketAmount $textColor={bucket.text}>
                  {formatAed(report.totals[bucket.key])}
                </BucketAmount>
                <BucketSub $textColor={bucket.text}>{bucket.sublabel}</BucketSub>
              </BucketCard>
            ))}
          </TotalsRow>

          {/* ── Empty — all paid up ── */}
          {hasNoOutstanding ? (
            <EmptyState>
              No outstanding AP invoices. All vendors are paid up to{' '}
              <strong>{report.asOfDate}</strong>.
            </EmptyState>
          ) : (
            <>
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
                        <AgingTd style={{ fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 12 }}>
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
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
