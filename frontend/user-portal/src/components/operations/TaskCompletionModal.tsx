/**
 * Task Completion Modal
 *
 * Modal for completing tasks with optional notes and photo uploads.
 * Mobile-optimized for farmer use.
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
import { Camera, X, ArrowRight } from 'lucide-react';
import { glassPanel, glassOpaque } from '@a64core/shared';
import { completeTask } from '../../services/tasksApi';
import type { TaskWithDetails } from '../../types/tasks';

interface TaskCompletionModalProps {
  isOpen: boolean;
  task: TaskWithDetails;
  onClose: () => void;
  onComplete: () => void;
}

export function TaskCompletionModal({ isOpen, task, onClose, onComplete }: TaskCompletionModalProps) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent, triggerTransition: boolean = false) => {
    e.preventDefault();

    // Synchronous ref guard prevents concurrent submissions (double-click protection)
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setSubmitting(true);
      setError(null);

      await completeTask(task.taskId, {
        notes: notes.trim() || undefined,
        photoUrls: [], // Photo upload would be implemented here
        triggerTransition, // Phase 2: Trigger state transition if requested
      });

      onComplete();
    } catch (err) {
      console.error('Failed to complete task:', err);
      setError('Failed to complete task. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Format state name for display (e.g., "growing" -> "GROWING")
  const formatStateName = (state: string) => state.toUpperCase();

  return (
    <Overlay>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Complete Task</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={2} />
          </CloseButton>
        </Header>

        <Content>
          <TaskInfo>
            <TaskTitle>{task.title}</TaskTitle>
            {task.description && <TaskDescription>{task.description}</TaskDescription>}
          </TaskInfo>

          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <Label>Completion Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about completing this task..."
                rows={4}
              />
            </FormGroup>

            {/* Photo upload placeholder - would be implemented with file input */}
            <FormGroup>
              <Label>Photos (Optional)</Label>
              <PhotoPlaceholder>
                <PhotoIcon><Camera size={28} strokeWidth={1.6} /></PhotoIcon>
                <PhotoText>Photo upload coming soon</PhotoText>
              </PhotoPlaceholder>
            </FormGroup>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            {task.triggerStateChange ? (
              // Phase 2: Show two buttons when task can trigger state transition
              <>
                <InfoBox>
                  This task can transition the block to <strong>{formatStateName(task.triggerStateChange)}</strong> state
                  when completed.
                </InfoBox>
                <ButtonGroup>
                  <CancelButton type="button" onClick={onClose} disabled={submitting}>
                    Cancel
                  </CancelButton>
                  <SubmitButton
                    type="button"
                    onClick={(e) => handleSubmit(e, false)}
                    disabled={submitting}
                  >
                    {submitting ? 'Completing...' : 'Complete Task'}
                  </SubmitButton>
                  <TransitionButton
                    type="button"
                    onClick={(e) => handleSubmit(e, true)}
                    disabled={submitting}
                  >
                    {submitting ? (
                      'Completing...'
                    ) : (
                      <>
                        <ArrowRight size={14} strokeWidth={2} /> Complete &amp; Transition
                      </>
                    )}
                  </TransitionButton>
                </ButtonGroup>
              </>
            ) : (
              // Standard single button for tasks without state transition
              <ButtonGroup>
                <CancelButton type="button" onClick={onClose} disabled={submitting}>
                  Cancel
                </CancelButton>
                <SubmitButton type="submit" disabled={submitting}>
                  {submitting ? 'Completing...' : 'Complete Task'}
                </SubmitButton>
              </ButtonGroup>
            )}
          </Form>
        </Content>
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
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Title = styled.h2`
  font-size: 1.3rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
`;

const TaskInfo = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const TaskTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const TaskDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Textarea = styled.textarea`
  ${glassOpaque}
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const PhotoPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  border: 2px dashed ${({ theme }) => theme.colors.line};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.glass.base};
`;

const PhotoIcon = styled.div`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const PhotoText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  text-align: center;
`;

const InfoBox = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.infoBg};
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.bright.lapis}40;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  text-align: center;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};

  strong {
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
    color: ${({ theme }) => theme.colors.bright.lapis};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TransitionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bright.lapis};
  color: ${({ theme }) => theme.colors.onDark};
  border: none;
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
