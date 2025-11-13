/**
 * PlantDataCard Component
 *
 * Displays a single plant data entry in a card layout with key information and actions.
 * Shows farm type compatibility badges, key stats, and hover actions.
 */

import styled from 'styled-components';
import type { PlantDataEnhanced } from '../../types/farm';
import { formatFarmType, getFarmTypeColor } from '../../services/plantDataEnhancedApi';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantDataCardProps {
  plant: PlantDataEnhanced;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onClone?: (id: string) => void;
  onDelete?: (id: string) => void;
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
  position: relative;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const PlantIcon = styled.div`
  font-size: 48px;
  text-align: center;
  margin-bottom: 16px;
`;

const PlantName = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 4px 0;
  text-align: center;
`;

const ScientificName = styled.div`
  font-size: 14px;
  font-style: italic;
  color: #616161;
  text-align: center;
  margin-bottom: 16px;
  min-height: 20px;
`;

const FarmTypeBadges = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
`;

const FarmTypeBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  white-space: nowrap;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #212121;
`;

const TagsContainer = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 16px;
  min-height: 28px;
`;

const Tag = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: #f5f5f5;
  color: #616161;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  opacity: 0;
  transition: opacity 150ms ease-in-out;

  ${Card}:hover & {
    opacity: 1;
  }
`;

const ActionButton = styled.button<{ $variant?: 'view' | 'edit' | 'clone' | 'delete' }>`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 4px;

  ${({ $variant }) => {
    if ($variant === 'view') {
      return `
        background: #3B82F6;
        color: white;
        &:hover {
          background: #1976d2;
        }
      `;
    }
    if ($variant === 'edit') {
      return `
        background: #F59E0B;
        color: white;
        &:hover {
          background: #D97706;
        }
      `;
    }
    if ($variant === 'clone') {
      return `
        background: #10B981;
        color: white;
        &:hover {
          background: #059669;
        }
      `;
    }
    if ($variant === 'delete') {
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
      background: white;
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

const InactiveBadge = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  background: #EF4444;
  color: white;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantDataCard({ plant, onView, onEdit, onClone, onDelete }: PlantDataCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    onView?.(plant.plantDataId);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    onView?.(plant.plantDataId);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(plant.plantDataId);
  };

  const handleClone = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClone?.(plant.plantDataId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${plant.plantName}"?`)) {
      onDelete?.(plant.plantDataId);
    }
  };

  // Get plant icon based on plant type
  const getPlantIcon = () => {
    const iconMap: Record<string, string> = {
      crop: '🌾',
      tree: '🌳',
      herb: '🌿',
      fruit: '🍎',
      vegetable: '🥕',
      ornamental: '🌺',
      medicinal: '🌱',
    };
    return iconMap[plant.plantType] || '🌱';
  };

  return (
    <Card onClick={handleCardClick}>
      {!plant.isActive && <InactiveBadge>Inactive</InactiveBadge>}

      <PlantIcon>{getPlantIcon()}</PlantIcon>

      <PlantName>{plant.plantName}</PlantName>
      <ScientificName>{plant.scientificName || '\u00A0'}</ScientificName>

      <FarmTypeBadges>
        {plant.farmTypeCompatibility.slice(0, 3).map((farmType) => (
          <FarmTypeBadge key={farmType} $color={getFarmTypeColor(farmType)}>
            {formatFarmType(farmType)}
          </FarmTypeBadge>
        ))}
        {plant.farmTypeCompatibility.length > 3 && (
          <FarmTypeBadge $color="#6B7280">
            +{plant.farmTypeCompatibility.length - 3}
          </FarmTypeBadge>
        )}
      </FarmTypeBadges>

      <StatsGrid>
        <StatItem>
          <StatLabel>Growth Cycle</StatLabel>
          <StatValue>{plant.growthCycle.totalCycleDays}d</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Yield</StatLabel>
          <StatValue>
            {plant.yieldInfo.yieldPerPlant} {plant.yieldInfo.yieldUnit}
          </StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Market Value</StatLabel>
          <StatValue>
            {plant.economicsAndLabor?.averageMarketValuePerKg != null
              ? `${plant.economicsAndLabor.currency || '$'}${plant.economicsAndLabor.averageMarketValuePerKg.toFixed(2)}/kg`
              : 'N/A'}
          </StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>Version</StatLabel>
          <StatValue>v{plant.dataVersion}</StatValue>
        </StatItem>
      </StatsGrid>

      <TagsContainer>
        {plant.tags.length > 0 ? (
          plant.tags.slice(0, 3).map((tag) => <Tag key={tag}>#{tag}</Tag>)
        ) : (
          <Tag>No tags</Tag>
        )}
        {plant.tags.length > 3 && <Tag>+{plant.tags.length - 3}</Tag>}
      </TagsContainer>

      <Actions>
        {onView && (
          <ActionButton $variant="view" onClick={handleView}>
            👁️ View
          </ActionButton>
        )}
        {onEdit && (
          <ActionButton $variant="edit" onClick={handleEdit}>
            ✏️ Edit
          </ActionButton>
        )}
        {onClone && (
          <ActionButton $variant="clone" onClick={handleClone}>
            📋 Clone
          </ActionButton>
        )}
        {onDelete && (
          <ActionButton $variant="delete" onClick={handleDelete}>
            🗑️ Delete
          </ActionButton>
        )}
      </Actions>
    </Card>
  );
}
