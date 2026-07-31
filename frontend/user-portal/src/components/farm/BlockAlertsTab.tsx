/**
 * BlockAlertsTab Component
 *
 * Displays and manages alerts for a block.
 */

import { useState, useEffect } from 'react';
import styled, { type DefaultTheme } from 'styled-components';
import { Plus } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, colorBadge, hexToRgba } from '@a64core/shared';
import { farmApi } from '../../services/farmApi';
import type { Alert, AlertCreate, AlertResolve, AlertSeverity } from '../../types/farm';

// Severity is a distinct vocabulary from the room-phase map (spec §5.2 covers
// document/workflow status, not alert urgency) — extrapolated onto bright.*
// hues rather than reusing `phase.harvesting` gold for non-harvest urgency
// (spec §3: gold is never a status colour except Harvesting). Kept consistent
// with dashboard/ResolveAlertModal.tsx's severity mapping.
function getSeverityColor(theme: DefaultTheme, severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return theme.colors.bright.coral;
    case 'high':
      return theme.colors.bright.terra;
    case 'medium':
      return theme.colors.bright.lapis;
    case 'low':
    default:
      return theme.colors.muted;
  }
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// Primary is this tab's one gold CTA ("Create Alert" / submit); danger is
// coral-tinted glass, never solid red (spec §4 "Buttons").
const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: 1px solid transparent;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
          color: ${theme.colors.onAccent};
          box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
          &:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
          }
        `;
      case 'danger':
        return `
          background: rgba(240, 138, 112, 0.16);
          border-color: rgba(240, 138, 112, 0.45);
          color: ${theme.colors.bright.coral};
          &:hover:not(:disabled) {
            background: rgba(240, 138, 112, 0.26);
          }
        `;
      default:
        return `
          background: transparent;
          color: ${theme.colors.celeste};
          border-color: ${theme.colors.glass.border};
          &:hover:not(:disabled) {
            background: rgba(180, 200, 220, 0.07);
            color: ${theme.colors.textPrimary};
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const AlertsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AlertCard = styled.div<{ $severity: AlertSeverity; $status: string }>`
  ${glassPanel}
  border-width: 2px;
  border-color: ${({ $severity, theme }) => hexToRgba(getSeverityColor(theme, $severity), 0.45)};
  padding: 20px;
  opacity: ${({ $status }) => ($status === 'active' ? 1 : 0.6)};
`;

const AlertHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
`;

const AlertTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

// Severity badge — the §4 badge pattern via colorBadge(): text = severity
// colour, bg = severity 16%, border = severity 45%, glowing dot.
const SeverityBadge = styled.span<{ $severity: AlertSeverity }>`
  ${({ $severity, theme }) => colorBadge(getSeverityColor(theme, $severity))}
`;

const AlertDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 16px 0;
  line-height: 1.6;
`;

const AlertMeta = styled.div`
  ${monoLabel}
  display: flex;
  gap: 16px;
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 12px;
`;

const AlertActions = styled.div`
  display: flex;
  gap: 8px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

// Modal styles — Night Observatory modal recipe (spec §4 "Modals/drawers").
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
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 24px 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  ${monoLabel}
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Input = styled.input`
  ${glassControl}
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Textarea = styled.textarea`
  ${glassControl}
  padding: 12px;
  font-size: 14px;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Select = styled.select`
  ${glassControl}
  padding: 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const ErrorMessage = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.4);
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface BlockAlertsTabProps {
  farmId: string;
  blockId: string;
  onRefresh?: () => void;
}

