/**
 * Pending Tasks Warning Modal (Phase 3)
 *
 * Warns users when attempting manual block status transitions
 * while there are pending tasks that would trigger the same transition automatically.
 *
 * Night Observatory (T-901 GAP-FILL, spec §4 "Modals/drawers"): glassPanel at
 * blur 24px over an rgba(10,14,36,.6) scrim, 20px radius, X-only close (this
 * modal never closed on backdrop click — unchanged). Destructive action
 * (force transition) is coral-tinted glass, never solid — spec §4 "Buttons".
 */

import styled from 'styled-components';
import { AlertTriangle, ClipboardList, Lightbulb, X } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';

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
      <Modal role="dialog" aria-modal="true" aria-label="Pending tasks detected">
        <Header>
          <HeaderLeft>
            <WarningIconWrap aria-hidden="true">
              <AlertTriangle size={22} strokeWidth={1.8} />
            </WarningIconWrap>
            <Title>Pending Tasks Detected</Title>
          </HeaderLeft>
          <CloseButton type="button" onClick={onCancel} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </CloseButton>
        </Header>

        <Content>
          <Message>
            You are attempting to manually transition this block to <StatusChip>{formatStatus(targetStatus)}</StatusChip> status.
            However, there {pendingTasks.length === 1 ? 'is' : 'are'} <strong>{pendingTasks.length} pending task{pendingTasks.length === 1 ? '' : 's'}</strong> that will
            automatically trigger this transition when completed.
          </Message>

          <Recommendation>
            <RecommendTitle>
              <Lightbulb size={14} strokeWidth={1.8} />
              Recommended Action
            </RecommendTitle>
            <RecommendText>
              Complete the pending task{pendingTasks.length === 1 ? '' : 's'} below to trigger the automatic transition.
              This ensures proper tracking and workflow continuity.
            </RecommendText>
          </Recommendation>

          <TaskList>
            <TaskListTitle>Pending Tasks</TaskListTitle>
            {pendingTasks.map((task) => (
              <TaskItem key={task.taskId}>
                <TaskIconWrap aria-hidden="true">
                  <ClipboardList size={16} strokeWidth={1.8} />
                </TaskIconWrap>
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
            <WarningTitle>
              <AlertTriangle size={14} strokeWidth={1.8} />
              Warning
            </WarningTitle>
            <WarningText>
              If you force this transition, the pending task{pendingTasks.length === 1 ? '' : 's'} will remain incomplete.
              You should only bypass this warning if you have a specific reason to do so.
            </WarningText>
          </Warning>
        </Content>

        <ButtonGroup>
          <CancelButton onClick={onCancel}>
            Cancel &amp; Review Tasks
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
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Modal = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const WarningIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.warning};
  display: flex;
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: background 150ms, color 150ms;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Message = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: ${({ theme }) => theme.typography.lineHeight.relaxed};
  margin: 0;

  strong {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
    color: ${({ theme }) => theme.colors.warning};
  }
`;

const StatusChip = styled.span`
  display: inline-block;
  padding: 2px 9px;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const Recommendation = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.infoBg};
  border-left: 3px solid ${({ theme }) => theme.colors.bright.lapis};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const RecommendTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const RecommendText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const TaskListTitle = styled.div`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.64rem;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const TaskItem = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const TaskIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.celeste};
  display: flex;
  flex-shrink: 0;
  margin-top: 2px;
`;

const TaskDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const TaskTitle = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const TaskMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const TaskType = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.muted};
  padding: 2px ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.glass.hi};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`;

const TaskSchedule = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
`;

const Warning = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warningBg};
  border-left: 3px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const WarningTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const WarningText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

// Destructive: coral-b tinted glass, never solid red (spec §4 "Buttons").
const ForceButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.error}33;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;
