/**
 * Farm Blocks View Page
 *
 * Shows all blocks for a farm with their task counts.
 * Mobile-first design for farmers to select blocks to view tasks.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { getFarm, getBlocks } from '../../services/farmApi';
import { getFarmTasks } from '../../services/tasksApi';
import type { Farm, Block } from '../../types/farm';
import type { TaskWithDetails } from '../../types/tasks';

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
      <Container>
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingText>Loading blocks...</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  if (error || !farm) {
    return (
      <Container>
        <ErrorContainer>
          <ErrorIcon>❌</ErrorIcon>
          <ErrorText>{error || 'Farm not found'}</ErrorText>
          <RetryButton onClick={loadFarmAndBlocks}>Retry</RetryButton>
        </ErrorContainer>
      </Container>
    );
  }

  const totalPending = blocks.reduce((sum, block) => sum + block.pendingTaskCount, 0);
  const totalInProgress = blocks.reduce((sum, block) => sum + block.inProgressTaskCount, 0);

  return (
    <Container>
      <Header>
        <BackButton onClick={handleBackClick}>
          <BackIcon>←</BackIcon>
          Back to Farms
        </BackButton>
        <FarmTitle>{farm.name}</FarmTitle>
        <FarmLocation>
          {farm.location?.city && farm.location?.state
            ? `${farm.location.city}, ${farm.location.state}`
            : farm.location?.city || farm.location?.state || 'No location specified'}
        </FarmLocation>
      </Header>

      {/* Task Summary */}
      <Summary>
        <SummaryCard>
          <SummaryIcon>⏸️</SummaryIcon>
          <SummaryValue>{totalPending}</SummaryValue>
          <SummaryLabel>Pending</SummaryLabel>
        </SummaryCard>
        <SummaryCard>
          <SummaryIcon>▶️</SummaryIcon>
          <SummaryValue>{totalInProgress}</SummaryValue>
          <SummaryLabel>In Progress</SummaryLabel>
        </SummaryCard>
      </Summary>

      {/* Block List */}
      {blocks.length === 0 ? (
        <EmptyContainer>
          <EmptyIcon>📦</EmptyIcon>
          <EmptyText>No blocks in this farm</EmptyText>
        </EmptyContainer>
      ) : (
        <BlockList>
          {blocks.map((block) => (
            <BlockCard
              key={block.blockId}
              onClick={() => handleBlockClick(block.blockId)}
              $hasTasks={block.pendingTaskCount > 0 || block.inProgressTaskCount > 0}
            >
              <BlockHeader>
                <BlockIcon>📦</BlockIcon>
                <BlockInfo>
                  <BlockName>{block.name}</BlockName>
                  <BlockState $state={block.state}>{block.state.toUpperCase()}</BlockState>
                </BlockInfo>
              </BlockHeader>

              <TaskCounts>
                {block.pendingTaskCount > 0 && (
                  <TaskBadge $status="pending">
                    <BadgeIcon>⏸️</BadgeIcon>
                    <BadgeCount>{block.pendingTaskCount}</BadgeCount>
                    <BadgeLabel>Pending</BadgeLabel>
                  </TaskBadge>
                )}
                {block.inProgressTaskCount > 0 && (
                  <TaskBadge $status="in_progress">
                    <BadgeIcon>▶️</BadgeIcon>
                    <BadgeCount>{block.inProgressTaskCount}</BadgeCount>
                    <BadgeLabel>In Progress</BadgeLabel>
                  </TaskBadge>
                )}
                {block.pendingTaskCount === 0 && block.inProgressTaskCount === 0 && (
                  <NoTasksText>No pending tasks</NoTasksText>
                )}
              </TaskCounts>

              <ViewButton>
                View Tasks
                <ArrowIcon>→</ArrowIcon>
              </ViewButton>
            </BlockCard>
          ))}
        </BlockList>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.surface.canvas};
  padding-bottom: ${({ theme }) => theme.space['8']};
`;

const Header = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.accent.sage};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  padding: ${({ theme }) => theme.space['2']} 0;
  margin-bottom: ${({ theme }) => theme.space['4']};

  &:hover {
    text-decoration: underline;
  }
`;

const BackIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.h4};
`;

const FarmTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const FarmLocation = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['6']};
`;

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  text-align: center;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SummaryIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  margin-bottom: ${({ theme }) => theme.space['2']};
`;

const SummaryValue = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h1};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const SummaryLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BlockList = styled.div`
  padding: 0 ${({ theme }) => theme.space['6']};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['4']};
`;

const BlockCard = styled.div<{ $hasTasks: boolean }>`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  box-shadow: ${({ theme }) => theme.shadows.md};
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 4px solid
    ${({ theme, $hasTasks }) => ($hasTasks ? theme.colors.accent.sage : theme.colors.border.subtle)};

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const BlockHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['4']};
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const BlockIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h1};
`;

const BlockInfo = styled.div`
  flex: 1;
`;

const BlockName = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const BlockState = styled.span<{ $state: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['2']}`};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${({ theme, $state }) => {
    switch ($state) {
      case 'empty':
        return theme.colors.surface.raised;
      case 'planned':
        return `${theme.colors.accent.sage}15`;
      case 'planted':
        return `${theme.colors.status.success}15`;
      case 'harvesting':
        return `${theme.colors.status.warning}15`;
      case 'alert':
        return `${theme.colors.status.danger}15`;
      default:
        return theme.colors.surface.raised;
    }
  }};
  color: ${({ theme, $state }) => {
    switch ($state) {
      case 'empty':
        return theme.colors.text.secondary;
      case 'planned':
        return theme.colors.accent.sageDeep;
      case 'planted':
        return theme.colors.status.success;
      case 'harvesting':
        return theme.colors.status.warning;
      case 'alert':
        return theme.colors.status.danger;
      default:
        return theme.colors.text.secondary;
    }
  }};
`;

const TaskCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space['2']};
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const TaskBadge = styled.div<{ $status: 'pending' | 'in_progress' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['4']}`};
  border-radius: ${({ theme }) => theme.radii.pill};
  background: ${({ theme, $status }) =>
    $status === 'pending' ? `${theme.colors.text.tertiary}15` : `${theme.colors.accent.sage}15`};
  color: ${({ theme, $status }) =>
    $status === 'pending' ? theme.colors.text.secondary : theme.colors.accent.sageDeep};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const BadgeIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
`;

const BadgeCount = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

const BadgeLabel = styled.span``;

const NoTasksText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const ViewButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.accent.sageSoft};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageSoft};
  }
`;

const ArrowIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.h4};
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['16']};
  gap: ${({ theme }) => theme.space['6']};
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid ${({ theme }) => theme.colors.surface.sunken};
  border-top-color: ${({ theme }) => theme.colors.accent.sage};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['16']};
  gap: ${({ theme }) => theme.space['6']};
`;

const ErrorIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.displaySm};
`;

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.status.danger};
  margin: 0;
  text-align: center;
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.space['4']} ${theme.space['8']}`};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }

  &:active {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['16']};
  gap: ${({ theme }) => theme.space['4']};
`;

const EmptyIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.displaySm};
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyLg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;
