/**
 * UnsavedChangesDialog Component
 *
 * Modal dialog that warns users about unsaved changes before navigation.
 * Appears when user tries to navigate away from a dirty form.
 */

import { useContext } from 'react';
import styled from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';
import { glassPanel } from '@a64core/shared';

// ============================================================================
// STYLED COMPONENTS
// Night Observatory (T-901 Phase 2, deliverable E) — canonical modal
// treatment: glassPanel at blur 24px over a rgba(10,14,36,.6) cosmos scrim,
// 20px radius. This is one of the two reference modals the phase-3 fleet
// copies (the other is BackupCodesModal.tsx). No shared modal shell existed
// in the repo (grepped `frontend/shared/src/components` for "modal" — no
// hits), so both stay bespoke per-component rather than being routed through
// a new wrapper (adding one is a structural change out of scope for a
// restyle pass).
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  /* Cosmos scrim, spec §4 "Modals/drawers" — retinted from the old
     rgba(0,0,0,.45)-family scrim. This dialog has never closed on backdrop
     click (no onClick here) — preserved as-is. */
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
`;

const Dialog = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 32px;
  max-width: 440px;
  width: 100%;
`;

const IconContainer = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.warningBg};
  color: ${({ theme }) => theme.colors.bright.gold};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const Message = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 24px 0;
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const LeaveButton = styled.button`
  /* Destructive action — coral-b tinted glass, never solid red (spec §4). */
  padding: 10px 20px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function UnsavedChangesDialog() {
  const context = useContext(UnsavedChangesContext);

  if (!context || !context.showDialog) {
    return null;
  }

  return (
    <Overlay>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <IconContainer><AlertTriangle size={24} strokeWidth={1.8} /></IconContainer>
        <Title>You have unsaved changes</Title>
        <Message>
          Are you sure you want to leave this page? Your changes will be lost if you navigate away without saving.
        </Message>
        <Actions>
          <CancelButton onClick={context.cancelNavigation}>
            Cancel
          </CancelButton>
          <LeaveButton onClick={context.confirmNavigation}>
            Leave Page
          </LeaveButton>
        </Actions>
      </Dialog>
    </Overlay>
  );
}
