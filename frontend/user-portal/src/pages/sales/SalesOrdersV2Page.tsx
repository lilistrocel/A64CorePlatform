/**
 * SalesOrdersV2Page — Wave 3 (T-200.4)
 *
 * Paginated list of Sales Orders v2 with status filter chips, date range,
 * search by doc number / customer name / BP ref, and navigation to
 * detail / new-form pages.
 *
 * Route: /sales/orders-v2
 *
 * Status vocabulary: Draft | Open | Partly Closed | Closed | Cancelled
 * (mirrors DocumentStatus enum — all lowercase).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / Chip below.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { ShoppingCart } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useSalesOrdersV2 } from '../../hooks/queries/useSalesOrders';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { SalesOrderStatus, SalesOrderListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = SalesOrderStatus | 'ALL';

function chipPhase(value: StatusFilter): PhaseKey | null {
  return value === 'ALL' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  flex: 1;
  min-width: 220px;
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const DateInput = styled.input`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  color-scheme: dark;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`;

const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 6px 14px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;

  ${({ $active, $phase, theme }) =>
    !($active && $phase) &&
    css`
      color: ${$active ? theme.colors.celeste : theme.colors.muted};
    `}

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const NewButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

// A dense results table lives inside one glass panel — no nested glass.
const TableWrapper = styled.div`
  ${glassPanel}
  padding: 8px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 12px 16px;
  color: ${({ theme }) => theme.colors.celeste};
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const ClickableTr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover td {
    background: rgba(180, 200, 220, 0.05);
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: SalesOrderStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const ProgressPill = styled.span`
  ${glassControl}
  display: inline-block;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.celeste};
  border-radius: 99px;
  padding: 2px 8px;
`;

// T-201.10 — badge for SOs with unbilled service-line qty. Terra tint
// signals "action needed" without spending gold budget (spec §3).
const ServiceOpenBadge = styled.span`
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.bright.terra};
  background: rgba(232, 147, 95, 0.16);
  border-radius: 99px;
  padding: 2px 10px;
`;

const PaginationRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 8px 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageBtn = styled.button<{ $active?: boolean }>`
  ${glassControl}
  padding: 6px 12px;
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.celeste)};
  border-color: ${({ $active, theme }) => ($active ? 'rgba(180, 200, 220, 0.35)' : theme.colors.glass.border)};
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
`;

const EmptyIcon = styled.div`
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  justify-content: center;
`;

const EmptyTitle = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 18px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 24px;
`;

// ─── Status chip config ────────────────────────────────────────────────────────

const STATUS_CHIPS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Partly Closed', value: 'partly_closed' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(amount: number, currency = 'AED'): string {
  return `${currency} ${amount.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusLabel(s: SalesOrderStatus): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'partly_closed': return 'Partly Closed';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return s;
  }
}

function fulfilmentLabel(item: SalesOrderListItem): string {
  switch (item.status) {
    case 'open': return 'Pending';
    case 'partly_closed': return 'Partial';
    case 'closed': return 'Fulfilled';
    default: return '—';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesOrdersV2Page() {
  const theme = useTheme();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // T-201.10: filter for SOs with unbilled service lines (requires backend support)
  const [hasServiceOpenLines, setHasServiceOpenLines] = useState(false);
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => ({
    organizationId: orgId,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    // Only send when true — backend ignores null/undefined
    hasServiceOpenLines: hasServiceOpenLines ? true : undefined,
    page,
    size: PAGE_SIZE,
  }), [orgId, statusFilter, dateFrom, dateTo, hasServiceOpenLines, page]);

  const { data, isLoading, isError, error } = useSalesOrdersV2(queryParams);

  // Client-side search filter (docNumber, customerName, bpRefNo)
  const filteredItems = useMemo<SalesOrderListItem[]>(() => {
    const items = data?.data ?? [];
    if (!searchText.trim()) return items;
    const q = searchText.toLowerCase();
    return items.filter(
      (item) =>
        item.docNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        (item.bpRefNo ?? '').toLowerCase().includes(q),
    );
  }, [data?.data, searchText]);

  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  function handleStatusChip(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleRowClick(docEntry: string) {
    navigate(`/sales/orders-v2/${docEntry}`);
  }

  return (
    <Container>
      <PageHeader
        breadcrumb="SALES · LIVE"
        title="Sales Orders"
        stats={[{ value: meta?.total ?? 0, label: 'Total Orders' }]}
      />

      <ActionRow>
        <NewButton onClick={() => navigate('/sales/orders-v2/new')}>
          + New Sales Order
        </NewButton>
      </ActionRow>

      {isError && (
        <ErrorBanner>
          Failed to load Sales Orders.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </ErrorBanner>
      )}

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search by order #, customer, BP ref…"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(1);
          }}
        />
        <DateInput
          type="date"
          title="Date from"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <DateInput
          type="date"
          title="Date to"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </FilterRow>

      <FilterChips>
        {STATUS_CHIPS.map(({ label, value }) => (
          <Chip
            key={value}
            $active={statusFilter === value}
            $phase={chipPhase(value)}
            onClick={() => handleStatusChip(value)}
          >
            {label}
          </Chip>
        ))}
        {/* T-201.10: filter chip for SOs with unbilled service lines.
            Note: requires backend support for has_service_open_lines param.
            The chip is visible and toggleable; when the backend param is not
            yet supported, the filter will silently return all results. This
            is a boolean toggle, not a status — no phase colour. */}
        <Chip
          $active={hasServiceOpenLines}
          onClick={() => {
            setHasServiceOpenLines((v) => !v);
            setPage(1);
          }}
          title="Show only Sales Orders with unbilled service lines (requires backend support)"
        >
          Has Service Open Qty
        </Chip>
      </FilterChips>

      {isLoading ? (
        <EmptyState>
          <EmptyText>Loading…</EmptyText>
        </EmptyState>
      ) : filteredItems.length === 0 ? (
        <EmptyState>
          <EmptyIcon>
            <ShoppingCart size={40} strokeWidth={1.6} />
          </EmptyIcon>
          <EmptyTitle>No Sales Orders found</EmptyTitle>
          <EmptyText>
            {statusFilter !== 'ALL' || searchText || dateFrom || dateTo
              ? 'Try adjusting your filters.'
              : 'Create your first Sales Order using the "+ New Sales Order" button, or convert a Quote.'}
          </EmptyText>
        </EmptyState>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>Order #</Th>
                  <Th>Doc Date</Th>
                  <Th>Delivery Date</Th>
                  <Th>Customer</Th>
                  <Th>BP Ref No</Th>
                  <Th style={{ textAlign: 'right' }}>Total Gross</Th>
                  <Th style={{ textAlign: 'right' }}>Service Open Qty</Th>
                  <Th>Status</Th>
                  <Th>Fulfilment</Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ClickableTr
                    key={item.docEntry}
                    onClick={() => handleRowClick(item.docEntry)}
                  >
                    <TdMono>
                      <strong style={{ color: theme.colors.celeste }}>{item.docNumber}</strong>
                    </TdMono>
                    <TdMono>{formatDate(item.docDate)}</TdMono>
                    <TdMono>{formatDate(item.deliveryDate)}</TdMono>
                    <Td>{item.customerName}</Td>
                    <Td>{item.bpRefNo ?? '—'}</Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: theme.typography.fontFamily.mono }}>
                      {formatAmount(item.totals.gross, item.currency)}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      {item.serviceOpenInvoiceQty > 0 ? (
                        <ServiceOpenBadge>
                          {item.serviceOpenInvoiceQty.toLocaleString()}
                        </ServiceOpenBadge>
                      ) : (
                        <span style={{ color: theme.colors.muted }}>—</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge $status={item.status}>
                        {statusLabel(item.status)}
                      </StatusBadge>
                    </Td>
                    <Td>
                      {fulfilmentLabel(item) !== '—' ? (
                        <ProgressPill>{fulfilmentLabel(item)}</ProgressPill>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </ClickableTr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>

          {meta && totalPages > 1 && (
            <PaginationRow>
              <span>
                Showing {((page - 1) * PAGE_SIZE) + 1}–
                {Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
              </span>
              <PaginationButtons>
                <PageBtn
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Prev
                </PageBtn>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - page) <= 2)
                  .map((p) => (
                    <PageBtn
                      key={p}
                      $active={p === page}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </PageBtn>
                  ))}
                <PageBtn
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </PageBtn>
              </PaginationButtons>
            </PaginationRow>
          )}
        </>
      )}
    </Container>
  );
}
