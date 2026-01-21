/**
 * SalesDashboardPage Component
 *
 * Overview dashboard with sales statistics, orders, and inventory tracking.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { salesApi } from '../../services/salesService';
import type { SalesDashboardStats } from '../../types/sales';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #616161;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
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
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
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
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const OrderCode = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
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
  background: #FEF3C7;
  border-left: 3px solid #F59E0B;
  border-radius: 4px;
  font-size: 13px;
`;

const ProductName = styled.span`
  font-weight: 500;
  color: #212121;
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
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: #9e9e9e;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SalesDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getDashboardStats();
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
        <Title>Sales Management</Title>
        <Subtitle>Orders, inventory, and purchase order tracking</Subtitle>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Orders</StatLabel>
          <StatValue>{stats.totalOrders}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Confirmed</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{stats.confirmedOrders}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Shipped</StatLabel>
          <StatValue style={{ color: '#8B5CF6' }}>{stats.shippedOrders}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Delivered</StatLabel>
          <StatValue style={{ color: '#10B981' }}>{stats.deliveredOrders}</StatValue>
        </StatCard>
      </StatsGrid>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Revenue</StatLabel>
          <StatValue style={{ color: '#10B981' }}>
            {salesApi.formatCurrency(stats.totalRevenue)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Pending Payments</StatLabel>
          <StatValue style={{ color: '#F59E0B' }}>
            {salesApi.formatCurrency(stats.pendingPayments)}
          </StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Available Stock</StatLabel>
          <StatValue>{stats.availableInventory}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Reserved Stock</StatLabel>
          <StatValue style={{ color: '#3B82F6' }}>{stats.reservedInventory}</StatValue>
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
                  <OrderAmount>{salesApi.formatCurrency(order.total)}</OrderAmount>
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
