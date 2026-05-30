/**
 * attachmentsService.ts
 *
 * HTTP layer for the attachments API.
 *
 * Endpoints:
 *   POST   /api/v1/attachments/{docType}/{docId}?organization_id={org}
 *   GET    /api/v1/attachments/{docType}/{docId}?organization_id={org}
 *   GET    /api/v1/attachments/file/{fileId}?organization_id={org}  — streaming (URL only)
 *   DELETE /api/v1/attachments/file/{fileId}?organization_id={org}
 *
 * Download note: getDownloadUrl() returns a URL string — never fetches the binary
 * into JS memory. Callers open a new tab or use a hidden <a> element.
 */

import { apiClient } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

// AR_INVOICE added in T-200.0 (Wave 3 sales UI).
// CUSTOMER_RECEIPT added in T-200.1 (Wave 3 sales UI).
// QUOTE added in T-200.3 (Wave 3 sales UI).
// Backend endpoints to be wired in follow-up attachment tasks —
// the component handles 404 gracefully (shows empty list, no crash).
export type AttachmentDocType = 'PR' | 'PO' | 'GR' | 'AP' | 'PAYMENT' | 'AR_INVOICE' | 'CUSTOMER_RECEIPT' | 'QUOTE';

export interface AttachmentMetadata {
  fileId: string;
  organizationId: string;
  docType: AttachmentDocType;
  docId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface SuccessResponse<T> {
  data: T;
  message?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Upload a file attachment to a document.
 * Axios automatically sets Content-Type to multipart/form-data when passed a FormData instance.
 */
export async function uploadAttachment(
  docType: AttachmentDocType,
  docId: string,
  orgId: string,
  file: File,
  description?: string,
  onUploadProgress?: (percentCompleted: number) => void
): Promise<AttachmentMetadata> {
  const formData = new FormData();
  formData.append('file', file);
  if (description) {
    formData.append('description', description);
  }

  const response = await apiClient.post<SuccessResponse<AttachmentMetadata>>(
    `/v1/attachments/${docType}/${docId}`,
    formData,
    {
      params: { organization_id: orgId },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(pct);
        }
      },
    }
  );

  return response.data.data;
}

/**
 * List all attachments for a document.
 */
export async function listAttachments(
  docType: AttachmentDocType,
  docId: string,
  orgId: string
): Promise<AttachmentMetadata[]> {
  const response = await apiClient.get<SuccessResponse<AttachmentMetadata[]>>(
    `/v1/attachments/${docType}/${docId}`,
    { params: { organization_id: orgId } }
  );
  return response.data.data;
}

/**
 * Returns the URL that streams the file with proper Content-Disposition headers.
 * Do NOT fetch this URL into JS memory — use it in a new tab or <a href> link.
 *
 * The token is injected into the URL as a query param so the browser can open
 * it directly without needing an Authorization header on the binary request.
 */
export function getDownloadUrl(fileId: string, orgId: string): string {
  const token = localStorage.getItem('accessToken') ?? '';
  const base = window.location.hostname === 'host.docker.internal'
    ? 'http://host.docker.internal/api'
    : '/api';
  const params = new URLSearchParams({ organization_id: orgId, token });
  return `${base}/v1/attachments/file/${fileId}?${params.toString()}`;
}

/**
 * Delete a file attachment by fileId.
 */
export async function deleteAttachment(fileId: string, orgId: string): Promise<void> {
  await apiClient.delete(`/v1/attachments/file/${fileId}`, {
    params: { organization_id: orgId },
  });
}
