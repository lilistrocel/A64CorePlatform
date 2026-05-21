/**
 * useAIAssistant Hook
 *
 * Wires together:
 *   - Zustand AI assistant store (messages, streaming state, panel state)
 *   - Existing auth store (access token)
 *   - Existing farmingYear / division stores for context
 *   - SSE streaming via aiAssistantApi.streamChat
 *   - TanStack Query for conversation list + delete mutation
 *
 * Usage:
 *   const { sendMessage, conversations, deleteConversation, ... } = useAIAssistant();
 */

import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAIAssistantStore, genId } from '../../stores/aiAssistant.store';
import { useAuthStore } from '../../stores/auth.store';
import {
  streamChat,
  listConversations,
  deleteConversation as deleteConversationApi,
  type SSEEvent,
} from '../../services/aiAssistantApi';
import type { ChatMessage, ConversationSummary, ToolCallEntry } from '../../stores/aiAssistant.store';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const AI_ASSISTANT_QUERY_KEYS = {
  conversations: ['ai-assistant', 'conversations'] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAIAssistant() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  // ── Store selectors ──────────────────────────────────────────────────────
  const {
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    currentConversationId,
    setCurrentConversationId,
    messages,
    setMessages,
    addUserMessage,
    addStreamingMessage,
    appendStreamingChunk,
    updateToolCall,
    finalizeMessage,
    markMessageError,
    isStreaming,
    draft,
    setDraft,
    panelError,
    setPanelError,
    startNewConversation,
    removeConversation,
    setConversations,
  } = useAIAssistantStore();

  const { isAuthenticated } = useAuthStore();

  // ── Context derivation ───────────────────────────────────────────────────
  /**
   * Build the context object to send with each message.
   * Reads the currently-selected farm/block from sessionStorage / localStorage
   * if available (set by the FarmDashboard page).
   *
   * We use a lightweight localStorage read rather than importing the farm store
   * directly to avoid circular dependency and keep this hook lean.
   */
  const buildContext = useCallback((): {
    farm_id: string | null;
    block_id: string | null;
    scope: 'global' | 'farm' | 'block';
  } => {
    // The FarmDashboardPage stores the selected farmId in sessionStorage
    // under the key 'selectedFarmId' when the user picks a farm.
    // If not present, we fall back to global scope.
    const farmId = sessionStorage.getItem('selectedFarmId') ?? null;
    const blockId = sessionStorage.getItem('selectedBlockId') ?? null;

    if (farmId && blockId) {
      return { farm_id: farmId, block_id: blockId, scope: 'block' };
    }
    if (farmId) {
      return { farm_id: farmId, block_id: null, scope: 'farm' };
    }
    return { farm_id: null, block_id: null, scope: 'global' };
  }, []);

  // ── Conversation list query ──────────────────────────────────────────────
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<
    ConversationSummary[]
  >({
    queryKey: AI_ASSISTANT_QUERY_KEYS.conversations,
    queryFn: listConversations,
    enabled: isAuthenticated && isPanelOpen,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Keep the Zustand store in sync with React Query data
  // (so components can read from either place)
  if (conversations.length > 0) {
    const storeConvs = useAIAssistantStore.getState().conversations;
    if (JSON.stringify(storeConvs) !== JSON.stringify(conversations)) {
      setConversations(conversations);
    }
  }

  // ── Delete conversation mutation ─────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: deleteConversationApi,
    onSuccess: (_, conversationId) => {
      removeConversation(conversationId);
      queryClient.invalidateQueries({
        queryKey: AI_ASSISTANT_QUERY_KEYS.conversations,
      });
    },
  });

  // ── Select / load a conversation ─────────────────────────────────────────
  /**
   * Switch to an existing conversation.
   * Currently the backend only returns summaries via GET /conversations —
   * there is no "load full history" endpoint in Phase C.
   * We set the conversationId so that the next sendMessage call resumes it.
   * Messages are cleared because we cannot retrieve historical messages
   * without a dedicated endpoint; the user will see history after sending
   * the next message (Claude service loads history on the backend).
   *
   * NOTE: If Phase E adds a GET /conversations/{id}/messages endpoint,
   * update this function to fetch and populate the message list.
   */
  const selectConversation = useCallback(
    (conversationId: string) => {
      setCurrentConversationId(conversationId);
      setMessages([]);
      setPanelError(null);
    },
    [setCurrentConversationId, setMessages, setPanelError]
  );

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const userMsgId = genId();
      const assistantMsgId = genId();

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };
      addUserMessage(userMsg);

      // Add streaming placeholder for assistant
      addStreamingMessage(assistantMsgId);

      const context = buildContext();

      try {
        await streamChat(
          {
            message: text.trim(),
            conversationId: currentConversationId,
            context,
          },
          (event: SSEEvent) => {
            switch (event.type) {
              case 'text':
                appendStreamingChunk(assistantMsgId, event.content);
                break;

              case 'tool_use': {
                const pendingToolCall: ToolCallEntry = {
                  name: event.name,
                  status: 'pending',
                };
                updateToolCall(assistantMsgId, pendingToolCall);
                break;
              }

              case 'tool_result': {
                const resultToolCall: ToolCallEntry = {
                  name: event.name,
                  status: 'done',
                  summary: typeof event.output === 'string'
                    ? event.output
                    : JSON.stringify(event.output).slice(0, 120),
                };
                updateToolCall(assistantMsgId, resultToolCall);
                break;
              }

              case 'done':
                finalizeMessage(
                  assistantMsgId,
                  event.conversationId,
                  event.costUsd
                );
                // Refresh the conversation list to include the new/updated entry
                queryClient.invalidateQueries({
                  queryKey: AI_ASSISTANT_QUERY_KEYS.conversations,
                });
                break;

              case 'error':
                markMessageError(assistantMsgId, event.message);
                break;
            }
          },
          abortRef.current.signal
        );
      } catch (err: unknown) {
        // AbortError is expected when the user closes the panel mid-stream
        if (err instanceof Error && err.name === 'AbortError') {
          markMessageError(assistantMsgId, 'Request cancelled.');
          return;
        }
        markMessageError(
          assistantMsgId,
          'Network error. Please check your connection and try again.'
        );
      }
    },
    [
      isStreaming,
      currentConversationId,
      buildContext,
      addUserMessage,
      addStreamingMessage,
      appendStreamingChunk,
      updateToolCall,
      finalizeMessage,
      markMessageError,
      queryClient,
    ]
  );

  // ── Cancel streaming ─────────────────────────────────────────────────────
  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Exposed API ──────────────────────────────────────────────────────────
  return {
    // Panel control
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,

    // Messaging
    messages,
    isStreaming,
    sendMessage,
    cancelStreaming,

    // Input
    draft,
    setDraft,

    // Conversations
    conversations,
    conversationsLoading,
    currentConversationId,
    selectConversation,
    startNewConversation,
    deleteConversation: deleteMutation.mutate,
    isDeletingConversation: deleteMutation.isPending,

    // Errors
    panelError,
    setPanelError,
  };
}
