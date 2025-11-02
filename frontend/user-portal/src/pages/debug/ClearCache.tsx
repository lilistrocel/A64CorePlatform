/**
 * ClearCache Debug Page
 *
 * Utility page for clearing browser cache and storage during development.
 * Access at: http://localhost:5173/debug/clear-cache
 */

import { useState } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Card = styled.div`
  background: white;
  border-radius: 16px;
  padding: 48px;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: #212121;
  margin: 0 0 12px 0;
  text-align: center;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #666;
  margin: 0 0 32px 0;
  text-align: center;
`;

const Section = styled.div`
  margin-bottom: 24px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
  margin: 0 0 12px 0;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;

  &:last-child {
    border-bottom: none;
  }
`;

const Label = styled.span`
  font-size: 14px;
  color: #666;
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #212121;
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
    if (props.$variant === 'danger') {
      return `
        background: #f44336;
        color: white;
        &:hover {
          background: #d32f2f;
        }
      `;
    }
    if (props.$variant === 'secondary') {
      return `
        background: #e0e0e0;
        color: #212121;
        &:hover {
          background: #d0d0d0;
        }
      `;
    }
    return `
      background: #667eea;
      color: white;
      &:hover {
        background: #5568d3;
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

  ${props => {
    if (props.$type === 'success') {
      return `
        background: #e8f5e9;
        color: #2e7d32;
        border: 1px solid #4caf50;
      `;
    }
    if (props.$type === 'error') {
      return `
        background: #ffebee;
        color: #c62828;
        border: 1px solid #f44336;
      `;
    }
    return `
      background: #e3f2fd;
      color: #1565c0;
      border: 1px solid #2196f3;
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
        <Title>🔧 Cache Debug Tool</Title>
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
            <Value>{cacheInfo.hasAccessToken ? '✓ Present' : '✗ Missing'}</Value>
          </InfoRow>
          <InfoRow>
            <Label>Auth Storage:</Label>
            <Value>{cacheInfo.hasAuthStorage ? '✓ Present' : '✗ Missing'}</Value>
          </InfoRow>
        </Section>

        <Section>
          <SectionTitle>Quick Actions</SectionTitle>

          <ButtonGroup>
            <Button onClick={hardReload} $variant="secondary">
              🔄 Hard Reload
            </Button>
            <Button onClick={clearAuthOnly} $variant="secondary">
              🔑 Clear Auth Only
            </Button>
          </ButtonGroup>

          <ButtonGroup>
            <Button onClick={clearAllCache} $variant="danger">
              🗑️ Clear All & Reload
            </Button>
          </ButtonGroup>
        </Section>

        {message && (
          <Message $type={message.type}>
            {message.text}
          </Message>
        )}

        <Message $type="info">
          💡 Tip: Bookmark this page for quick access during development!<br/>
          URL: <strong>http://localhost:5173/debug/clear-cache</strong>
        </Message>
      </Card>
    </Container>
  );
}
