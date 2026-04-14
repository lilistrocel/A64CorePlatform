/**
 * VoiceControls Component
 *
 * Mic button and TTS toggle for the AI Hub header.
 *
 * - Mic: Click to start recording, click again to stop.
 *        Audio is sent to the backend for transcription via Vertex AI.
 *        When transcription completes and text is available, calls onTranscript.
 * - TTS: Toggle speaker button to enable/disable text-to-speech.
 *
 * Both buttons are pill-shaped with icon + label for clear visibility.
 * Errors (e.g. mic denied) are shown as a temporary toast below the controls.
 */

import { useState, useEffect, useRef } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Mic, MicOff, Volume2, VolumeX, AlertCircle, Loader } from 'lucide-react';
import type { UseVoiceReturn } from '../../hooks/ai/useVoice';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceControlsProps
  extends Pick<
    UseVoiceReturn,
    | 'isListening'
    | 'isTranscribing'
    | 'transcript'
    | 'sttError'
    | 'startListening'
    | 'stopListening'
    | 'clearTranscript'
    | 'isTTSEnabled'
    | 'isSpeaking'
    | 'isTTSLoading'
    | 'toggleTTS'
    | 'sttSupported'
    | 'ttsSupported'
  > {
  onTranscript: (text: string) => void;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

const pulseRing = keyframes`
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(1.4); opacity: 0; }
  100% { transform: scale(1.4); opacity: 0; }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50%      { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

interface PillButtonProps {
  $isActive: boolean;
  $activeColor: string;
  $isDisabled: boolean;
  $hasError?: boolean;
}

const PillButton = styled.button<PillButtonProps>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px 0 10px;
  border-radius: 18px;
  border: 1.5px solid ${({ $isActive, $activeColor, $isDisabled, $hasError, theme }) => {
    if ($hasError) return '#EF4444';
    if ($isDisabled) return theme.colors.neutral[300];
    return $isActive ? $activeColor : `${$activeColor}40`;
  }};
  background: ${({ $isActive, $activeColor, $isDisabled, $hasError, theme }) => {
    if ($hasError) return '#FEF2F2';
    if ($isDisabled) return theme.colors.surface;
    return $isActive ? `${$activeColor}15` : theme.colors.neutral[50];
  }};
  color: ${({ $isActive, $activeColor, $isDisabled, $hasError, theme }) => {
    if ($hasError) return '#EF4444';
    if ($isDisabled) return theme.colors.textDisabled;
    return $isActive ? $activeColor : theme.colors.textSecondary;
  }};
  cursor: ${({ $isDisabled }) => ($isDisabled ? 'not-allowed' : 'pointer')};
  transition: all 150ms ease-in-out;
  flex-shrink: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;

  ${({ $isActive, $activeColor }) =>
    $isActive &&
    css`
      animation: ${pulseGlow} 1.5s infinite ease-in-out;
      font-weight: 600;
      border-color: ${$activeColor};
    `}

  &:hover:not(:disabled) {
    background: ${({ $activeColor, $hasError }) =>
      $hasError ? '#FEE2E2' : `${$activeColor}12`};
    border-color: ${({ $activeColor, $hasError }) =>
      $hasError ? '#EF4444' : `${$activeColor}80`};
    color: ${({ $activeColor, $hasError }) =>
      $hasError ? '#DC2626' : $activeColor};
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:focus-visible {
    outline: 2px solid ${({ $activeColor }) => $activeColor};
    outline-offset: 2px;
  }
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const SpinningIcon = styled(IconWrapper)`
  animation: ${spin} 1s linear infinite;
`;

const Label = styled.span`
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1;

  @media (max-width: 480px) {
    display: none;
  }
`;

const PulseRing = styled.div<{ $color: string }>`
  position: absolute;
  inset: -4px;
  border-radius: 18px;
  border: 2px solid ${({ $color }) => $color};
  animation: ${pulseRing} 1.2s infinite ease-out;
  pointer-events: none;
`;

const ErrorToast = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}40;
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.error};
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: ${({ theme }) => theme.shadows.md};
  z-index: 50;
  animation: ${slideIn} 200ms ease-out;
  pointer-events: none;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function VoiceControls({
  isListening,
  isTranscribing,
  transcript,
  sttError,
  startListening,
  stopListening,
  clearTranscript,
  isTTSEnabled,
  isTTSLoading,
  toggleTTS,
  sttSupported,
  ttsSupported,
  onTranscript,
}: VoiceControlsProps) {
  const wasListeningRef = useRef(false);
  const [showError, setShowError] = useState(false);

  // Forward transcript when recording + transcription finishes
  useEffect(() => {
    if (wasListeningRef.current && !isListening && !isTranscribing && transcript.trim()) {
      onTranscript(transcript.trim());
      clearTranscript();
    }
    wasListeningRef.current = isListening || isTranscribing;
  }, [isListening, isTranscribing, transcript, onTranscript, clearTranscript]);

  // Show error toast for 4 seconds then auto-dismiss
  useEffect(() => {
    if (sttError) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowError(false);
    }
  }, [sttError]);

  const handleMicClick = () => {
    if (!sttSupported || isTranscribing) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const PTT_COLOR = '#3B82F6';
  const TTS_COLOR = '#8B5CF6';

  const micLabel = !sttSupported
    ? 'Unavailable'
    : isTranscribing
    ? 'Processing...'
    : isListening
    ? 'Recording...'
    : showError
    ? 'Error'
    : 'Talk';

  const ttsLabel = !ttsSupported
    ? 'Unavailable'
    : isTTSLoading
    ? 'Generating...'
    : isTTSEnabled
    ? 'Speaker On'
    : 'Speaker Off';

  return (
    <Wrapper>
      <ControlsRow>
        {/* Mic button — click to start/stop recording */}
        <PillButton
          $isActive={isListening}
          $activeColor={PTT_COLOR}
          $isDisabled={!sttSupported || isTranscribing}
          $hasError={showError}
          onClick={handleMicClick}
          title={
            !sttSupported
              ? 'Voice input not supported in this browser'
              : isTranscribing
              ? 'Processing your voice...'
              : isListening
              ? 'Click to stop recording'
              : 'Click to start voice input'
          }
          aria-label={
            !sttSupported
              ? 'Voice input not supported'
              : isTranscribing
              ? 'Processing your voice'
              : isListening
              ? 'Recording — click to stop'
              : 'Click to start voice input'
          }
          aria-pressed={isListening}
          disabled={!sttSupported || isTranscribing}
        >
          <IconWrapper>
            {isTranscribing ? (
              <SpinningIcon><Loader size={16} /></SpinningIcon>
            ) : isListening ? (
              <MicOff size={16} />
            ) : (
              <Mic size={16} />
            )}
          </IconWrapper>
          <Label>{micLabel}</Label>
          {isListening && <PulseRing $color={PTT_COLOR} />}
        </PillButton>

        {/* TTS toggle button */}
        <PillButton
          $isActive={isTTSEnabled}
          $activeColor={TTS_COLOR}
          $isDisabled={!ttsSupported || isTTSLoading}
          onClick={ttsSupported && !isTTSLoading ? toggleTTS : undefined}
          title={
            !ttsSupported
              ? 'Text-to-speech not supported in this browser'
              : isTTSLoading
              ? 'Generating audio...'
              : isTTSEnabled
              ? 'Disable text-to-speech'
              : 'Enable text-to-speech'
          }
          aria-label={
            !ttsSupported
              ? 'Text-to-speech not supported'
              : isTTSLoading
              ? 'Generating audio'
              : isTTSEnabled
              ? 'Disable text-to-speech'
              : 'Enable text-to-speech'
          }
          aria-pressed={isTTSEnabled}
          aria-busy={isTTSLoading}
          disabled={!ttsSupported || isTTSLoading}
        >
          <IconWrapper>
            {isTTSLoading ? (
              <SpinningIcon><Loader size={16} /></SpinningIcon>
            ) : isTTSEnabled ? (
              <Volume2 size={16} />
            ) : (
              <VolumeX size={16} />
            )}
          </IconWrapper>
          <Label>{ttsLabel}</Label>
        </PillButton>
      </ControlsRow>

      {/* Error toast — slides in below the controls */}
      {showError && sttError && (
        <ErrorToast role="alert">
          <AlertCircle size={14} />
          {sttError}
        </ErrorToast>
      )}
    </Wrapper>
  );
}
