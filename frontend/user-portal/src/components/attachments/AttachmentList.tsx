/**
 * AttachmentList
 *
 * Reusable component that renders the upload zone and attachment list for any
 * document type (PR, PO, GR, AP, PAYMENT).
 *
 * Props:
 *   docType        — one of the five supported document types
 *   docId          — the document's primary key string
 *   organizationId — org context for all API calls
 *   readOnly       — when true, hides upload zone and delete buttons
 *
 * Download strategy: filenames are rendered as <a href> links that open in a
 * new tab. The browser handles PDF viewing inline and image display inline.
 * The binary stream is never loaded into JS memory.
 *
 * Delete confirmation modal does NOT close on overlay click (project rule).
 *
 * Until backend endpoints ship, the list query returns gracefully (404 → []).
 * Upload and delete will show an inline error; no crash occurs.
 */

import { useRef, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  FileText,
  Image as ImageIcon,
  Trash2,
  UploadCloud,
  X,
  Paperclip,
} from 'lucide-react';
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '../../hooks/queries/useAttachments';
import { getDownloadUrl, type AttachmentDocType, type AttachmentMetadata } from '../../services/attachmentsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttachmentListProps {
  docType: AttachmentDocType;
  docId: string;
  organizationId: string;
  /**
   * When true the upload zone and delete buttons are hidden.
   * The list is always rendered if attachments exist.
   */
  readOnly: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Animations ───────────────────────────────────────────────────────────────

const progressStripe = keyframes`
  0% { background-position: 0 0; }
  100% { background-position: 40px 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── Styled components ────────────────────────────────────────────────────────

const SectionWrapper = styled.section``;

const SectionHeader = styled.div`
  margin-bottom: 6px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 4px;
`;

const HelpText = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 16px;
  line-height: 1.5;
`;

// ── Upload zone ───────────────────────────────────────────────────────────────

const DropZone = styled.div<{ $active: boolean; $hasError: boolean }>`
  border: 2px dashed ${({ theme, $active, $hasError }) =>
    $hasError
      ? (theme.colors.status.danger ?? '#ef4444')
      : $active
        ? theme.colors.accent.sage
        : theme.colors.border.subtle};
  border-radius: 10px;
  padding: 28px 24px;
  text-align: center;
  cursor: pointer;
  background: ${({ theme, $active }) =>
    $active ? theme.colors.accent.sageSoft ?? '#eff6ff' : theme.colors.surface.raised};
  transition: border-color 150ms ease, background 150ms ease;
  user-select: none;

  &:hover {
    border-color: ${({ theme }) => theme.colors.accent.sage};
    background: ${({ theme }) => theme.colors.accent.sageSoft ?? '#eff6ff'};
  }
`;

const DropZoneIcon = styled.div`
  color: ${({ theme }) => theme.colors.accent.sage};
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
`;

const DropZoneText = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: 4px;
`;

const DropZoneSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const HiddenInput = styled.input`
  display: none;
`;

// ── Pending upload row ────────────────────────────────────────────────────────

const PendingUploadBox = styled.div`
  margin-top: 12px;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.colors.surface.raised};
  animation: ${fadeIn} 200ms ease;
`;

const PendingFileName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: 8px;
  word-break: break-all;
`;

const DescriptionInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.surface.canvas ?? theme.colors.surface.raised};
  box-sizing: border-box;
  margin-bottom: 10px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
  &:disabled { opacity: 0.6; }
`;

const PendingActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const UploadButton = styled.button`
  padding: 7px 16px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const CancelPendingButton = styled.button`
  padding: 7px 12px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const WarnText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger ?? '#ef4444'};
  margin-bottom: 8px;
  line-height: 1.4;
`;

// ── Progress bar ──────────────────────────────────────────────────────────────

const ProgressBar = styled.div`
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.surface.sunken};
  overflow: hidden;
  margin-bottom: 8px;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  border-radius: 3px;
  background: repeating-linear-gradient(
    45deg,
    ${({ theme }) => theme.colors.accent.sage},
    ${({ theme }) => theme.colors.accent.sage} 10px,
    ${({ theme }) => theme.colors.accent.sage ?? '#60a5fa'} 10px,
    ${({ theme }) => theme.colors.accent.sage ?? '#60a5fa'} 20px
  );
  background-size: 40px 40px;
  animation: ${progressStripe} 600ms linear infinite;
  transition: width 100ms linear;
`;

// ── Attachment list ───────────────────────────────────────────────────────────

const AttachmentTable = styled.div`
  margin-top: 16px;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  overflow: hidden;
`;

const AttachmentRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  animation: ${fadeIn} 200ms ease;
  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.surface.canvas}; }
