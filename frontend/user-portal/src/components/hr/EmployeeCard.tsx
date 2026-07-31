/**
 * EmployeeCard Component
 *
 * Compact employee info card for displaying employee details in a summary view.
 */

import styled, { css } from 'styled-components';
import { Mail, Smartphone, Building2 } from 'lucide-react';
import type { Employee } from '../../types/hr';
import { getEmployeeFullName, getEmployeeStatusLabel, getEmployeeStatusColor } from '../../services/hrService';
import { glassPanel, glassPanelHover, monoLabel } from '@a64core/shared';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface EmployeeCardProps {
  employee: Employee;
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

const EmployeeInfo = styled.div`
  flex: 1;
`;

const EmployeeName = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const EmployeeCode = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

/* Status colour comes from hrService.getEmployeeStatusColor(), already
   routed onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.64rem;
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

const Department = styled.div`
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
  min-height: 44px;
  min-width: 44px;
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

export function EmployeeCard({
  employee,
  onClick,
  showActions = false,
  onEdit,
  onDelete,
}: EmployeeCardProps) {
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
        <EmployeeInfo>
          <EmployeeName>{getEmployeeFullName(employee)}</EmployeeName>
          <EmployeeCode>{employee.employeeCode}</EmployeeCode>
        </EmployeeInfo>
        <StatusBadge $color={getEmployeeStatusColor(employee.status)}>
          {getEmployeeStatusLabel(employee.status)}
        </StatusBadge>
      </CardHeader>

      <ContactInfo>
        <InfoItem>
          <InfoIcon><Mail size={13} strokeWidth={1.6} /></InfoIcon>
          <span>{employee.email}</span>
        </InfoItem>
        {employee.phone && (
          <InfoItem>
            <InfoIcon><Smartphone size={13} strokeWidth={1.6} /></InfoIcon>
            <span>{employee.phone}</span>
          </InfoItem>
        )}
      </ContactInfo>

      {(employee.department || employee.position) && (
        <Department>
          {employee.department && (
            <>
              <Building2 size={13} strokeWidth={1.6} />
              {employee.department}
            </>
          )}
          {employee.department && employee.position && ' • '}
          {employee.position}
        </Department>
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
