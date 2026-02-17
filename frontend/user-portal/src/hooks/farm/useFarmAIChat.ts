/**
 * Farm AI Chat Hook
 *
 * Manages chat state, message sending, and action confirmation
 * for the Farm AI assistant.
 */

import { useState, useCallback } from 'react';
import { sendFarmAIChat, confirmFarmAIAction } from '../../services/farmApi';
import type {
  ChatMessage,
  FarmAIChatResponse,
  PendingAction,
  GrowthStageInfo,
} from '../../types/farmAI';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending_action?: PendingAction | null;
  tools_used?: string[];
  timestamp: Date;
}

export function useFarmAIChat(farmId: string, blockId: string) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [growthStage, setGrowthStage] = useState<GrowthStageInfo | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    setError(null);

    // Add user message to display
    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      // Build conversation history from existing messages (exclude pending action metadata)
      const history: ChatMessage[] = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response: FarmAIChatResponse = await sendFarmAIChat(farmId, blockId, {
        message: text.trim(),
        conversation_history: history.slice(-18), // Keep last 18 + new = 19 < 20 limit
      });

      // Add assistant response
      const assistantMsg: DisplayMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        pending_action: response.pending_action,
        tools_used: response.tools_used,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Update growth stage if returned
      if (response.growth_stage) {
        setGrowthStage(response.growth_stage);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Failed to send message';
      setError(errMsg);
    } finally {
      setSending(false);
    }
  }, [farmId, blockId, messages, sending]);

  const confirmAction = useCallback(async (actionId: string, approved: boolean) => {
    setConfirming(true);
    setError(null);

    try {
      const response = await confirmFarmAIAction(farmId, blockId, {
        action_id: actionId,
        approved,
      });

      // Add result as a system-like assistant message
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
  }, [farmId, blockId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    sending,
    confirming,
    error,
    growthStage,
    sendMessage,
    confirmAction,
    clearMessages,
  };
}
