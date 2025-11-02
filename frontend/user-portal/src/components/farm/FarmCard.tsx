/**
 * FarmCard Component
 *
 * Displays a single farm in a card layout with key information and actions.
 */

import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import type { Farm, FarmSummary } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FarmCardProps {
  farm: Farm;
  summary?: FarmSummary;
  onEdit?: (farmId: string) => void;
  onDelete?: (farmId: string) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Card = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;
  cursor: pointer;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const FarmIcon = styled.div`
  font-size: 32px;
  margin-bottom: 8px;
`;

const FarmTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const StatusBadge = styled.span<{ $isActive: boolean }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $isActive }) => ($isActive ? '#10B981' : '#6B7280')};
  color: white;
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #616161;
  margin-bottom: 16px;
`;

const LocationIcon = styled.span`
  font-size: 16px;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
`;

const BlockStats = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
`;

const BlockStatBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant }) => {
    if ($variant === 'primary') {
      return `
        background: #3B82F6;
        color: white;
        &:hover {
          background: #1976d2;
        }
      `;
    }
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

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmCard({ farm, summary, onEdit, onDelete }: FarmCardProps) {
  const navigate = useNavigate();

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    navigate(`/farm/farms/${farm.farmId}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(farm.farmId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${farm.name}"?`)) {
      onDelete?.(farm.farmId);
    }
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/farm/farms/${farm.farmId}`);
  };

  const locationText = [farm.location.city, farm.location.state, farm.location.country]
    .filter(Boolean)
    .join(', ');

  return (
    <Card onClick={handleCardClick}>
      <CardHeader>
        <div>
          <FarmIcon>🏞️</FarmIcon>
          <FarmTitle>{farm.name}</FarmTitle>
        </div>
        <StatusBadge $isActive={farm.isActive}>
          {farm.isActive ? 'Active' : 'Inactive'}
        </StatusBadge>
      </CardHeader>

      <Location>
        <LocationIcon>📍</LocationIcon>
        <span>{locationText}</span>
      </Location>

      <StatsGrid>
        <StatItem>
          <StatLabel>Total Area</StatLabel>
          <StatValue>{farm.totalArea.toFixed(1)} ha</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Blocks</StatLabel>
          <StatValue>{summary?.totalBlocks || 0}</StatValue>
        </StatItem>
      </StatsGrid>

      {summary && (
        <BlockStats>
          {summary.blocksByState.empty > 0 && (
            <BlockStatBadge $color="#6B7280">
              {summary.blocksByState.empty} Empty
            </BlockStatBadge>
          )}
          {summary.blocksByState.planned > 0 && (
            <BlockStatBadge $color="#3B82F6">
              {summary.blocksByState.planned} Planned
            </BlockStatBadge>
          )}
          {summary.blocksByState.planted > 0 && (
            <BlockStatBadge $color="#10B981">
              {summary.blocksByState.planted} Planted
            </BlockStatBadge>
          )}
          {summary.blocksByState.harvesting > 0 && (
            <BlockStatBadge $color="#F59E0B">
              {summary.blocksByState.harvesting} Harvesting
            </BlockStatBadge>
          )}
          {summary.blocksByState.alert > 0 && (
            <BlockStatBadge $color="#EF4444">
              {summary.blocksByState.alert} Alert
            </BlockStatBadge>
          )}
        </BlockStats>
      )}

      <Actions>
        <ActionButton $variant="primary" onClick={handleView}>
          View
        </ActionButton>
        {onEdit && (
          <ActionButton $variant="secondary" onClick={handleEdit}>
            Edit
          </ActionButton>
        )}
        {onDelete && (
          <ActionButton $variant="danger" onClick={handleDelete}>
            Delete
          </ActionButton>
        )}
      </Actions>
    </Card>
  );
}
