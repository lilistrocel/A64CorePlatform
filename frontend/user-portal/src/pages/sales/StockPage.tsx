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
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 4px 0;
`;

const PageSubtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.text.secondary};
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
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.accent.sage : theme.colors.border.subtle)};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.accent.sage : theme.colors.surface.canvas};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.text.secondary)};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.accent.sage};
    color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.accent.sage)};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
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
    case 'available': return '#0F6E56';
    case 'reserved': return '#0F6E56';
    case 'sold': return '#4B4844';
    case 'expired': return '#9E2A2A';
  }
}

const StatusChip = styled.button<StatusChipProps>`
  padding: 4px 14px;
  border-radius: 999px;
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid
    ${({ $active, $status }) => ($active ? getStatusAccent($status) : 'transparent')};
  background: ${({ $active, $status }) =>
    $active ? getStatusAccent($status) + '20' : 'transparent'};
  color: ${({ $active, $status, theme }) =>
    $active ? getStatusAccent($status) : theme.colors.text.secondary};

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
