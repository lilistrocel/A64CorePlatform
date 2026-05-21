/**
 * PurchaseRequestsPage
 *
 * Paginated list of Purchase Requests with status filters and navigation
 * to detail/new form pages.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { usePurchaseRequests } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { PRStatus, UrgencyLevel } from '../../services/purchasingApi';

// ─── Styled components ──────────────────────────────────────────────────────

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
  &:hover {
    border-color: ${({ theme }) => theme.colors.accent.sage};
    background: ${({ theme }) => theme.colors.accent.sageSoft || '#eff6ff'};
  }
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

const StatusBadge = styled.span<{ $status: PRStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'Draft': return theme.colors.surface.raised;
      case 'Pending Approval': return '#fef3c7';
      case 'Approved': return theme.colors.accent.sageSoft || '#ecfdf5';
      case 'Rejected': return theme.colors.status.danger || '#fef2f2';
      case 'Cancelled': return theme.colors.surface.raised;
      case 'Closed': return '#ede9fe';
      default: return theme.colors.surface.raised;
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'Draft': return theme.colors.text.secondary;
      case 'Pending Approval': return '#92400e';
      case 'Approved': return theme.colors.status.success || '#10b981';
      case 'Rejected': return theme.colors.status.danger || '#ef4444';
      case 'Cancelled': return theme.colors.text.tertiary;
      case 'Closed': return '#5b21b6';
      default: return theme.colors.text.secondary;
    }
  }};
`;

const UrgencyDot = styled.span<{ $urgency: UrgencyLevel }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: ${({ $urgency }) => {
    switch ($urgency) {
      case 'high': return '#ef4444';
      case 'normal': return '#f59e0b';
      case 'low': return '#6b7280';
      default: return '#6b7280';
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

// ─── Status filter options ────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: PRStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending Approval', value: 'Pending Approval' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
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

export function PurchaseRequestsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PRStatus | 'all'>('all');

  const { data, isLoading, isError } = usePurchaseRequests({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const prs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <Header>
        <Title>Purchase Requests</Title>
        <PrimaryButton onClick={() => navigate('/purchasing/pr/new')}>
          + New PR
        </PrimaryButton>
      </Header>

      <FilterRow>
        <SearchInput
          placeholder="Search by PR number..."
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

      {isLoading && <EmptyState>Loading purchase requests...</EmptyState>}
      {isError && <EmptyState>Failed to load purchase requests. Please try again.</EmptyState>}
      {!isLoading && !isError && prs.length === 0 && (
        <EmptyState>No purchase requests found. Create your first PR to get started.</EmptyState>
      )}

      {!isLoading && !isError && prs.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>PR Number</Th>
                <Th>Department</Th>
                <Th>Urgency</Th>
                <Th>Total (AED)</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {prs.map((pr) => (
                <Tr key={pr.docId} onClick={() => navigate(`/purchasing/pr/${pr.docId}`)}>
                  <Td>
                    <code style={{ fontSize: 13, fontWeight: 600 }}>{pr.docNumber}</code>
                  </Td>
                  <Td>{pr.department ?? '—'}</Td>
                  <Td>
                    <UrgencyDot $urgency={pr.urgency} />
                    {pr.urgency}
                  </Td>
                  <Td>{formatAmount(pr.totalGross, pr.currencyCode)}</Td>
                  <Td>
                    <StatusBadge $status={pr.status}>{pr.status}</StatusBadge>
                  </Td>
                  <Td>{formatDate(pr.requestedDate)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {prs.length} of {meta.total} purchase requests</span>
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
