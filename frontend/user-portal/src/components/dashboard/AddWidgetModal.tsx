import { useState } from 'react';
import styled from 'styled-components';
import { useDashboardStore, WIDGET_CATALOG } from '../../stores/dashboard.store';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWidgetModal({ isOpen, onClose }: AddWidgetModalProps) {
  const { widgets, addWidget } = useDashboardStore();
  const [adding, setAdding] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeWidgetIds = widgets.map(w => w.id);
  const availableWidgets = WIDGET_CATALOG.filter(w => !activeWidgetIds.includes(w.id));

  const handleAddWidget = async (widgetId: string) => {
    setAdding(widgetId);
    await addWidget(widgetId);
    setAdding(null);
    onClose();
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Add Widget</ModalTitle>
          <CloseBtn onClick={onClose} aria-label="Close add widget dialog">&times;</CloseBtn>
        </ModalHeader>

        <ModalBody>
          {availableWidgets.length === 0 ? (
            <EmptyMessage>All available widgets are already on your dashboard.</EmptyMessage>
          ) : (
            <WidgetGrid>
              {availableWidgets.map((widget) => (
                <WidgetCard key={widget.id}>
                  <WidgetIcon>{widget.icon || '📊'}</WidgetIcon>
                  <WidgetInfo>
                    <WidgetName>{widget.title}</WidgetName>
                    <WidgetDesc>{widget.description}</WidgetDesc>
                    <WidgetType>{widget.type === 'chart' ? 'Chart' : 'Stat Card'}</WidgetType>
                  </WidgetInfo>
                  <AddButton
                    onClick={() => handleAddWidget(widget.id)}
                    disabled={adding === widget.id}
                    aria-label={`Add ${widget.title} widget`}
                  >
                    {adding === widget.id ? 'Adding...' : '+ Add'}
                  </AddButton>
                </WidgetCard>
              ))}
            </WidgetGrid>
          )}
        </ModalBody>
      </Modal>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 560px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: 1.5rem;
  overflow-y: auto;
`;

const WidgetGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const WidgetCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[300]};
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const WidgetIcon = styled.div`
  font-size: 2rem;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const WidgetInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const WidgetName = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const WidgetDesc = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 0.125rem;
`;

const WidgetType = styled.div`
  font-size: 0.6875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const AddButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 2rem 0;
  font-size: 0.9375rem;
`;
