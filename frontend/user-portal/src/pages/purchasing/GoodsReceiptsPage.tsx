/**
 * GoodsReceiptsPage
 *
 * Paginated list of Goods Receipts. Mirrors PurchaseOrdersPage patterns.
 *
 * Role gating: procurement_officer, procurement_manager, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/gr
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
import { useGoodsReceipts } from '../../hooks/queries/useGoodsReceipts';
import { useAuthStore } from '../../stores/auth.store';
import type { GRStatus } from '../../services/goodsReceiptsService';
import { purchasingStatusToPhase, statusDisplayLabel } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────

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

/** Muted, smaller Space Mono — for secondary metadata like "Posted At". */
const MutedMono = styled(Mono)`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`;

/** PO cross-reference link — secondary emphasis (celeste), never gold. Also
 * Space Mono since it renders a doc number. */
const RefLink = styled(Mono)`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const StatusBadge = styled.span<{ $status: GRStatus }>`
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// T-811: filter values are sent to the backend as a `status` query param —
// they must be the stored (lowercase_snake) vocabulary. GR's 'Posted'
// collapsed into the shared 'open' value under the Wave 4 migration.
const STATUS_FILTERS: { label: string; value: GRStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Posted', value: 'open' },
];

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GoodsReceiptsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GRStatus | 'all'>('all');

  const { data, isLoading, isError } = useGoodsReceipts({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const grs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <PageHeader
        breadcrumb="— PURCHASING · RECEIPTS"
        title="Goods Receipts"
        emphasizeLastWord
        description="Confirmed deliveries against open purchase orders."
        stats={[
          { value: meta.total, label: 'Total GRs' },
          { value: grs.length, label: 'This Page' },
        ]}
      />

      <FilterRow>
        <SearchInput
          placeholder="Search by GR number or vendor..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search goods receipts"
        />
        <FilterChips>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.value}
              $active={statusFilter === f.value}
              $phase={f.value === 'all' ? undefined : purchasingStatusToPhase(f.value)}
              onClick={() => { setStatusFilter(f.value as GRStatus | 'all'); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
        <Button variant="primary" onClick={() => navigate('/purchasing/gr/new')}>
          New from PO
        </Button>
      </FilterRow>

      {isLoading && <StatusMessage>Loading goods receipts...</StatusMessage>}
      {isError && <StatusMessage>Failed to load goods receipts. Please try again.</StatusMessage>}
      {!isLoading && !isError && grs.length === 0 && (
        <EmptyState>
          <EmptyHeadline>No goods receipts yet</EmptyHeadline>
          {/* Reason: no separate CTA — "New from PO" above in FilterRow
              already covers this action; a second gold primary button here
              would breach the spec §3 ≤4-gold-per-view budget. */}
          <EmptyText style={{ marginBottom: 0 }}>Receive against an open purchase order above to record a delivery.</EmptyText>
        </EmptyState>
      )}

      {!isLoading && !isError && grs.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>GR Number</Th>
                  <Th>PO Number</Th>
                  <Th>Vendor</Th>
                  <Th>Received Date</Th>
                  <Th>Total Net</Th>
                  <Th>Status</Th>
                  <Th>Posted At</Th>
                </tr>
              </thead>
              <tbody>
                {grs.map((gr) => (
                  <Tr key={gr.docId} onClick={() => navigate(`/purchasing/gr/${gr.docId}`)}>
                    <Td>
                      <DocCode>{gr.docNumber}</DocCode>
                    </Td>
                    <Td>
                      {gr.baseDocNumber ? (
                        <RefLink
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/purchasing/po/${gr.baseDocId}`);
                          }}
                        >
                          {gr.baseDocNumber}
                        </RefLink>
                      ) : '—'}
                    </Td>
                    <Td>{gr.vendorName ?? gr.vendorCode ?? '—'}</Td>
                    <Td><Mono>{formatDate(gr.receivedDate)}</Mono></Td>
                    <Td><Mono>{formatAmount(gr.subtotalNet, gr.currencyCode)}</Mono></Td>
                    <Td>
                      <StatusBadge $status={gr.status}>{statusDisplayLabel(gr.status, 'GR')}</StatusBadge>
                    </Td>
                    <Td>
                      <MutedMono>{gr.postedAt ? formatDate(gr.postedAt) : '—'}</MutedMono>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination>
            <span>Showing {grs.length} of {meta.total} goods receipts</span>
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
