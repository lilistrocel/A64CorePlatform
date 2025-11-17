/**
 * BlockGrid Component
 *
 * Responsive grid layout for displaying dashboard block cards.
 * Adapts card count per row based on screen size.
 */

import styled from 'styled-components';
import { CompactBlockCard } from './CompactBlockCard';
import type { DashboardBlock } from '../../../types/farm';
import type { DashboardConfig } from '../../../hooks/farm/useDashboardConfig';

interface BlockGridProps {
  blocks: DashboardBlock[];
  farmId: string;
  config: DashboardConfig;
  onBlockUpdate?: () => void;
}

export function BlockGrid({ blocks, farmId, config, onBlockUpdate }: BlockGridProps) {
  if (blocks.length === 0) {
    return (
      <EmptyState>
        <EmptyIcon>📦</EmptyIcon>
        <EmptyTitle>No Blocks Found</EmptyTitle>
        <EmptyText>Try adjusting your filters or create new blocks for this farm.</EmptyText>
      </EmptyState>
    );
  }

  return (
    <Container>
      <Grid $cardsPerRow={config.layout.cardsPerRow}>
        {blocks.map((block) => (
          <CompactBlockCard
            key={block.blockId}
            block={block}
            farmId={farmId}
            config={config}
            onUpdate={onBlockUpdate}
          />
        ))}
      </Grid>

      <Summary>
        Displaying {blocks.length} block{blocks.length !== 1 ? 's' : ''}
      </Summary>
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  width: 100%;
`;

const Grid = styled.div<{ $cardsPerRow: number }>`
  display: grid;
  grid-template-columns: repeat(
    ${(props) => props.$cardsPerRow},
    minmax(0, 1fr)
  );
  gap: 16px;
  margin-bottom: 24px;

  /* Responsive breakpoints */
  @media (max-width: 1920px) {
    grid-template-columns: repeat(
      ${(props) => Math.min(props.$cardsPerRow, 8)},
      minmax(0, 1fr)
    );
  }

  @media (max-width: 1440px) {
    grid-template-columns: repeat(
      ${(props) => Math.min(props.$cardsPerRow, 6)},
      minmax(0, 1fr)
    );
  }

  @media (max-width: 1024px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const Summary = styled.div`
  text-align: center;
  font-size: 14px;
  color: #757575;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const EmptyText = styled.p`
  font-size: 16px;
  color: #757575;
  margin: 0;
`;
