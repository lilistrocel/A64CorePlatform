/**
 * DeliveriesPage — Wave 3 (T-200.5)
 *
 * Paginated list of Delivery Notes with status filter chips, date range,
 * search by doc number / customer name, and navigation to detail / new-form pages.
 *
 * Route: /sales/deliveries
 *
 * Status vocabulary: Draft | Open | Cancelled
 * (mirrors DocumentStatus enum — all lowercase).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Truck } from 'lucide-react';
import { useDeliveries } from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import type { DeliveryStatus, DeliveryListItem } from '../../services/salesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = DeliveryStatus | 'ALL';

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
  margin-bottom: 16px;
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

const StatusChips = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const StatusChip = styled.button<{ $active: boolean; $status: StatusFilter }>`
  padding: 6px 16px;
  border-radius: 99px;
  border: 1.5px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $active, $status }) => {
    if (!$active) return '#f3f4f6';
    switch ($status) {
      case 'draft': return '#e0e7ff';
      case 'open': return '#d1fae5';
      case 'cancelled': return '#fee2e2';
      default: return '#e0e7ff';
    }
  }};
  color: ${({ $active, $status }) => {
    if (!$active) return '#6b7280';
    switch ($status) {
      case 'draft': return '#3730a3';
      case 'open': return '#065f46';
      case 'cancelled': return '#991b1b';
      default: return '#1e40af';
    }
  }};
  border-color: ${({ $active, $status }) => {
    if (!$active) return 'transparent';
    switch ($status) {
      case 'draft': return '#818cf8';
      case 'open': return '#34d399';
      case 'cancelled': return '#f87171';
      default: return '#93c5fd';
    }
  }};
  &:hover {
    opacity: 0.85;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: middle;
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 0.1s;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
  &:last-child td {
    border-bottom: none;
  }
`;

const StatusBadge = styled.span<{ $status: DeliveryStatus }>`
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
      case 'cancelled': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'draft': return '#374151';
      case 'open': return '#065f46';
      case 'cancelled': return '#991b1b';
      default: return '#374151';
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

const PageButton = styled.button`
  padding: 6px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  font-size: 14px;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: DeliveryStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'open': return 'Open';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function DeliveriesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const queryParams = {
    organizationId: orgId,
    status: statusFilter === 'ALL' ? null : statusFilter,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    page,
    size: 20,
  };

  const { data, isLoading, error } = useDeliveries(queryParams);

  // Client-side search filter (doc number + customer name)
  const filteredItems = useMemo<DeliveryListItem[]>(() => {
    if (!data?.data) return [];
    if (!search.trim()) return data.data;
    const q = search.toLowerCase();
    return data.data.filter(
      (dn) =>
        dn.docNumber.toLowerCase().includes(q) ||
        dn.customerName.toLowerCase().includes(q),
    );
  }, [data?.data, search]);

  const meta = data?.meta;

  return (
    <Container>
      <Header>
        <Title>Delivery Notes</Title>
        <PrimaryButton onClick={() => navigate('/sales/deliveries/new')}>
          <Truck size={16} />
          + New Delivery
        </PrimaryButton>
      </Header>

      <FilterRow>
        <StatusChips>
          {STATUS_FILTERS.map(({ label, value }) => (
            <StatusChip
              key={value}
              $active={statusFilter === value}
              $status={value}
              onClick={() => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              {label}
            </StatusChip>
          ))}
        </StatusChips>
      </FilterRow>

      <FilterRow>
        <SearchInput
          type="text"
          placeholder="Search by doc number or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

      {isLoading && <EmptyState>Loading...</EmptyState>}
      {error && <EmptyState style={{ color: '#dc2626' }}>Failed to load deliveries.</EmptyState>}

      {!isLoading && !error && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Doc Number</Th>
                <Th>Doc Date</Th>
                <Th>Actual Delivery</Th>
                <Th>Customer</Th>
                <Th>Source SO</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: 'right' }}>Total COGS</Th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState>No delivery notes found.</EmptyState>
                  </td>
                </tr>
              ) : (
                filteredItems.map((dn) => (
                  <Tr
                    key={dn.docEntry}
                    onClick={() => navigate(`/sales/deliveries/${dn.docEntry}`)}
                  >
                    <Td>
                      <strong>{dn.docNumber}</strong>
                    </Td>
                    <Td>{formatDate(dn.docDate)}</Td>
                    <Td>{formatDate(dn.actualDeliveryDate)}</Td>
                    <Td>{dn.customerName}</Td>
                    <Td>
                      {dn.baseDocRef ? (
                        <span
                          style={{ color: '#6366f1', cursor: 'pointer', fontWeight: 500 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/sales/orders-v2/${dn.baseDocRef!.docId}`);
                          }}
                        >
                          {dn.baseDocRef.docNumber}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge $status={dn.status}>
                        {statusLabel(dn.status)}
                      </StatusBadge>
                    </Td>
                    <Td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {Number(dn.totalCogs).toLocaleString('en-AE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <Pagination>
              <span>
                Showing {(meta.page - 1) * meta.perPage + 1}–
                {Math.min(meta.page * meta.perPage, meta.total)} of {meta.total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <PageButton
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </PageButton>
                <PageButton
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= meta.totalPages}
                >
                  Next
                </PageButton>
              </div>
            </Pagination>
          )}
        </>
      )}
    </Container>
  );
}

export default DeliveriesPage;
