/**
 * PhysicalBlockGrid Component
 *
 * Displays physical blocks with their embedded virtual blocks (plantings).
 * Groups virtual blocks under their parent physical blocks.
 */

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { PhysicalBlockCard } from './PhysicalBlockCard';
import type { Block } from '../../types/farm';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PhysicalBlockGridProps {
  physicalBlocks: Block[];
  virtualBlocks: Block[];
  farmId: string;
  onRefresh?: () => void;
  onCreateBlock?: () => void;
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

const BlockCount = styled.span`
  font-size: 14px;
  color: #616161;
  font-weight: 500;
  margin-top: 4px;
  display: block;
`;

const ControlsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
`;

const FilterBar = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const SortControl = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SortLabel = styled.span`
  font-size: 13px;
  color: #616161;
`;

const SortSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  color: #424242;
  background: white;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: #3b82f6;
  }
`;

const SortDirectionButton = styled.button`
  padding: 8px 10px;
  background: transparent;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  color: #616161;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  background: ${({ $active }) => ($active ? '#3b82f6' : 'transparent')};
  color: ${({ $active }) => ($active ? 'white' : '#616161')};
  border: 1px solid ${({ $active }) => ($active ? '#3b82f6' : '#e0e0e0')};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ $active }) => ($active ? '#1976d2' : '#f5f5f5')};
  }
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 24px;

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
  margin: 0;
`;

const CreateButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #10B981;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #059669;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

type FilterType = 'all' | 'with-plantings' | 'empty';
type SortField = 'name' | 'blockCode';
type SortDirection = 'asc' | 'desc';

export function PhysicalBlockGrid({
  physicalBlocks,
  virtualBlocks,
  farmId,
  onRefresh,
  onCreateBlock,
}: PhysicalBlockGridProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Group virtual blocks by parent
  const virtualBlocksByParent = useMemo(() => {
    const grouped = new Map<string, Block[]>();

    virtualBlocks.forEach((vb) => {
      if (vb.parentBlockId) {
        const existing = grouped.get(vb.parentBlockId) || [];
        grouped.set(vb.parentBlockId, [...existing, vb]);
      }
    });

    return grouped;
  }, [virtualBlocks]);

  // Apply filters and sorting
  const filteredPhysicalBlocks = useMemo(() => {
    let result = physicalBlocks;

    if (filter === 'with-plantings') {
      result = result.filter((pb) => {
        const physicalBlockHasPlanting =
          pb.state !== 'empty' && pb.state !== 'cleaning' && pb.state !== 'partial';
        const children = virtualBlocksByParent.get(pb.blockId) || [];
        const activePlantings = children.filter(
          (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
        );
        return physicalBlockHasPlanting || activePlantings.length > 0;
      });
    } else if (filter === 'empty') {
      result = result.filter((pb) => {
        const isPhysicalBlockEmpty = pb.state === 'empty';
        const children = virtualBlocksByParent.get(pb.blockId) || [];
        const activePlantings = children.filter(
          (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
        );
        return isPhysicalBlockEmpty && activePlantings.length === 0;
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      const aVal = sortField === 'name' ? (a.name || a.blockCode) : a.blockCode;
      const bVal = sortField === 'name' ? (b.name || b.blockCode) : b.blockCode;
      const comparison = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [physicalBlocks, virtualBlocksByParent, filter, sortField, sortDirection]);

  // Calculate counts for filters
  const totalPhysicalBlocks = physicalBlocks.length;
  const blocksWithPlantings = physicalBlocks.filter((pb) => {
    // Check if physical block itself has a planting
    // Exclude: empty, cleaning, partial (partial = has virtual children, not a direct planting)
    const physicalBlockHasPlanting =
      pb.state !== 'empty' && pb.state !== 'cleaning' && pb.state !== 'partial';
    // Check virtual block children
    const children = virtualBlocksByParent.get(pb.blockId) || [];
    const activePlantings = children.filter(
      (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
    );
    return physicalBlockHasPlanting || activePlantings.length > 0;
  }).length;
  const emptyBlocks = physicalBlocks.filter((pb) => {
    const isPhysicalBlockEmpty = pb.state === 'empty';
    const children = virtualBlocksByParent.get(pb.blockId) || [];
    const activePlantings = children.filter(
      (vb) => vb.state !== 'empty' && vb.state !== 'cleaning'
    );
    return isPhysicalBlockEmpty && activePlantings.length === 0;
  }).length;

  return (
    <Container>
      <Header>
        <div>
          <Title>Physical Blocks & Plantings</Title>
          <BlockCount>
            {totalPhysicalBlocks} physical blocks · {virtualBlocks.length} total plantings
          </BlockCount>
        </div>
        {onCreateBlock && (
          <CreateButton onClick={onCreateBlock}>
            <span>+</span>
            <span>Create Block</span>
          </CreateButton>
        )}
      </Header>

      <ControlsBar>
        <FilterBar>
          <FilterButton $active={filter === 'all'} onClick={() => setFilter('all')}>
            All Blocks ({totalPhysicalBlocks})
          </FilterButton>
          <FilterButton $active={filter === 'with-plantings'} onClick={() => setFilter('with-plantings')}>
            With Plantings ({blocksWithPlantings})
          </FilterButton>
          <FilterButton $active={filter === 'empty'} onClick={() => setFilter('empty')}>
            Empty ({emptyBlocks})
          </FilterButton>
        </FilterBar>
        <SortControl>
          <SortLabel>Sort by:</SortLabel>
          <SortSelect value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
            <option value="name">Name</option>
            <option value="blockCode">Block Code</option>
          </SortSelect>
          <SortDirectionButton onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}>
            {sortDirection === 'asc' ? '↑' : '↓'}
          </SortDirectionButton>
        </SortControl>
      </ControlsBar>

      {filteredPhysicalBlocks.length === 0 ? (
        <EmptyState>
          <EmptyIcon>🏗️</EmptyIcon>
          <EmptyTitle>No Physical Blocks Found</EmptyTitle>
          <EmptyDescription>
            {filter === 'all'
              ? 'Create your first physical block to start organizing your farm'
              : 'Try adjusting your filters'}
          </EmptyDescription>
        </EmptyState>
      ) : (
        <GridContainer>
          {filteredPhysicalBlocks.map((physicalBlock) => {
            const children = virtualBlocksByParent.get(physicalBlock.blockId) || [];
            return (
              <PhysicalBlockCard
                key={physicalBlock.blockId}
                physicalBlock={physicalBlock}
                virtualBlocks={children}
                farmId={farmId}
                onRefresh={onRefresh}
              />
            );
          })}
        </GridContainer>
      )}
    </Container>
  );
}
