/**
 * AI Hub - TypeScript Types
 *
 * Covers the 4-section AI Hub page: Control, Monitor, Report, Advise.
 * Re-exports shared action confirmation types from farmAI to avoid duplication.
 */

import type { PendingAction, ConfirmActionRequest, ConfirmActionResponse } from './farmAI';

export type AIHubSection = 'control' | 'monitor' | 'report' | 'advise';

export interface AIHubChatRequest {
  section: AIHubSection;
  message: string;
  conversation_history: { role: 'user' | 'assistant'; content: string }[];
}

export interface AIHubChatResponse {
  message: string;
  section: AIHubSection;
  pending_action: PendingAction | null;
  tools_used: string[];
}

export interface AIHubHistoryItem {
  section: AIHubSection;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  toolsUsed: string[];
  timestamp: string;
}

// Re-export shared action types for convenience
export type { PendingAction, ConfirmActionRequest, ConfirmActionResponse };
