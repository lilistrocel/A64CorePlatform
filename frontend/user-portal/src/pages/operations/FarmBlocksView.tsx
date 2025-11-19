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
          {farm.location.city}, {farm.location.state}
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
  background: ${({ theme }) => theme.colors.neutral[50]};
  padding-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.sm} 0;
  margin-bottom: ${({ theme }) => theme.spacing.md};

  &:hover {
    text-decoration: underline;
  }
`;

const BackIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
`;

const FarmTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const FarmLocation = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SummaryIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const SummaryValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SummaryLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BlockList = styled.div`
  padding: 0 ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BlockCard = styled.div<{ $hasTasks: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 4px solid
    ${({ theme, $hasTasks }) => ($hasTasks ? theme.colors.primary[500] : theme.colors.neutral[300])};

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
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const BlockIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
`;

const BlockInfo = styled.div`
  flex: 1;
`;

const BlockName = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const BlockState = styled.span<{ $state: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${({ theme, $state }) => {
    switch ($state) {
      case 'empty':
        return theme.colors.neutral[100];
      case 'planned':
        return `${theme.colors.primary[500]}15`;
      case 'planted':
        return `${theme.colors.success}15`;
      case 'harvesting':
        return `${theme.colors.warning}15`;
      case 'alert':
        return `${theme.colors.error}15`;
      default:
        return theme.colors.neutral[100];
    }
  }};
  color: ${({ theme, $state }) => {
    switch ($state) {
      case 'empty':
        return theme.colors.neutral[700];
      case 'planned':
        return theme.colors.primary[700];
      case 'planted':
        return theme.colors.success;
      case 'harvesting':
        return theme.colors.warning;
      case 'alert':
        return theme.colors.error;
      default:
        return theme.colors.neutral[700];
    }
  }};
`;

const TaskCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TaskBadge = styled.div<{ $status: 'pending' | 'in_progress' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme, $status }) =>
    $status === 'pending' ? `${theme.colors.neutral[500]}15` : `${theme.colors.primary[500]}15`};
  color: ${({ theme, $status }) =>
    $status === 'pending' ? theme.colors.neutral[700] : theme.colors.primary[700]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const BadgeIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
`;

const BadgeCount = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

const BadgeLabel = styled.span``;

const NoTasksText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ViewButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primary[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[100]};
  }
`;

const ArrowIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.lg};
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid ${({ theme }) => theme.colors.neutral[200]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ErrorIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['4xl']};
`;

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
  text-align: center;
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.xl}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:active {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.md};
`;

const EmptyIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['4xl']};
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;
