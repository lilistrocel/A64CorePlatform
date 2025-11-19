/**
 * Report Alert Modal Component
 *
 * Allows farmers to report issues/problems with a block.
 * Creates an alert that notifies managers and changes block status.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Button } from '@a64core/shared';
import { createAlert } from '../../services/alertsApi';
import type { AlertSeverity } from '../../types/alerts';

interface ReportAlertModalProps {
  farmId: string;
  blockId: string;
  blockName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReportAlertModal({
  farmId,
  blockId,
  blockName,
  isOpen,
  onClose,
  onSuccess,
}: ReportAlertModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!title.trim()) {
      setError('Please enter an alert title');
      return;
    }

    if (title.trim().length < 3) {
      setError('Alert title must be at least 3 characters');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a description of the issue');
      return;
    }

    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createAlert(farmId, blockId, {
        blockId,
        title: title.trim(),
        description: description.trim(),
        severity,
        alertType: 'manual',
        source: 'operations_task_manager',
      });

      // Reset form
      setTitle('');
      setDescription('');
      setSeverity('medium');

      // Notify parent and close
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to create alert:', err);
      setError(err.response?.data?.detail || 'Failed to report alert. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setDescription('');
      setSeverity('medium');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Overlay onClick={handleClose} />
      <Modal>
        <ModalHeader>
          <ModalTitle>🚨 Report Issue</ModalTitle>
          <CloseButton onClick={handleClose} disabled={loading}>
            ✕
          </CloseButton>
        </ModalHeader>

        <ModalBody>
          <BlockInfo>
            <BlockLabel>Block:</BlockLabel>
            <BlockName>{blockName}</BlockName>
          </BlockInfo>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <FormGroup>
            <Label htmlFor="alert-title">
              Issue Title <Required>*</Required>
            </Label>
            <Input
              id="alert-title"
              type="text"
              placeholder="Brief summary of the problem..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              maxLength={200}
            />
            <CharCount>{title.length}/200</CharCount>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="alert-description">
              Description <Required>*</Required>
            </Label>
            <Textarea
              id="alert-description"
              placeholder="Detailed description of the issue. What did you observe? Where is the problem located? When did you first notice it?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              rows={6}
            />
            <HelpText>Minimum 10 characters. Be as detailed as possible to help managers resolve the issue quickly.</HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="alert-severity">Severity Level</Label>
            <SeverityGrid>
              <SeverityOption
                $selected={severity === 'low'}
                $color="#4CAF50"
                onClick={() => !loading && setSeverity('low')}
              >
                <SeverityIcon>ℹ️</SeverityIcon>
                <SeverityLabel>Low</SeverityLabel>
                <SeverityDesc>Minor issue, no urgency</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'medium'}
                $color="#FF9800"
                onClick={() => !loading && setSeverity('medium')}
              >
                <SeverityIcon>⚠️</SeverityIcon>
                <SeverityLabel>Medium</SeverityLabel>
                <SeverityDesc>Needs attention soon</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'high'}
                $color="#FF5722"
                onClick={() => !loading && setSeverity('high')}
              >
                <SeverityIcon>🔥</SeverityIcon>
                <SeverityLabel>High</SeverityLabel>
                <SeverityDesc>Urgent, act today</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'critical'}
                $color="#F44336"
                onClick={() => !loading && setSeverity('critical')}
              >
                <SeverityIcon>🚨</SeverityIcon>
                <SeverityLabel>Critical</SeverityLabel>
                <SeverityDesc>Emergency, immediate action</SeverityDesc>
              </SeverityOption>
            </SeverityGrid>
          </FormGroup>

          <InfoBox>
            <InfoIcon>💡</InfoIcon>
            <InfoText>
              Reporting this alert will notify managers and change the block status to <strong>ALERT</strong>.
              Managers will be able to assign and resolve the issue.
            </InfoText>
          </InfoBox>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading} fullWidth>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} fullWidth>
            {loading ? 'Reporting...' : 'Report Issue'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  animation: fadeIn 0.2s ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.xl};
  z-index: 1001;
  max-width: 600px;
  width: calc(100% - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translate(-50%, -40%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.2s;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  overflow-y: auto;
  flex: 1;
`;

const BlockInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const BlockLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const BlockName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => `${theme.colors.error}15`};
  color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.error};
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[100]};
    cursor: not-allowed;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  resize: vertical;
  min-height: 120px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[100]};
    cursor: not-allowed;
  }
`;

const CharCount = styled.div`
  text-align: right;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const HelpText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const SeverityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: 640px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

interface SeverityOptionProps {
  $selected: boolean;
  $color: string;
}

const SeverityOption = styled.div<SeverityOptionProps>`
  padding: ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ $selected, $color, theme }) =>
    $selected ? $color : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ $selected, $color }) =>
    $selected ? `${$color}15` : 'transparent'};

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color }) => `${$color}10`};
  }
`;

const SeverityIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SeverityLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  text-align: center;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SeverityDesc = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoBox = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => `${theme.colors.primary[500]}10`};
  border-left: 3px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const InfoIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  flex-shrink: 0;
`;

const InfoText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  }
`;

const ModalFooter = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
`;
