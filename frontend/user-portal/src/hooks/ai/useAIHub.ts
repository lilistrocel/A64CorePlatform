/**
 * useAIHub Hook
 *
 * Manages per-section chat state for the AI Hub page.
 * Accepts a section parameter and resets messages when the section changes.
 *
 * - Only the 'control' section supports write actions (canWrite).
 * - Stores up to the last 18 messages in conversation history sent to the backend.
 * - confirmAction clears pending_action from the originating message after resolution.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { sendAIHubChat, confirmAIHubAction } from '../../services/aiHubApi';
import type { AIHubSection, PendingAction } from '../../types/aiHub';

// ============================================================================
// INTERNAL TYPES
// ============================================================================

export interface AIHubDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending_action?: PendingAction | null;
  tools_used?: string[];
  timestamp: Date;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAIHub(section: AIHubSection) {
  const [messages, setMessages] = useState<AIHubDisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to always have the latest messages available inside async callbacks
  // without needing to include them in the dependency array (avoids stale closure)
  const messagesRef = useRef<AIHubDisplayMessage[]>([]);
  messagesRef.current = messages;

  const prevSectionRef = useRef<AIHubSection | null>(null);

  // Reset conversation when section changes
  useEffect(() => {
    if (prevSectionRef.current !== null && prevSectionRef.current !== section) {
      setMessages([]);
      setError(null);
    }
    prevSectionRef.current = section;
  }, [section]);

  // Only the control section can issue write actions
  const canWrite = section === 'control';

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      setError(null);

      const userMsg: AIHubDisplayMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        // Build history from the ref (which includes the just-added user message)
        const history = messagesRef.current.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const response = await sendAIHubChat({
          section,
          message: text.trim(),
          // History slice excludes the last item since that is the user's message
          // we just sent — the backend will pair it with the assistant reply.
          // We send up to 18 prior messages to stay within the backend limit.
          conversation_history: history.slice(-19, -1),
        });

        const assistantMsg: AIHubDisplayMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message,
          pending_action: response.pending_action,
          tools_used: response.tools_used,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const apiErr = err as {
          response?: { data?: { detail?: string } };
          message?: string;
        };
        const errMsg =
          apiErr?.response?.data?.detail ||
          apiErr?.message ||
          'Failed to send message';
        setError(errMsg);
      } finally {
        setSending(false);
      }
    },
    [section, sending]
  );

  const confirmAction = useCallback(
    async (actionId: string, approved: boolean) => {
      setConfirming(true);
      setError(null);

      try {
        const response = await confirmAIHubAction({
          action_id: actionId,
          approved,
        });

        // Clear pending_action from the originating message, then append result
        setMessages((prev) => {
          const cleared = prev.map((m) =>
            m.pending_action?.action_id === actionId
              ? { ...m, pending_action: null }
              : m
          );
          const resultMsg: AIHubDisplayMessage = {
            id: `confirm-${Date.now()}`,
            role: 'assistant',
            content: response.message,
            timestamp: new Date(),
          };
          return [...cleared, resultMsg];
        });

        return response;
      } catch (err: unknown) {
        const apiErr = err as {
          response?: { data?: { detail?: string } };
          message?: string;
        };
        const errMsg =
          apiErr?.response?.data?.detail ||
          apiErr?.message ||
          'Failed to confirm action';
        setError(errMsg);
        return null;
      } finally {
        setConfirming(false);
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    sending,
    confirming,
    error,
    canWrite,
    sendMessage,
    confirmAction,
    clearMessages,
  };
}
