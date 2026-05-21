/**
 * Task Completion Modal
 *
 * Modal for completing tasks with optional notes and photo uploads.
 * Mobile-optimized for farmer use.
 */

import { useState, useRef } from 'react';
import styled from 'styled-components';
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
          <CloseButton onClick={onClose}>×</CloseButton>
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
                <PhotoIcon>📷</PhotoIcon>
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
                    {submitting ? 'Completing...' : `Complete & Transition`}
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
  background: rgba(0, 0, 0, 0.5);
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
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space['6']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.fontSizes.h1};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.md};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const Content = styled.div`
  padding: ${({ theme }) => theme.space['6']};
  overflow-y: auto;
`;

const TaskInfo = styled.div`
  margin-bottom: ${({ theme }) => theme.space['6']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const TaskTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.space['1']} 0;
`;

const TaskDescription = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  line-height: ${({ theme }) => theme.lineHeights.base};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['6']};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['2']};
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Textarea = styled.textarea`
  padding: ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const PhotoPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space['8']};
  border: 2px dashed ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface.canvas};
`;

const PhotoIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h1};
  margin-bottom: ${({ theme }) => theme.space['2']};
`;

const PhotoText = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.status.danger}15`};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  text-align: center;
`;

const InfoBox = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.accent.sage}15`};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.accent.sageSoft};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  text-align: center;
  line-height: ${({ theme }) => theme.lineHeights.base};

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.accent.sageDeep};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  flex-wrap: wrap;
`;

const CancelButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.sunken};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  flex: 1;
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.status.success};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.status.success};
    filter: brightness(0.9);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TransitionButton = styled.button`
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
  position: relative;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &::before {
    content: '→';
    margin-right: ${({ theme }) => theme.space['1']};
  }
`;
