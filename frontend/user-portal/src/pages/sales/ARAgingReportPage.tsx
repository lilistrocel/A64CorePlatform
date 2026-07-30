/**
 * ARAgingReportPage — Wave 3 (T-200.2)
 *
 * The AR Aging report answers "who owes me money and how late are they?"
 *
 * Route: /sales/reports/ar-aging
 *
 * Features:
 *   - Filter bar: as-of date, customer name search, currency dropdown
 *   - Grand totals card with 5 bucket stats (current + overdue bands)
 *   - Sortable customer table with drill-down to AR Invoices list
 *   - Overdue buckets (61-90 and 90+) highlighted in amber/red
 *   - CSV export (client-side)
 *   - Empty state
 *
 * Hardening rules (T-200.0 carry-over):
 *   Rule 1: API path uses /v1/sales/reports/ar-aging (no /api/ prefix)
 *   Rule 2: Response models use _RESPONSE_CONFIG (camelCase); backend has
 *           response_model_by_alias=True on the route
 *   Rule 3: Status literals are lowercase — N/A for this report page
 *   Rule 4: NO Audit History button
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { BarChart3, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { useArAging } from '../../hooks/queries/useArAging';
import { useAuthStore } from '../../stores/auth.store';
import type { ARAgingCustomerRow } from '../../services/salesApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtAmt(value: string | number | undefined): string {
  if (value === undefined || value === null) return '0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '0.00' : num.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isWarning(bucket: string | number): boolean {
  const n = typeof bucket === 'string' ? parseFloat(bucket) : bucket;
  return !isNaN(n) && n > 0;
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const SubTitle = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 400;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLabel = styled.label`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DateInput = styled.input`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const SearchInput = styled.input`
  padding: 9px 12px;
  min-width: 220px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder {
    color: ${({ theme }) => theme.colors.textDisabled};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const CurrencySelect = styled.select`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const GhostButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    border-color: ${({ theme }) => theme.colors.neutral[400]};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Grand totals card ────────────────────────────────────────────────────────

const TotalsCard = styled.div`
  background: ${({ theme }) => theme.colors.surface || theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 24px;
`;

const TotalsCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const TotalsCardTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const TotalsMeta = styled.div`
  display: flex;
  gap: 16px;
`;

const MetaBadge = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: 99px;
  padding: 3px 10px;
`;

const TotalsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

// Aging-bucket escalation (current/1-30/31-60 are neutral; the report only
// flags the two most severe buckets): 61-90 → gold (warning), 90+ → terracotta
// (danger). Chromatic voices per a20core-rebrand-spec.md — severity beats hue.
const BucketCard = styled.div<{ $warning?: boolean; $danger?: boolean }>`
  background: ${({ $warning, $danger, theme }) =>
    $danger
      ? theme.colors.errorBg
      : $warning
      ? theme.colors.gold[50]
      : theme.colors.neutral[50]};
  border: 1px solid
    ${({ $warning, $danger, theme }) =>
      $danger ? theme.colors.terracotta[200] : $warning ? theme.colors.gold[200] : theme.colors.neutral[200]};
  border-radius: 10px;
  padding: 14px 16px;
`;

const BucketLabel = styled.div<{ $warning?: boolean; $danger?: boolean }>`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ $warning, $danger, theme }) =>
    $danger ? theme.colors.error : $warning ? theme.colors.gold[600] : theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const BucketAmount = styled.div<{ $warning?: boolean; $danger?: boolean }>`
  font-size: 22px;
  font-weight: 700;
  color: ${({ $warning, $danger, theme }) =>
    $danger ? theme.colors.error : $warning ? theme.colors.gold[600] : theme.colors.textPrimary};
  font-variant-numeric: tabular-nums;
`;

const BucketSubtext = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

// ─── Customer table ───────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface || theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const TableTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th<{ $sortable?: boolean; $right?: boolean }>`
  padding: 10px 14px;
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
  user-select: none;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};

  &:hover {
    ${({ $sortable, theme }) =>
      $sortable ? `color: ${theme.colors.primary[600]};` : ''}
  }
`;

const Td = styled.td<{ $right?: boolean; $warn?: boolean; $danger?: boolean }>`
  padding: 11px 14px;
  font-size: 13px;
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  font-variant-numeric: tabular-nums;
  color: ${({ $warn, $danger, theme }) =>
    $danger ? theme.colors.error : $warn ? theme.colors.gold[600] : theme.colors.textPrimary};
  font-weight: ${({ $warn, $danger }) => ($warn || $danger ? '600' : '400')};
`;

const TrClickable = styled.tr`
  cursor: pointer;
  transition: background 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[50]};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const TrFooter = styled.tr`
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-weight: 700;
`;

const SortIcon = styled.span`
  margin-left: 4px;
  font-size: 10px;
`;

// ─── Empty / Loading / Error states ──────────────────────────────────────────

const StateBox = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StateIcon = styled.div`
  font-size: 40px;
  margin-bottom: 16px;
`;

const StateText = styled.p`
  font-size: 15px;
  font-weight: 500;
`;

const ErrorBox = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 20px;
  color: ${({ theme }) => theme.colors.terracotta[700]};
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
`;

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortField =
  | 'customerName'
  | 'current'
  | 'days1To30'
  | 'days31To60'
  | 'days61To90'
  | 'over90'
  | 'total'
  | 'invoiceCount';

function sortRows(
  rows: ARAgingCustomerRow[],
  field: SortField,
  asc: boolean,
): ARAgingCustomerRow[] {
  return [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (field === 'customerName') {
      av = a.customerName;
      bv = b.customerName;
    } else if (field === 'invoiceCount') {
      av = a.invoiceCount;
      bv = b.invoiceCount;
    } else {
      av = parseFloat(a[field] as string) || 0;
      bv = parseFloat(b[field] as string) || 0;
    }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: ARAgingCustomerRow[], asOfDate: string): void {
  const headers = [
    'Customer Name',
    'Customer ID',
    'Currency',
    'Current',
    '1-30 Days',
    '31-60 Days',
    '61-90 Days',
    '90+ Days',
    'Total',
    'Invoices',
  ];
  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        `"${r.customerName}"`,
        r.customerId,
        r.currency,
        r.current,
        r.days1To30,
        r.days31To60,
        r.days61To90,
        r.over90,
        r.total,
        r.invoiceCount,
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ar_aging_${asOfDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page component ───────────────────────────────────────────────────────────

export function ARAgingReportPage() {
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';
  const navigate = useNavigate();
  const theme = useTheme();

  // Filter state
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [customerSearch, setCustomerSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  // Sort state — default: total desc
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortAsc, setSortAsc] = useState(false);

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useArAging({
    organizationId: orgId,
    asOfDate: asOfDate || undefined,
    currency: currencyFilter || undefined,
  });

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortAsc((prev) => !prev);
      } else {
        setSortField(field);
        setSortAsc(false); // new field starts desc
      }
    },
    [sortField],
  );

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return <SortIcon>{sortAsc ? '▲' : '▼'}</SortIcon>;
  };

  // Apply client-side customer name filter + sort
  const displayedRows = useMemo(() => {
    let rows = report?.customers ?? [];
    if (customerSearch.trim()) {
      const q = customerSearch.trim().toLowerCase();
      rows = rows.filter((r) => r.customerName.toLowerCase().includes(q));
    }
    return sortRows(rows, sortField, sortAsc);
  }, [report?.customers, customerSearch, sortField, sortAsc]);

  const gt = report?.grandTotals;

  const handleRowClick = (row: ARAgingCustomerRow) => {
    // Drill down to filtered AR Invoices list for this customer (open invoices)
    navigate(`/sales/ar-invoices?customer_id=${row.customerId}&status=open`);
  };

  const handleExportCsv = () => {
    if (!report) return;
    exportCsv(displayedRows, report.asOfDate);
  };

  return (
    <Container>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Header>
        <TitleRow>
          <BarChart3 size={28} strokeWidth={1.8} />
          <div>
            <Title>AR Aging Report</Title>
            <SubTitle>Outstanding receivables by customer and ageing band</SubTitle>
          </div>
        </TitleRow>
        <HeaderActions>
          <GhostButton onClick={handleExportCsv} disabled={!report || displayedRows.length === 0}>
            <Download size={15} />
            Export CSV
          </GhostButton>
          <PrimaryButton onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={15} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </PrimaryButton>
        </HeaderActions>
      </Header>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterRow>
        <FilterGroup>
          <FilterLabel>As of Date</FilterLabel>
          <DateInput
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Customer</FilterLabel>
          <SearchInput
            type="text"
            placeholder="Search customer name…"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Currency</FilterLabel>
          <CurrencySelect
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
          >
            <option value="">All currencies</option>
            <option value="AED">AED</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </CurrencySelect>
        </FilterGroup>
      </FilterRow>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {isError && (
        <ErrorBox>
          <AlertTriangle size={18} />
          <span>
            Failed to load AR Aging report.{' '}
            {error instanceof Error ? error.message : 'Please try again.'}
          </span>
        </ErrorBox>
      )}

      {/* ── Grand totals card ─────────────────────────────────────────────── */}
      {(report || isLoading) && (
        <TotalsCard>
          <TotalsCardHeader>
            <TotalsCardTitle>Grand Totals</TotalsCardTitle>
            {gt && (
              <TotalsMeta>
                <MetaBadge>{gt.customerCount} customer{gt.customerCount !== 1 ? 's' : ''}</MetaBadge>
                <MetaBadge>{gt.invoiceCount} invoice{gt.invoiceCount !== 1 ? 's' : ''}</MetaBadge>
                {report?.asOfDate && (
                  <MetaBadge>As of {report.asOfDate}</MetaBadge>
                )}
              </TotalsMeta>
            )}
          </TotalsCardHeader>

          {isLoading ? (
            <div style={{ color: theme.colors.textSecondary, fontSize: 14, padding: '8px 0' }}>Loading…</div>
          ) : (
            <TotalsGrid>
              <BucketCard>
                <BucketLabel>Current</BucketLabel>
                <BucketAmount>{fmtAmt(gt?.current)}</BucketAmount>
                <BucketSubtext>Not yet due</BucketSubtext>
              </BucketCard>
              <BucketCard>
                <BucketLabel>1–30 Days</BucketLabel>
                <BucketAmount>{fmtAmt(gt?.days1To30)}</BucketAmount>
                <BucketSubtext>Slightly overdue</BucketSubtext>
              </BucketCard>
              <BucketCard>
                <BucketLabel>31–60 Days</BucketLabel>
                <BucketAmount>{fmtAmt(gt?.days31To60)}</BucketAmount>
                <BucketSubtext>Overdue</BucketSubtext>
              </BucketCard>
              <BucketCard $warning={isWarning(gt?.days61To90 ?? 0)}>
                <BucketLabel $warning={isWarning(gt?.days61To90 ?? 0)}>61–90 Days</BucketLabel>
                <BucketAmount $warning={isWarning(gt?.days61To90 ?? 0)}>{fmtAmt(gt?.days61To90)}</BucketAmount>
                <BucketSubtext>Seriously overdue</BucketSubtext>
              </BucketCard>
              <BucketCard $danger={isWarning(gt?.over90 ?? 0)}>
                <BucketLabel $danger={isWarning(gt?.over90 ?? 0)}>90+ Days</BucketLabel>
                <BucketAmount $danger={isWarning(gt?.over90 ?? 0)}>{fmtAmt(gt?.over90)}</BucketAmount>
                <BucketSubtext>Critical — escalate</BucketSubtext>
              </BucketCard>
            </TotalsGrid>
          )}
        </TotalsCard>
      )}

      {/* ── Customer table ────────────────────────────────────────────────── */}
      <TableWrapper>
        <TableHeader>
          <TableTitle>
            By Customer{displayedRows.length > 0 ? ` (${displayedRows.length})` : ''}
          </TableTitle>
        </TableHeader>

        {isLoading ? (
          <StateBox>
            <StateText>Loading AR Aging data…</StateText>
          </StateBox>
        ) : displayedRows.length === 0 ? (
          <StateBox>
            <StateIcon>📭</StateIcon>
            <StateText>No outstanding AR invoices for the selected filters.</StateText>
          </StateBox>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th $sortable onClick={() => handleSort('customerName')}>
                  Customer{sortIcon('customerName')}
                </Th>
                <Th>Currency</Th>
                <Th $right $sortable onClick={() => handleSort('current')}>
                  Current{sortIcon('current')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('days1To30')}>
                  1–30 Days{sortIcon('days1To30')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('days31To60')}>
                  31–60 Days{sortIcon('days31To60')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('days61To90')}>
                  61–90 Days{sortIcon('days61To90')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('over90')}>
                  90+ Days{sortIcon('over90')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('total')}>
                  Total{sortIcon('total')}
                </Th>
                <Th $right $sortable onClick={() => handleSort('invoiceCount')}>
                  Invoices{sortIcon('invoiceCount')}
                </Th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, idx) => {
                const has6190 = isWarning(row.days61To90);
                const hasOver90 = isWarning(row.over90);
                return (
                  <TrClickable
                    key={`${row.customerId}-${row.currency}-${idx}`}
                    onClick={() => handleRowClick(row)}
                    title="Click to view this customer's open AR Invoices"
                  >
                    <Td>
                      <span style={{ fontWeight: 600 }}>{row.customerName}</span>
                    </Td>
                    <Td>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: theme.colors.neutral[100],
                        borderRadius: 4,
                        padding: '2px 7px',
                      }}>
                        {row.currency}
                      </span>
                    </Td>
                    <Td $right>{fmtAmt(row.current)}</Td>
                    <Td $right>{fmtAmt(row.days1To30)}</Td>
                    <Td $right>{fmtAmt(row.days31To60)}</Td>
                    <Td $right $warn={has6190}>{fmtAmt(row.days61To90)}</Td>
                    <Td $right $danger={hasOver90}>{fmtAmt(row.over90)}</Td>
                    <Td $right style={{ fontWeight: 700 }}>{fmtAmt(row.total)}</Td>
                    <Td $right>{row.invoiceCount}</Td>
                  </TrClickable>
                );
              })}
            </tbody>
            {/* Grand totals footer row */}
            {gt && (
              <tfoot>
                <TrFooter>
                  <Td style={{ fontWeight: 700 }}>TOTAL</Td>
                  <Td></Td>
                  <Td $right>{fmtAmt(gt.current)}</Td>
                  <Td $right>{fmtAmt(gt.days1To30)}</Td>
                  <Td $right>{fmtAmt(gt.days31To60)}</Td>
                  <Td $right $warn={isWarning(gt.days61To90)}>{fmtAmt(gt.days61To90)}</Td>
                  <Td $right $danger={isWarning(gt.over90)}>{fmtAmt(gt.over90)}</Td>
                  <Td $right style={{ fontWeight: 700 }}>{fmtAmt(gt.total)}</Td>
                  <Td $right>{gt.invoiceCount}</Td>
                </TrFooter>
              </tfoot>
            )}
          </Table>
        )}
      </TableWrapper>
    </Container>
  );
}
