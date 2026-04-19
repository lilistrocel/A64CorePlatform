/**
 * Inventory Dashboard
 *
 * Main inventory management page with tabs for:
 * - Harvest Inventory
 * - Input Inventory
 * - Asset Inventory
 * - Waste Inventory
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { getInventorySummary } from '../../services/inventoryApi';
import { formatNumber, formatCurrency } from '../../utils';
import type { InventorySummary } from '../../types/inventory';
import { HarvestInventoryList } from './HarvestInventoryList';
import { InputInventoryList } from './InputInventoryList';
import { AssetInventoryList } from './AssetInventoryList';
import { useFarmingYearStore } from '../../stores/farmingYear.store';

const WasteInventoryList = lazy(() => import('./WasteInventoryList'));

export function InventoryDashboard() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Use the global farming year from sidebar
  const { selectedYear: selectedFarmingYear } = useFarmingYearStore();

  // Reload summary when farming year changes
  useEffect(() => {
    loadSummary();
  }, [selectedFarmingYear]);

  // If at /inventory root, redirect to /inventory/harvest
  useEffect(() => {
    if (location.pathname === '/inventory') {
      navigate('/inventory/harvest', { replace: true });
    }
  }, [location.pathname, navigate]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const data = await getInventorySummary(undefined, selectedFarmingYear);
      setSummary(data);
    } catch (error) {
      console.error('Failed to load inventory summary:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <Title>
            Inventory Management
            {selectedFarmingYear && (
              <FarmingYearBadge>Year {selectedFarmingYear}</FarmingYearBadge>
            )}
          </Title>
          <Subtitle>
            {selectedFarmingYear
              ? `Filtered statistics for farming year ${selectedFarmingYear}`
              : 'Manage harvest, inputs, farm assets, and waste tracking'}
          </Subtitle>
        </HeaderLeft>
      </Header>

      {/* Summary Cards */}
      <SummaryGrid>
        <SummaryCard $variant="harvest">
          <CardIcon>📦</CardIcon>
          <CardContent>
            <CardLabel>Harvest Inventory</CardLabel>
            <CardValue>{loading ? '...' : formatNumber(summary?.harvestInventory.totalItems || 0)}</CardValue>
            <CardSubtext>
              Value: {loading ? '...' : formatCurrency(summary?.totalHarvestValue || 0, 'AED')}
            </CardSubtext>
          </CardContent>
        </SummaryCard>

        <SummaryCard $variant="input">
          <CardIcon>🧪</CardIcon>
          <CardContent>
            <CardLabel>Input Inventory</CardLabel>
            <CardValue>{loading ? '...' : formatNumber(summary?.inputInventory.totalItems || 0)}</CardValue>
            <CardSubtext>
              {summary?.lowStockAlerts ? (
                <AlertText>{formatNumber(summary.lowStockAlerts)} low stock alerts</AlertText>
              ) : (
                'All stock levels OK'
              )}
            </CardSubtext>
          </CardContent>
        </SummaryCard>

        <SummaryCard $variant="asset">
          <CardIcon>🚜</CardIcon>
          <CardContent>
            <CardLabel>Farm Assets</CardLabel>
            <CardValue>{loading ? '...' : formatNumber(summary?.assetInventory.totalItems || 0)}</CardValue>
            <CardSubtext>
              {summary?.maintenanceOverdue ? (
                <AlertText>{formatNumber(summary.maintenanceOverdue)} maintenance overdue</AlertText>
              ) : (
                `${formatNumber(summary?.assetInventory.operationalCount || 0)} operational`
              )}
            </CardSubtext>
          </CardContent>
        </SummaryCard>

        <SummaryCard $variant="waste">
          <CardIcon>🗑️</CardIcon>
          <CardContent>
            <CardLabel>Waste Inventory</CardLabel>
            <CardValue>{loading ? '...' : formatNumber(summary?.wasteInventory?.totalItems || 0)}</CardValue>
            <CardSubtext>
              {summary?.wasteInventory?.pendingDisposal ? (
                <AlertText>{formatNumber(summary.wasteInventory.pendingDisposal)} pending disposal</AlertText>
              ) : (
                `Value: ${formatCurrency(summary?.totalWasteValue || 0, 'AED')}`
              )}
            </CardSubtext>
          </CardContent>
        </SummaryCard>

        <SummaryCard $variant="alerts">
          <CardIcon>⚠️</CardIcon>
          <CardContent>
            <CardLabel>Alerts</CardLabel>
            <CardValue>
              {loading ? '...' : formatNumber((summary?.lowStockAlerts || 0) + (summary?.expiringItems || 0) + (summary?.maintenanceOverdue || 0))}
            </CardValue>
            <CardSubtext>
              {summary?.expiringItems ? `${formatNumber(summary.expiringItems)} items expiring soon` : 'No urgent alerts'}
            </CardSubtext>
          </CardContent>
        </SummaryCard>
      </SummaryGrid>

      {/* Navigation Tabs */}
      <TabNav>
        <TabLink to="/inventory/harvest">
          <TabIcon>📦</TabIcon>
          Harvest
        </TabLink>
        <TabLink to="/inventory/input">
          <TabIcon>🧪</TabIcon>
          Inputs
        </TabLink>
        <TabLink to="/inventory/assets">
          <TabIcon>🚜</TabIcon>
          Assets
        </TabLink>
        <TabLink to="/inventory/waste">
          <TabIcon>🗑️</TabIcon>
          Waste
        </TabLink>
      </TabNav>

      {/* Content Area */}
      <ContentArea>
        <Suspense fallback={<LoadingText>Loading...</LoadingText>}>
          <Routes>
            <Route path="harvest" element={<HarvestInventoryList onUpdate={loadSummary} farmingYear={selectedFarmingYear} />} />
            <Route path="input" element={<InputInventoryList onUpdate={loadSummary} />} />
            <Route path="assets" element={<AssetInventoryList onUpdate={loadSummary} />} />
            <Route path="waste" element={<WasteInventoryList />} />
          </Routes>
        </Suspense>
      </ContentArea>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const FarmingYearBadge = styled.span`
  display: inline-block;
  background: ${({ theme }) => theme.colors.infoBg};
  color: #0369a1;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

interface SummaryCardProps {
  $variant: 'harvest' | 'input' | 'asset' | 'waste' | 'alerts';
}

const SummaryCard = styled.div<SummaryCardProps>`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  border-left: 4px solid ${({ theme, $variant }) => {
    switch ($variant) {
      case 'harvest': return theme.colors.success;
      case 'input': return theme.colors.primary[500];
      case 'asset': return theme.colors.warning;
      case 'waste': return theme.colors.neutral[500] || '#6b7280';
      case 'alerts': return theme.colors.error;
      default: return theme.colors.neutral[300];
    }
  }};
`;

const CardIcon = styled.div`
  font-size: 2rem;
`;

const CardContent = styled.div`
  flex: 1;
`;

const CardLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const CardValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CardSubtext = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const AlertText = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const TabNav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  overflow-x: auto;
`;

const TabLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
  }

  &.active {
    color: ${({ theme }) => theme.colors.primary[500]};
    border-bottom-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const TabIcon = styled.span`
  font-size: 1.25rem;
`;

const ContentArea = styled.div`
  min-height: 400px;
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
