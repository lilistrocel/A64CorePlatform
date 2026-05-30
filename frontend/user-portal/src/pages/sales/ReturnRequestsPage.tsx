/**
 * ReturnRequestsPage — Wave 3 (T-200.6)
 *
 * Paginated list of Return Requests (RMAs) with:
 *   - Status filter chips: All / Draft / Open / Closed / Cancelled
 *   - Reason filter chips: All + each reason code label
 *   - Search: docNumber, customerName, source DN docNumber (via baseDocRef)
 *   - Table: DocNumber, DocDate, ValidUntil, Customer, Reason, Source DN,
 *            Total Qty, Status badge
 *   - "+ New Return Request" button
 *
 * Route: /sales/return-requests
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Plus } from 'lucide-react';
import { useReturnRequests } from '../../hooks/queries/useReturnRequests';
import { useAuthStore } from '../../stores/auth.store';
import type { ReturnRequestStatus, ReturnReason, ReturnRequestListItem } from '../../services/salesApi';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
`;

const TitleGroup = styled.div``;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.primary[600]}; }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
`;

const SearchInput = styled.input`
  padding: 9px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  width: 280px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.textSecondary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[400]}; }
`;

const ChipGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : theme.colors.surface};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] : theme.colors.textSecondary};
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const Card = styled.div`
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
  padding: 11px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; }
`;

const Td = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

interface StatusBadgeProps { $status: ReturnRequestStatus }
const StatusBadge = styled.span<StatusBadgeProps>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#f3f4f6';
      case 'open': return '#ecfdf5';
      case 'closed': return '#f3e8ff';
      case 'cancelled': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#374151';
      case 'open': return '#065f46';
      case 'closed': return '#6b21a8';
      case 'cancelled': return '#991b1b';
      default: return '#374151';
    }
  }};
`;

const EmptyState = styled.div`
  padding: 56px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $disabled?: boolean }>`
  padding: 6px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ $disabled, theme }) => $disabled ? theme.colors.neutral[400] : theme.colors.textPrimary};
  font-size: 13px;
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-bottom: 16px;
  color: #991b1b;
  font-size: 14px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: ReturnRequestStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const REASON_OPTIONS: Array<{ value: ReturnReason | ''; label: string }> = [
  { value: '', label: 'All Reasons' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'overshipped', label: 'Overshipped' },
  { value: 'customer_change', label: 'Customer Changed Mind' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'other', label: 'Other' },
];

function reasonLabel(reason: string): string {
  const found = REASON_OPTIONS.find((o) => o.value === reason);
  return found ? found.label : reason;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: ReturnRequestStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnRequestsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<ReturnRequestStatus | ''>('');
  const [reasonFilter, setReasonFilter] = useState<ReturnReason | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = useReturnRequests({
    organizationId: orgId,
    status: statusFilter || undefined,
    page,
    size: PAGE_SIZE,
  });

  // Client-side search + reason filter (server list endpoint doesn't support reason filter)
  const filtered = useMemo<ReturnRequestListItem[]>(() => {
    const items = data?.data ?? [];
    const q = search.toLowerCase().trim();
    return items.filter((rr) => {
      if (reasonFilter && rr.reason !== reasonFilter) return false;
      if (!q) return true;
      const dn = (rr.baseDocRef as { docNumber?: string } | null)?.docNumber ?? '';
      return (
        rr.docNumber.toLowerCase().includes(q) ||
        rr.customerName.toLowerCase().includes(q) ||
        dn.toLowerCase().includes(q)
      );
    });
  }, [data?.data, search, reasonFilter]);

  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <Container>
      <Header>
        <TitleGroup>
          <Title>Return Requests</Title>
          <Subtitle>RMA authorisations — gate for the returns flow</Subtitle>
        </TitleGroup>
        <NewButton onClick={() => navigate('/sales/return-requests/new')}>
          <Plus size={16} /> New Return Request
        </NewButton>
      </Header>

      {error && (
        <ErrorBanner>Failed to load Return Requests. Please refresh and try again.</ErrorBanner>
      )}

      <Toolbar>
        <SearchInput
          placeholder="Search doc number, customer, source DN..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <ChipGroup>
          {STATUS_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              $active={statusFilter === opt.value}
              onClick={() => { setStatusFilter(opt.value as ReturnRequestStatus | ''); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup>
          {REASON_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              $active={reasonFilter === opt.value}
              onClick={() => { setReasonFilter(opt.value as ReturnReason | ''); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipGroup>
      </Toolbar>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Doc Number</Th>
              <Th>Doc Date</Th>
              <Th>Valid Until</Th>
              <Th>Customer</Th>
              <Th>Reason</Th>
              <Th>Source DN</Th>
              <Th style={{ textAlign: 'right' }}>Gross</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <Td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                  Loading...
                </Td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <Td colSpan={8}>
                  <EmptyState>
                    {search || statusFilter || reasonFilter
                      ? 'No Return Requests match the current filters.'
                      : 'No Return Requests yet. Start from a posted Delivery or click "+ New Return Request".'}
                  </EmptyState>
                </Td>
              </tr>
            ) : (
              filtered.map((rr) => {
                const dn = (rr.baseDocRef as { docNumber?: string } | null)?.docNumber;
                return (
                  <Tr
                    key={rr.docEntry}
                    onClick={() => navigate(`/sales/return-requests/${rr.docEntry}`)}
                  >
                    <Td style={{ fontWeight: 600 }}>{rr.docNumber}</Td>
                    <Td>{formatDate(rr.docDate)}</Td>
                    <Td>{formatDate(rr.validUntilDate)}</Td>
                    <Td>{rr.customerName}</Td>
                    <Td>{reasonLabel(rr.reason)}</Td>
                    <Td style={{ color: dn ? undefined : '#9ca3af' }}>{dn ?? '—'}</Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(rr.totals.gross).toLocaleString('en-AE', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      })}
                    </Td>
                    <Td>
                      <StatusBadge $status={rr.status}>{statusLabel(rr.status)}</StatusBadge>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>

        {!isLoading && total > 0 && (
          <Pagination>
            <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <PaginationButtons>
              <PageButton $disabled={page <= 1} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </PageButton>
              <PageButton
                $disabled={page >= totalPages}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </PageButton>
            </PaginationButtons>
          </Pagination>
        )}
      </Card>
    </Container>
  );
}
