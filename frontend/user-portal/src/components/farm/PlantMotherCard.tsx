/**
 * PlantMotherCard Component
 *
 * Displays a single mother plant (product) in a card layout — plantName,
 * scientificName, plantType, and its variety count. Mirrors PlantDataCard's
 * styling exactly (same glassPanelHover recipe) but scoped to the mother's
 * own fields; the detailed cultivation stats now live one level down, on
 * each variety.
 */

import styled from 'styled-components';
import {
  Wheat,
  TreeDeciduous,
  Leaf,
  Apple,
  Carrot,
  Flower2,
  Sprout,
  Eye,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { glassPanelHover, monoLabel, phaseBadge } from '@a64core/shared';
import type { PlantMotherWithVarietyCount } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantMotherCardProps {
  mother: PlantMotherWithVarietyCount;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onAddVariety?: (id: string) => void;
}

// ============================================================================
// STYLED COMPONENTS (identical recipe to PlantDataCard)
// ============================================================================

const Card = styled.div`
  ${glassPanelHover}
  padding: 24px;
  position: relative;
`;

const PlantIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 16px;
`;

const PlantName = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
  text-align: center;
`;

const ScientificName = styled.div`
  font-size: 14px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: 16px;
  min-height: 20px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const PlantTypeBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
`;

const VarietyCountRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
`;

const VarietyCountLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
`;

const VarietyCountValue = styled.span`
  ${monoLabel}
  text-transform: none;
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  opacity: 0;
  transition: opacity 150ms ease-in-out;

  ${Card}:hover & {
    opacity: 1;
  }
`;

// Same button vocabulary as PlantDataCard's ActionButton (spec §4): glass
// secondary for non-destructive, coral-tinted glass for delete.
const ActionButton = styled.button<{ $variant?: 'view' | 'edit' | 'delete' | 'addVariety' }>`
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 4px;

  ${({ $variant, theme }) => {
    if ($variant === 'delete') {
      return `
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover {
          filter: brightness(1.15);
        }
      `;
    }
    if ($variant === 'addVariety') {
      // The one primary-leaning action on this card (gold accent border,
      // per spec §3's single-gold-cue rule — not a filled gold button).
      return `
        background: ${theme.colors.glass.base};
        color: ${theme.colors.secondary[500]};
        border: 1px solid ${theme.colors.secondary[500]};
        &:hover {
          background: ${theme.colors.glass.hi};
        }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover {
        background: ${theme.colors.glass.hi};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const InactiveBadge = styled.div<{ $phase: 'decommissioned' }>`
  ${({ $phase }) => phaseBadge($phase)}
  position: absolute;
  top: 12px;
  right: 12px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

const PLANT_TYPE_ICONS: Record<string, typeof Sprout> = {
  crop: Wheat,
  tree: TreeDeciduous,
  herb: Leaf,
  fruit: Apple,
  vegetable: Carrot,
  ornamental: Flower2,
  medicinal: Sprout,
};

export function PlantMotherCard({ mother, onView, onEdit, onDelete, onAddVariety }: PlantMotherCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    onView?.(mother.plantMotherId);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    onView?.(mother.plantMotherId);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(mother.plantMotherId);
  };

  const handleAddVariety = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddVariety?.(mother.plantMotherId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${mother.plantName}"?`)) {
      onDelete?.(mother.plantMotherId);
    }
  };

  const PlantTypeIcon = PLANT_TYPE_ICONS[mother.plantType] || Sprout;

  return (
    <Card onClick={handleCardClick}>
      {!mother.isActive && <InactiveBadge $phase="decommissioned">Inactive</InactiveBadge>}

      <PlantIcon>
        <PlantTypeIcon size={40} strokeWidth={1.4} />
      </PlantIcon>

      <PlantName>{mother.plantName}</PlantName>
      <ScientificName>{mother.scientificName || ' '}</ScientificName>

      <InfoRow>
        <PlantTypeBadge>{mother.plantType}</PlantTypeBadge>
      </InfoRow>

      <VarietyCountRow>
        <VarietyCountLabel>Varieties</VarietyCountLabel>
        <VarietyCountValue>
          {mother.varietyCount} {mother.varietyCount === 1 ? 'variety' : 'varieties'}
        </VarietyCountValue>
      </VarietyCountRow>

      <Actions>
        {onView && (
          <ActionButton $variant="view" onClick={handleView}>
            <Eye size={13} strokeWidth={1.6} /> View
          </ActionButton>
        )}
        {onAddVariety && (
          <ActionButton $variant="addVariety" onClick={handleAddVariety}>
            <Plus size={13} strokeWidth={1.8} /> Add Variety
          </ActionButton>
        )}
        {onEdit && (
          <ActionButton $variant="edit" onClick={handleEdit}>
            <Pencil size={13} strokeWidth={1.6} /> Edit
          </ActionButton>
        )}
        {onDelete && (
          <ActionButton $variant="delete" onClick={handleDelete}>
            <Trash2 size={13} strokeWidth={1.6} /> Delete
          </ActionButton>
        )}
      </Actions>
    </Card>
  );
}
