/**
 * Report Alert Modal Component
 *
 * Allows farmers to report issues/problems with a block.
 * Creates an alert that notifies managers and changes block status.
 */

import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { Siren, X, Info, AlertTriangle, Flame, Lightbulb } from 'lucide-react';
import { Button, glassPanel, glassOpaque } from '@a64core/shared';
import { createAlert } from '../../services/alertsApi';
import type { AlertSeverity } from '../../types/alerts';

/** `#rrggbb` -> `rgba(...)`, local to this file. Walks the severity ramp as
 * one hue's (coral, the app's only alert colour) opacity rather than mixing
 * hues — same technique as RoomDetailsModal's contamination severity, so
 * every severity encoding in the app reads the same way (spec §3: gold is
 * never a status colour outside the literal Harvesting phase). */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const theme = useTheme();
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
          <ModalTitle>
            <Siren size={20} strokeWidth={1.6} /> Report Issue
          </ModalTitle>
          <CloseButton onClick={handleClose} disabled={loading} aria-label="Close">
            <X size={20} strokeWidth={2} />
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
              {/* Severity is a data encoding — walked as one hue's (coral,
                  the app's only alert colour) opacity ramp rather than
                  mixing hues, so low -> critical reads as an ordered scale
                  (spec §3: gold is not a status colour). */}
              <SeverityOption
                $selected={severity === 'low'}
                $color={hexToRgba(theme.colors.bright.coral, 0.35)}
                onClick={() => !loading && setSeverity('low')}
              >
                <SeverityIcon $color={hexToRgba(theme.colors.bright.coral, 0.35)}>
                  <Info size={22} strokeWidth={1.6} />
                </SeverityIcon>
                <SeverityLabel>Low</SeverityLabel>
                <SeverityDesc>Minor issue, no urgency</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'medium'}
                $color={hexToRgba(theme.colors.bright.coral, 0.6)}
                onClick={() => !loading && setSeverity('medium')}
              >
                <SeverityIcon $color={hexToRgba(theme.colors.bright.coral, 0.6)}>
                  <AlertTriangle size={22} strokeWidth={1.6} />
                </SeverityIcon>
                <SeverityLabel>Medium</SeverityLabel>
                <SeverityDesc>Needs attention soon</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'high'}
                $color={theme.colors.bright.coral}
                onClick={() => !loading && setSeverity('high')}
              >
                <SeverityIcon $color={theme.colors.bright.coral}>
                  <Flame size={22} strokeWidth={1.6} />
                </SeverityIcon>
                <SeverityLabel>High</SeverityLabel>
                <SeverityDesc>Urgent, act today</SeverityDesc>
              </SeverityOption>

              <SeverityOption
                $selected={severity === 'critical'}
                $color={theme.colors.terracotta[900]}
                onClick={() => !loading && setSeverity('critical')}
              >
                <SeverityIcon $color={theme.colors.terracotta[900]}>
                  <Siren size={22} strokeWidth={1.6} />
                </SeverityIcon>
                <SeverityLabel>Critical</SeverityLabel>
                <SeverityDesc>Emergency, immediate action</SeverityDesc>
              </SeverityOption>
            </SeverityGrid>
          </FormGroup>

          <InfoBox>
            <InfoIcon><Lightbulb size={20} strokeWidth={1.6} /></InfoIcon>
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
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
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
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 20px;
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.3rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.1);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
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
  background: ${({ theme }) => theme.colors.glass.base};
  border-radius: 10px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const BlockLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const BlockName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
`;

const ErrorMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.errorBg};
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
  ${glassOpaque}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 0.2s;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Textarea = styled.textarea`
  ${glassOpaque}
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-family: inherit;
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 120px;
  transition: border-color 0.2s;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CharCount = styled.div`
  text-align: right;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const HelpText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
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
    $selected ? $color : theme.colors.glass.border};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ $selected, $color }) =>
    $selected ? `${$color}26` : 'transparent'};

  &:hover {
    border-color: ${({ $color }) => $color};
    background: ${({ $color }) => `${$color}1a`};
  }
`;

const SeverityIcon = styled.div<{ $color: string }>`
  display: flex;
  justify-content: center;
  color: ${({ $color }) => $color};
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
  color: ${({ theme }) => theme.colors.muted};
`;

const InfoBox = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.infoBg};
  border-left: 3px solid ${({ theme }) => theme.colors.bright.lapis};
  border-radius: 10px;
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const InfoIcon = styled.div`
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.bright.lapis};
`;

const InfoText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  flex-shrink: 0;
`;
