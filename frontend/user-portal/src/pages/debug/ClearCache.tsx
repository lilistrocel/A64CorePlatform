/**
 * ClearCache Debug Page
 *
 * Utility page for clearing browser cache and storage during development.
 * Access at: http://localhost:5173/debug/clear-cache
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Check, Key, RefreshCw, Settings, Trash2, X, Lightbulb } from 'lucide-react';
import { glassPanel } from '@a64core/shared';

// Night Observatory (T-901): standalone debug route outside MainLayout (no
// sidebar) — the fixed Sky layer at the app shell is the entire backdrop here.
const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Card = styled.div`
  ${glassPanel}
  border-radius: 20px;
  padding: 48px;
  max-width: 600px;
  width: 100%;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px 0;
  text-align: center;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 32px 0;
  text-align: center;
`;

const Section = styled.div`
  margin-bottom: 24px;
  padding: 20px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px 0;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }
`;

const Label = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  flex: 1;
  padding: 16px 24px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  ${props => {
    // Destructive action — coral-b tinted glass, never solid red (spec §4).
    if (props.$variant === 'danger') {
      return `
        background: rgba(240, 138, 112, 0.16);
        color: ${props.theme.colors.bright.coral};
        border: 1px solid rgba(240, 138, 112, 0.45);
        &:hover {
          background: rgba(240, 138, 112, 0.26);
        }
      `;
    }
    if (props.$variant === 'secondary') {
      return `
        background: ${props.theme.colors.glass.base};
        border: 1px solid ${props.theme.colors.glass.border};
        color: ${props.theme.colors.textPrimary};
        &:hover {
          background: ${props.theme.colors.glass.hi};
        }
      `;
    }
    return `
      background: ${props.theme.colors.primary[500]};
      color: ${props.theme.colors.onDark};
      &:hover {
        background: ${props.theme.colors.primary[600]};
      }
    `;
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Message = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: 16px;
  border-radius: 8px;
  margin-top: 24px;
  font-size: 14px;
  text-align: center;

  ${({ $type, theme }) => {
    if ($type === 'success') {
      return `
        background: ${theme.colors.successBg};
        color: ${theme.colors.bright.emerald};
        border: 1px solid ${theme.colors.success};
      `;
    }
    if ($type === 'error') {
      return `
        background: ${theme.colors.errorBg};
        color: ${theme.colors.bright.coral};
        border: 1px solid ${theme.colors.error};
      `;
    }
    return `
      background: ${theme.colors.infoBg};
      color: ${theme.colors.bright.lapis};
      border: 1px solid ${theme.colors.info};
    `;
  }}
`;

export function ClearCache() {
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [cacheInfo, setCacheInfo] = useState({
    localStorageKeys: localStorage.length,
    sessionStorageKeys: sessionStorage.length,
    hasAccessToken: !!localStorage.getItem('accessToken'),
    hasAuthStorage: !!localStorage.getItem('auth-storage'),
  });

  const updateCacheInfo = () => {
    setCacheInfo({
      localStorageKeys: localStorage.length,
      sessionStorageKeys: sessionStorage.length,
      hasAccessToken: !!localStorage.getItem('accessToken'),
      hasAuthStorage: !!localStorage.getItem('auth-storage'),
    });
  };

  const clearAllCache = async () => {
    try {
      // Clear localStorage
      localStorage.clear();

      // Clear sessionStorage
      sessionStorage.clear();

      // Clear service worker caches (if any)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      updateCacheInfo();
      setMessage({ type: 'success', text: '✓ All cache cleared successfully! Reloading in 2 seconds...' });

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      setMessage({ type: 'error', text: '✗ Failed to clear cache: ' + (error as Error).message });
    }
  };

  const clearAuthOnly = () => {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('auth-storage');

      updateCacheInfo();
      setMessage({ type: 'success', text: '✓ Authentication data cleared!' });
    } catch (error) {
      setMessage({ type: 'error', text: '✗ Failed to clear auth data: ' + (error as Error).message });
    }
  };

  const hardReload = () => {
    // Force reload from server, bypassing cache
    window.location.reload();
  };

  return (
    <Container>
      <Card>
        <Title>
          <Settings size={26} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Cache Debug Tool
        </Title>
        <Subtitle>Clear browser cache and storage during development</Subtitle>

        <Section>
          <SectionTitle>Current Cache State</SectionTitle>
          <InfoRow>
            <Label>localStorage keys:</Label>
            <Value>{cacheInfo.localStorageKeys}</Value>
          </InfoRow>
          <InfoRow>
            <Label>sessionStorage keys:</Label>
            <Value>{cacheInfo.sessionStorageKeys}</Value>
          </InfoRow>
          <InfoRow>
            <Label>Access Token:</Label>
            <Value>
              {cacheInfo.hasAccessToken
                ? <><Check size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle' }} /> Present</>
                : <><X size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle' }} /> Missing</>}
            </Value>
          </InfoRow>
          <InfoRow>
            <Label>Auth Storage:</Label>
            <Value>
              {cacheInfo.hasAuthStorage
                ? <><Check size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle' }} /> Present</>
                : <><X size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle' }} /> Missing</>}
            </Value>
          </InfoRow>
        </Section>

        <Section>
          <SectionTitle>Quick Actions</SectionTitle>

          <ButtonGroup>
            <Button onClick={hardReload} $variant="secondary">
              <RefreshCw size={16} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Hard Reload
            </Button>
            <Button onClick={clearAuthOnly} $variant="secondary">
              <Key size={16} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Clear Auth Only
            </Button>
          </ButtonGroup>

          <ButtonGroup>
            <Button onClick={clearAllCache} $variant="danger">
              <Trash2 size={16} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Clear All &amp; Reload
            </Button>
          </ButtonGroup>
        </Section>

        {message && (
          <Message $type={message.type}>
            {message.text}
          </Message>
        )}

        <Message $type="info">
          <Lightbulb size={14} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Tip: Bookmark this page for quick access during development!<br/>
          URL: <strong>http://localhost:5173/debug/clear-cache</strong>
        </Message>
      </Card>
    </Container>
  );
}
