/**
 * BlockGrid Component
 *
 * Displays a grid of blocks for a farm with filtering and creation capabilities.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Construction } from 'lucide-react';
import { glassControl, monoLabel } from '@a64core/shared';
import { BlockCard } from './BlockCard';
import type { Block, BlockState } from '../../types/farm';
import { BLOCK_STATE_LABELS } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface BlockGridProps {
  blocks: Block[];
  farmId: string;
  onCreateBlock?: () => void;
  onEditBlock?: (blockId: string) => void;
  onDeleteBlock?: (blockId: string) => void;
  onRefresh?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`;

// State-filter pill — mockup ".pill" (spec §4). Active state uses celeste
// (secondary emphasis), not gold — this is a plain filter row, not one of the
// gold-budgeted elements (spec §3).
const FilterButton = styled.button<{ $active: boolean }>`
  ${glassControl}
  padding: 6px 14px;
  border-radius: 99px;
  background: ${({ $active, theme }) => ($active ? 'rgba(180, 200, 220, 0.14)' : 'rgba(23, 29, 64, 0.35)')};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  border-color: ${({ $active, theme }) => ($active ? theme.colors.celeste : theme.colors.line)};
  box-shadow: ${({ $active }) => ($active ? '0 0 16px rgba(180, 200, 220, 0.15)' : 'none')};
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// The one primary-CTA gold budget item on this view (spec §3) — gold
// gradient fill, cosmos (onAccent) text. Matches shared Button's 'primary'
// variant recipe exactly (frontend/shared/src/components/common/Button.tsx).
const CreateButton = styled.button`
  padding: 10px 20px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
`;

const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 20px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 24px 0;
`;

const BlockCount = styled.span`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function BlockGrid({
  blocks,
  farmId,
  onCreateBlock,
  onEditBlock,
  onDeleteBlock,
  onRefresh,
}: BlockGridProps) {
  const [filterState, setFilterState] = useState<BlockState | 'all'>('all');

  // Filter blocks by state
  const filteredBlocks = blocks.filter(
    (block) => filterState === 'all' || block.state === filterState
  );

  // Count blocks by state
  const blockCounts = blocks.reduce(
    (counts, block) => {
      counts[block.state] = (counts[block.state] || 0) + 1;
      return counts;
    },
    {} as Record<BlockState, number>
  );

  const stateFilters: Array<{ state: BlockState | 'all'; label: string }> = [
    { state: 'all', label: 'All Blocks' },
    { state: 'empty', label: 'Empty' },
    { state: 'planned', label: 'Planned' },
    { state: 'planted', label: 'Planted' },
    { state: 'harvesting', label: 'Harvesting' },
    { state: 'alert', label: 'Alert' },
  ];

  return (
    <Container>
      <Header>
        <div>
          <Title>Blocks</Title>
          <BlockCount>{blocks.length} total blocks</BlockCount>
        </div>
        <HeaderActions>
          <CreateButton onClick={onCreateBlock}>
            <span>+</span>
            <span>Add Block</span>
          </CreateButton>
        </HeaderActions>
      </Header>

      <FilterBar>
        {stateFilters.map(({ state, label }) => {
          const count = state === 'all' ? blocks.length : blockCounts[state as BlockState] || 0;
          return (
            <FilterButton
              key={state}
              $active={filterState === state}
              onClick={() => setFilterState(state)}
            >
              {label} ({count})
            </FilterButton>
          );
        })}
      </FilterBar>

      {filteredBlocks.length === 0 ? (
        <EmptyState>
          <EmptyIcon aria-hidden="true"><Construction size={40} strokeWidth={1.4} /></EmptyIcon>
          <EmptyTitle>
            {filterState === 'all' ? 'No blocks yet' : `No ${BLOCK_STATE_LABELS[filterState as BlockState]} blocks`}
          </EmptyTitle>
          <EmptyDescription>
            {filterState === 'all'
              ? 'Create your first block to start organizing your farm'
              : 'Try adjusting your filters or create a new block'}
          </EmptyDescription>
          {filterState === 'all' && onCreateBlock && (
            <CreateButton onClick={onCreateBlock}>
              <span>+</span>
              <span>Create First Block</span>
            </CreateButton>
          )}
        </EmptyState>
      ) : (
        <GridContainer>
          {filteredBlocks.map((block) => (
            <BlockCard
              key={block.blockId}
              block={block}
              farmId={farmId}
              onEdit={onEditBlock}
              onDelete={onDeleteBlock}
              onStateChange={onRefresh}
            />
          ))}
        </GridContainer>
      )}
    </Container>
  );
}
