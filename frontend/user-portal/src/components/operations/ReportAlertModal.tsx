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
      <Overlay />
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
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
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
  padding: ${({ theme }) => theme.space['8']};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: ${({ theme }) => theme.fontSizes.h2};
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.2s;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.text.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  padding: ${({ theme }) => theme.space['8']};
  overflow-y: auto;
  flex: 1;
`;

const BlockInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['2']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-bottom: ${({ theme }) => theme.space['6']};
`;

const BlockLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const BlockName = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.status.danger}15`};
  color: ${({ theme }) => theme.colors.status.danger};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-bottom: ${({ theme }) => theme.space['6']};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.space['6']};
`;

const Label = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['2']};
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.status.danger};
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.space['4']};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  transition: border-color 0.2s;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: ${({ theme }) => theme.space['4']};
  font-size: ${({ theme }) => theme.fontSizes.bodyMd};
  font-family: inherit;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  resize: vertical;
  min-height: 120px;
  transition: border-color 0.2s;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    cursor: not-allowed;
  }
`;

const CharCount = styled.div`
  text-align: right;
  font-size: ${({ theme }) => theme.fontSizes.caption};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['1']};
`;

const HelpText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: ${({ theme }) => theme.space['2']};
`;

const SeverityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.space['4']};

  @media (min-width: 640px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

interface SeverityOptionProps {
  $selected: boolean;
  $color: string;
}

const SeverityOption = styled.div<SeverityOptionProps>`
  padding: ${({ theme }) => theme.space['4']};
  border: 2px solid ${({ $selected, $color, theme }) =>
    $selected ? $color : theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
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
  font-size: ${({ theme }) => theme.fontSizes.h2};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const SeverityLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-align: center;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.space['1']};
`;

const SeverityDesc = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const InfoBox = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['4']};
  background: ${({ theme }) => `${theme.colors.accent.sage}10`};
  border-left: 3px solid ${({ theme }) => theme.colors.accent.sage};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-top: ${({ theme }) => theme.space['6']};
`;

const InfoIcon = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.h4};
  flex-shrink: 0;
`;

const InfoText = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.colors.text.primary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const ModalFooter = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['8']};
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;
