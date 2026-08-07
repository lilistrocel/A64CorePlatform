/**
 * PlantMotherDetailModal Component
 *
 * Shows a mother plant (product)'s active varieties (compact rows) with
 * View/Edit/Delete per variety, plus an "Add Variety" action. Reuses
 * PlantDataDetail (existing, unmodified) for the full read-only variety
 * view and delegates variety create/edit to the caller, which opens
 * PlantDataFormModal in the appropriate mode (variety-create / edit).
 *
 * Modal closes ONLY via the X button, never on backdrop click (project rule).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useQueryClient } from '@tanstack/react-query';
import {
  Wheat,
  TreeDeciduous,
  Leaf,
  Apple,
  Carrot,
  Flower2,
  Sprout,
  Pencil,
  Trash2,
  X,
  Plus,
  Copy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import { useVarietiesForMother } from '../../hooks/queries/usePlantMothers';
import { queryKeys } from '../../config/react-query.config';
import { deletePlantDataEnhanced } from '../../services/plantDataEnhancedApi';
import { PlantDataDetail } from './PlantDataDetail';
import type { PlantDataEnhanced, PlantMother } from '../../types/farm';

const PLANT_TYPE_ICONS: Record<string, LucideIcon> = {
  crop: Wheat,
  tree: TreeDeciduous,
  herb: Leaf,
  fruit: Apple,
  vegetable: Carrot,
  ornamental: Flower2,
  medicinal: Sprout,
};

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PlantMotherDetailModalProps {
  mother: PlantMother;
  onClose: () => void;
  onEditMother?: (motherId: string) => void;
  onAddVariety?: (motherId: string) => void;
  onEditVariety?: (variety: PlantDataEnhanced) => void;
  /** Opens the variety-create form pre-filled from this variety's data (see PlantDataFormModal's duplicateFromVariety). */
  onDuplicateVariety?: (variety: PlantDataEnhanced) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1090;
  padding: 20px;
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 720px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const PlantIconBox = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.celeste};
  flex-shrink: 0;
`;

const PlantName = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 2px 0;
`;

const ScientificName = styled.div`
  font-size: 14px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.celeste};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const IconButton = styled.button<{ $variant?: 'edit' | 'close' }>`
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;

  ${({ $variant, theme }) => {
    if ($variant === 'edit') {
      return `
        background: ${theme.colors.glass.base};
        border-color: ${theme.colors.glass.border};
        color: ${theme.colors.textPrimary};
        &:hover { background: ${theme.colors.glass.hi}; }
      `;
    }
    return `
      background: transparent;
      border-color: ${theme.colors.glass.border};
      color: ${theme.colors.muted};
      &:hover {
        color: ${theme.colors.textPrimary};
        background: rgba(180, 200, 220, 0.07);
      }
    `;
  }}
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const SectionTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// Primary CTA of this view (spec §3): gold gradient, one per screen.
const AddVarietyButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  transition: all 150ms ease-in-out;

  &:hover {
    filter: brightness(1.05);
  }
`;

const VarietyRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(180, 200, 220, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.08);
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const VarietyInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const VarietyName = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const VarietyMeta = styled.span`
  ${monoLabel}
  text-transform: none;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const InactiveTag = styled.span`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(180, 200, 220, 0.12);
  color: ${({ theme }) => theme.colors.muted};
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;

const RowButton = styled.button<{ $variant?: 'edit' | 'delete' }>`
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'delete') {
      return `
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover { filter: brightness(1.15); }
      `;
    }
    return `
      background: ${theme.colors.glass.base};
      color: ${theme.colors.textPrimary};
      border: 1px solid ${theme.colors.glass.border};
      &:hover { background: ${theme.colors.glass.hi}; }
    `;
  }}
`;

const EmptyText = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  font-size: 14px;
  text-align: center;
  padding: 32px 16px;
`;

