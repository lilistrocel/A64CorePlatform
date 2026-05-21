/**
 * AI Assistant — API Service
 *
 * SSE streaming chat via fetch (axios doesn't support ReadableStream).
 * REST conversation list/delete via the existing apiClient.
 *
 * Auth token is read from localStorage — the same source as the axios
 * interceptor in api.ts.  Division header is also injected for parity.
 */

import { apiClient } from './api';
import type { ConversationSummary } from '../stores/aiAssistant.store';

// ---------------------------------------------------------------------------
// Types matching the backend SSE event shapes
// ---------------------------------------------------------------------------

export interface SSETextEvent {
  type: 'text';
  content: string;
}

export interface SSEToolUseEvent {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

export interface SSEToolResultEvent {
  type: 'tool_result';
  name: string;
  output: unknown;
}

export interface SSEDoneEvent {
  type: 'done';
  conversationId: string;
  costUsd: number;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent =
  | SSETextEvent
  | SSEToolUseEvent
  | SSEToolResultEvent
  | SSEDoneEvent
  | SSEErrorEvent;

export interface ChatRequestPayload {
  message: string;
  conversationId?: string | null;
  context: {
    farm_id?: string | null;
    block_id?: string | null;
    scope: 'global' | 'farm' | 'block';
  };
}

// ---------------------------------------------------------------------------
// Helper: get auth headers from localStorage (same source as api.ts interceptor)
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Mirror division header that axios interceptor injects
  try {
    const raw = localStorage.getItem('division-storage');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { currentDivision?: { divisionId?: string } } };
      const divisionId = parsed?.state?.currentDivision?.divisionId;
      if (divisionId) {
        headers['X-Division-Id'] = divisionId;
      }
    }
  } catch {
    // Non-critical — ignore
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Helper: determine API base URL (same logic as api.ts)
// ---------------------------------------------------------------------------

function getApiBase(): string {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'host.docker.internal') {
      return 'http://host.docker.internal/api';
    }
    return '/api';
  }
  return import.meta.env.VITE_API_URL || '/api';
}

// ---------------------------------------------------------------------------
// SSE streaming chat
// ---------------------------------------------------------------------------

/**
 * Stream a chat request as Server-Sent Events.
 *
 * @param payload   The request body
 * @param onEvent   Callback for each parsed SSE event
 * @param signal    AbortController signal to cancel mid-stream
 */
export async function streamChat(
  payload: ChatRequestPayload,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${getApiBase()}/v1/ai/assistant/chat`;

  const fetchResponse = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      message: payload.message,
      conversation_id: payload.conversationId ?? null,
      context: payload.context,
    }),
    signal,
  });

  if (!fetchResponse.ok) {
    // Non-streaming error (e.g. 401, 500 before stream starts)
    let errMsg = `Request failed (${fetchResponse.status})`;
    try {
      const errData = await fetchResponse.json() as { detail?: string; message?: string };
      errMsg = errData.detail ?? errData.message ?? errMsg;
    } catch {
      // Could not parse JSON body — use default
    }
    onEvent({ type: 'error', message: errMsg });
    return;
  }

  if (!fetchResponse.body) {
    onEvent({ type: 'error', message: 'No response body from server.' });
    return;
  }

  // Parse newline-delimited JSON from the ReadableStream
  const reader = fetchResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines — each complete line is a JSON event
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // The backend sends raw JSON (no "data:" SSE prefix)
        try {
          const event = JSON.parse(trimmed) as SSEEvent;
          onEvent(event);
        } catch {
          // Malformed line — skip silently
        }
      }
    }

    // Handle any remainder in the buffer
    if (buffer.trim()) {
      try {
        const remainderEvent = JSON.parse(buffer.trim()) as SSEEvent;
        onEvent(remainderEvent);
      } catch {
        // Non-JSON tail — ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// REST: List conversations
// ---------------------------------------------------------------------------

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await apiClient.get<ConversationSummary[]>(
    '/v1/ai/assistant/conversations'
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// REST: Delete conversation
// ---------------------------------------------------------------------------

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiClient.delete(`/v1/ai/assistant/conversations/${conversationId}`);
}
