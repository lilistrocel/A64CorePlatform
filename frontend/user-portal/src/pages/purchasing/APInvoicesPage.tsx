/**
 * APInvoicesPage
 *
 * Paginated list of AP (Vendor) Invoices. Mirrors GoodsReceiptsPage pattern.
 * Includes a Variance column: "—" when zero, red positive, muted green negative.
 *
 * Role gating: procurement_officer, procurement_manager, accountant,
 *   finance_admin, auditor, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 *
 * Route: /purchasing/ap
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAPInvoices } from '../../hooks/queries/useAPInvoices';
import { useAuthStore } from '../../stores/auth.store';
import type { APStatus } from '../../services/apInvoicesService';

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
  min-width: 260px;
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
    $active ? theme.colors.primary[50] || '#eff6ff' : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary[700] || '#1d4ed8' : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: all 150ms ease;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
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

const StatusBadge = styled.span<{ $status: APStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status }) => {
    switch ($status) {
      case 'Draft':            return '#f3f4f6';
      case 'Pending Approval': return '#fef3c7';
      case 'Approved':         return '#d1fae5';
      case 'Rejected':         return '#fee2e2';
      default:                 return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'Draft':            return '#6b7280';
      case 'Pending Approval': return '#92400e';
      case 'Approved':         return '#065f46';
      case 'Rejected':         return '#991b1b';
      default:                 return '#6b7280';
    }
  }};
`;

/** Variance cell: hidden when zero, red when positive, muted green when negative */
const VarianceCell = styled.span<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-size: 13px;
  font-weight: ${({ $sign }) => ($sign === 'zero' ? '400' : '600')};
  color: ${({ $sign }) => {
    if ($sign === 'positive') return '#dc2626';   // red — vendor charged more
    if ($sign === 'negative') return '#059669';   // muted green — vendor charged less
    return '#9ca3af';                             // grey — no variance
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: APStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Pending Approval', value: 'Pending Approval' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
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

/**
 * Format a variance amount for display.
 * Returns { label, sign } where sign drives the colour.
 */
function formatVariance(
  variance: number,
  currency: string
): { label: string; sign: 'positive' | 'negative' | 'zero' } {
  if (variance === 0) return { label: '—', sign: 'zero' };
  const abs = new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(variance));
  if (variance > 0) return { label: `+${abs}`, sign: 'positive' };
  return { label: `(${abs})`, sign: 'negative' };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function APInvoicesPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<APStatus | 'all'>('all');

  const { data, isLoading, isError } = useAPInvoices({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const aps = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <Header>
        <Title>AP Invoices</Title>
        <PrimaryButton onClick={() => navigate('/purchasing/ap/new')}>
          + New from GR
        </PrimaryButton>
      </Header>

      <FilterRow>
        <SearchInput
          placeholder="Search by doc number, vendor, or invoice #..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search AP invoices"
        />
        <FilterChips>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.value}
              $active={statusFilter === f.value}
              onClick={() => { setStatusFilter(f.value as APStatus | 'all'); setPage(1); }}
            >
              {f.label}
            </Chip>
          ))}
        </FilterChips>
      </FilterRow>

      {isLoading && <EmptyState>Loading AP invoices...</EmptyState>}
      {isError && <EmptyState>Failed to load AP invoices. Please try again.</EmptyState>}
      {!isLoading && !isError && aps.length === 0 && (
        <EmptyState>No AP invoices found.</EmptyState>
      )}

      {!isLoading && !isError && aps.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Doc Number</Th>
                <Th>Vendor Invoice #</Th>
                <Th>Vendor</Th>
                <Th>Invoice Date</Th>
                <Th>Due Date</Th>
                <Th>Total Gross</Th>
                <Th>Variance</Th>
                <Th>Status</Th>
                <Th>Approved By / At</Th>
              </tr>
            </thead>
            <tbody>
              {aps.map((ap) => {
                const { label: varLabel, sign: varSign } = formatVariance(
                  ap.totalPriceVariance,
                  ap.currencyCode
                );
                return (
                  <Tr key={ap.docId} onClick={() => navigate(`/purchasing/ap/${ap.docId}`)}>
                    <Td>
                      <code style={{ fontSize: 13, fontWeight: 600 }}>{ap.docNumber}</code>
                    </Td>
                    <Td style={{ fontSize: 13 }}>{ap.invoiceNumber}</Td>
                    <Td>{ap.vendorName ?? ap.vendorCode ?? '—'}</Td>
                    <Td>{formatDate(ap.invoiceDate)}</Td>
                    <Td>{formatDate(ap.dueDate)}</Td>
                    <Td>{formatAmount(ap.totalGross, ap.currencyCode)}</Td>
                    <Td>
                      <VarianceCell $sign={varSign}>{varLabel}</VarianceCell>
                    </Td>
                    <Td>
                      <StatusBadge $status={ap.status}>{ap.status}</StatusBadge>
                    </Td>
                    <Td style={{ fontSize: 12, color: '#6b7280' }}>
                      {ap.approvedBy
                        ? `${ap.approvedBy}${ap.approvedAt ? ` · ${formatDate(ap.approvedAt)}` : ''}`
                        : '—'}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {aps.length} of {meta.total} AP invoices</span>
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
