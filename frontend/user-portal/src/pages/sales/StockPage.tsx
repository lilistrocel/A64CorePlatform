/**
 * StockPage Component
 *
 * Sales > Stock page — two tabs:
 *   - Sellable: harvested goods available/reserved/sold/expired (from farm inventory)
 *   - Waste: waste records (from farm waste inventory)
 *
 * Reads from farm-side endpoints via inventoryApi (not the retired /v1/sales/inventory/*).
 * Deep-linkable via ?tab=sellable or ?tab=waste.
 */

import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { HarvestInventoryList, type HarvestStockStatus } from '../inventory/HarvestInventoryList';
import WasteInventoryList from '../inventory/WasteInventoryList';
import { ReturnedInventoryList } from '../inventory/ReturnedInventoryList';
import { SalesActionTiles } from '../../components/sales/SalesActionTiles';

// ============================================================================
// TYPES
// ============================================================================

type StockTab = 'sellable' | 'returned' | 'waste';

const STOCK_STATUS_FILTERS: Array<{ key: HarvestStockStatus; label: string }> = [
  { key: 'available', label: 'Available' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'sold', label: 'Sold' },
  { key: 'expired', label: 'Expired' },
];

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const PageContainer = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 8px;
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const PageSubtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 28px 0;
`;

const TabRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
`;

interface TabButtonProps {
  $active: boolean;
}

const TabButton = styled.button<TabButtonProps>`
  padding: 8px 20px;
  border-radius: 999px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary[500] : theme.colors.neutral[300])};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary[500] : theme.colors.background};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.textSecondary)};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.primary[500])};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const StatusFilterRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`;

interface StatusChipProps {
  $active: boolean;
  $status: HarvestStockStatus;
}

function getStatusAccent(status: HarvestStockStatus): string {
  switch (status) {
    case 'available': return '#10B981';
    case 'reserved': return '#3B82F6';
    case 'sold': return '#6B7280';
    case 'expired': return '#EF4444';
  }
}

const StatusChip = styled.button<StatusChipProps>`
  padding: 4px 14px;
  border-radius: 999px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid
    ${({ $active, $status }) => ($active ? getStatusAccent($status) : 'transparent')};
  background: ${({ $active, $status }) =>
    $active ? getStatusAccent($status) + '20' : 'transparent'};
  color: ${({ $active, $status, theme }) =>
    $active ? getStatusAccent($status) : theme.colors.textSecondary};

  &:hover {
    border-color: ${({ $status }) => getStatusAccent($status)};
    color: ${({ $status }) => getStatusAccent($status)};
    background: ${({ $status }) => getStatusAccent($status) + '10'};
  }

  &:focus-visible {
    outline: 2px solid ${({ $status }) => getStatusAccent($status)};
    outline-offset: 2px;
  }
`;

const TabContent = styled.div``;

// ============================================================================
// COMPONENT
// ============================================================================

export function StockPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read active tab from URL; default to 'sellable'
  const rawTab = searchParams.get('tab');
  const activeTab: StockTab =
    rawTab === 'waste' ? 'waste' : rawTab === 'returned' ? 'returned' : 'sellable';

  // Read active status filter from URL; null means "all"
  const rawStatus = searchParams.get('status');
  const activeStatus: HarvestStockStatus | null =
    rawStatus === 'available' || rawStatus === 'reserved' || rawStatus === 'sold' || rawStatus === 'expired'
      ? rawStatus
      : null;

  const handleTabChange = (tab: StockTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    // Reset status filter when switching tabs
    next.delete('status');
    setSearchParams(next, { replace: true });
  };

  const handleStatusFilter = (status: HarvestStockStatus) => {
    const next = new URLSearchParams(searchParams);
    if (activeStatus === status) {
      // Toggle off
      next.delete('status');
    } else {
      next.set('status', status);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Stock</PageTitle>
        <PageSubtitle>Sellable harvested goods, customer returns, and waste tracking</PageSubtitle>
      </PageHeader>

      <SalesActionTiles activeKey="stock" />

      {/* Tab selector */}
      <TabRow role="tablist" aria-label="Stock tabs">
        <TabButton
          role="tab"
          aria-selected={activeTab === 'sellable'}
          $active={activeTab === 'sellable'}
          onClick={() => handleTabChange('sellable')}
        >
          Sellable
        </TabButton>
        <TabButton
          role="tab"
          aria-selected={activeTab === 'returned'}
          $active={activeTab === 'returned'}
          onClick={() => handleTabChange('returned')}
        >
          Returned
        </TabButton>
        <TabButton
          role="tab"
          aria-selected={activeTab === 'waste'}
          $active={activeTab === 'waste'}
          onClick={() => handleTabChange('waste')}
        >
          Waste
        </TabButton>
      </TabRow>

      {/* Status filter chips — Sellable tab only */}
      {activeTab === 'sellable' && (
        <StatusFilterRow aria-label="Filter by stock status">
          {STOCK_STATUS_FILTERS.map(({ key, label }) => (
            <StatusChip
              key={key}
              $active={activeStatus === key}
              $status={key}
              onClick={() => handleStatusFilter(key)}
              aria-pressed={activeStatus === key}
            >
              {label}
            </StatusChip>
          ))}
        </StatusFilterRow>
      )}

      <TabContent role="tabpanel">
        {activeTab === 'sellable' && (
          <HarvestInventoryList embedded statusFilter={activeStatus} />
        )}
        {activeTab === 'returned' && (
          <ReturnedInventoryList embedded />
        )}
        {activeTab === 'waste' && (
          <WasteInventoryList embedded />
        )}
      </TabContent>
    </PageContainer>
  );
}
