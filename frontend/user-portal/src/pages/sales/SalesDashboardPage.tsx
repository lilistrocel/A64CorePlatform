/**
 * SalesDashboardPage Component
 *
 * Overview dashboard with sales statistics, orders, and inventory tracking.
 *
 * Night Observatory (T-901): page header now uses the shared PageHeader
 * (breadcrumb + title + stat tiles) wired to the dashboard stats this page
 * already fetches — no new data sources added. StatCard/Widget are glass
 * panels; OrderItem/InventoryItem sit one level inside a glass panel so they
 * use a plain line-bordered surface rather than nesting a second glass layer
 * (spec §2 two-layer limit).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { glassPanel, monoLabel, PageHeader } from '@a64core/shared';
import { salesApi } from '../../services/salesService';
import { formatNumber, formatCurrency } from '../../utils';
import type { SalesDashboardStats } from '../../types/sales';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { SalesActionTiles } from '../../components/sales/SalesActionTiles';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  ${glassPanel}
  padding: 24px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CurrencyValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  word-break: break-word;

  @media (max-width: 1200px) {
    font-size: 20px;
  }
`;

const WidgetsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Widget = styled.div`
  ${glassPanel}
  padding: 24px;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const OrderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

// One level inside the Widget glass panel — plain line-bordered surface
// rather than a second nested glassPanel (spec §2 two-layer limit).
const OrderItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const OrderCode = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const OrderAmount = styled.span`
  font-size: 14px;
  font-weight: 600;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

const InventoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InventoryItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.warningBg};
  border-left: 3px solid ${({ theme }) => theme.colors.warning};
  border-radius: 4px;
  font-size: 13px;
`;

const ProductName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ExpiryDate = styled.span`
  font-size: 12px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.bright.gold};
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesDashboardPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [stats, setStats] = useState<SalesDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the global farming year from sidebar
  const { selectedYear: selectedFarmingYear } = useFarmingYearStore();

  // Reload stats when farming year changes
  useEffect(() => {
    loadDashboardStats();
  }, [selectedFarmingYear]);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getDashboardStats(selectedFarmingYear);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load dashboard stats:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading dashboard...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Container>
      <PageHeader
        breadcrumb={`SALES${selectedFarmingYear ? ` · YEAR ${selectedFarmingYear}` : ''}`}
        title="Sales Management"
        emphasizeLastWord
        stats={[
          { value: formatNumber(stats.totalOrders), label: 'Total Orders' },
          { value: formatCurrency(stats.totalRevenue, 'AED'), label: 'Revenue', alive: true },
          { value: formatNumber(stats.deliveredOrders), label: 'Delivered', alive: true },
        ]}
      />

      <SalesActionTiles />

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Orders</StatLabel>
          <StatValue>{formatNumber(stats.totalOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Confirmed</StatLabel>
          <StatValue style={{ color: theme.colors.bright.lapis }}>{formatNumber(stats.confirmedOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Shipped</StatLabel>
          <StatValue style={{ color: theme.colors.bright.terra }}>{formatNumber(stats.shippedOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Delivered</StatLabel>
          <StatValue style={{ color: theme.colors.success }}>{formatNumber(stats.deliveredOrders)}</StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Revenue</StatLabel>
          <CurrencyValue style={{ color: theme.colors.success }}>
            {formatCurrency(stats.totalRevenue, 'AED')}
          </CurrencyValue>
        </StatCard>

        <StatCard>
          <StatLabel>Pending Payments</StatLabel>
          <CurrencyValue style={{ color: theme.colors.warning }}>
            {formatCurrency(stats.pendingPayments, 'AED')}
          </CurrencyValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available Stock</StatLabel>
          <StatValue>{formatNumber(stats.availableInventory)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Reserved Stock</StatLabel>
          <StatValue style={{ color: theme.colors.bright.lapis }}>{formatNumber(stats.reservedInventory)}</StatValue>
        </StatCard>
      </StatsGrid>

      <WidgetsRow>
        <Widget>
          <WidgetTitle>Recent Orders</WidgetTitle>
          {stats.recentOrders && stats.recentOrders.length > 0 ? (
            <OrderList>
              {stats.recentOrders.map((order) => (
                <OrderItem
                  key={order.orderId}
                  onClick={() => navigate(`/sales/orders/${order.orderId}`)}
                >
                  <OrderCode>{order.orderCode}</OrderCode>
                  <OrderAmount>{formatCurrency(order.total, 'AED')}</OrderAmount>
                </OrderItem>
              ))}
            </OrderList>
          ) : (
            <EmptyText>No recent orders</EmptyText>
          )}
        </Widget>

        <Widget>
          <WidgetTitle>Expiring Items</WidgetTitle>
          {stats.expiringItems && stats.expiringItems.length > 0 ? (
            <InventoryList>
              {stats.expiringItems.map((item) => (
                <InventoryItem key={item.inventoryId}>
                  <ProductName>{item.productName}</ProductName>
                  <ExpiryDate>
                    Expires: {item.expiryDate ? salesApi.formatDate(item.expiryDate) : 'N/A'}
                  </ExpiryDate>
                </InventoryItem>
              ))}
            </InventoryList>
          ) : (
            <EmptyText>No items expiring soon</EmptyText>
          )}
        </Widget>
      </WidgetsRow>

    </Container>
  );
}
