/**
 * BlockGrid Component
 *
 * Responsive grid layout for displaying dashboard block cards.
 * Adapts card count per row based on screen size.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { CompactBlockCard } from './CompactBlockCard';
import { EmptyVirtualBlockModal } from '../EmptyVirtualBlockModal';
import type { Block, DashboardBlock } from '../../../types/farm';
import type { DashboardConfig } from '../../../hooks/farm/useDashboardConfig';

interface BlockGridProps {
  blocks: DashboardBlock[];
  farmId: string;
  config: DashboardConfig;
  onBlockUpdate?: () => void;
}

export function BlockGrid({ blocks, farmId, config, onBlockUpdate }: BlockGridProps) {
  // Tracks which virtual block (if any) the user is archiving/deleting.
  const [blockToArchive, setBlockToArchive] = useState<DashboardBlock | null>(null);

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
      <Grid>
        {blocks.map((block) => (
          <CardWrapper key={block.blockId}>
            <CompactBlockCard
              block={block}
              farmId={farmId}
              config={config}
              onUpdate={onBlockUpdate}
            />
            {/* Trash icon only on virtual blocks — physical blocks have their
                own management flow on the FarmDetail Physical layout. */}
            {block.blockCategory === 'virtual' && (
              <TrashButton
                type="button"
                aria-label={`Archive or delete ${block.name || block.blockCode}`}
                title="Archive / delete planting"
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockToArchive(block);
                }}
              >
                🗑️
              </TrashButton>
            )}
          </CardWrapper>
        ))}
      </Grid>

      <Summary>
        Displaying {blocks.length} block{blocks.length !== 1 ? 's' : ''}
      </Summary>

      {/* Archive/delete confirmation. EmptyVirtualBlockModal expects a Block
          shape; DashboardBlock supplies all the fields it reads (blockId,
          blockCode, name, blockCategory) plus we add farmId. */}
      {blockToArchive && (
        <EmptyVirtualBlockModal
          isOpen={blockToArchive !== null}
          onClose={() => setBlockToArchive(null)}
          block={{ ...blockToArchive, farmId } as unknown as Block}
          onSuccess={() => {
            setBlockToArchive(null);
            onBlockUpdate?.();
          }}
        />
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  width: 100%;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
  justify-content: start;
`;

/* Wraps each CompactBlockCard so we can absolutely-position a trash button
   on top of it without modifying CompactBlockCard itself (which is shared
   across views). */
const CardWrapper = styled.div`
  position: relative;
`;

const TrashButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  color: #9E2A2A;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  z-index: 2;

  &:hover {
    background: rgba(220, 38, 38, 0.1);
    border-color: #9E2A2A;
  }

  &:focus-visible {
    outline: 2px solid #9E2A2A;
    outline-offset: 2px;
  }
`;

const Summary = styled.div`
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  background: ${({ theme }) => theme.colors.surface.canvas};
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
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 8px 0;
`;

const EmptyText = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;
