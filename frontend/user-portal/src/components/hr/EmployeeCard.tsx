/**
 * EmployeeCard Component
 *
 * Compact employee info card for displaying employee details in a summary view.
 */

import styled from 'styled-components';
import type { Employee } from '../../types/hr';
import { getEmployeeFullName, getEmployeeStatusColor, getEmployeeStatusLabel } from '../../services/hrService';

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
  background: white;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};

  ${({ $clickable }) =>
    $clickable &&
    `
    &:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }
  `}
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
  color: #212121;
  margin: 0 0 4px 0;
`;

const EmployeeCode = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  font-family: 'JetBrains Mono', monospace;
`;

const StatusBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  text-transform: capitalize;
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
  color: #616161;
`;

const InfoIcon = styled.span`
  font-size: 14px;
  width: 16px;
  text-align: center;
`;

const Department = styled.div`
  font-size: 13px;
  color: #616161;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f5f5f5;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
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
          <InfoIcon>📧</InfoIcon>
          <span>{employee.email}</span>
        </InfoItem>
        {employee.phone && (
          <InfoItem>
            <InfoIcon>📱</InfoIcon>
            <span>{employee.phone}</span>
          </InfoItem>
        )}
      </ContactInfo>

      {(employee.department || employee.position) && (
        <Department>
          {employee.department && `🏢 ${employee.department}`}
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
