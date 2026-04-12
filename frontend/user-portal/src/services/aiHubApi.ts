/**
 * AI Hub API Service
 *
 * Handles communication with the /v1/farm/ai-hub/* endpoints.
 * Uses the same apiClient instance as farmApi (from services/api.ts).
 */

import { apiClient } from './api';
import type {
  AIHubChatRequest,
  AIHubChatResponse,
  AIHubSection,
  AIHubHistoryItem,
  ConfirmActionRequest,
  ConfirmActionResponse,
} from '../types/aiHub';

/**
 * Send a message to the AI Hub assistant for a specific section.
 */
export async function sendAIHubChat(data: AIHubChatRequest): Promise<AIHubChatResponse> {
  const response = await apiClient.post<AIHubChatResponse>('/v1/farm/ai-hub/chat', data);
  return response.data;
}

/**
 * Confirm or deny a pending write action (Control section only).
 */
export async function confirmAIHubAction(
  data: ConfirmActionRequest
): Promise<ConfirmActionResponse> {
  const response = await apiClient.post<ConfirmActionResponse>('/v1/farm/ai-hub/confirm', data);
  return response.data;
}

/**
 * Transcribe audio via backend Vertex AI (bypasses browser SpeechRecognition).
 * Accepts a Blob of recorded audio (WebM/OGG/WAV).
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  const response = await apiClient.post<{ transcript: string }>(
    '/v1/farm/ai-hub/transcribe',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.transcript;
}

/**
 * Synthesize speech via the backend ElevenLabs TTS endpoint.
 * Returns a Blob of audio (MP3) to be played via the Web Audio API.
 */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  const response = await apiClient.post(
    '/v1/farm/ai-hub/tts',
    { text },
    { responseType: 'blob' }
  );
  return response.data;
}

/**
 * Fetch recent chat history for a specific section.
 */
export async function getAIHubHistory(
  section: AIHubSection,
  skip: number = 0,
  limit: number = 20
): Promise<AIHubHistoryItem[]> {
  const response = await apiClient.get<AIHubHistoryItem[]>(
    `/v1/farm/ai-hub/history/${section}`,
    { params: { skip, limit } }
  );
  return response.data;
}

/**
 * Export a report as PDF or Excel.
 * Sends the markdown content to the backend and triggers a file download.
 */
export async function exportReport(
  markdown: string,
  title: string,
  format: 'pdf' | 'excel'
): Promise<void> {
  const response = await apiClient.post(
    '/v1/farm/ai-hub/export-report',
    { markdown, title, format },
    { responseType: 'blob' }
  );

  const blob = response.data as Blob;
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';
  const mimeType =
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
