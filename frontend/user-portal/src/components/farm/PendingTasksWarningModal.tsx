/**
 * Pending Tasks Warning Modal (Phase 3)
 *
 * Warns users when attempting manual block status transitions
 * while there are pending tasks that would trigger the same transition automatically.
 */

import styled from 'styled-components';

interface PendingTask {
  taskId: string;
  title: string;
  taskType: string;
  scheduledDate: string;
}

interface PendingTasksWarningModalProps {
  isOpen: boolean;
  targetStatus: string;
  pendingTasks: PendingTask[];
  onCancel: () => void;
  onForce: () => void;
}

export function PendingTasksWarningModal({
  isOpen,
  targetStatus,
  pendingTasks,
  onCancel,
  onForce,
}: PendingTasksWarningModalProps) {
  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatStatus = (status: string) => {
    return status.toUpperCase();
  };

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <WarningIcon>⚠️</WarningIcon>
          <Title>Pending Tasks Detected</Title>
        </Header>

        <Content>
          <Message>
            You are attempting to manually transition this block to <StatusBadge>{formatStatus(targetStatus)}</StatusBadge> status.
            However, there {pendingTasks.length === 1 ? 'is' : 'are'} <strong>{pendingTasks.length} pending task{pendingTasks.length === 1 ? '' : 's'}</strong> that will
            automatically trigger this transition when completed.
          </Message>

          <Recommendation>
            <RecommendTitle>💡 Recommended Action</RecommendTitle>
            <RecommendText>
              Complete the pending task{pendingTasks.length === 1 ? '' : 's'} below to trigger the automatic transition.
              This ensures proper tracking and workflow continuity.
            </RecommendText>
          </Recommendation>

          <TaskList>
            <TaskListTitle>Pending Tasks:</TaskListTitle>
            {pendingTasks.map((task) => (
              <TaskItem key={task.taskId}>
                <TaskIcon>📋</TaskIcon>
                <TaskDetails>
                  <TaskTitle>{task.title}</TaskTitle>
                  <TaskMeta>
                    <TaskType>{task.taskType}</TaskType>
                    <TaskSchedule>Scheduled: {formatDate(task.scheduledDate)}</TaskSchedule>
                  </TaskMeta>
                </TaskDetails>
              </TaskItem>
            ))}
          </TaskList>

          <Warning>
            <WarningTitle>⚠️ Warning</WarningTitle>
            <WarningText>
              If you force this transition, the pending task{pendingTasks.length === 1 ? '' : 's'} will remain incomplete.
              You should only bypass this warning if you have a specific reason to do so.
            </WarningText>
          </Warning>
        </Content>

        <ButtonGroup>
          <CancelButton onClick={onCancel}>
            Cancel & Review Tasks
          </CancelButton>
          <ForceButton onClick={onForce}>
            Force Transition Anyway
          </ForceButton>
        </ButtonGroup>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndices.modal};
  padding: ${({ theme }) => theme.space['6']};
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.xl};
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  background: ${({ theme }) => `${theme.colors.status.warning}15`};
`;

const WarningIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h1};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.space['6']};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['6']};
`;

const Message = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: ${({ theme }) => theme.lineHeights.loose};
  margin: 0;

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.status.warning};
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: ${({ theme }) => `${theme.space['1']} ${theme.space['2']}`};
  background: ${({ theme }) => `${theme.colors.accent.sage}20`};
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
`;

const Recommendation = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.accent.sage}10`};
  border-left: 4px solid ${({ theme }) => theme.colors.accent.sage};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const RecommendTitle = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['1']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
`;

const RecommendText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  line-height: ${({ theme }) => theme.lineHeights.base};
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['2']};
`;

const TaskListTitle = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const TaskItem = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const TaskIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  flex-shrink: 0;
`;

const TaskDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const TaskTitle = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const TaskMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  flex-wrap: wrap;
`;

const TaskType = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: capitalize;
  padding: ${({ theme }) => `2px ${theme.space['1']}`};
  background: ${({ theme }) => theme.colors.surface.sunken};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const TaskSchedule = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Warning = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.status.warning}10`};
  border-left: 4px solid ${({ theme }) => theme.colors.status.warning};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const WarningTitle = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['1']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
`;

const WarningText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  line-height: ${({ theme }) => theme.lineHeights.base};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['6']};
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const ForceButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.status.warning};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    filter: brightness(0.9);
  }
`;
