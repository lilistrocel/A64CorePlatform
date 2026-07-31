import { useState } from 'react';
import styled from 'styled-components';
import { AlertTriangle, Check, Download } from 'lucide-react';
import { glassPanel } from '@a64core/shared';

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
    const codesText = `A20Core - MFA Backup Codes
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
    link.download = 'a20core-backup-codes.txt';
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
            <WarningIcon><AlertTriangle size={20} strokeWidth={1.8} /></WarningIcon>
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
              {copied ? (<><Check size={15} strokeWidth={2} /> Copied!</>) : 'Copy All'}
            </ActionButton>
            <ActionButton onClick={handleDownload}>
              <Download size={15} strokeWidth={1.8} /> Download
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

// Styled Components — Night Observatory (T-901 Phase 2, deliverable E). This
// is the second of the two canonical reference modals (see
// UnsavedChangesDialog.tsx for the "no shared modal shell exists" note). This
// modal's Overlay already closed on backdrop click (gated behind the
// `acknowledged` checkbox) BEFORE this pass — that click-to-close behaviour
// is preserved untouched here; only colours/radius/blur change, per the
// explicit instruction not to alter existing close behaviour in this pass.
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* Cosmos scrim, spec §4 "Modals/drawers" (rgba(10,14,36,.6)). */
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 0.5rem;

  @media (min-width: 480px) {
    padding: 1rem;
  }
`;

const Modal = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 100%;
  max-width: 500px;
  max-height: 100vh;
  overflow-y: auto;

  /* Full-screen on mobile */
  @media (max-width: 479px) {
    max-height: 100vh;
    height: 100%;
    border-radius: 0;
  }

  @media (min-width: 480px) {
    max-height: 90vh;
  }
`;

const ModalHeader = styled.div`
  padding: 1rem 1rem 0;
  text-align: center;

  @media (min-width: 480px) {
    padding: 1.5rem 1.5rem 0;
  }
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;

  @media (min-width: 480px) {
    font-size: 1.5rem;
  }
`;

const ModalBody = styled.div`
  padding: 1rem;

  @media (min-width: 480px) {
    padding: 1.5rem;
  }
`;

const ModalFooter = styled.div`
  padding: 0 1rem 1rem;

  @media (min-width: 480px) {
    padding: 0 1.5rem 1.5rem;
  }
`;

const WarningBanner = styled.div`
  /* Warning banner uses the phase/status warning tint (gold-b at 16%), not
     the rare chrome gold — consistent with spec §1.1 warningBg semantics. */
  background: ${({ theme }) => theme.colors.warningBg};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: 12px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;

  @media (min-width: 480px) {
    padding: 1rem;
    margin-bottom: 1.5rem;
    gap: 0.75rem;
  }
`;

const WarningIcon = styled.span`
  display: flex;
  color: ${({ theme }) => theme.colors.warning};
  flex-shrink: 0;
`;

const WarningText = styled.div`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 0.8125rem;
  line-height: 1.4;

  @media (min-width: 480px) {
    font-size: 0.875rem;
    line-height: 1.5;
  }
`;

const BackupCodesContainer = styled.div`
  background: ${({ theme }) => theme.colors.cosmosDeep};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 12px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;

  @media (min-width: 480px) {
    padding: 1rem;
    margin-bottom: 1rem;
  }
`;

const BackupCodesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.375rem;

  @media (min-width: 360px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
`;

const BackupCode = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  background: ${({ theme }) => theme.colors.glass.base};
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};

  @media (min-width: 480px) {
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
`;

const CodeNumber = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.75rem;
  min-width: 1.25rem;

  @media (min-width: 480px) {
    min-width: 1.5rem;
  }
`;

const CodeValue = styled.span`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 1rem; /* Min 16px for readability on mobile */
  font-weight: 500;
  letter-spacing: 0.25px;

  @media (min-width: 480px) {
    font-size: 0.875rem;
    letter-spacing: 0.5px;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;

  @media (min-width: 360px) {
    flex-direction: row;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  flex: 1;
  min-height: 44px; /* Touch-friendly */
  padding: 0.625rem 1rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;

  @media (min-width: 360px) {
    width: auto;
    min-height: 36px;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const AcknowledgmentSection = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;

  @media (min-width: 480px) {
    gap: 0.75rem;
    padding: 1rem;
  }
`;

const Checkbox = styled.input`
  width: 1.25rem;
  height: 1.25rem;
  min-width: 1.25rem; /* Prevent shrinking */
  margin-top: 0.125rem;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const CheckboxLabel = styled.label`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  line-height: 1.4;

  @media (min-width: 480px) {
    font-size: 0.875rem;
    line-height: 1.5;
  }
`;

const CloseButton = styled.button<{ $acknowledged: boolean }>`
  width: 100%;
  min-height: 44px; /* Touch-friendly */
  padding: 0.75rem;
  /* Primary-CTA gold gradient once acknowledged (spec §4 Buttons) — the
     button is inert/muted glass until the user has checked the box. */
  background: ${({ $acknowledged, theme }) =>
    $acknowledged
      ? `linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]})`
      : theme.colors.glass.base};
  border: 1px solid ${({ $acknowledged, theme }) => ($acknowledged ? 'transparent' : theme.colors.glass.border)};
  border-radius: 10px;
  color: ${({ $acknowledged, theme }) => $acknowledged ? theme.colors.onAccent : theme.colors.muted};
  font-size: 0.875rem;
  font-weight: 700;
  cursor: ${({ $acknowledged }) => $acknowledged ? 'pointer' : 'not-allowed'};
  transition: all 0.2s;

  @media (min-width: 480px) {
    padding: 0.875rem;
    font-size: 1rem;
  }

  &:hover:not(:disabled) {
    background: ${({ $acknowledged, theme }) =>
      $acknowledged
        ? `linear-gradient(145deg, ${theme.colors.secondary[400]}, ${theme.colors.secondary[500]})`
        : theme.colors.glass.base};
  }
`;
