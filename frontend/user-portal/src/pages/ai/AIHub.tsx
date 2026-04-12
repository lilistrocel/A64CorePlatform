/**
 * AIHub Page
 *
 * Full-screen AI assistant hub with 4 tabs: Control, Monitor, Report, Advise.
 * Super admin only — non-super_admin users are redirected to /dashboard.
 * Exists outside MainLayout (no sidebar) for an immersive, tablet-first experience.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  ← Back  │ Control | Monitor | Report | Advise │ [mic] [tts] [logout] │
 *   ├──────────────────────────────────────────────────┤
 *   │                  AIHubChat                       │
 *   └──────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { LogOut, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { AIHubTabBar } from '../../components/ai/AIHubTabBar';
import { AIHubChat } from '../../components/ai/AIHubChat';
import { VoiceControls } from '../../components/ai/VoiceControls';
import { useVoice } from '../../hooks/ai/useVoice';
import type { AIHubSection } from '../../types/aiHub';

// ============================================================================
// CONSTANTS
// ============================================================================

const SECTION_ACCENT_COLORS: Record<AIHubSection, string> = {
  control: '#F59E0B',
  monitor: '#3B82F6',
  report:  '#8B5CF6',
  advise:  '#10B981',
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FullScreen = styled.div`
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height for mobile browsers */
  overflow: hidden;
  background: ${({ theme }) => theme.colors.neutral[50]};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  flex-shrink: 0;
  min-height: 56px;
  z-index: 10;

  @media (min-width: 640px) {
    padding: 0 16px;
    gap: 12px;
  }
`;

const HeaderButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[200]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid #2196f3;
    outline-offset: 2px;
  }
`;

const BackButton = styled(HeaderButton)`
  gap: 4px;
`;

const BackLabel = styled.span`
  display: none;

  @media (min-width: 480px) {
    display: inline;
    font-size: 14px;
    font-weight: 500;
  }
`;

const TabBarWrapper = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const Divider = styled.div`
  width: 1px;
  height: 28px;
  background: ${({ theme }) => theme.colors.neutral[300]};
  margin: 0 4px;
`;

const LogoutButton = styled(HeaderButton)`
  color: #EF4444;

  &:hover {
    background: #FEF2F2;
    color: #DC2626;
  }
`;

const ChatArea = styled.main`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const AccessDeniedContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  padding: 32px;
  text-align: center;
`;

const AccessDeniedTitle = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const AccessDeniedText = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  max-width: 360px;
`;

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export function AIHub() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [section, setSection] = useState<AIHubSection>('monitor');
  const [voiceTranscript, setVoiceTranscript] = useState('');

  // Voice controls
  const voice = useVoice();

  // Redirect non-super_admin users immediately
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleBack = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  // When voice STT produces a transcript, pass it to the chat
  const handleTranscript = useCallback((text: string) => {
    setVoiceTranscript(text);
  }, []);

  // Reset voice transcript once the chat component has consumed it
  const handleVoiceTranscriptConsumed = useCallback(() => {
    setVoiceTranscript('');
  }, []);

  // When a new AI reply comes in, optionally speak it via TTS
  const handleAIReply = useCallback(
    (text: string) => {
      voice.speak(text);
    },
    [voice]
  );

  // If user is null (loading) or not super_admin, show a minimal denied state
  // (the useEffect above redirects, but this prevents a flash of content)
  if (!user) {
    return null;
  }

  if (user.role !== 'super_admin') {
    return (
      <FullScreen>
        <AccessDeniedContainer>
          <AccessDeniedTitle>Access Denied</AccessDeniedTitle>
          <AccessDeniedText>
            The AI Hub is only accessible to super admins.
          </AccessDeniedText>
          <HeaderButton onClick={handleBack} aria-label="Go back to dashboard">
            <ArrowLeft size={18} />
            Back to Dashboard
          </HeaderButton>
        </AccessDeniedContainer>
      </FullScreen>
    );
  }

  const accentColor = SECTION_ACCENT_COLORS[section];

  return (
    <FullScreen>
      <Header role="banner">
        {/* Back button */}
        <BackButton
          onClick={handleBack}
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          <ArrowLeft size={18} />
          <BackLabel>Back</BackLabel>
        </BackButton>

        <Divider aria-hidden="true" />

        {/* Tab bar — takes remaining space */}
        <TabBarWrapper>
          <AIHubTabBar
            activeSection={section}
            onSectionChange={setSection}
          />
        </TabBarWrapper>

        <Divider aria-hidden="true" />

        {/* Voice + logout controls */}
        <HeaderActions>
          <VoiceControls
            isListening={voice.isListening}
            isTranscribing={voice.isTranscribing}
            transcript={voice.transcript}
            sttError={voice.sttError}
            startListening={voice.startListening}
            stopListening={voice.stopListening}
            clearTranscript={voice.clearTranscript}
            isTTSEnabled={voice.isTTSEnabled}
            isSpeaking={voice.isSpeaking}
            isTTSLoading={voice.isTTSLoading}
            toggleTTS={voice.toggleTTS}
            sttSupported={voice.sttSupported}
            ttsSupported={voice.ttsSupported}
            onTranscript={handleTranscript}
          />

          <Divider aria-hidden="true" />

          <LogoutButton
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={18} />
          </LogoutButton>
        </HeaderActions>
      </Header>

      {/* Chat panel - keyed by section to mount fresh when section changes */}
      <ChatArea
        id={`ai-hub-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`ai-hub-tab-${section}`}
      >
        <AIHubChat
          key={section}
          section={section}
          accentColor={accentColor}
          onAIReply={handleAIReply}
          voiceTranscript={voiceTranscript}
          onVoiceTranscriptConsumed={handleVoiceTranscriptConsumed}
        />
      </ChatArea>
    </FullScreen>
  );
}
