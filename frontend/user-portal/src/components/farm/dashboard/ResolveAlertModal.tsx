/**
 * ResolveAlertModal Component
 *
 * Modal for resolving block alerts with resolution notes.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { resolveAlert } from '../../../services/alertsApi';
import type { DashboardAlert } from '../../../types/farm';

interface ResolveAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmId: string;
  blockId: string;
  blockName?: string;
  alerts: DashboardAlert[];
  onSuccess: () => void;
}

export function ResolveAlertModal({
  isOpen,
  onClose,
  farmId,
  blockId,
  blockName,
  alerts,
  onSuccess,
}: ResolveAlertModalProps) {
  const [selectedAlertId, setSelectedAlertId] = useState<string>(
    alerts.length > 0 ? alerts[0].alertId : ''
  );
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [restoreBlockStatus, setRestoreBlockStatus] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAlert = alerts.find((a) => a.alertId === selectedAlertId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (resolutionNotes.trim().length < 10) {
      setError('Resolution notes must be at least 10 characters');
      return;
    }

    setResolving(true);

    try {
      await resolveAlert(
        farmId,
        blockId,
        selectedAlertId,
        { resolutionNotes: resolutionNotes.trim() },
        restoreBlockStatus
      );

      // Success - close modal and refresh
      setResolutionNotes('');
      setError(null);
      onClose();
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resolve alert');
    } finally {
      setResolving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Overlay onClick={onClose}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Resolve Alert</Title>
          <CloseButton onClick={onClose}>&times;</CloseButton>
        </Header>

        <Form onSubmit={handleSubmit}>
          {blockName && (
            <BlockInfo>
              <BlockLabel>Block:</BlockLabel>
              <BlockValue>{blockName}</BlockValue>
            </BlockInfo>
          )}

          {/* Alert Selection */}
          {alerts.length > 1 && (
            <FormGroup>
              <Label>Select Alert to Resolve</Label>
              <Select
                value={selectedAlertId}
                onChange={(e) => setSelectedAlertId(e.target.value)}
              >
                {alerts.map((alert) => (
                  <option key={alert.alertId} value={alert.alertId}>
                    {alert.title} ({alert.severity})
                  </option>
                ))}
              </Select>
            </FormGroup>
          )}

          {/* Show selected alert details */}
          {selectedAlert && (
            <AlertDetails>
              <AlertTitle>
                {getSeverityIcon(selectedAlert.severity)} {selectedAlert.title}
              </AlertTitle>
              <AlertSeverity $severity={selectedAlert.severity}>
                {selectedAlert.severity.toUpperCase()}
              </AlertSeverity>
            </AlertDetails>
          )}

          {/* Resolution Notes */}
          <FormGroup>
            <Label>
              Resolution Notes <Required>*</Required>
            </Label>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe how the issue was resolved, what actions were taken, and any follow-up needed..."
              rows={5}
              required
              minLength={10}
            />
            <CharCount $error={resolutionNotes.length > 0 && resolutionNotes.length < 10}>
              {resolutionNotes.length} / 10 characters minimum
            </CharCount>
          </FormGroup>

          {/* Restore Block Status Option */}
          <CheckboxGroup>
            <Checkbox
              type="checkbox"
              id="restoreStatus"
              checked={restoreBlockStatus}
              onChange={(e) => setRestoreBlockStatus(e.target.checked)}
            />
            <CheckboxLabel htmlFor="restoreStatus">
              Restore block to previous status after resolution
            </CheckboxLabel>
          </CheckboxGroup>

          <InfoNote>
            <InfoIcon>💡</InfoIcon>
            <InfoText>
              Resolving this alert will mark it as resolved and record your name and timestamp.
              {restoreBlockStatus &&
                ' If no other active alerts exist, the block status will be restored.'}
            </InfoText>
          </InfoNote>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Actions>
            <CancelButton type="button" onClick={onClose} disabled={resolving}>
              Cancel
            </CancelButton>
            <ResolveButton type="submit" disabled={resolving || resolutionNotes.trim().length < 10}>
              {resolving ? 'Resolving...' : 'Resolve Alert'}
            </ResolveButton>
          </Actions>
        </Form>
      </ModalContainer>
    </Overlay>
  );
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'high':
      return '🔥';
    case 'medium':
      return '⚠️';
    case 'low':
      return 'ℹ️';
    default:
      return '⚠️';
  }
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

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
  padding: 20px;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 28px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

const Form = styled.form`
  padding: 24px;
`;

const BlockInfo = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
`;

const BlockLabel = styled.span`
  font-weight: 600;
  color: #6b7280;
`;

const BlockValue = styled.span`
  color: #111827;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
`;

const Required = styled.span`
  color: #ef4444;
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #111827;
  background: white;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const AlertDetails = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 6px;
  margin-bottom: 20px;
`;

const AlertTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #92400e;
`;

const AlertSeverity = styled.span<{ $severity: string }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: ${(props) => {
    switch (props.$severity) {
      case 'critical':
        return '#fef2f2';
      case 'high':
        return '#fef3c7';
      case 'medium':
        return '#dbeafe';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${(props) => {
    switch (props.$severity) {
      case 'critical':
        return '#dc2626';
      case 'high':
        return '#f59e0b';
      case 'medium':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  }};
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #111827;
  resize: vertical;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const CharCount = styled.div<{ $error?: boolean }>`
  font-size: 12px;
  color: ${(props) => (props.$error ? '#ef4444' : '#6b7280')};
  margin-top: 4px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  user-select: none;
`;

const InfoNote = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
  border-radius: 6px;
  margin-bottom: 20px;
`;

const InfoIcon = styled.span`
  font-size: 16px;
`;

const InfoText = styled.p`
  margin: 0;
  font-size: 13px;
  color: #1e40af;
  line-height: 1.5;
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: #fef2f2;
  border-left: 4px solid #ef4444;
  border-radius: 6px;
  color: #991b1b;
  font-size: 14px;
  margin-bottom: 20px;
`;

const Actions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 10px 20px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ResolveButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  background: #10b981;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: #059669;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
