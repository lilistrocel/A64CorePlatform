/**
 * OrderCard Component
 *
 * Displays sales order information in a card format.
 */

import styled from 'styled-components';
import type { SalesOrder } from '../../types/sales';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface OrderCardProps {
  order: SalesOrder;
  onClick?: () => void;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div<{ $clickable: boolean }>`
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  &:hover {
    box-shadow: ${({ $clickable }) => ($clickable ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none')};
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const OrderInfo = styled.div`
  flex: 1;
`;

const OrderCode = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 4px 0;
  font-family: 'JetBrains Mono', monospace;
`;

const CustomerName = styled.div`
  font-size: 14px;
  color: #616161;
`;

const StatusContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status }) => {
    switch ($status) {
      case 'draft':
        return 'background: #E0E0E0; color: #616161;';
      case 'confirmed':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'processing':
        return 'background: #FEF3C7; color: #92400E;';
      case 'shipped':
        return 'background: #DBEAFE; color: #1E40AF;';
      case 'delivered':
        return 'background: #D1FAE5; color: #065F46;';
      case 'cancelled':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #E0E0E0; color: #616161;';
    }
  }}
`;

const PaymentBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;

  ${({ $status }) => {
    switch ($status) {
      case 'paid':
        return 'background: #D1FAE5; color: #065F46;';
      case 'partial':
        return 'background: #FEF3C7; color: #92400E;';
      case 'pending':
        return 'background: #FEE2E2; color: #991B1B;';
      default:
        return 'background: #E0E0E0; color: #616161;';
    }
  }}
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: #616161;
  font-weight: 500;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: #212121;
  font-weight: 500;
`;

const ItemsList = styled.div`
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #616161;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  flex: 1;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: #EF4444;
        border: 1px solid #EF4444;
        &:hover {
          background: #FEE2E2;
        }
      `;
    }
    return `
      background: transparent;
      color: #3B82F6;
      border: 1px solid #3B82F6;
      &:hover {
        background: #e3f2fd;
      }
    `;
  }}
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function OrderCard({ order, onClick, showActions = false, onEdit, onDelete }: OrderCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick && !showActions) {
      onClick();
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete();
  };

  return (
    <Card $clickable={!!onClick && !showActions} onClick={handleCardClick}>
      <CardHeader>
        <OrderInfo>
          <OrderCode>{order.orderCode}</OrderCode>
          <CustomerName>{order.customerName || order.customerId}</CustomerName>
        </OrderInfo>
        <StatusContainer>
          <StatusBadge $status={order.status}>{order.status}</StatusBadge>
          <PaymentBadge $status={order.paymentStatus}>{order.paymentStatus}</PaymentBadge>
        </StatusContainer>
      </CardHeader>

      <CardBody>
        <InfoRow>
          <InfoLabel>Order Date</InfoLabel>
          <InfoValue>{new Date(order.orderDate).toLocaleDateString()}</InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Items</InfoLabel>
          <InfoValue>{order.items.length} items</InfoValue>
        </InfoRow>

        <InfoRow>
          <InfoLabel>Subtotal</InfoLabel>
          <InfoValue>${order.subtotal.toFixed(2)}</InfoValue>
        </InfoRow>

        {order.tax && order.tax > 0 && (
          <InfoRow>
            <InfoLabel>Tax</InfoLabel>
            <InfoValue>${order.tax.toFixed(2)}</InfoValue>
          </InfoRow>
        )}

        {order.discount && order.discount > 0 && (
          <InfoRow>
            <InfoLabel>Discount</InfoLabel>
            <InfoValue>-${order.discount.toFixed(2)}</InfoValue>
          </InfoRow>
        )}

        <InfoRow>
          <InfoLabel>Total</InfoLabel>
          <InfoValue style={{ fontSize: '16px', fontWeight: 600 }}>${order.total.toFixed(2)}</InfoValue>
        </InfoRow>

        <ItemsList>
          <strong>Order Items:</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
            {order.items.map((item, index) => (
              <li key={index}>
                {item.productName} - {item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.totalPrice.toFixed(2)}
              </li>
            ))}
          </ul>
        </ItemsList>

        {order.shippingAddress && (
          <ItemsList>
            <strong>Shipping Address:</strong>
            <div style={{ marginTop: '4px' }}>
              {order.shippingAddress.street && <div>{order.shippingAddress.street}</div>}
              {(order.shippingAddress.city || order.shippingAddress.state) && (
                <div>
                  {order.shippingAddress.city}
                  {order.shippingAddress.city && order.shippingAddress.state && ', '}
                  {order.shippingAddress.state}
                </div>
              )}
              {(order.shippingAddress.country || order.shippingAddress.postalCode) && (
                <div>
                  {order.shippingAddress.country} {order.shippingAddress.postalCode}
                </div>
              )}
            </div>
          </ItemsList>
        )}
      </CardBody>

      {showActions && (
        <Actions>
          {onEdit && order.status === 'draft' && (
            <ActionButton $variant="secondary" onClick={handleEdit}>
              Edit
            </ActionButton>
          )}
          {onDelete && order.status === 'draft' && (
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
        </Actions>
      )}
    </Card>
  );
}
