/**
 * useAIAnalytics Hook
 *
 * Custom hook for interacting with AI Analytics chat API.
 * Manages conversation history, loading states, and error handling.
 */

import { useState, useCallback } from 'react';
import { apiClient } from '../../services/api';
import type {
  AIAnalyticsResponse,
  AIAnalyticsChatRequest,
  ChatMessage,
  ConversationMessage,
} from '../../types/analytics';

interface UseAIAnalyticsReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: Error | null;
  sendMessage: (prompt: string, forceRefresh?: boolean) => Promise<void>;
  clearHistory: () => void;
}

/**
 * Send a query to the AI Analytics API and manage conversation history
 */
export function useAIAnalytics(): UseAIAnalyticsReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (prompt: string, forceRefresh: boolean = false) => {
      if (!prompt.trim()) {
        setError(new Error('Query cannot be empty'));
        return;
      }

      if (prompt.length > 1000) {
        setError(new Error('Query is too long (max 1000 characters)'));
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Add user message to history
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);

        // Build conversation history from messages (exclude current message)
        const conversationHistory: ConversationMessage[] = messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Prepare request
        const requestBody: AIAnalyticsChatRequest = {
          prompt,
          conversation_history: conversationHistory.length > 0 ? conversationHistory : undefined,
          force_refresh: forceRefresh,
        };

        // Send request to AI Analytics API
        const response = await apiClient.post<AIAnalyticsResponse>('/v1/ai/chat', requestBody);

        const aiResponse = response.data;

        // Add AI assistant message to history
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: aiResponse.report.summary,
          timestamp: new Date().toISOString(),
          response: aiResponse,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setError(null);
      } catch (err: any) {
        console.error('Error sending AI Analytics query:', err);
        // Handle various error formats from backend
        let errorMessage = 'Failed to process query. Please try again.';
        if (err.response?.data?.detail) {
          const detail = err.response.data.detail;
          // Handle both string and object error details
          errorMessage = typeof detail === 'string' ? detail : detail.message || JSON.stringify(detail);
        } else if (err.message) {
          errorMessage = err.message;
        }
        setError(new Error(errorMessage));

        // Remove user message if request failed
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [messages]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearHistory,
  };
}
