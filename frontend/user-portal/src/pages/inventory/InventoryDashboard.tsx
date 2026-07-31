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
import { FlaskConical, Tractor, AlertTriangle } from 'lucide-react';
import { PageHeader, glassPanel, monoLabel } from '@a64core/shared';
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

  const totalAlerts =
    (summary?.lowStockAlerts || 0) + (summary?.expiringItems || 0) + (summary?.maintenanceOverdue || 0);

  return (
    <Container>
      <PageHeader
        breadcrumb="OPERATIONS · INVENTORY"
        title="Inventory Management"
        emphasizeLastWord
        description={
          selectedFarmingYear
            ? `Filtered statistics for farming year ${selectedFarmingYear}`
            : 'Manage farm inputs and assets'
        }
        stats={[
          { value: loading ? '...' : formatNumber(summary?.inputInventory.totalItems || 0), label: 'Input Items' },
          { value: loading ? '...' : formatNumber(summary?.assetInventory.totalItems || 0), label: 'Assets' },
          { value: loading ? '...' : formatNumber(totalAlerts), label: 'Alerts' },
        ]}
      />

      {/* Summary Cards — Inputs and Assets only (Harvest & Waste moved to Sales > Stock) */}
      <SummaryGrid>
        <SummaryCard $variant="input">
          <CardIcon $variant="input">
            <FlaskConical size={26} strokeWidth={1.6} />
          </CardIcon>
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
          <CardIcon $variant="asset">
            <Tractor size={26} strokeWidth={1.6} />
          </CardIcon>
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
          <CardIcon $variant="alerts">
            <AlertTriangle size={26} strokeWidth={1.6} />
          </CardIcon>
          <CardContent>
            <CardLabel>Alerts</CardLabel>
            <CardValue>{loading ? '...' : formatNumber(totalAlerts)}</CardValue>
            <CardSubtext>
              {summary?.expiringItems ? `${formatNumber(summary.expiringItems)} items expiring soon` : 'No urgent alerts'}
            </CardSubtext>
          </CardContent>
        </SummaryCard>
      </SummaryGrid>

      {/* Navigation Tabs — Inputs and Assets only */}
      <TabNav>
        <TabLink to="/inventory/input">
          <TabIcon><FlaskConical size={16} strokeWidth={1.6} /></TabIcon>
          Inputs
        </TabLink>
        <TabLink to="/inventory/assets">
          <TabIcon><Tractor size={16} strokeWidth={1.6} /></TabIcon>
          Assets
        </TabLink>
      </TabNav>

      {/* Content Area */}
      <ContentArea>
        <Suspense fallback={<LoadingText>Loading...</LoadingText>}>
          <Routes>
            <Route path="input" element={<InputInventoryList onUpdate={loadSummary} embedded />} />
            <Route path="assets" element={<AssetInventoryList onUpdate={loadSummary} embedded />} />
          </Routes>
        </Suspense>
      </ContentArea>
    </Container>
  );
}

// Styled Components
// Night Observatory (T-901): page-level container stays transparent so the
// fixed sky shows through — no opaque background here (spec §2).
const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 1400px;
  margin: 0 auto;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

interface SummaryCardProps {
  $variant: 'input' | 'asset' | 'alerts';
}

// One glass layer — the panels sit directly on the sky (spec §2 two-layer max).
const SummaryCard = styled.div<SummaryCardProps>`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  border-left: 3px solid
    ${({ theme, $variant }) => {
      switch ($variant) {
        case 'input':
          return theme.colors.bright.lapis;
        case 'asset':
          return theme.colors.bright.laurel;
        case 'alerts':
          return theme.colors.bright.coral;
        default:
          return theme.colors.line;
      }
    }};
`;

const CardIcon = styled.div<SummaryCardProps>`
  display: flex;
  color: ${({ theme, $variant }) => {
    switch ($variant) {
      case 'input':
        return theme.colors.bright.lapis;
      case 'asset':
        return theme.colors.bright.laurel;
      case 'alerts':
        return theme.colors.bright.coral;
      default:
        return theme.colors.celeste;
    }
  }};
`;

const CardContent = styled.div`
  flex: 1;
`;

const CardLabel = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const CardValue = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CardSubtext = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const AlertText = styled.span`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const TabNav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
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
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &.active {
    color: ${({ theme }) => theme.colors.celeste};
    border-bottom-color: ${({ theme }) => theme.colors.celeste};
  }
`;

const TabIcon = styled.span`
  display: flex;
`;

const ContentArea = styled.div`
  min-height: 400px;
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.muted};
`;
