/**
 * Multi-Level AI Chat Hook
 *
 * Routes messages to the correct API based on scope (global or farm-level).
 * Handles confirmation flow for farm-level scope.
 * Resets conversation when scope changes.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  sendFarmLevelAIChat,
  confirmFarmLevelAIAction,
  sendGlobalAIChat,
} from '../../services/farmApi';
import type {
  ChatMessage,
  PendingAction,
  AIScope,
} from '../../types/farmAI';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending_action?: PendingAction | null;
  tools_used?: string[];
  timestamp: Date;
}

export function useMultiLevelAIChat(scope: AIScope) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevScopeRef = useRef<string>('');

  // Reset conversation when scope changes
  useEffect(() => {
    const scopeKey = scope.level === 'global' ? 'global' : `farm:${scope.farmId}`;
    if (prevScopeRef.current && prevScopeRef.current !== scopeKey) {
      setMessages([]);
      setError(null);
    }
    prevScopeRef.current = scopeKey;
  }, [scope]);

  const canWrite = scope.level === 'farm';

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    setError(null);

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const history: ChatMessage[] = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const requestData = {
        message: text.trim(),
        conversation_history: history.slice(-18),
      };

      let responseMessage: string;
      let pendingAction: PendingAction | null = null;
      let toolsUsed: string[] = [];

      if (scope.level === 'farm') {
        const response = await sendFarmLevelAIChat(scope.farmId, requestData);
        responseMessage = response.message;
        pendingAction = response.pending_action;
        toolsUsed = response.tools_used;
      } else {
        const response = await sendGlobalAIChat(requestData);
        responseMessage = response.message;
        toolsUsed = response.tools_used;
      }

      const assistantMsg: DisplayMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseMessage,
        pending_action: pendingAction,
        tools_used: toolsUsed,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Failed to send message';
      setError(errMsg);
    } finally {
      setSending(false);
    }
  }, [scope, messages, sending]);

  const confirmAction = useCallback(async (actionId: string, approved: boolean) => {
    if (scope.level !== 'farm') return null;

    setConfirming(true);
    setError(null);

    try {
      const response = await confirmFarmLevelAIAction(scope.farmId, {
        action_id: actionId,
        approved,
      });

      const resultMsg: DisplayMessage = {
        id: `confirm-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, resultMsg]);

      // Clear the pending action from the originating message
      setMessages(prev =>
        prev.map(m =>
          m.pending_action?.action_id === actionId
            ? { ...m, pending_action: null }
            : m
        )
      );

      return response;
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Failed to confirm action';
      setError(errMsg);
      return null;
    } finally {
      setConfirming(false);
    }
  }, [scope]);

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
