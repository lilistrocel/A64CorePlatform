import { useState } from 'react';
import styled from 'styled-components';

interface BackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  backupCodes: string[];
}

export function BackupCodesModal({ isOpen, onClose, backupCodes }: BackupCodesModalProps) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const handleCopyAll = async () => {
    const codesText = backupCodes.join('\n');
    try {
      await navigator.clipboard.writeText(codesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = codesText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const codesText = `A64 Core Platform - MFA Backup Codes
Generated: ${new Date().toISOString()}
=====================================

${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

=====================================
IMPORTANT: Keep these codes in a secure location.
Each code can only be used once.
If you lose access to your authenticator app, you can use
these codes to sign in to your account.
`;

    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'a64-backup-codes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (acknowledged) {
      onClose();
    }
  };

  return (
    <Overlay onClick={handleClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Your Backup Codes</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <WarningBanner>
            <WarningIcon>&#9888;</WarningIcon>
            <WarningText>
              <strong>Save these codes securely. They will not be shown again.</strong>
              <br />
              Use these codes to sign in if you lose access to your authenticator app.
              Each code can only be used once.
            </WarningText>
          </WarningBanner>

          <BackupCodesContainer>
            <BackupCodesGrid>
              {backupCodes.map((code, index) => (
                <BackupCode key={index}>
                  <CodeNumber>{index + 1}.</CodeNumber>
                  <CodeValue>{code}</CodeValue>
                </BackupCode>
              ))}
            </BackupCodesGrid>
          </BackupCodesContainer>

          <ButtonRow>
            <ActionButton onClick={handleCopyAll}>
              {copied ? '✓ Copied!' : 'Copy All'}
            </ActionButton>
            <ActionButton onClick={handleDownload}>
              ⬇ Download
            </ActionButton>
          </ButtonRow>

          <AcknowledgmentSection>
            <Checkbox
              type="checkbox"
              id="backup-codes-ack"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <CheckboxLabel htmlFor="backup-codes-ack">
              I have saved my backup codes in a secure location
            </CheckboxLabel>
          </AcknowledgmentSection>
        </ModalBody>

        <ModalFooter>
          <CloseButton
            onClick={handleClose}
            disabled={!acknowledged}
            $acknowledged={acknowledged}
          >
            {acknowledged ? 'Done' : 'Please save your codes first'}
          </CloseButton>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}

// Styled Components
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  padding: 1.5rem 1.5rem 0;
  text-align: center;
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const ModalBody = styled.div`
  padding: 1.5rem;
`;

const ModalFooter = styled.div`
  padding: 0 1.5rem 1.5rem;
`;

const WarningBanner = styled.div`
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1.5rem;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
`;

const WarningIcon = styled.span`
  font-size: 1.5rem;
  color: #b45309;
  flex-shrink: 0;
`;

const WarningText = styled.div`
  color: #92400e;
  font-size: 0.875rem;
  line-height: 1.5;
`;

const BackupCodesContainer = styled.div`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
`;

const BackupCodesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
`;

const BackupCode = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Courier New', monospace;
  background: white;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const CodeNumber = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  min-width: 1.5rem;
`;

const CodeValue = styled.span`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.5px;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 0.625rem 1rem;
  background: white;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[600]};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const AcknowledgmentSection = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: ${({ theme }) => theme.colors.neutral[100]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

const Checkbox = styled.input`
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.125rem;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.primary[500]};
`;

const CheckboxLabel = styled.label`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  line-height: 1.5;
`;

const CloseButton = styled.button<{ $acknowledged: boolean }>`
  width: 100%;
  padding: 0.875rem;
  background: ${({ $acknowledged, theme }) =>
    $acknowledged ? theme.colors.primary[500] : theme.colors.neutral[300]};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ $acknowledged }) => $acknowledged ? 'white' : '#666'};
  font-size: 1rem;
  font-weight: 500;
  cursor: ${({ $acknowledged }) => $acknowledged ? 'pointer' : 'not-allowed'};
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${({ $acknowledged, theme }) =>
      $acknowledged ? theme.colors.primary[600] : theme.colors.neutral[300]};
  }
`;