export function BlockAlertsTab({ farmId, blockId, onRefresh }: BlockAlertsTabProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resolvingAlert, setResolvingAlert] = useState<Alert | null>(null);

  useEffect(() => {
    loadAlerts();
  }, [farmId, blockId]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const response = await farmApi.getBlockAlerts(farmId, blockId, 1, 100);
      setAlerts(response.items);
    } catch (err) {
      console.error('Error loading alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async (data: AlertCreate) => {
    try {
      await farmApi.createBlockAlert(farmId, blockId, data);
      await loadAlerts();
      onRefresh?.();
      setShowCreateModal(false);
    } catch (err) {
      throw err;
    }
  };

  const handleResolveAlert = async (alertId: string, data: AlertResolve) => {
    try {
      await farmApi.resolveBlockAlert(farmId, blockId, alertId, data);
      await loadAlerts();
      onRefresh?.();
      setResolvingAlert(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    if (!confirm('Are you sure you want to dismiss this alert?')) return;

    try {
      await farmApi.dismissBlockAlert(farmId, blockId, alertId);
      await loadAlerts();
      onRefresh?.();
    } catch (err) {
      alert('Failed to dismiss alert');
    }
  };

  if (loading) {
    return <LoadingState>Loading alerts...</LoadingState>;
  }

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const resolvedAlerts = alerts.filter((a) => a.status !== 'active');

  return (
    <Container>
      <Header>
        <Title>{activeAlerts.length} Active Alerts</Title>
        <Button $variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} strokeWidth={2} /> Create Alert
        </Button>
      </Header>

      {alerts.length === 0 ? (
        <EmptyState>
          <p>No alerts for this block</p>
          <p>Create an alert to track issues or important notifications</p>
        </EmptyState>
      ) : (
        <AlertsList>
          {activeAlerts.map((alert) => (
            <AlertCard key={alert.alertId} $severity={alert.severity} $status={alert.status}>
              <AlertHeader>
                <AlertTitle>{alert.title}</AlertTitle>
                <SeverityBadge $severity={alert.severity}>{alert.severity}</SeverityBadge>
              </AlertHeader>
              <AlertDescription>{alert.description}</AlertDescription>
              <AlertMeta>
                <span>Created by: {alert.createdByEmail}</span>
                <span>•</span>
                <span>{farmApi.getRelativeTime(alert.createdAt)}</span>
              </AlertMeta>
              <AlertActions>
                <Button $variant="primary" onClick={() => setResolvingAlert(alert)}>
                  Resolve
                </Button>
                <Button onClick={() => handleDismissAlert(alert.alertId)}>Dismiss</Button>
              </AlertActions>
            </AlertCard>
          ))}

          {resolvedAlerts.length > 0 && (
            <>
              <Title style={{ marginTop: '24px' }}>Resolved Alerts</Title>
              {resolvedAlerts.map((alert) => (
                <AlertCard key={alert.alertId} $severity={alert.severity} $status={alert.status}>
                  <AlertHeader>
                    <AlertTitle>{alert.title}</AlertTitle>
                    <SeverityBadge $severity={alert.severity}>{alert.severity}</SeverityBadge>
                  </AlertHeader>
                  <AlertDescription>{alert.description}</AlertDescription>
                  <AlertMeta>
                    <span>Resolved by: {alert.resolvedByEmail}</span>
                    <span>•</span>
                    <span>{alert.resolvedAt ? farmApi.getRelativeTime(alert.resolvedAt) : 'N/A'}</span>
                  </AlertMeta>
                  {alert.resolutionNotes && (
                    <AlertDescription>
                      <strong>Resolution:</strong> {alert.resolutionNotes}
                    </AlertDescription>
                  )}
                </AlertCard>
              ))}
            </>
          )}
        </AlertsList>
      )}

      {/* Create Alert Modal */}
      {showCreateModal && (
        <CreateAlertModal
          blockId={blockId}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAlert}
        />
      )}

      {/* Resolve Alert Modal */}
      {resolvingAlert && (
        <ResolveAlertModal
          alert={resolvingAlert}
          onClose={() => setResolvingAlert(null)}
          onResolve={(data) => handleResolveAlert(resolvingAlert.alertId, data)}
        />
      )}
    </Container>
  );
}

// ============================================================================
// CREATE ALERT MODAL
// ============================================================================

interface CreateAlertModalProps {
  blockId: string;
  onClose: () => void;
  onCreate: (data: AlertCreate) => Promise<void>;
}

function CreateAlertModal({ blockId, onClose, onCreate }: CreateAlertModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium' as AlertSeverity,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Title and description are required');
      return;
    }

    try {
      setLoading(true);
      await onCreate({
        blockId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        severity: formData.severity,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay>
      <Modal>
        <ModalTitle>Create Alert</ModalTitle>
        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="title">Alert Title *</Label>
            <Input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Pest Infestation Detected"
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="severity">Severity *</Label>
            <Select
              id="severity"
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value as AlertSeverity })}
              required
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the issue or alert..."
              required
            />
          </FormGroup>

          <ButtonGroup>
            <Button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Alert'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}

// ============================================================================
// RESOLVE ALERT MODAL
// ============================================================================

interface ResolveAlertModalProps {
  alert: Alert;
  onClose: () => void;
  onResolve: (data: AlertResolve) => Promise<void>;
}

function ResolveAlertModal({ alert, onClose, onResolve }: ResolveAlertModalProps) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resolutionNotes.trim()) {
      setError('Resolution notes are required');
      return;
    }

    try {
      setLoading(true);
      await onResolve({ resolutionNotes: resolutionNotes.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay>
      <Modal>
        <ModalTitle>Resolve Alert: {alert.title}</ModalTitle>
        <Form onSubmit={handleSubmit}>
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="resolutionNotes">Resolution Notes *</Label>
            <Textarea
              id="resolutionNotes"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe how the issue was resolved..."
              required
            />
          </FormGroup>

          <ButtonGroup>
            <Button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={loading}>
              {loading ? 'Resolving...' : 'Resolve Alert'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
}
