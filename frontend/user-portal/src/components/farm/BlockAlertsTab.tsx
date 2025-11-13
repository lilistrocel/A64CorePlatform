/**
 * BlockAlertsTab Component
 *
 * Displays and manages alerts for a block.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { farmApi } from '../../services/farmApi';
import type { Alert, AlertCreate, AlertResolve, AlertSeverity } from '../../types/farm';

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
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  border: none;

  ${({ $variant }) => {
    switch ($variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          &:hover:not(:disabled) {
            background: #2563eb;
          }
        `;
      case 'danger':
        return `
          background: #ef4444;
          color: white;
          &:hover:not(:disabled) {
            background: #dc2626;
          }
        `;
      default:
        return `
          background: transparent;
          color: #616161;
          border: 1px solid #e0e0e0;
          &:hover:not(:disabled) {
            background: #f5f5f5;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AlertsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AlertCard = styled.div<{ $severity: AlertSeverity; $status: string }>`
  background: white;
  border: 2px solid
    ${({ $severity }) => {
      switch ($severity) {
        case 'critical':
          return '#ef4444';
        case 'high':
          return '#f97316';
        case 'medium':
          return '#eab308';
        case 'low':
          return '#3b82f6';
        default:
          return '#e0e0e0';
      }
    }};
  border-radius: 8px;
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
  font-weight: 600;
  color: #212121;
  margin: 0;
`;

const SeverityBadge = styled.span<{ $severity: AlertSeverity }>`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${({ $severity }) => {
    switch ($severity) {
      case 'critical':
        return '#ef4444';
      case 'high':
        return '#f97316';
      case 'medium':
        return '#eab308';
      case 'low':
        return '#3b82f6';
      default:
        return '#9e9e9e';
    }
  }};
  color: white;
`;

const AlertDescription = styled.p`
  font-size: 14px;
  color: #616161;
  margin: 0 0 16px 0;
  line-height: 1.6;
`;

const AlertMeta = styled.div`
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #9e9e9e;
  margin-bottom: 12px;
`;

const AlertActions = styled.div`
  display: flex;
  gap: 8px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #9e9e9e;
`;

// Modal styles (simplified - reuse from other modals)
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
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #212121;
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
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const Input = styled.input`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const Textarea = styled.textarea`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const Select = styled.select`
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 150ms ease-in-out;

  &:focus {
    outline: none;
    border-color: #3b82f6;
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
  background: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
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
          + Create Alert
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
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
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
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
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
