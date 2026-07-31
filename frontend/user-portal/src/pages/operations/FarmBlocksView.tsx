/**
 * Farm Blocks View Page
 *
 * Shows all blocks for a farm with their task counts.
 * Mobile-first design for farmers to select blocks to view tasks.
 *
 * Night Observatory (T-901 GAP-FILL): glass cards over the sky, block state
 * badges routed through the canonical BLOCK_STATE_PHASE_KEYS map (spec §5.2)
 * rather than a local re-derivation, task counts onto the phase map
 * (pending -> fruitingInit, in progress -> inoculated).
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Package, Pause, Play, ArrowRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, glassPanelHover, monoLabel, phaseBadge, type PageHeaderStat, type PhaseKey } from '@a64core/shared';
import { getFarm, getBlocks } from '../../services/farmApi';
import { getFarmTasks } from '../../services/tasksApi';
import { BLOCK_STATE_PHASE_KEYS, BLOCK_STATE_LABELS } from '../../types/farm';
import type { Farm, Block } from '../../types/farm';

interface BlockWithTasks extends Block {
  pendingTaskCount: number;
  inProgressTaskCount: number;
}

export function FarmBlocksView() {
  const navigate = useNavigate();
  const { farmId } = useParams<{ farmId: string }>();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [blocks, setBlocks] = useState<BlockWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (farmId) {
      loadFarmAndBlocks();
    }
  }, [farmId]);

  const loadFarmAndBlocks = async () => {
    if (!farmId) return;

    try {
      setLoading(true);
      setError(null);

      // Load farm info and blocks in parallel
      const [farmData, blocksData, tasksResponse] = await Promise.all([
        getFarm(farmId),
        getBlocks(farmId),
        getFarmTasks(farmId, { page: 1, perPage: 100 }),
      ]);

      const tasks = tasksResponse.items;

      // Count tasks by block
      const blocksWithTasks: BlockWithTasks[] = blocksData.map((block) => {
        const blockTasks = tasks.filter((task) => task.blockId === block.blockId);
        const pendingCount = blockTasks.filter((task) => task.status === 'pending').length;
        const inProgressCount = blockTasks.filter((task) => task.status === 'in_progress').length;

        return {
          ...block,
          pendingTaskCount: pendingCount,
          inProgressTaskCount: inProgressCount,
        };
      });

      setFarm(farmData);
      setBlocks(blocksWithTasks);
    } catch (err) {
      console.error('Failed to load farm and blocks:', err);
      setError('Failed to load blocks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockClick = (blockId: string) => {
    navigate(`/operations/${farmId}/${blockId}`);
  };

  const handleBackClick = () => {
    navigate('/operations');
  };

  if (loading) {
    return (
      <PageWrapper>
        <StateBox>
          <Spinner />
          <StateText>Loading blocks…</StateText>
        </StateBox>
      </PageWrapper>
    );
  }

  if (error || !farm) {
    return (
      <PageWrapper>
        <StateBox>
          <ErrorIcon aria-hidden="true"><AlertTriangle size={32} strokeWidth={1.6} /></ErrorIcon>
          <StateText>{error || 'Farm not found'}</StateText>
          <Button variant="secondary" size="small" onClick={loadFarmAndBlocks}>
            Retry
          </Button>
        </StateBox>
      </PageWrapper>
    );
  }

  const totalPending = blocks.reduce((sum, block) => sum + block.pendingTaskCount, 0);
  const totalInProgress = blocks.reduce((sum, block) => sum + block.inProgressTaskCount, 0);

  const headerStats: PageHeaderStat[] = [
    { value: totalPending, label: 'Pending' },
    { value: totalInProgress, label: 'In progress', alive: true },
  ];

  const location =
    farm.location?.city && farm.location?.state
      ? `${farm.location.city}, ${farm.location.state}`
      : farm.location?.city || farm.location?.state || 'No location specified';

  return (
    <PageWrapper>
      <BackButton onClick={handleBackClick}>
        <ArrowLeft size={15} strokeWidth={2} />
        Back to Farms
      </BackButton>

      <PageHeader
        breadcrumb="Operations · Live"
        title={farm.name}
        description={location}
        stats={blocks.length > 0 ? headerStats : undefined}
      />

      {blocks.length === 0 ? (
        <EmptyState>
          <EmptyIconWrap aria-hidden="true">
            <Package size={28} strokeWidth={1.5} />
          </EmptyIconWrap>
          <EmptyTitle>No blocks in this farm</EmptyTitle>
        </EmptyState>
      ) : (
        <BlockList>
          {blocks.map((block) => {
            const hasTasks = block.pendingTaskCount > 0 || block.inProgressTaskCount > 0;
            const phaseKey = BLOCK_STATE_PHASE_KEYS[block.state];
            return (
              <BlockCard
                key={block.blockId}
                onClick={() => handleBlockClick(block.blockId)}
                $hasTasks={hasTasks}
              >
                <BlockHeader>
                  <BlockIconWrap aria-hidden="true">
                    <Package size={20} strokeWidth={1.6} />
                  </BlockIconWrap>
                  <BlockInfo>
                    <BlockName>{block.name}</BlockName>
                    <BlockStateBadge $phaseKey={phaseKey}>
                      {BLOCK_STATE_LABELS[block.state]}
                    </BlockStateBadge>
                  </BlockInfo>
                </BlockHeader>

                <TaskCounts>
                  {block.pendingTaskCount > 0 && (
                    <TaskBadge $phaseKey="fruitingInit">
                      <Pause size={12} strokeWidth={2} />
                      {block.pendingTaskCount} Pending
                    </TaskBadge>
                  )}
                  {block.inProgressTaskCount > 0 && (
                    <TaskBadge $phaseKey="inoculated">
                      <Play size={12} strokeWidth={2} />
                      {block.inProgressTaskCount} In progress
                    </TaskBadge>
                  )}
                  {block.pendingTaskCount === 0 && block.inProgressTaskCount === 0 && (
                    <NoTasksText>No pending tasks</NoTasksText>
                  )}
                </TaskCounts>

                <ViewButton>
                  View Tasks
                  <ArrowRight size={15} strokeWidth={2} />
                </ViewButton>
              </BlockCard>
            );
          })}
        </BlockList>
      )}
    </PageWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// Night Observatory (T-901 GAP-FILL) — visual idiom: MushroomRoomMonitor.tsx.
// ============================================================================

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const StateBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 24px;
`;

const StateText = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ErrorIcon = styled.div`
  color: ${({ theme }) => theme.colors.bright.coral};
  display: flex;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  border-radius: 50%;
  animation: spinAnim 0.9s linear infinite;

  @keyframes spinAnim {
    to {
      transform: rotate(360deg);
    }
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
  gap: 10px;
`;

const EmptyIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0;
`;

const BlockList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
`;

const BlockCard = styled.div<{ $hasTasks: boolean }>`
  ${glassPanelHover}
  padding: 20px;
  border-left: 3px solid
    ${({ theme, $hasTasks }) => ($hasTasks ? theme.colors.phase.inoculated : theme.colors.line)};
`;

const BlockHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
`;

const BlockIconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.glass.hi};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const BlockInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const BlockName = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const BlockStateBadge = styled.span<{ $phaseKey: PhaseKey }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
  width: fit-content;
`;

const TaskCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const TaskBadge = styled.div<{ $phaseKey: 'fruitingInit' | 'inoculated' }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const NoTasksText = styled.p`
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ViewButton = styled.div`
  ${monoLabel}
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.72rem;
  transition: background 150ms ease, color 150ms ease;

  ${BlockCard}:hover & {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;
