/**
 * Farm AI Chat - TypeScript Types
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FarmAIChatRequest {
  message: string;
  conversation_history: ChatMessage[];
}

export interface PendingAction {
  action_id: string;
  tool_name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  expires_at: string;
}

export interface GrowthStageInfo {
  stage: string;
  day: number;
  total_cycle_days: number;
  progress_percent: number;
}

export interface FarmAIChatResponse {
  message: string;
  pending_action: PendingAction | null;
  growth_stage: GrowthStageInfo | null;
  tools_used: string[];
}

export interface ConfirmActionRequest {
  action_id: string;
  approved: boolean;
}

export interface ConfirmActionResponse {
  status: 'executed' | 'cancelled' | 'expired' | 'not_found';
  message: string;
  result: Record<string, any> | null;
}
