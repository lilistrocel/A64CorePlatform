/**
 * StockPage Component
 *
 * Sales > Stock page — two tabs:
 *   - Sellable: harvested goods available/reserved/sold/expired (from farm inventory)
 *   - Waste: waste records (from farm waste inventory)
 *
 * Reads from farm-side endpoints via inventoryApi (not the retired /v1/sales/inventory/*).
 * Deep-linkable via ?tab=sellable or ?tab=waste.
 *
 * Night Observatory (T-901): page title now uses the shared PageHeader
 * (no local numbers to surface as stats — this page's own state is just the
 * active tab/filter, the real data lives in the child list components).
 */

import { useSearchParams } from 'react-router-dom';
import styled, { type DefaultTheme } from 'styled-components';
import { PageHeader } from '@a64core/shared';
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
    ${({ theme, $active }) => ($active ? theme.colors.bright.lapis : theme.colors.glass.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.bright.lapis : 'transparent')};
  color: ${({ theme, $active }) => ($active ? theme.colors.onDark : theme.colors.celeste)};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.bright.lapis};
    color: ${({ theme, $active }) => ($active ? theme.colors.onDark : theme.colors.textPrimary)};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.bright.lapis};
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

// Stock lot status vocabulary (available/reserved/sold/expired) — distinct from
// the document-status canon used elsewhere in sales (statusPhase.ts); mapped
// by semantics here onto the Night Observatory bright.* hues directly.
function getStatusAccent(status: HarvestStockStatus, theme: DefaultTheme): string {
  switch (status) {
    case 'available': return theme.colors.bright.emerald;
    case 'reserved': return theme.colors.bright.lapis;
    case 'sold': return theme.colors.muted;
    case 'expired': return theme.colors.bright.coral;
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
    ${({ $active, $status, theme }) => ($active ? getStatusAccent($status, theme) : 'transparent')};
  background: ${({ $active, $status, theme }) =>
    $active ? getStatusAccent($status, theme) + '20' : 'transparent'};
  color: ${({ $active, $status, theme }) =>
    $active ? getStatusAccent($status, theme) : theme.colors.celeste};

  &:hover {
    border-color: ${({ $status, theme }) => getStatusAccent($status, theme)};
    color: ${({ $status, theme }) => getStatusAccent($status, theme)};
    background: ${({ $status, theme }) => getStatusAccent($status, theme) + '10'};
  }

  &:focus-visible {
    outline: 2px solid ${({ $status, theme }) => getStatusAccent($status, theme)};
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
      <PageHeader
        title="Stock"
        description="Sellable harvested goods, customer returns, and waste tracking"
      />

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
