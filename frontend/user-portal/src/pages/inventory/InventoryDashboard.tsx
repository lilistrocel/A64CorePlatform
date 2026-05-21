/**
 * Inventory Dashboard
 *
 * Main inventory management page with tabs for:
 * - Harvest Inventory
 * - Input Inventory
 * - Asset Inventory
 * - Waste Inventory
 */

import { useState, useEffect, Suspense } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { getInventorySummary } from '../../services/inventoryApi';
import { formatNumber } from '../../utils';
import type { InventorySummary } from '../../types/inventory';
import { InputInventoryList } from './InputInventoryList';
import { AssetInventoryList } from './AssetInventoryList';
import { useFarmingYearStore } from '../../stores/farmingYear.store';

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

  // If at /inventory root, redirect to /inventory/input
  useEffect(() => {
    if (location.pathname === '/inventory') {
      navigate('/inventory/input', { replace: true });
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
              : 'Manage farm inputs and assets'}
          </Subtitle>
        </HeaderLeft>
      </Header>

      {/* Summary Cards — Inputs and Assets only (Harvest & Waste moved to Sales > Stock) */}
      <SummaryGrid>
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

      {/* Navigation Tabs — Inputs and Assets only */}
      <TabNav>
        <TabLink to="/inventory/input">
          <TabIcon>🧪</TabIcon>
          Inputs
        </TabLink>
        <TabLink to="/inventory/assets">
          <TabIcon>🚜</TabIcon>
          Assets
        </TabLink>
      </TabNav>

      {/* Content Area */}
      <ContentArea>
        <Suspense fallback={<LoadingText>Loading...</LoadingText>}>
          <Routes>
            <Route path="input" element={<InputInventoryList onUpdate={loadSummary} />} />
            <Route path="assets" element={<AssetInventoryList onUpdate={loadSummary} />} />
          </Routes>
        </Suspense>
      </ContentArea>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  padding: ${({ theme }) => theme.space['8']};
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: ${({ theme }) => theme.space['8']};
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const FarmingYearBadge = styled.span`
  display: inline-block;
  background: ${({ theme }) => theme.colors.surface.sunken};
  color: #0369a1;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.space['6']};
  margin-bottom: ${({ theme }) => theme.space['8']};
`;

interface SummaryCardProps {
  $variant: 'input' | 'asset' | 'alerts';
}

const SummaryCard = styled.div<SummaryCardProps>`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space['4']};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  border-left: 4px solid ${({ theme, $variant }) => {
    switch ($variant) {
      case 'input': return theme.colors.accent.sage;
      case 'asset': return theme.colors.status.warning;
      case 'alerts': return theme.colors.status.danger;
      default: return theme.colors.border.subtle;
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
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const CardValue = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CardSubtext = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['1']};
`;

const AlertText = styled.span`
  color: ${({ theme }) => theme.colors.status.danger};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const TabNav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space['2']};
  border-bottom: 2px solid ${({ theme }) => theme.colors.surface.sunken};
  margin-bottom: ${({ theme }) => theme.space['8']};
  overflow-x: auto;
`;

const TabLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['2']};
  padding: ${({ theme }) => theme.space['4']} ${({ theme }) => theme.space['6']};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.accent.sage};
  }

  &.active {
    color: ${({ theme }) => theme.colors.accent.sage};
    border-bottom-color: ${({ theme }) => theme.colors.accent.sage};
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
  padding: ${({ theme }) => theme.space['8']};
  color: ${({ theme }) => theme.colors.text.secondary};
`;
