/**
 * Block Task List Page
 *
 * Shows all tasks for a specific block with filtering and actions.
 * Mobile-first design for farmers to complete tasks.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { getBlock } from '../../services/farmApi';
import { getBlockTasks } from '../../services/tasksApi';
import { TaskCompletionModal } from '../../components/operations/TaskCompletionModal';
import { HarvestEntryModal } from '../../components/operations/HarvestEntryModal';
import { ReportAlertModal } from '../../components/operations/ReportAlertModal';
import type { Block } from '../../types/farm';
import type { TaskWithDetails, TaskStatus, TaskType } from '../../types/tasks';
import {
  TASK_TYPE_COLORS,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_STATUS_COLORS,
  TASK_STATUS_LABELS,
} from '../../types/tasks';

/**
 * Check if a task is overdue based on scheduledDate
 */
function isTaskOverdue(task: TaskWithDetails): boolean {
  if (!task.scheduledDate || task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  const scheduledDate = new Date(task.scheduledDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  return scheduledDate < today;
}

export function BlockTaskList() {
  const navigate = useNavigate();
  const { farmId, blockId } = useParams<{ farmId: string; blockId: string }>();
  const [block, setBlock] = useState<Block | null>(null);
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus>('pending');
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (farmId && blockId) {
      loadBlockAndTasks();
    }
  }, [farmId, blockId]);

  const loadBlockAndTasks = async () => {
    if (!farmId || !blockId) return;

    try {
      setLoading(true);
      setError(null);

      const [blockData, tasksResponse] = await Promise.all([
        getBlock(farmId, blockId),
        getBlockTasks(blockId, { page: 1, perPage: 100 }),
      ]);

      setBlock(blockData);
      setTasks(tasksResponse.items);
    } catch (err) {
      console.error('Failed to load block and tasks:', err);
      setError('Failed to load tasks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate(`/operations/${farmId}`);
  };

  const handleTaskClick = (task: TaskWithDetails) => {
    setSelectedTask(task);

    if (task.taskType === 'daily_harvest' && task.status !== 'completed') {
      setShowHarvestModal(true);
    } else if (task.status === 'pending' || task.status === 'in_progress') {
      setShowCompletionModal(true);
    }
  };

  const handleTaskComplete = () => {
    setShowCompletionModal(false);
    setShowHarvestModal(false);
    setSelectedTask(null);
    loadBlockAndTasks();
  };

  const handleAlertReported = () => {
    loadBlockAndTasks(); // Reload to update block status if it changed to ALERT
  };

  const filteredTasks = tasks.filter((task) => task.status === statusFilter);

  const statusCounts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingText>Loading tasks...</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  if (error || !block) {
    return (
      <Container>
        <ErrorContainer>
          <ErrorIcon>❌</ErrorIcon>
          <ErrorText>{error || 'Block not found'}</ErrorText>
          <RetryButton onClick={loadBlockAndTasks}>Retry</RetryButton>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton onClick={handleBackClick}>
          <BackIcon>←</BackIcon>
          Back to Blocks
        </BackButton>
        <HeaderRow>
          <BlockInfo>
            <BlockTitle>{block.name}</BlockTitle>
            <BlockState $state={block.state}>{block.state.toUpperCase()}</BlockState>
          </BlockInfo>
          <ReportButton onClick={() => setShowReportModal(true)}>
            <ReportIcon>🚨</ReportIcon>
            Report Issue
          </ReportButton>
        </HeaderRow>
      </Header>

      {/* Status Filter */}
      <FilterBar>
        <FilterButton
          $active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        >
          Pending ({statusCounts.pending})
        </FilterButton>
        <FilterButton
          $active={statusFilter === 'completed'}
          onClick={() => setStatusFilter('completed')}
        >
          Done ({statusCounts.completed})
        </FilterButton>
      </FilterBar>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <EmptyContainer>
          <EmptyIcon>✅</EmptyIcon>
          <EmptyText>No {statusFilter} tasks</EmptyText>
        </EmptyContainer>
      ) : (
        <TaskList>
          {filteredTasks.map((task) => {
            const overdue = isTaskOverdue(task);
            return (
              <TaskCard
                key={task.taskId}
                onClick={() => handleTaskClick(task)}
                $status={task.status}
                $overdue={overdue}
              >
                <TaskHeader>
                  <TaskTypeIcon>{TASK_TYPE_ICONS[task.taskType]}</TaskTypeIcon>
                  <TaskInfo>
                    <TaskTitle>{task.title}</TaskTitle>
                    <TaskType $color={TASK_TYPE_COLORS[task.taskType]}>
                      {TASK_TYPE_LABELS[task.taskType]}
                    </TaskType>
                  </TaskInfo>
                  {overdue ? (
                    <OverdueBadge>⚠️ OVERDUE</OverdueBadge>
                  ) : (
                    <TaskStatusBadge $color={TASK_STATUS_COLORS[task.status]}>
                      {TASK_STATUS_LABELS[task.status]}
                    </TaskStatusBadge>
                  )}
                </TaskHeader>

                {task.description && <TaskDescription>{task.description}</TaskDescription>}

                <TaskMeta>
                  {task.scheduledDate && (
                    <MetaItem>
                      <MetaIcon>📅</MetaIcon>
                      <MetaText $overdue={overdue}>
                        Scheduled: {new Date(task.scheduledDate).toLocaleDateString()}
                        {overdue && ' (overdue)'}
                      </MetaText>
                    </MetaItem>
                  )}
                  {task.assignedToName && (
                    <MetaItem>
                      <MetaIcon>👤</MetaIcon>
                      <MetaText>{task.assignedToName}</MetaText>
                    </MetaItem>
                  )}
                  {task.dueDate && (
                    <MetaItem>
                      <MetaIcon>⏰</MetaIcon>
                      <MetaText>{new Date(task.dueDate).toLocaleDateString()}</MetaText>
                    </MetaItem>
                  )}
                </TaskMeta>

                {(task.status === 'pending' || task.status === 'in_progress') && (
                  <ActionPrompt>
                    {task.taskType === 'daily_harvest'
                      ? 'Tap to record harvest'
                      : 'Tap to complete task'}
                  </ActionPrompt>
                )}
              </TaskCard>
            );
          })}
        </TaskList>
      )}

      {/* Modals */}
      {selectedTask && (
        <>
          <TaskCompletionModal
            isOpen={showCompletionModal}
            task={selectedTask}
            onClose={() => {
              setShowCompletionModal(false);
              setSelectedTask(null);
            }}
            onComplete={handleTaskComplete}
          />
          <HarvestEntryModal
            isOpen={showHarvestModal}
            task={selectedTask}
            onClose={() => {
              setShowHarvestModal(false);
              setSelectedTask(null);
            }}
            onComplete={handleTaskComplete}
          />
        </>
      )}

      {/* Report Alert Modal */}
      {farmId && blockId && block && (
        <ReportAlertModal
          isOpen={showReportModal}
          farmId={farmId}
          blockId={blockId}
          blockName={block.name}
          onClose={() => setShowReportModal(false)}
          onSuccess={handleAlertReported}
        />
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

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space['4']};
`;

const BlockInfo = styled.div`
  flex: 1;
`;

const ReportButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
  padding: ${({ theme }) => `${theme.space['2']} ${theme.space['4']}`};
  background: ${({ theme }) => `${theme.colors.status.danger}15`};
  color: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => `${theme.colors.status.danger}25`};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const ReportIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
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

const BlockTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.h2};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['2']} 0;
`;

const BlockState = styled.span<{ $state: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['4']}`};
  border-radius: ${({ theme }) => theme.radii.pill};
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

const FilterBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['2']};
  padding: ${({ theme }) => theme.space['6']};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: ${({ theme }) => `${theme.space['2']} ${theme.space['4']}`};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.accent.sage : theme.colors.border.subtle)};
  border-radius: ${({ theme }) => theme.radii.pill};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.accent.sage : theme.colors.surface.raised};
  color: ${({ theme, $active }) => ($active ? 'white' : theme.colors.text.primary)};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.colors.accent.sageDeep : theme.colors.surface.raised};
  }
`;

const TaskList = styled.div`
  padding: 0 ${({ theme }) => theme.space['6']};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['4']};
`;

const TaskCard = styled.div<{ $status: string; $overdue?: boolean }>`
  background: ${({ theme, $overdue }) =>
    $overdue ? `${theme.colors.status.danger}08` : theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.space['6']};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border: ${({ theme, $overdue }) =>
    $overdue ? `2px solid ${theme.colors.status.danger}` : 'none'};
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: ${({ $status }) => ($status === 'completed' || $status === 'cancelled' ? 0.7 : 1)};

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const TaskHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space['4']};
  margin-bottom: ${({ theme }) => theme.space['4']};
`;

const TaskTypeIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h2};
`;

const TaskInfo = styled.div`
  flex: 1;
`;

const TaskTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const TaskType = styled.span<{ $color: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['2']}`};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
`;

const TaskStatusBadge = styled.span<{ $color: string }>`
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['2']}`};
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
`;

const OverdueBadge = styled.span`
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['2']}`};
  border-radius: ${({ theme }) => theme.radii.pill};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  text-transform: uppercase;
  background: ${({ theme }) => theme.colors.status.danger};
  color: white;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
`;

const TaskDescription = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 ${({ theme }) => theme.space['4']} 0;
  line-height: ${({ theme }) => theme.lineHeights.base};
`;

const TaskMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space['4']};
  margin-bottom: ${({ theme }) => theme.space['2']};
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['1']};
`;

const MetaIcon = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
`;

const MetaText = styled.span<{ $overdue?: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme, $overdue }) => ($overdue ? theme.colors.status.danger : theme.colors.text.secondary)};
  font-weight: ${({ theme, $overdue }) =>
    $overdue ? theme.fontWeights.semibold : theme.fontWeights.regular};
`;

const ActionPrompt = styled.div`
  padding: ${({ theme }) => theme.space['2']};
  background: ${({ theme }) => theme.colors.accent.sageSoft};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  text-align: center;
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
  text-align: center;
`;
