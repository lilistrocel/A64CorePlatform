/**
 * PurchaseOrdersPage
 *
 * Paginated list of Purchase Orders with status filters.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { usePurchaseOrders } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { POStatus } from '../../services/purchasingApi';

// ─── Styled components (same pattern as PurchaseRequestsPage) ─────────────────

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
  &::placeholder { color: ${({ theme }) => theme.colors.textDisabled}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
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
    $active ? theme.colors.primary[500] : theme.colors.neutral[300]};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary[50] : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: all 150ms ease;
`;

const PrimaryButton = styled.button`
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
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
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
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover { background: ${({ theme }) => theme.colors.neutral[50]}; }
  &:last-child td { border-bottom: none; }
`;

const StatusBadge = styled.span<{ $status: POStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'Draft': return theme.colors.neutral[100];
      case 'Pending Approval': return theme.colors.warningBg;
      case 'Open': return theme.colors.primary[100];
      case 'Sent': return theme.colors.emerald[100];
      case 'Partially Received': return theme.colors.primary[100];
      case 'Received': return theme.colors.successBg;
      case 'Closed': return theme.colors.secondary[50];
      case 'Cancelled': return theme.colors.neutral[100];
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'Draft': return theme.colors.textSecondary;
      case 'Pending Approval': return theme.colors.gold[800];
      case 'Open': return theme.colors.primary[700];
      case 'Sent': return theme.colors.emerald[700];
      case 'Partially Received': return theme.colors.secondary[700];
      case 'Received': return theme.colors.emerald[700];
      case 'Closed': return theme.colors.secondary[700];
      case 'Cancelled': return theme.colors.textDisabled;
      default: return theme.colors.textSecondary;
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PageButtons = styled.div`
  display: flex;
  gap: 8px;
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
  const theme = useTheme();
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
      <Header>
        <Title>Purchase Orders</Title>
        <PrimaryButton onClick={() => navigate('/purchasing/po/new')}>
          + New PO
        </PrimaryButton>
      </Header>

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
              onClick={() => { setStatusFilter(f.value as any); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
      </FilterRow>

      {isLoading && <EmptyState>Loading purchase orders...</EmptyState>}
      {isError && <EmptyState>Failed to load purchase orders. Please try again.</EmptyState>}
      {!isLoading && !isError && pos.length === 0 && (
        <EmptyState>No purchase orders found.</EmptyState>
      )}

      {!isLoading && !isError && pos.length > 0 && (
        <>
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
                    <code style={{ fontSize: 13, fontWeight: 600 }}>{po.docNumber}</code>
                  </Td>
                  <Td>{po.vendorName ?? po.vendorCode ?? '—'}</Td>
                  <Td>{formatAmount(po.totalGross, po.currencyCode)}</Td>
                  <Td>
                    <StatusBadge $status={po.status}>{po.status}</StatusBadge>
                  </Td>
                  <Td>{formatDate(po.docDate)}</Td>
                  <Td>
                    {po.baseDocId ? (
                      <span
                        style={{ color: theme.colors.primary[600], cursor: 'pointer', fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/purchasing/pr/${po.baseDocId}`); }}
                      >
                        From PR
                      </span>
                    ) : '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {pos.length} of {meta.total} purchase orders</span>
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
