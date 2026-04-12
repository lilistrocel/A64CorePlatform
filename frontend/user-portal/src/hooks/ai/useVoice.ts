/**
 * useVoice Hook
 *
 * Provides voice input (STT) and text-to-speech (TTS) for the AI Hub.
 *
 * STT uses MediaRecorder + backend transcription (Vertex AI Gemini) instead of
 * the browser's SpeechRecognition API, which requires direct internet access
 * to Google's speech servers and fails on restricted networks.
 *
 * TTS uses the backend ElevenLabs endpoint (/farm/ai-hub/tts) which returns an
 * audio blob played via the HTMLAudioElement API.  If the API call fails, the
 * hook degrades gracefully to the browser's SpeechSynthesis API so the user
 * always hears something.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio, synthesizeSpeech } from '../../services/aiHubApi';

// ============================================================================
// FEATURE DETECTION
// ============================================================================

function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

function isBrowserTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

export interface UseVoiceReturn {
  // STT
  isListening: boolean;
  isTranscribing: boolean;
  transcript: string;
  sttError: string | null;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;

  // TTS
  isTTSEnabled: boolean;
  isSpeaking: boolean;
  isTTSLoading: boolean;
  toggleTTS: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;

  // Feature detection
  sttSupported: boolean;
  ttsSupported: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useVoice(): UseVoiceReturn {
  const sttSupported = isMediaRecorderSupported();
  // TTS is always considered supported because we control the backend endpoint.
  // The browser fallback is available as a secondary safety net.
  const ttsSupported = true;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sttError, setSttError] = useState<string | null>(null);
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Tracks the currently playing HTMLAudioElement so we can cancel it.
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks the object URL created for the current audio blob so we can revoke it.
  const currentObjectUrlRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  /** Release the current Audio instance and revoke its object URL. */
  const cleanupCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // CLEANUP ON UNMOUNT
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cleanupCurrentAudio();
      // Also cancel any in-progress browser TTS as a belt-and-braces measure.
      if (isBrowserTTSSupported()) {
        window.speechSynthesis.cancel();
      }
    };
    // cleanupCurrentAudio is stable (useCallback with no deps), intentionally
    // not including isBrowserTTSSupported (pure function).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupCurrentAudio]);

  // -------------------------------------------------------------------------
  // STT
  // -------------------------------------------------------------------------

  const startListening = useCallback(async () => {
    if (!sttSupported || isListening || isTranscribing) return;

    setSttError(null);
    audioChunksRef.current = [];

    // Request microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSttError('Microphone access denied. Allow mic in browser settings.');
      return;
    }

    streamRef.current = stream;

    // Pick a supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop mic stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
          setIsListening(false);
          return;
        }

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        });

        // Send to backend for transcription
        setIsTranscribing(true);
        try {
          const text = await transcribeAudio(audioBlob);
          if (text.trim()) {
            setTranscript(text.trim());
          } else {
            setSttError('No speech detected — try again');
          }
        } catch {
          setSttError('Transcription failed — check your connection');
        } finally {
          setIsTranscribing(false);
          setIsListening(false);
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setSttError('Recording failed — try again');
        setIsListening(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      setTranscript('');
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setSttError('Failed to start recording');
    }
  }, [sttSupported, isListening, isTranscribing]);

  const stopListening = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    mediaRecorderRef.current.stop();
    // isListening will be set to false in onstop handler after transcription
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  // -------------------------------------------------------------------------
  // TTS — browser fallback
  // -------------------------------------------------------------------------

  /** Speak text using the browser's SpeechSynthesis API as a last resort. */
  const speakWithBrowser = useCallback((text: string) => {
    if (!isBrowserTTSSupported()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  // -------------------------------------------------------------------------
  // TTS — markdown to speech-friendly plain text
  // -------------------------------------------------------------------------

  /** Strip markdown formatting so TTS reads naturally. */
  const sanitizeForSpeech = useCallback((text: string): string => {
    return (
      text
        // Remove horizontal rules
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // Convert headings to plain text with a pause
        .replace(/^#{1,6}\s+(.+)$/gm, '$1.')
        // Remove bold/italic markers
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
        // Remove strikethrough
        .replace(/~~([^~]+)~~/g, '$1')
        // Convert bullet points to natural sentence flow
        .replace(/^\s*[-*+]\s+/gm, '')
        // Convert numbered lists — keep the number for context
        .replace(/^\s*(\d+)\.\s+/gm, '$1: ')
        // Remove inline code backticks
        .replace(/`([^`]+)`/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove links — keep the label
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Remove blockquote markers
        .replace(/^\s*>\s+/gm, '')
        // Collapse multiple newlines into a single pause-friendly period + space
        .replace(/\n{2,}/g, '. ')
        // Replace remaining single newlines with a comma for slight pause
        .replace(/\n/g, ', ')
        // Clean up multiple spaces
        .replace(/\s{2,}/g, ' ')
        // Clean up awkward punctuation from conversions (e.g. ".,", "..")
        .replace(/[.,]\s*[.,]/g, '.')
        .trim()
    );
  }, []);

  // -------------------------------------------------------------------------
  // TTS — primary (ElevenLabs via backend)
  // -------------------------------------------------------------------------

  const speak = useCallback(
    async (text: string) => {
      if (!isTTSEnabled || !text.trim()) return;

      // Strip markdown so TTS reads naturally
      const cleanText = sanitizeForSpeech(text);
      if (!cleanText) return;

      // Cancel any currently playing audio before starting a new request.
      cleanupCurrentAudio();
      if (isBrowserTTSSupported()) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setIsTTSLoading(true);

      try {
        const blob = await synthesizeSpeech(cleanText);
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);

        currentAudioRef.current = audio;
        currentObjectUrlRef.current = objectUrl;

        audio.onplay = () => {
          setIsTTSLoading(false);
          setIsSpeaking(true);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          cleanupCurrentAudio();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setIsTTSLoading(false);
          cleanupCurrentAudio();
        };

        // play() returns a Promise — catch any autoplay policy rejections.
        await audio.play();
      } catch {
        // API failed or autoplay was blocked — fall back to browser TTS.
        setIsTTSLoading(false);
        cleanupCurrentAudio();
        speakWithBrowser(cleanText);
      }
    },
    [isTTSEnabled, sanitizeForSpeech, cleanupCurrentAudio, speakWithBrowser]
  );

  const stopSpeaking = useCallback(() => {
    cleanupCurrentAudio();
    if (isBrowserTTSSupported()) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsTTSLoading(false);
  }, [cleanupCurrentAudio]);

  const toggleTTS = useCallback(() => {
    setIsTTSEnabled((prev) => {
      if (prev) {
        // Disabling TTS — stop everything in progress.
        cleanupCurrentAudio();
        if (isBrowserTTSSupported()) {
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        setIsTTSLoading(false);
      }
      return !prev;
    });
  }, [cleanupCurrentAudio]);

  return {
    isListening,
    isTranscribing,
    transcript,
    sttError,
    startListening,
    stopListening,
    clearTranscript,
    isTTSEnabled,
    isSpeaking,
    isTTSLoading,
    toggleTTS,
    speak,
    stopSpeaking,
    sttSupported,
    ttsSupported,
  };
}
