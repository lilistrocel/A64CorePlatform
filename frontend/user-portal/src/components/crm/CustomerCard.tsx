/**
 * CustomerCard Component
 *
 * Compact customer info card for displaying customer details in a summary view.
 * Can be used in other modules (Sales, Marketing) for customer reference.
 */

import styled, { css } from 'styled-components';
import { Mail, Smartphone, Building2 } from 'lucide-react';
import type { Customer } from '../../types/crm';
import { getCustomerTypeLabel, getCustomerStatusColor } from '../../services/crmService';
import { glassPanel, glassPanelHover, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CustomerCardProps {
  customer: Customer;
  onClick?: () => void;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div<{ $clickable: boolean }>`
  ${({ $clickable }) => ($clickable ? glassPanelHover : glassPanel)}
  padding: 16px;
  border-radius: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const CustomerInfo = styled.div`
  flex: 1;
`;

const CustomerName = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const CustomerCode = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const BadgeContainer = styled.div`
  display: flex;
  gap: 8px;
  flex-direction: column;
  align-items: flex-end;
`;

/* Status colour comes from crmService.getCustomerStatusColor(), which is
   already routed onto colors.phase.* (spec §5.2) — this badge applies the
   §4 badge visual (16%/45% tinted hex, mono uppercase, glowing dot) on top
   of whatever hex the service returns, mirroring the marketing badges. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.6rem;
  font-weight: 700;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
`;

/* Lapis, not gold or celeste — the "ordinary interactive/info" accent per
   the coordinator's gold-audit correction. */
const TypeBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(107, 138, 224, 0.14);
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.35);
`;

const ContactInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoIcon = styled.span`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
`;

const Company = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const dangerVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }
`;

const defaultVariant = css`
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 6px 12px;
  min-height: 44px; /* WCAG touch target minimum */
  min-width: 44px; /* WCAG touch target minimum */
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  ${({ $variant }) => ($variant === 'danger' ? dangerVariant : defaultVariant)}
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerCard({
  customer,
  onClick,
  showActions = false,
  onEdit,
  onDelete,
}: CustomerCardProps) {
  const handleCardClick = () => {
    if (onClick) onClick();
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
    <Card $clickable={!!onClick} onClick={handleCardClick}>
      <CardHeader>
        <CustomerInfo>
          <CustomerName>{customer.name}</CustomerName>
          <CustomerCode>{customer.customerCode}</CustomerCode>
        </CustomerInfo>
        <BadgeContainer>
          <StatusBadge $color={getCustomerStatusColor(customer.status)}>
            {customer.status}
          </StatusBadge>
          <TypeBadge>{getCustomerTypeLabel(customer.type)}</TypeBadge>
        </BadgeContainer>
      </CardHeader>

      <ContactInfo>
        <InfoItem>
          <InfoIcon><Mail size={13} strokeWidth={1.6} /></InfoIcon>
          <span>{customer.email}</span>
        </InfoItem>
        {customer.phone && (
          <InfoItem>
            <InfoIcon><Smartphone size={13} strokeWidth={1.6} /></InfoIcon>
            <span>{customer.phone}</span>
          </InfoItem>
        )}
      </ContactInfo>

      {customer.company && (
        <Company>
          <Building2 size={13} strokeWidth={1.6} />
          {customer.company}
        </Company>
      )}

      {showActions && (
        <Actions>
          {onEdit && (
            <ActionButton onClick={handleEdit}>
              Edit
            </ActionButton>
          )}
          {onDelete && (
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
        </Actions>
      )}
    </Card>
  );
}