`;

const FileIconWrap = styled.div`
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  display: flex;
  align-items: center;
`;

const FileMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.a`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.accent.sageDeep ?? theme.colors.accent.sage};
  text-decoration: none;
  word-break: break-all;
  &:hover { text-decoration: underline; }
`;

const FileDetails = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const FileDescription = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 2px;
  font-style: italic;
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: color 150ms ease, background 150ms ease;
  &:hover {
    color: ${({ theme }) => theme.colors.status.danger ?? '#ef4444'};
    background: #fee2e2;
  }
`;

const EmptyState = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 16px 0 4px;
`;

const InlineError = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.status.danger ?? '#ef4444'};
  margin-top: 8px;
  padding: 8px 12px;
  background: #fee2e2;
  border-radius: 6px;
  line-height: 1.4;
`;

// ── Delete confirm modal ──────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  width: 100%;
  max-width: 400px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ModalTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const ModalCloseButton = styled.button`
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  display: flex;
  align-items: center;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const ModalBody = styled.div`
  padding: 18px 22px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.6;
`;

const ModalFooter = styled.div`
  padding: 10px 22px 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const GhostButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.status.danger ?? '#ef4444'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: #dc2626; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function getFileIcon(mimeType: string) {
  if (isImageMime(mimeType)) return <ImageIcon size={18} />;
  return <FileText size={18} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AttachmentList({
  docType,
  docId,
  organizationId,
  readOnly,
}: AttachmentListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDescription, setPendingDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationWarn, setValidationWarn] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Delete confirm modal state
  const [deletingAttachment, setDeletingAttachment] = useState<AttachmentMetadata | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Query + mutations
  const { data: attachments = [], isLoading, isError } = useAttachments(docType, docId, organizationId);
  const uploadMutation = useUploadAttachment();
  const deleteMutation = useDeleteAttachment();

  // ── File selection / drag drop ─────────────────────────────────────────────

  const handleFileChosen = useCallback((file: File) => {
    setUploadError(null);
    setValidationWarn(null);

    // Client-side size guard
    if (file.size > MAX_SIZE_BYTES) {
      setValidationWarn(
        `${file.name} is ${formatFileSize(file.size)} — exceeds the 10 MB limit. Select a smaller file.`
      );
      return;
    }

    // Warn on unexpected MIME type but still allow (backend will reject if truly invalid)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setValidationWarn(
        `${file.name} has type "${file.type}" which is outside PDF / JPG / PNG / WebP. ` +
        'The server will reject unsupported formats.'
      );
    }

    setPendingFile(file);
    setPendingDescription('');
    setUploadProgress(0);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChosen(file);
    // Reset input value so re-selecting the same file triggers onChange
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChosen(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleZoneClick = () => {
    if (!readOnly) fileInputRef.current?.click();
  };

  // ── Upload submit ──────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploadError(null);
    setUploadProgress(0);

    try {
      await uploadMutation.mutateAsync({
        docType,
        docId,
        orgId: organizationId,
        file: pendingFile,
        description: pendingDescription.trim() || undefined,
        onProgress: setUploadProgress,
      });
      // Reset pending state after success
      setPendingFile(null);
      setPendingDescription('');
      setUploadProgress(0);
      setValidationWarn(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setUploadError(
        axiosErr?.response?.data?.detail ??
        axiosErr?.message ??
        'Upload failed. Please try again.'
      );
    }
  };

  const handleCancelPending = () => {
    setPendingFile(null);
    setPendingDescription('');
    setUploadProgress(0);
    setUploadError(null);
    setValidationWarn(null);
  };

  // ── Delete confirm ─────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deletingAttachment) return;
    setDeleteError(null);

    try {
      await deleteMutation.mutateAsync({
        fileId: deletingAttachment.fileId,
        orgId: organizationId,
        docType,
        docId,
      });
      setDeletingAttachment(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setDeleteError(
        axiosErr?.response?.data?.detail ??
        axiosErr?.message ??
        'Delete failed. Please try again.'
      );
    }
  };

  const handleDeleteModalClose = () => {
    setDeletingAttachment(null);
    setDeleteError(null);
  };

  const isUploading = uploadMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SectionWrapper aria-label="Attachments">
      <SectionHeader>
        <SectionTitle>
          <Paperclip size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Attachments
        </SectionTitle>
      </SectionHeader>
      <HelpText>
        Upload scans, supporting documents, or correspondence (PDF, JPG, PNG, WebP — max 10 MB per file).
      </HelpText>

      {/* Upload zone — only when editable */}
      {!readOnly && (
        <>
          <HiddenInput
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleInputChange}
            aria-label="Select file to attach"
          />
          <DropZone
            $active={isDragOver}
            $hasError={Boolean(validationWarn) && !pendingFile}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleZoneClick}
            role="button"
            tabIndex={0}
            aria-label="Drop file here or click to browse"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleZoneClick(); }}
          >
            <DropZoneIcon>
              <UploadCloud size={28} />
            </DropZoneIcon>
            <DropZoneText>Drop file here or click to browse</DropZoneText>
            <DropZoneSub>PDF, JPG, PNG, WebP — max 10 MB</DropZoneSub>
          </DropZone>

          {/* Validation warning for size / type (before file is staged) */}
          {validationWarn && !pendingFile && (
            <InlineError role="alert">{validationWarn}</InlineError>
          )}

          {/* Staged file awaiting upload */}
          {pendingFile && (
            <PendingUploadBox>
              <PendingFileName>{pendingFile.name}</PendingFileName>

              {validationWarn && (
                <WarnText role="alert">{validationWarn}</WarnText>
              )}

              <DescriptionInput
                type="text"
                placeholder="Description (optional)"
                value={pendingDescription}
                onChange={(e) => setPendingDescription(e.target.value)}
                disabled={isUploading}
                aria-label="Attachment description"
                maxLength={200}
              />

              {isUploading && (
                <ProgressBar aria-label={`Upload progress ${uploadProgress}%`}>
                  <ProgressFill $percent={uploadProgress} />
                </ProgressBar>
              )}

              {uploadError && (
                <InlineError role="alert">{uploadError}</InlineError>
              )}

              <PendingActions>
                <UploadButton
                  onClick={handleUpload}
                  disabled={isUploading}
                  aria-label={isUploading ? 'Uploading…' : `Upload ${pendingFile.name}`}
                >
                  {isUploading ? `Uploading… ${uploadProgress}%` : 'Upload'}
                </UploadButton>
                <CancelPendingButton
                  onClick={handleCancelPending}
                  disabled={isUploading}
                  aria-label="Cancel pending upload"
                >
                  Cancel
                </CancelPendingButton>
              </PendingActions>
            </PendingUploadBox>
          )}
        </>
      )}

      {/* Attachment list */}
      {isLoading && (
        <EmptyState>Loading attachments…</EmptyState>
      )}

      {isError && (
        <EmptyState>Unable to load attachments.</EmptyState>
      )}

      {!isLoading && !isError && attachments.length === 0 && (
        <EmptyState>No attachments yet.</EmptyState>
      )}

      {!isLoading && !isError && attachments.length > 0 && (
        <AttachmentTable role="list" aria-label={`${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}`}>
          {attachments.map((att) => (
            <AttachmentRow key={att.fileId} role="listitem">
              <FileIconWrap aria-hidden="true">
                {getFileIcon(att.mimeType)}
              </FileIconWrap>
              <FileMeta>
                <FileName
                  href={getDownloadUrl(att.fileId, organizationId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Download ${att.originalFilename}`}
                  aria-label={`Download ${att.originalFilename}`}
                >
                  {att.originalFilename}
                </FileName>
                <FileDetails>
                  <span>{formatFileSize(att.sizeBytes)}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>
                    {att.uploadedBy} &middot;{' '}
                    <time dateTime={att.uploadedAt} title={new Date(att.uploadedAt).toLocaleString()}>
                      {formatRelativeTime(att.uploadedAt)}
                    </time>
                  </span>
                </FileDetails>
                {att.description && (
                  <FileDescription>{att.description}</FileDescription>
                )}
              </FileMeta>
              {!readOnly && (
                <DeleteButton
                  onClick={() => setDeletingAttachment(att)}
                  aria-label={`Delete ${att.originalFilename}`}
                  title={`Delete ${att.originalFilename}`}
                >
                  <Trash2 size={16} />
                </DeleteButton>
              )}
            </AttachmentRow>
          ))}
        </AttachmentTable>
      )}

      {/* Delete confirmation modal — does NOT close on overlay click (project rule) */}
      {deletingAttachment && (
        <Overlay>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete Attachment</ModalTitle>
              <ModalCloseButton
                onClick={handleDeleteModalClose}
                aria-label="Close delete confirmation"
              >
                <X size={16} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>
              Delete <strong>{deletingAttachment.originalFilename}</strong>? This cannot be undone.
              {deleteError && (
                <InlineError role="alert" style={{ marginTop: 10, marginBottom: 0 }}>
                  {deleteError}
                </InlineError>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostButton onClick={handleDeleteModalClose} disabled={deleteMutation.isPending}>
                Cancel
              </GhostButton>
              <DangerButton
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                aria-label={`Confirm delete ${deletingAttachment.originalFilename}`}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
    </SectionWrapper>
  );
}
