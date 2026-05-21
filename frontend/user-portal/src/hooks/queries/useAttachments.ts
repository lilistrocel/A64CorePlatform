/**
 * useAttachments.ts
 *
 * TanStack Query hooks for document attachments.
 *
 *   useAttachments(docType, docId, orgId)         — list query
 *   useUploadAttachment()                          — upload mutation
 *   useDeleteAttachment()                          — delete mutation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  type AttachmentDocType,
  type AttachmentMetadata,
} from '../../services/attachmentsService';

// ─── Query key factory ────────────────────────────────────────────────────────

export const attachmentsQueryKeys = {
  all: ['attachments'] as const,
  list: (docType: AttachmentDocType, docId: string, orgId: string) =>
    ['attachments', docType, docId, orgId] as const,
};

// ─── List query ───────────────────────────────────────────────────────────────

/**
 * Fetch all attachments for a specific document.
 * Returns an empty array when the backend endpoint is not yet available (404).
 */
export function useAttachments(
  docType: AttachmentDocType,
  docId: string,
  orgId: string
) {
  return useQuery<AttachmentMetadata[]>({
    queryKey: attachmentsQueryKeys.list(docType, docId, orgId),
    queryFn: () => listAttachments(docType, docId, orgId),
    staleTime: 30_000,
    enabled: Boolean(docId) && Boolean(orgId),
    // Gracefully handle 404 from backend before endpoints ship — return empty array
    retry: (failureCount, error) => {
      const err = error as { response?: { status?: number } };
      if (err?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });
}

// ─── Upload mutation ──────────────────────────────────────────────────────────

interface UploadAttachmentVars {
  docType: AttachmentDocType;
  docId: string;
  orgId: string;
  file: File;
  description?: string;
  onProgress?: (pct: number) => void;
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation<AttachmentMetadata, Error, UploadAttachmentVars>({
    mutationFn: ({ docType, docId, orgId, file, description, onProgress }) =>
      uploadAttachment(docType, docId, orgId, file, description, onProgress),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: attachmentsQueryKeys.list(vars.docType, vars.docId, vars.orgId),
      });
    },
  });
}

// ─── Delete mutation ──────────────────────────────────────────────────────────

interface DeleteAttachmentVars {
  fileId: string;
  orgId: string;
  // Needed to invalidate the correct list query after deletion
  docType: AttachmentDocType;
  docId: string;
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteAttachmentVars>({
    mutationFn: ({ fileId, orgId }) => deleteAttachment(fileId, orgId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: attachmentsQueryKeys.list(vars.docType, vars.docId, vars.orgId),
      });
    },
  });
}
