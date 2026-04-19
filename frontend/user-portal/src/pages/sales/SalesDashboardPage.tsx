/**
 * SalesDashboardPage Component
 *
 * Overview dashboard with sales statistics, orders, and inventory tracking.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { salesApi } from '../../services/salesService';
import { formatNumber, formatCurrency } from '../../utils';
import type { SalesDashboardStats } from '../../types/sales';
import { useFarmingYearStore } from '../../stores/farmingYear.store';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 32px;
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
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CurrencyValue = styled.div`
  font-size: 24px;
  font-weight: 600;
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
  background: ${({ theme }) => theme.colors.background};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
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

const OrderItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const OrderCode = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: 'JetBrains Mono', monospace;
`;

const OrderAmount = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #10B981;
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
  border-left: 3px solid #F59E0B;
  border-radius: 4px;
  font-size: 13px;
`;

const ProductName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ExpiryDate = styled.span`
  font-size: 12px;
  color: #92400E;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
`;

const ActionButton = styled.button`
  padding: 12px 24px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.textDisabled};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesDashboardPage() {
  const navigate = useNavigate();
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
      <Header>
        <HeaderLeft>
          <Title>
            Sales Management
            {selectedFarmingYear && (
              <FarmingYearBadge>Year {selectedFarmingYear}</FarmingYearBadge>
            )}
          </Title>
          <Subtitle>
            {selectedFarmingYear
              ? `Filtered statistics for farming year ${selectedFarmingYear}`
              : 'Orders, inventory, and purchase order tracking'}
          </Subtitle>
        </HeaderLeft>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Orders</StatLabel>
          <StatValue>{formatNumber(stats.totalOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Confirmed</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{formatNumber(stats.confirmedOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Shipped</StatLabel>
          <StatValue style={{ color: '#8B5CF6' }}>{formatNumber(stats.shippedOrders)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Delivered</StatLabel>
          <StatValue style={{ color: '#10B981' }}>{formatNumber(stats.deliveredOrders)}</StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Revenue</StatLabel>
          <CurrencyValue style={{ color: '#10B981' }}>
            {formatCurrency(stats.totalRevenue, 'AED')}
          </CurrencyValue>
        </StatCard>

        <StatCard>
          <StatLabel>Pending Payments</StatLabel>
          <CurrencyValue style={{ color: '#F59E0B' }}>
            {formatCurrency(stats.pendingPayments, 'AED')}
          </CurrencyValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available Stock</StatLabel>
          <StatValue>{formatNumber(stats.availableInventory)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Reserved Stock</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{formatNumber(stats.reservedInventory)}</StatValue>
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

      <QuickActions>
        <ActionButton onClick={() => navigate('/sales/orders')}>Manage Orders</ActionButton>
        <ActionButton onClick={() => navigate('/sales/inventory')}>View Inventory</ActionButton>
        <ActionButton onClick={() => navigate('/sales/purchase-orders')}>Purchase Orders</ActionButton>
      </QuickActions>
    </Container>
  );
}
