/**
 * AI Assistant — Zustand Store
 *
 * Manages:
 *   - Panel open/close state
 *   - Current conversation ID
 *   - Message list (one per conversation session)
 *   - Streaming state (isStreaming flag + incremental text accumulation)
 *   - Draft input text
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant';

export interface ToolCallEntry {
  name: string;
  status: 'pending' | 'done';
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallEntry[];
  costUsd?: number;
  isStreaming?: boolean;
  isError?: boolean;
  timestamp: number;
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  updatedAt: string;
  message_count: number;
}

interface AIAssistantState {
  // Panel visibility
  isPanelOpen: boolean;

  // Conversation management
  currentConversationId: string | null;
  conversations: ConversationSummary[];
  messages: ChatMessage[];

  // Streaming state
  isStreaming: boolean;

  // Input draft
  draft: string;

  // Error state for the panel-level error (not per-message)
  panelError: string | null;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  setCurrentConversationId: (id: string | null) => void;
  setConversations: (conversations: ConversationSummary[]) => void;

  /** Replace entire message list (e.g. when switching conversations) */
  setMessages: (messages: ChatMessage[]) => void;

  /** Append a complete user message */
  addUserMessage: (message: ChatMessage) => void;

  /** Append a new streaming-in-progress assistant placeholder */
  addStreamingMessage: (id: string) => void;

  /** Append a text chunk to the currently-streaming message */
  appendStreamingChunk: (id: string, chunk: string) => void;

  /** Add or update a tool call on the currently-streaming message */
  updateToolCall: (messageId: string, toolCall: ToolCallEntry) => void;

  /** Finalize the streaming message — clear isStreaming flag, attach costUsd */
  finalizeMessage: (id: string, conversationId: string, costUsd?: number) => void;

  /** Mark the streaming message as errored */
  markMessageError: (id: string, errorText: string) => void;

  setStreaming: (isStreaming: boolean) => void;
  setDraft: (draft: string) => void;
  setPanelError: (error: string | null) => void;

  /** Start a brand-new conversation — clears messages and conversation ID */
  startNewConversation: () => void;

  /** Remove a conversation from the local list after deletion */
  removeConversation: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let msgCounter = 0;
function genId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export const useAIAssistantStore = create<AIAssistantState>((set) => ({
  isPanelOpen: false,
  currentConversationId: null,
  conversations: [],
  messages: [],
  isStreaming: false,
  draft: '',
  panelError: null,

  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),

  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  setConversations: (conversations) => set({ conversations }),

  setMessages: (messages) => set({ messages }),

  addUserMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  addStreamingMessage: (id) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'assistant',
          content: '',
          toolCalls: [],
          isStreaming: true,
          timestamp: Date.now(),
        },
      ],
      isStreaming: true,
    })),

  appendStreamingChunk: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m
      ),
    })),

  updateToolCall: (messageId, toolCall) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.toolCalls ?? [];
        const idx = existing.findIndex((t) => t.name === toolCall.name);
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = toolCall;
          return { ...m, toolCalls: updated };
        }
        return { ...m, toolCalls: [...existing, toolCall] };
      }),
    })),

  finalizeMessage: (id, conversationId, costUsd) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false, costUsd } : m
      ),
      isStreaming: false,
      currentConversationId: conversationId,
    })),

  markMessageError: (id, errorText) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, content: errorText, isStreaming: false, isError: true }
          : m
      ),
      isStreaming: false,
    })),

  setStreaming: (isStreaming) => set({ isStreaming }),
  setDraft: (draft) => set({ draft }),
  setPanelError: (panelError) => set({ panelError }),

  startNewConversation: () =>
    set({ messages: [], currentConversationId: null, panelError: null }),

  removeConversation: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.filter(
        (c) => c.conversationId !== conversationId
      ),
      // If we just deleted the active conversation, clear it
      currentConversationId:
        s.currentConversationId === conversationId
          ? null
          : s.currentConversationId,
      messages:
        s.currentConversationId === conversationId ? [] : s.messages,
    })),
}));

// Convenience ID generator exported so components can create message IDs
export { genId };
