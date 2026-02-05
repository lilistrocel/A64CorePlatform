/**
 * UnsavedChangesDialog Component
 *
 * Modal dialog that warns users about unsaved changes before navigation.
 * Appears when user tries to navigate away from a dirty form.
 */

import { useContext } from 'react';
import styled from 'styled-components';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';

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
  z-index: 2000;
  padding: 16px;
`;

const Dialog = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 440px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const IconContainer = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #FEF3C7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  font-size: 24px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 8px 0;
`;

const Message = styled.p`
  font-size: 14px;
  color: #616161;
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
  color: #616161;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const LeaveButton = styled.button`
  padding: 10px 20px;
  background: #EF4444;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #DC2626;
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
    <Overlay onClick={context.cancelNavigation}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <IconContainer>&#9888;</IconContainer>
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
