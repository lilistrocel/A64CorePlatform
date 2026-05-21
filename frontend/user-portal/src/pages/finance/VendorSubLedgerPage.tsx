/**
 * VendorSubLedgerPage
 *
 * Finance report: Vendor Sub-Ledger as of a selected date.
 *
 * Backend returns vendorId only. This page cross-references with the operation's
 * vendor list (GET /v1/purchasing/vendors) to render vendorCode + vendorName.
 *
 * Layout:
 *   Toolbar → Company / As-of-date / Vendor filter (optional) / Reload
 *   Top card: Total Outstanding
 *   Table: Vendor Code | Vendor Name | Total Credits | Total Debits | Balance
 *          | Last Activity | Entry Count | Action (View Entries →)
 *
 * The "View Entries →" action navigates to:
 *   /finance/journal-entries?search={vendorCode}
 * The JE description contains the vendor code, so the search surfaces entries.
 *
 * Role gate: accountant, finance_admin, auditor, admin, super_admin.
 * Route: /finance/vendor-sub-ledger
 *
 * Modals do NOT close on overlay click — data-entry policy (no modals here).
 */

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import { useVendorSubLedger } from '../../hooks/queries/useFinanceReports';
import { useVendors } from '../../hooks/queries/index';

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

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

// ─── Total outstanding card ────────────────────────────────────────────────────

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 24px;
`;

const SummaryBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SummaryLabel = styled.span`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const SummaryValue = styled.span`
  font-size: 24px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SummaryMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
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

const SubLedgerTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
`;

const SLTHead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const SLTh = styled.th`
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

const SLThRight = styled(SLTh)`
  text-align: right;
`;

const SLThCenter = styled(SLTh)`
  text-align: center;
`;

const SLTr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const SLTd = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SLTdMono = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SLTdCenter = styled.td`
  padding: 11px 14px;
  font-size: 13px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

interface BalanceTdProps {
  $negative: boolean;
}

const BalanceTd = styled.td<BalanceTdProps>`
  padding: 11px 14px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  text-align: right;
  font-weight: 600;
  color: ${({ $negative }) => ($negative ? '#9E2A2A' : '#166534')};
`;

const ViewEntriesLink = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.accent.sage};
  padding: 4px 8px;
  border-radius: 6px;
  font-family: inherit;
  white-space: nowrap;
  transition: background 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageSoft};
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
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

