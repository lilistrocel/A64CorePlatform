/**
 * QuotesPage — Wave 3 (T-200.3)
 *
 * Paginated list of Sales Quotes with status filter chips, date range,
 * search by doc number / customer name / BP ref, and navigation to
 * detail / new-form pages.
 *
 * Route: /sales/quotes
 *
 * Status vocabulary: Draft | Open | Closed | Cancelled
 * (mirrors SAP B1 Sales Quote lifecycle).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { FileText } from 'lucide-react';
import { useQuotes } from '../../hooks/queries/useQuotes';
import { useAuthStore } from '../../stores/auth.store';
import type { QuoteStatus, QuoteListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = QuoteStatus | 'ALL';

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

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 220px;
  padding: 10px 14px;
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

const DateInput = styled.input`
  padding: 10px 12px;
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

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[600] : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
    color: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const NewButton = styled.button`
  padding: 10px 20px;
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
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: left;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const ClickableTr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover td {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

// Status badge colours — A20Core document-status canon, shared across all
// Wave 3 sales list/detail pages (see a20core-rebrand-spec.md):
//   draft     → neutral   (neutral[100] / textSecondary)
//   open      → emerald   (successBg / emerald[700])
//   closed    → neutral (dark) (neutral[200] / neutral[800])
//   cancelled → terracotta (errorBg / terracotta[700])
const StatusBadge = styled.span<{ $status: QuoteStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.neutral[100];
      case 'open': return theme.colors.successBg;
      case 'closed': return theme.colors.neutral[200];
      case 'cancelled': return theme.colors.errorBg;
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'draft': return theme.colors.textSecondary;
      case 'open': return theme.colors.emerald[700];
      case 'closed': return theme.colors.neutral[800];
      case 'cancelled': return theme.colors.terracotta[700];
      default: return theme.colors.textSecondary;
    }
  }};
`;

const PaginationRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageBtn = styled.button<{ $active?: boolean }>`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.onAccent : theme.colors.textPrimary};
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
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const EmptyIcon = styled.div`
  margin-bottom: 16px;
  opacity: 0.3;
`;

const EmptyTitle = styled.p`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  font-size: 14px;
  margin: 0;
`;

const ErrorBanner = styled.div`
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.terracotta[700]};
  font-size: 14px;
  margin-bottom: 24px;
`;

// ─── Status chip config ────────────────────────────────────────────────────────

const STATUS_CHIPS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
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

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuotesPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => ({
    organizationId: orgId,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    size: PAGE_SIZE,
  }), [orgId, statusFilter, dateFrom, dateTo, page]);

  const { data, isLoading, isError, error } = useQuotes(queryParams);

  // Client-side search filter (docNumber, customerName, bpRefNo)
  const filteredItems = useMemo<QuoteListItem[]>(() => {
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
    navigate(`/sales/quotes/${docEntry}`);
  }

  return (
    <Container>
      <Header>
        <Title>Sales Quotes</Title>
        <NewButton onClick={() => navigate('/sales/quotes/new')}>
          + New Quote
        </NewButton>
      </Header>

      {isError && (
        <ErrorBanner>
          Failed to load Sales Quotes.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </ErrorBanner>
      )}

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search by quote #, customer, BP ref…"
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
            onClick={() => handleStatusChip(value)}
          >
            {label}
          </Chip>
        ))}
      </FilterChips>

      <TableWrapper style={{ marginTop: 20 }}>
        {isLoading ? (
          <EmptyState>
            <EmptyText>Loading…</EmptyText>
          </EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState>
            <EmptyIcon>
              <FileText size={48} />
            </EmptyIcon>
            <EmptyTitle>No Sales Quotes found</EmptyTitle>
            <EmptyText>
              {statusFilter !== 'ALL' || searchText || dateFrom || dateTo
                ? 'Try adjusting your filters.'
                : 'Create your first Sales Quote using the "+ New Quote" button.'}
            </EmptyText>
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Quote #</Th>
                  <Th>Date</Th>
                  <Th>Valid Until</Th>
                  <Th>Customer</Th>
                  <Th>BP Ref No</Th>
                  <Th style={{ textAlign: 'right' }}>Total Gross</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <ClickableTr
                    key={item.docEntry}
                    onClick={() => handleRowClick(item.docEntry)}
                  >
                    <Td>
                      <strong style={{ color: theme.colors.primary[500] }}>{item.docNumber}</strong>
                    </Td>
                    <Td>{formatDate(item.docDate)}</Td>
                    <Td>{formatDate(item.validUntilDate)}</Td>
                    <Td>{item.customerName}</Td>
                    <Td>{item.bpRefNo ?? '—'}</Td>
                    <Td style={{ textAlign: 'right' }}>
                      {formatAmount(item.totals.gross, item.currency)}
                    </Td>
                    <Td>
                      <StatusBadge $status={item.status}>
                        {statusLabel(item.status)}
                      </StatusBadge>
                    </Td>
                  </ClickableTr>
                ))}
              </tbody>
            </Table>

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
      </TableWrapper>
    </Container>
  );
}
