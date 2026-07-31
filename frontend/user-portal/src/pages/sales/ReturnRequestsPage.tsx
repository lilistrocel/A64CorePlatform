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
 *
 * Night Observatory reskin (T-901): status filter chips and the status
 * column both route through the single canonical helper in
 * components/sales/statusPhase.ts — see StatusBadge / Chip below. Reason
 * chips have no phase (categorical, not status) — celeste emphasis instead.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css, useTheme } from 'styled-components';
import { Plus } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, phaseBadge, PageHeader } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { useReturnRequests } from '../../hooks/queries/useReturnRequests';
import { useAuthStore } from '../../stores/auth.store';
import { salesStatusToPhase } from '../../components/sales/statusPhase';
import type { ReturnRequestStatus, ReturnReason, ReturnRequestListItem } from '../../services/salesApi';

function chipPhase(value: ReturnRequestStatus | ''): PhaseKey | null {
  return value === '' ? null : salesStatusToPhase(value);
}

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
`;

const NewButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
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

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
`;

const SearchInput = styled.input`
  ${glassControl}
  padding: 9px 14px;
  font-size: 14px;
  width: 280px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ChipGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey | null }>`
  ${({ $active, $phase }) => ($active && $phase ? phaseBadge($phase) : glassControl)}
  padding: 5px 12px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.66rem;
  letter-spacing: 0.07em;
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

// A dense results table lives inside one glass panel — no nested glass.
const Card = styled.div`
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
  padding: 11px 14px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Tr = styled.tr`
  cursor: pointer;
  &:hover td { background: rgba(180, 200, 220, 0.05); }
`;

const Td = styled.td`
  padding: 13px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  transition: background 100ms ease;
`;

const TdMono = styled(Td)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const StatusBadge = styled.span<{ $status: ReturnRequestStatus }>`
  ${({ $status }) => phaseBadge(salesStatusToPhase($status))}
`;

const EmptyState = styled.div`
  padding: 56px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 8px 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const PageButton = styled.button<{ $disabled?: boolean }>`
  ${glassControl}
  padding: 6px 14px;
  color: ${({ $disabled, theme }) => $disabled ? theme.colors.muted : theme.colors.celeste};
  font-size: 13px;
  cursor: ${({ $disabled }) => $disabled ? 'not-allowed' : 'pointer'};
  &:hover:not(:disabled) { color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.colors.bright.coral};
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
  const theme = useTheme();
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
      <PageHeader
        breadcrumb="SALES · LIVE"
        title="Return Requests"
        description="RMA authorisations — gate for the returns flow"
        stats={[{ value: total, label: 'Total Requests' }]}
      />

      <ActionRow>
        <NewButton onClick={() => navigate('/sales/return-requests/new')}>
          <Plus size={16} strokeWidth={1.8} /> New Return Request
        </NewButton>
      </ActionRow>

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
              $phase={chipPhase(opt.value)}
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
                    <TdMono style={{ fontWeight: 600 }}>{rr.docNumber}</TdMono>
                    <TdMono>{formatDate(rr.docDate)}</TdMono>
                    <TdMono>{formatDate(rr.validUntilDate)}</TdMono>
                    <Td>{rr.customerName}</Td>
                    <Td>{reasonLabel(rr.reason)}</Td>
                    <TdMono style={{ color: dn ? undefined : theme.colors.muted }}>{dn ?? '—'}</TdMono>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: theme.typography.fontFamily.mono }}>
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