const LoadingText = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  text-align: center;
  padding: 32px 16px;
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function PlantMotherDetailModal({
  mother,
  onClose,
  onEditMother,
  onAddVariety,
  onEditVariety,
  onDuplicateVariety,
}: PlantMotherDetailModalProps) {
  const queryClient = useQueryClient();
  const { data: varieties, isLoading, error } = useVarietiesForMother(mother.plantMotherId);
  const [viewingVariety, setViewingVariety] = useState<PlantDataEnhanced | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const PlantTypeIcon = PLANT_TYPE_ICONS[mother.plantType] || Sprout;

  const handleDeleteVariety = async (variety: PlantDataEnhanced, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete variety "${variety.varietyName || variety.plantName}"?`)) return;

    setDeleteError(null);
    try {
      await deletePlantDataEnhanced(variety.plantDataId);
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.varieties(mother.plantMotherId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.plantMothers.lists() });
    } catch (err) {
      console.error('Error deleting variety:', err);
      setDeleteError('Failed to delete variety. Please try again.');
    }
  };

  // Reason: Overlay click intentionally NOT wired to onClose — modal must close via X button only.
  return (
    <>
      <Overlay>
        <Modal>
          <Header>
            <HeaderLeft>
              <PlantIconBox aria-hidden="true">
                <PlantTypeIcon size={26} strokeWidth={1.6} />
              </PlantIconBox>
              <div>
                <PlantName>{mother.plantName}</PlantName>
                {mother.scientificName && <ScientificName>{mother.scientificName}</ScientificName>}
              </div>
            </HeaderLeft>
            <HeaderActions>
              {onEditMother && (
                <IconButton $variant="edit" onClick={() => onEditMother(mother.plantMotherId)}>
                  <Pencil size={14} strokeWidth={1.8} /> Edit
                </IconButton>
              )}
              <IconButton $variant="close" onClick={onClose} aria-label="Close">
                <X size={16} strokeWidth={1.8} />
              </IconButton>
            </HeaderActions>
          </Header>

          <Content>
            <SectionTitleRow>
              <SectionTitle>Varieties</SectionTitle>
              {onAddVariety && (
                <AddVarietyButton onClick={() => onAddVariety(mother.plantMotherId)}>
                  <Plus size={14} strokeWidth={2} /> Add Variety
                </AddVarietyButton>
              )}
            </SectionTitleRow>

            {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}

            {isLoading && <LoadingText>Loading varieties…</LoadingText>}
            {!isLoading && error && (
              <ErrorBanner>Failed to load varieties. Please try again.</ErrorBanner>
            )}
            {!isLoading && !error && (!varieties || varieties.length === 0) && (
              <EmptyText>
                No varieties yet. {onAddVariety ? 'Click "Add Variety" to create the first cultivation recipe.' : ''}
              </EmptyText>
            )}
            {!isLoading && varieties && varieties.length > 0 && (
              <div>
                {varieties.map((variety) => (
                  <VarietyRow key={variety.plantDataId} onClick={() => setViewingVariety(variety)}>
                    <VarietyInfo>
                      <VarietyName>
                        {variety.varietyName || variety.plantName}
                        {!variety.isActive && (
                          <>
                            {' '}
                            <InactiveTag>Inactive</InactiveTag>
                          </>
                        )}
                      </VarietyName>
                      <VarietyMeta>
                        {variety.growthCycle.totalCycleDays}d cycle &middot; {variety.yieldInfo.yieldPerPlant}
                        {variety.yieldInfo.yieldUnit}/plant
                      </VarietyMeta>
                    </VarietyInfo>
                    <RowActions>
                      {onEditVariety && (
                        <RowButton
                          $variant="edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditVariety(variety);
                          }}
                        >
                          <Pencil size={12} strokeWidth={1.6} /> Edit
                        </RowButton>
                      )}
                      {onDuplicateVariety && (
                        <RowButton
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateVariety(variety);
                          }}
                        >
                          <Copy size={12} strokeWidth={1.6} /> Duplicate
                        </RowButton>
                      )}
                      <RowButton $variant="delete" onClick={(e) => handleDeleteVariety(variety, e)}>
                        <Trash2 size={12} strokeWidth={1.6} /> Delete
                      </RowButton>
                    </RowActions>
                  </VarietyRow>
                ))}
              </div>
            )}
          </Content>
        </Modal>
      </Overlay>

      {viewingVariety && (
        <PlantDataDetail
          plant={viewingVariety}
          onClose={() => setViewingVariety(null)}
          onEdit={
            onEditVariety
              ? (_id) => {
                  setViewingVariety(null);
                  onEditVariety(viewingVariety);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
