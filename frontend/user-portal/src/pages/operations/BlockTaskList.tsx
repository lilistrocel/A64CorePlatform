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
  background: ${({ theme }) => theme.colors.neutral[50]};
  padding-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
`;

const BlockInfo = styled.div`
  flex: 1;
`;

const ReportButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background: ${({ theme }) => `${theme.colors.error}15`};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => `${theme.colors.error}25`};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const ReportIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
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

const BlockTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`;

const BlockState = styled.span<{ $state: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
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

const FilterBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const FilterButton = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary[500] : theme.colors.neutral[300])};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primary[500] : theme.colors.surface};
  color: ${({ theme, $active }) => ($active ? 'white' : theme.colors.textPrimary)};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.colors.primary[600] : theme.colors.neutral[100]};
  }
`;

const TaskList = styled.div`
  padding: 0 ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const TaskCard = styled.div<{ $status: string; $overdue?: boolean }>`
  background: ${({ theme, $overdue }) =>
    $overdue ? `${theme.colors.error}08` : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  border: ${({ theme, $overdue }) =>
    $overdue ? `2px solid ${theme.colors.error}` : 'none'};
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
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TaskTypeIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const TaskInfo = styled.div`
  flex: 1;
`;

const TaskTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const TaskType = styled.span<{ $color: string }>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
`;

const TaskStatusBadge = styled.span<{ $color: string }>`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  text-transform: uppercase;
  background: ${({ $color }) => `${$color}15`};
  color: ${({ $color }) => $color};
`;

const OverdueBadge = styled.span`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  text-transform: uppercase;
  background: ${({ theme }) => theme.colors.error};
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
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
`;

const TaskMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const MetaIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
`;

const MetaText = styled.span<{ $overdue?: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme, $overdue }) => ($overdue ? theme.colors.error : theme.colors.textSecondary)};
  font-weight: ${({ theme, $overdue }) =>
    $overdue ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal};
`;

const ActionPrompt = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.primary[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-align: center;
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
  text-align: center;
`;
