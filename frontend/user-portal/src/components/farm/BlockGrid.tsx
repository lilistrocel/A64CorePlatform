/**
 * BlockGrid Component
 *
 * Displays a grid of blocks for a farm with filtering and creation capabilities.
 */

import { useState } from 'react';
import styled from 'styled-components';
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
  color: #212121;
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

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? '#3B82F6' : 'transparent')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3B82F6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }
`;

const CreateButton = styled.button`
  padding: 10px 20px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: #1976d2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
  color: #9e9e9e;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: #616161;
  margin: 0 0 8px 0;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: #9e9e9e;
  margin: 0 0 24px 0;
`;

const BlockCount = styled.span`
  font-size: 14px;
  color: #616161;
  font-weight: 500;
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
          <EmptyIcon>🏗️</EmptyIcon>
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
