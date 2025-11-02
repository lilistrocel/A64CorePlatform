import styled from 'styled-components';
import { Card } from '@a64core/shared';

export function Settings() {
  return (
    <SettingsContainer>
      <Title>Settings</Title>

      <Card title="General Settings">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Theme</SettingLabel>
            <SettingValue>Light Mode</SettingValue>
            <SettingDescription>Choose your preferred theme</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Language</SettingLabel>
            <SettingValue>English (US)</SettingValue>
            <SettingDescription>Select your language preference</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Timezone</SettingLabel>
            <SettingValue>UTC+00:00</SettingValue>
            <SettingDescription>Set your local timezone</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>

      <Card title="Notifications">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Email Notifications</SettingLabel>
            <SettingValue>Enabled</SettingValue>
            <SettingDescription>Receive email updates and alerts</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Push Notifications</SettingLabel>
            <SettingValue>Disabled</SettingValue>
            <SettingDescription>Get push notifications in your browser</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>

      <Card title="Security">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Two-Factor Authentication</SettingLabel>
            <SettingValue>Not Configured</SettingValue>
            <SettingDescription>Add an extra layer of security to your account</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Active Sessions</SettingLabel>
            <SettingValue>1 Session</SettingValue>
            <SettingDescription>Manage your active login sessions</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>
    </SettingsContainer>
  );
}

const SettingsContainer = styled.div`
  padding: ${({ theme }: any) => theme.spacing.md};
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.md};
  width: 100%;

  @media (min-width: 768px) {
    padding: ${({ theme }: any) => theme.spacing.lg};
    gap: ${({ theme }: any) => theme.spacing.lg};
  }

  @media (min-width: 1024px) {
    padding: ${({ theme }: any) => theme.spacing.xl};
    max-width: 1200px;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }: any) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.bold};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }: any) => theme.spacing.md} 0;

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize['3xl']};
    margin-bottom: ${({ theme }: any) => theme.spacing.lg};
  }
`;

const SettingsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.lg};

  @media (min-width: 768px) {
    gap: ${({ theme }: any) => theme.spacing.xl};
  }
`;

const SettingItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.xs};
  padding-bottom: ${({ theme }: any) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};

  @media (min-width: 768px) {
    padding-bottom: ${({ theme }: any) => theme.spacing.lg};
  }

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const SettingLabel = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textPrimary};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.base};
  }
`;

const SettingValue = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.primary[500]};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  }
`;

const SettingDescription = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  }
`;
