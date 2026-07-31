/**
 * Add Widget Modal
 *
 * Night Observatory (T-901 GAP-FILL, spec §4 "Modals/drawers"): glassPanel
 * at blur 24px over an rgba(10,14,36,.6) scrim, 20px radius, X-only close.
 * This modal previously closed on overlay click — per the project's standing
 * rule (data-entry/action modals never close on backdrop click), that is
 * removed here too; the X button is the only way out.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { BarChart3, X } from 'lucide-react';
import { glassPanel, monoLabel } from '@a64core/shared';
import { useDashboardStore, WIDGET_CATALOG, WIDGET_ICON_COMPONENTS } from '../../stores/dashboard.store';

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
    <Overlay>
      <Modal role="dialog" aria-modal="true" aria-label="Add widget">
        <ModalHeader>
          <ModalTitle>Add Widget</ModalTitle>
          <CloseBtn onClick={onClose} aria-label="Close add widget dialog">
            <X size={18} strokeWidth={2} />
          </CloseBtn>
        </ModalHeader>

        <ModalBody>
          {availableWidgets.length === 0 ? (
            <EmptyMessage>All available widgets are already on your dashboard.</EmptyMessage>
          ) : (
            <WidgetGrid>
              {availableWidgets.map((widget) => {
                const WidgetIcon = WIDGET_ICON_COMPONENTS[widget.id] ?? BarChart3;
                return (
                <WidgetCard key={widget.id}>
                  <WidgetIconWrap aria-hidden="true">
                    <WidgetIcon size={20} strokeWidth={1.6} />
                  </WidgetIconWrap>
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
                    {adding === widget.id ? 'Adding…' : '+ Add'}
                  </AddButton>
                </WidgetCard>
                );
              })}
            </WidgetGrid>
          )}
        </ModalBody>
      </Modal>
    </Overlay>
  );
}

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
  padding: 20px 24px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.muted};
  padding: 6px;
  border-radius: 8px;
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

const ModalBody = styled.div`
  padding: 20px 24px;
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
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 12px;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: rgba(220, 185, 79, 0.35);
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const WidgetIconWrap = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.glass.hi};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const WidgetInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const WidgetName = styled.div`
  font-size: 0.9375rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const WidgetDesc = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 0.125rem;
`;

const WidgetType = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-top: 0.35rem;
`;

// Secondary/ghost treatment — this is not the view's primary CTA (spec §3
// gold discipline), so it stays glass rather than gold.
const AddButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
  border-radius: 9px;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 2rem 0;
  font-size: 0.9375rem;
`;