const VendorCodeCell = styled.td`
  padding: 11px 14px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

// ─── Main component ────────────────────────────────────────────────────────────

export function VendorSubLedgerPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

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
  const [selectedVendorId, setSelectedVendorId] = useState('');

  // ── Vendor list for cross-reference and filter dropdown ──────────────────────

  const { data: vendorsData } = useVendors({
    organizationId: organizationId || undefined,
    perPage: 500,
    isActive: true,
  });
  const vendors = vendorsData?.data ?? [];

  // Build a lookup map: vendorId → { vendorCode, name }
  const vendorMap = useMemo(() => {
    const m = new Map<string, { vendorCode: string; name: string }>();
    for (const v of vendors) {
      m.set(v.vendorId, { vendorCode: v.vendorCode, name: v.name });
    }
    return m;
  }, [vendors]);

  // ── Sub-ledger query ──────────────────────────────────────────────────────────

  const {
    data: subLedger,
    isLoading: subLedgerLoading,
    isError: subLedgerError,
    error: subLedgerErrorObj,
    refetch,
  } = useVendorSubLedger(
    organizationId,
    effectiveCompanyCode,
    asOfDate || undefined,
    selectedVendorId || undefined
  );

  // ── Sort by balance desc ─────────────────────────────────────────────────────

  const sortedRows = useMemo(() => {
    if (!subLedger) return [];
    return [...subLedger.byVendor].sort(
      (a, b) => parseFloat(b.balance) - parseFloat(a.balance)
    );
  }, [subLedger]);

  // ── Error message ────────────────────────────────────────────────────────────

  const errorMessage = subLedgerError
    ? (() => {
        const e = subLedgerErrorObj as {
          response?: { data?: { detail?: unknown }; status?: number };
          message?: string;
        };
        const detail = e?.response?.data?.detail;
        return typeof detail === 'string'
          ? detail
          : (e?.message ?? 'Failed to load vendor sub-ledger. Please try again.');
      })()
    : null;

  // ── Role guard ────────────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view the Vendor Sub-Ledger.</EmptyState>
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

  const selectedVendor = selectedVendorId ? vendorMap.get(selectedVendorId) : null;

  return (
    <PageContainer>
      <PageTitle>Vendor Sub-Ledger</PageTitle>
      <PageSubtitle>
        A detailed ledger of all AP transactions per vendor. Shows total debits, credits,
        and outstanding balance. Use "View Entries" to drill into the journal entries for
        a vendor.
      </PageSubtitle>
      <Divider />

      {/* ── Toolbar ── */}
      <ToolbarCard>
        <ToolbarRow>
          {/* Company selector */}
          <ToolbarField>
            <ToolbarLabel htmlFor="vsl-company">Company</ToolbarLabel>
            <ToolbarSelect
              id="vsl-company"
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

          {/* As-of-date picker */}
          <ToolbarField>
            <ToolbarLabel htmlFor="vsl-as-of-date">As of Date</ToolbarLabel>
            <ToolbarDateInput
              id="vsl-as-of-date"
              type="date"
              value={asOfDate}
              max={todayIso()}
              onChange={(e) => setAsOfDate(e.target.value)}
              aria-label="As of date"
            />
          </ToolbarField>

          {/* Vendor filter (optional) */}
          <ToolbarField>
            <ToolbarLabel htmlFor="vsl-vendor">Vendor (optional)</ToolbarLabel>
            <ToolbarSelect
              id="vsl-vendor"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              aria-label="Filter by vendor"
            >
              <option value="">— All Vendors —</option>
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorCode} — {v.name}
                </option>
              ))}
            </ToolbarSelect>
          </ToolbarField>

          {/* Manual refresh button */}
          <ToolbarField>
            <ToolbarLabel as="span">&nbsp;</ToolbarLabel>
            <ViewEntriesLink
              type="button"
              onClick={() => { void refetch(); }}
              disabled={subLedgerLoading || !effectiveCompanyCode}
              aria-label="Refresh vendor sub-ledger"
              style={{ padding: '10px 18px', fontWeight: 600, fontSize: 14 }}
            >
              {subLedgerLoading ? 'Loading…' : 'Refresh'}
            </ViewEntriesLink>
          </ToolbarField>
        </ToolbarRow>
      </ToolbarCard>

      {/* ── Error banner ── */}
      {errorMessage && (
        <ErrorBanner role="alert">{errorMessage}</ErrorBanner>
      )}

      {/* ── Loading ── */}
      {subLedgerLoading && (
        <LoadingOverlay aria-live="polite">Loading vendor sub-ledger…</LoadingOverlay>
      )}

      {/* ── No data guard ── */}
      {!subLedgerLoading && !subLedgerError && !subLedger && (
        <EmptyState>
          Select a company above. The sub-ledger loads automatically.
        </EmptyState>
      )}

      {/* ── Report ── */}
      {subLedger && !subLedgerLoading && (
        <>
          {/* ── Total outstanding card ── */}
          <SummaryCard>
            <SummaryBlock>
              <SummaryLabel>Total Outstanding</SummaryLabel>
              <SummaryValue>{formatAed(subLedger.totalOutstanding)}</SummaryValue>
              <SummaryMeta>
                AED as of{' '}
                {subLedger.asOfDate}
                {selectedVendor ? ` · Vendor: ${selectedVendor.vendorCode} — ${selectedVendor.name}` : ''}
              </SummaryMeta>
            </SummaryBlock>
          </SummaryCard>

          {/* ── Empty state ── */}
          {sortedRows.length === 0 ? (
            <EmptyState>
              No AP activity found
              {selectedVendorId ? ' for this vendor' : ''} as of{' '}
              <strong>{subLedger.asOfDate}</strong>.
            </EmptyState>
          ) : (
            <>
              <ReportMetaBar>
                <ReportMetaTitle>
                  Vendor Sub-Ledger — {effectiveCompanyCode}
                </ReportMetaTitle>
                <span>
                  As of <strong>{subLedger.asOfDate}</strong>
                  {' · '}
                  {sortedRows.length} vendor{sortedRows.length !== 1 ? 's' : ''}
                </span>
              </ReportMetaBar>

              <TableWrapper>
                <SubLedgerTable role="table" aria-label="Vendor Sub-Ledger">
                  <SLTHead>
                    <tr>
                      <SLTh scope="col">Vendor Code</SLTh>
                      <SLTh scope="col">Vendor Name</SLTh>
                      <SLThRight scope="col">Total Credits (AED)</SLThRight>
                      <SLThRight scope="col">Total Debits (AED)</SLThRight>
                      <SLThRight scope="col">Balance (AED)</SLThRight>
                      <SLTh scope="col">Last Activity</SLTh>
                      <SLThCenter scope="col">Entries</SLThCenter>
                      <SLTh scope="col">Action</SLTh>
                    </tr>
                  </SLTHead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const vendorInfo = vendorMap.get(row.vendorId);
                      const vendorCode = vendorInfo?.vendorCode ?? '—';
                      const vendorName = vendorInfo?.name ?? row.vendorId;
                      const balanceNum = parseFloat(row.balance);
                      const isNegativeBalance = balanceNum < 0;

                      return (
                        <SLTr key={row.vendorId}>
                          <VendorCodeCell>{vendorCode}</VendorCodeCell>
                          <SLTd>{vendorName}</SLTd>
                          <SLTdMono>{formatAed(row.totalCredits)}</SLTdMono>
                          <SLTdMono>{formatAed(row.totalDebits)}</SLTdMono>
                          <BalanceTd $negative={isNegativeBalance}>
                            {formatAed(row.balance)}
                          </BalanceTd>
                          <SLTd>{formatDateTime(row.lastActivityAt)}</SLTd>
                          <SLTdCenter>{row.entryCount}</SLTdCenter>
                          <SLTd>
                            {vendorCode !== '—' && (
                              <ViewEntriesLink
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/finance/journal-entries?search=${encodeURIComponent(vendorCode)}`
                                  )
                                }
                                aria-label={`View journal entries for ${vendorName}`}
                              >
                                View Entries →
                              </ViewEntriesLink>
                            )}
                          </SLTd>
                        </SLTr>
                      );
                    })}
                  </tbody>
                </SubLedgerTable>
              </TableWrapper>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
