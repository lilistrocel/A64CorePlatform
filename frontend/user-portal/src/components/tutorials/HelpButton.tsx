/**
 * HelpButton + TutorialModal
 *
 * Drop `<HelpButton topic="genetics.propagate" />` into any page or modal
 * header. It renders a `?`, opens the tutorial on click, and opens it
 * automatically the first time this user reaches the screen.
 *
 * The auto-open is deliberately narrow: once per topic per user, dismissed
 * state stored server-side, and never while another dialog is already open —
 * interrupting someone mid-form with a tour is worse than them never finding
 * it. `autoOpen={false}` opts a placement out entirely, which is right for
 * tutorials attached to modals, since the modal is itself the interruption.
 */

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  useMarkTutorialSeen,
  useSeenTutorials,
} from '../../hooks/tutorials/useTutorial';
import { getTutorial } from '../../tutorials/registry';
import { Modal } from '../genetics/Modal';
import { Banner, Button, Hint } from '../genetics/styled';

const Trigger = styled.button`
  /* Sits inline inside page headings and modal headers, so it needs to align
     against a much larger font size without dragging the baseline. */
  margin-left: 10px;
  vertical-align: middle;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid ${({ theme }) => theme.colors.neutral[400]};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: all 150ms;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    background: ${({ theme }) => theme.colors.primary[50]};
    color: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const Lead = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const StepItem = styled.li`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`;

const Num = styled.span`
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.primary[600]};
  color: #fff;
`;

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const StepTitle = styled.span`
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepText = styled.span`
  font-size: 13px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProtocolRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
`;

const ProtocolCode = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface HelpButtonProps {
  topic: string;
  /** Set false for tutorials attached to a modal — see module docstring. */
  autoOpen?: boolean;
  label?: string;
}

export function HelpButton({ topic, autoOpen = true, label }: HelpButtonProps) {
  const tutorial = getTutorial(topic);
  const { data: seen, isLoading } = useSeenTutorials();
  const markSeen = useMarkTutorialSeen();
  const [open, setOpen] = useState(false);
  const [autoConsidered, setAutoConsidered] = useState(false);

  useEffect(() => {
    if (!autoOpen || isLoading || autoConsidered || !tutorial) return;

    // Decide once, so a later refetch cannot re-open a tour mid-task.
    setAutoConsidered(true);

    // Never stack on top of a blocking modal: being interrupted part-way
    // through a form is worse than not discovering the tutorial.
    //
    // Tested via data-blocking-modal rather than role=dialog, because the AI
    // assistant panel is permanently mounted with role="dialog" — a role check
    // reports a dialog on every screen and silently suppresses every tutorial.
    if (document.querySelector('[data-blocking-modal="true"]')) return;

    if (!(seen ?? []).includes(topic)) setOpen(true);
  }, [autoOpen, isLoading, autoConsidered, seen, topic, tutorial]);

  // An unknown topic is a developer mistake, not a user-facing state — render
  // nothing rather than a button that opens an empty box.
  if (!tutorial) return null;

  const dismiss = () => {
    setOpen(false);
    if (!(seen ?? []).includes(topic)) markSeen.mutate(topic);
  };

  return (
    <>
      <Trigger
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? `How ${tutorial.title} works`}
        title={label ?? `How ${tutorial.title} works`}
      >
        ?
      </Trigger>

      {open && (
        <Modal
          title={tutorial.title}
          subtitle={undefined}
          width="600px"
          onClose={dismiss}
          footer={
            <>
              <Button type="button" $variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="button" onClick={dismiss}>
                Got it
              </Button>
            </>
          }
        >
          <Lead>{tutorial.lead}</Lead>

          <StepList>
            {tutorial.steps.map((s, i) => (
              <StepItem key={s.title}>
                <Num>{i + 1}</Num>
                <StepBody>
                  <StepTitle>{s.title}</StepTitle>
                  <StepText>{s.body}</StepText>
                </StepBody>
              </StepItem>
            ))}
          </StepList>

          {tutorial.watchOut && <Banner $tone="warning">{tutorial.watchOut}</Banner>}

          {tutorial.protocols && tutorial.protocols.length > 0 && (
            <ProtocolRow>
              <Hint>Related procedures:</Hint>
              {tutorial.protocols.map((code) => (
                <ProtocolCode key={code}>{code}</ProtocolCode>
              ))}
            </ProtocolRow>
          )}

          <Hint>
            “Got it” hides this from your account. “Close” leaves it to reappear next
            time. The <strong>?</strong> in the header reopens it either way.
          </Hint>
        </Modal>
      )}
    </>
  );
}
