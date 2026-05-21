/**
 * GoodsReceiptsPage
 *
 * Paginated list of Goods Receipts. Mirrors PurchaseOrdersPage patterns.
 *
 * Role gating: procurement_officer, procurement_manager, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/gr
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useGoodsReceipts } from '../../hooks/queries/useGoodsReceipts';
import { useAuthStore } from '../../stores/auth.store';
import type { GRStatus } from '../../services/goodsReceiptsService';

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
  color: ${({ theme }) => theme.colors.text.primary};
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
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const FilterChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.accent.sage : theme.colors.border.subtle};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageSoft || '#eff6ff' : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageDeep || '#1d4ed8' : theme.colors.text.secondary};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: all 150ms ease;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover { background: ${({ theme }) => theme.colors.surface.canvas}; }
  &:last-child td { border-bottom: none; }
`;

const StatusBadge = styled.span<{ $status: GRStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'Draft':   return '#f3f4f6';
      case 'Posted':  return '#d1fae5';
      default:        return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'Draft':   return '#6b7280';
      case 'Posted':  return '#065f46';
      default:        return '#6b7280';
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const PageButtons = styled.div`
  display: flex;
  gap: 8px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: GRStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Posted', value: 'Posted' },
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
      <Header>
        <Title>Goods Receipts</Title>
        <PrimaryButton onClick={() => navigate('/purchasing/gr/new')}>
          + New from PO
        </PrimaryButton>
      </Header>

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
              onClick={() => { setStatusFilter(f.value as GRStatus | 'all'); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
      </FilterRow>

      {isLoading && <EmptyState>Loading goods receipts...</EmptyState>}
      {isError && <EmptyState>Failed to load goods receipts. Please try again.</EmptyState>}
      {!isLoading && !isError && grs.length === 0 && (
        <EmptyState>No goods receipts found.</EmptyState>
      )}

      {!isLoading && !isError && grs.length > 0 && (
        <>
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
                    <code style={{ fontSize: 13, fontWeight: 600 }}>{gr.docNumber}</code>
                  </Td>
                  <Td>
                    {gr.baseDocNumber ? (
                      <span
                        style={{ color: '#2563eb', cursor: 'pointer', fontSize: 13 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/purchasing/po/${gr.baseDocId}`);
                        }}
                      >
                        {gr.baseDocNumber}
                      </span>
                    ) : '—'}
                  </Td>
                  <Td>{gr.vendorName ?? gr.vendorCode ?? '—'}</Td>
                  <Td>{formatDate(gr.receivedDate)}</Td>
                  <Td>{formatAmount(gr.subtotalNet, gr.currencyCode)}</Td>
                  <Td>
                    <StatusBadge $status={gr.status}>{gr.status}</StatusBadge>
                  </Td>
                  <Td style={{ fontSize: 12, color: '#6b7280' }}>
                    {gr.postedAt ? formatDate(gr.postedAt) : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {grs.length} of {meta.total} goods receipts</span>
            <PageButtons>
              <GhostButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </GhostButton>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>
                Page {meta.page} / {meta.totalPages}
              </span>
              <GhostButton
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.totalPages}
              >
                Next
              </GhostButton>
            </PageButtons>
          </Pagination>
        </>
      )}
    </Container>
  );
}
