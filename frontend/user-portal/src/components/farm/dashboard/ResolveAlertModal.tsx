/**
 * ResolveAlertModal Component
 *
 * Modal for resolving block alerts with resolution notes.
 */

import { useState } from 'react';
import styled, { type DefaultTheme } from 'styled-components';
import { Siren, Flame, AlertTriangle, Info, Lightbulb, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, colorBadge } from '@a64core/shared';
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
    <Overlay>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Resolve Alert</Title>
          <CloseButton onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </CloseButton>
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
                <SeverityIcon severity={selectedAlert.severity} /> {selectedAlert.title}
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
            <InfoIcon aria-hidden="true"><Lightbulb size={16} strokeWidth={1.6} /></InfoIcon>
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

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  critical: Siren,
  high: Flame,
  medium: AlertTriangle,
  low: Info,
};

function SeverityIcon({ severity }: { severity: string }) {
  const Icon = SEVERITY_ICONS[severity] ?? AlertTriangle;
  return <Icon size={14} strokeWidth={1.8} aria-hidden="true" style={{ verticalAlign: '-2px' }} />;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

// Night Observatory modal recipe (spec §4 "Modals/drawers").
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  padding: 20px;
`;

const ModalContainer = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Title = styled.h2`
  font-size: 20px;
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
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
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
  background: rgba(180, 200, 220, 0.05);
  border-radius: 10px;
`;

const BlockLabel = styled.span`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const BlockValue = styled.span`
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  ${monoLabel}
  display: block;
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const Select = styled.select`
  ${glassControl}
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const AlertDetails = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: ${({ theme }) => theme.colors.warningBg};
  border-left: 4px solid ${({ theme }) => theme.colors.warning};
  border-radius: 10px;
  margin-bottom: 20px;
`;

const AlertTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.warning};
`;

// Severity is a distinct vocabulary from the room-phase map (spec §5.2 covers
// document/workflow status, not alert urgency) — extrapolated onto the same
// bright.* hues rather than reusing `phase.harvesting` gold for non-harvest
// urgency (spec §3: gold is never a status colour except Harvesting). Matches
// BlockAlertsTab.tsx's getSeverityColor.
function getSeverityColor(theme: DefaultTheme, severity: string): string {
  switch (severity) {
    case 'critical':
      return theme.colors.bright.coral;
    case 'high':
      return theme.colors.bright.terra;
    case 'medium':
      return theme.colors.bright.lapis;
    default:
      return theme.colors.muted;
  }
}

// The §4 badge pattern via colorBadge(): text = severity colour, bg =
// severity 16%, border = severity 45%, glowing dot.
const AlertSeverity = styled.span<{ $severity: string }>`
  ${({ $severity, theme }) => colorBadge(getSeverityColor(theme, $severity))}
`;

const Textarea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  transition: all 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const CharCount = styled.div<{ $error?: boolean }>`
  font-size: 12px;
  color: ${(props) => (props.$error ? props.theme.colors.bright.coral : props.theme.colors.muted)};
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
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const CheckboxLabel = styled.label`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  user-select: none;
`;

const InfoNote = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.infoBg};
  border-left: 4px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: 10px;
  margin-bottom: 20px;
`;

const InfoIcon = styled.span`
  display: flex;
  align-items: flex-start;
  color: ${({ theme }) => theme.colors.bright.lapis};
  flex-shrink: 0;
`;

const InfoText = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.onDark};
  line-height: 1.5;
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.errorBg};
  border-left: 4px solid ${({ theme }) => theme.colors.error};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
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
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// The one primary-CTA gold budget item on this view (spec §3) — resolving is
// this modal's single confirming action.
const ResolveButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;
