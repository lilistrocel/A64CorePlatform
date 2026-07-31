/**
 * PurchaseOrdersPage
 *
 * Paginated list of Purchase Orders with status filters.
 *
 * Modals do NOT close on overlay click — X button only.
 *
 * Night Observatory (T-901 Phase 3, spec Docs/2-Working-Progress/night-observatory-spec.md):
 * visual reskin only — glass table/controls, phase badges via ./statusPhase,
 * Space Mono metadata, shared PageHeader/Button. Logic, routes, data-fetching
 * and props are unchanged.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { PageHeader, Button, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { usePurchaseOrders } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { POStatus } from '../../services/purchasingApi';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components (same pattern as PurchaseRequestsPage) ─────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
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

  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

/** Filter pill — spec §5 preamble: "same status = same colour in every
 * context (badge, card edge, filter pill, ...)". Active state without a
 * phase (the "All" chip) falls back to celeste, never gold. */
const Chip = styled.button<{ $active: boolean; $phase?: PhaseKey }>`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  ${({ $active, $phase, theme }) =>
    $active &&
    ($phase
      ? phaseBadge($phase)
      : css`
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.celeste};
          background: rgba(180, 200, 220, 0.14);
        `)}
`;

const TableWrap = styled.div`
  ${glassPanel}
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 14px 16px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover td { background: rgba(180, 200, 220, 0.05); }
  &:last-child td { border-bottom: none; }
`;

/** Space Mono for document IDs, quantities, currency amounts, timestamps —
 * spec §2/instruction 6. */
const Mono = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const DocCode = styled(Mono)`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** "From PR" cross-reference link — secondary emphasis (celeste), never gold. */
const RefLink = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const StatusBadge = styled.span<{ $status: POStatus }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

const StatusMessage = styled.p`
  text-align: center;
  padding: 48px 32px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px;
`;

const EmptyText = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9rem;
  margin: 0 0 20px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const PageButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PageIndicator = styled.span`
  ${monoLabel}
  padding: 6px 12px;
  color: ${({ theme }) => theme.colors.celeste};
`;

// ─── Status filter options ────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: POStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending Approval', value: 'Pending Approval' },
  { label: 'Open', value: 'Open' },
  { label: 'Sent', value: 'Sent' },
  { label: 'Cancelled', value: 'Cancelled' },
];

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseOrdersPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all');

  const { data, isLoading, isError } = usePurchaseOrders({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const pos = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · ORDERS"
        title="Purchase Orders"
        emphasizeLastWord
        description="Vendor-facing orders raised from approved requests or created directly."
        stats={[
          { value: meta.total, label: 'Total POs' },
          { value: pos.length, label: 'This Page' },
        ]}
      />

      <FilterRow>
        <SearchInput
          placeholder="Search by PO number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <FilterChips>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.value}
              $active={statusFilter === f.value}
              $phase={f.value === 'all' ? undefined : purchasingStatusToPhase(f.value)}
              onClick={() => { setStatusFilter(f.value as any); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
        <Button variant="primary" onClick={() => navigate('/purchasing/po/new')}>
          New Purchase Order
        </Button>
      </FilterRow>

      {isLoading && <StatusMessage>Loading purchase orders...</StatusMessage>}
      {isError && <StatusMessage>Failed to load purchase orders. Please try again.</StatusMessage>}
      {!isLoading && !isError && pos.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No purchase orders yet</EmptyHeadline>
          {/* Reason: no separate CTA — "New Purchase Order" above in
              FilterRow already covers this action; a second gold primary
              button here would breach the spec §3 ≤4-gold-per-view budget. */}
          <EmptyText style={{ marginBottom: 0 }}>Purchase orders appear here once a PR is approved or a PO is created directly above.</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && pos.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>PO Number</Th>
                  <Th>Vendor</Th>
                  <Th>Total (AED)</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Based On</Th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <Tr key={po.docId} onClick={() => navigate(`/purchasing/po/${po.docId}`)}>
                    <Td>
                      <DocCode>{po.docNumber}</DocCode>
                    </Td>
                    <Td>{po.vendorName ?? po.vendorCode ?? '—'}</Td>
                    <Td><Mono>{formatAmount(po.totalGross, po.currencyCode)}</Mono></Td>
                    <Td>
                      <StatusBadge $status={po.status}>{po.status}</StatusBadge>
                    </Td>
                    <Td><Mono>{formatDate(po.docDate)}</Mono></Td>
                    <Td>
                      {po.baseDocId ? (
                        <RefLink
                          onClick={(e) => { e.stopPropagation(); navigate(`/purchasing/pr/${po.baseDocId}`); }}
                        >
                          From PR
                        </RefLink>
                      ) : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination>
            <span>Showing {pos.length} of {meta.total} purchase orders</span>
            <PageButtons>
              <Button
                variant="outline"
                size="small"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <PageIndicator>Page {meta.page} / {meta.totalPages}</PageIndicator>
              <Button
                variant="outline"
                size="small"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.totalPages}
              >
                Next
              </Button>
            </PageButtons>
          </Pagination>
        </>
      )}
    </Container>
  );
}
