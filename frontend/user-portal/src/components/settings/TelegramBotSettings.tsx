import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Card, phaseBadge, type PhaseKey } from '@a64core/shared';
import {
  getWatchdogConfig,
  updateWatchdogConfig,
  testWatchdogNotification,
  getWatchdogStatus,
  triggerWatchdogCheck,
  getWatchdogHistory,
  type WatchdogConfig,
  type WatchdogConfigUpdate,
} from '../../services/farmApi';
import { useToastStore } from '../../stores/toast.store';

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All (Low+)' },
  { value: 'medium_plus', label: 'Medium+' },
  { value: 'high_plus', label: 'High+ (Recommended)' },
  { value: 'critical_only', label: 'Critical Only' },
];

const CHECK_OPTIONS = [
  { value: 'mcp_reachability', label: 'MCP Server Reachability' },
  { value: 'late_items', label: 'Late Harvests' },
  { value: 'active_alerts', label: 'Active Alerts' },
  { value: 'block_health', label: 'Block Health' },
  { value: 'system_health', label: 'System Health' },
];

export function TelegramBotSettings() {
  const { addToast } = useToastStore();

  const [config, setConfig] = useState<WatchdogConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [checkInterval, setCheckInterval] = useState(15);
  const [cooldown, setCooldown] = useState(60);
  const [severity, setSeverity] = useState('high_plus');
  const [enabledChecks, setEnabledChecks] = useState<string[]>([]);

  // Action states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWatchdogConfig();
      setConfig(data);
      setBotToken(''); // Never pre-fill token
      setChatId(data.chatId || '');
      setEnabled(data.enabled);
      setCheckInterval(data.checkIntervalMinutes);
      setCooldown(data.notificationCooldownMinutes);
      setSeverity(data.severityThreshold);
      setEnabledChecks(data.enabledChecks || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load watchdog config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadStatus();
  }, [loadConfig]);

  const loadStatus = async () => {
    try {
      const status = await getWatchdogStatus();
      setSchedulerStatus(status);
    } catch {
      // Non-critical
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const update: WatchdogConfigUpdate = {
        chatId,
        enabled,
        checkIntervalMinutes: checkInterval,
        notificationCooldownMinutes: cooldown,
        severityThreshold: severity,
        enabledChecks,
      };
      // Only include token if user entered a new one
      if (botToken.trim()) {
        update.botToken = botToken.trim();
      }

      const result = await updateWatchdogConfig(update);
      setConfig(result.data);
      setBotToken('');
      addToast('success', result.message || 'Watchdog configuration saved');
      loadStatus();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save watchdog config';
      setError(typeof msg === 'string' ? msg : 'Save failed');
      addToast('error', 'Failed to save watchdog configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testWatchdogNotification();
      setTestResult(result);
      if (result.success) {
        addToast('success', 'Test message sent to Telegram');
      } else {
        addToast('error', result.message || 'Test failed');
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Test request failed';
      setTestResult({ success: false, message: typeof msg === 'string' ? msg : 'Test failed' });
      addToast('error', typeof msg === 'string' ? msg : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const result = await triggerWatchdogCheck();
      setTriggerResult(result);
      addToast('success', `Watchdog check complete: ${result.totalIssues} issues found, ${result.sentIssues} sent`);
    } catch (err: any) {
      addToast('error', 'Failed to trigger watchdog check');
    } finally {
      setTriggering(false);
    }
  };

  const handleLoadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    try {
      const data = await getWatchdogHistory(20);
      setHistory(data);
      setShowHistory(true);
    } catch {
      addToast('error', 'Failed to load notification history');
    }
  };

  const toggleCheck = (checkValue: string) => {
    setEnabledChecks(prev =>
      prev.includes(checkValue)
        ? prev.filter(c => c !== checkValue)
        : [...prev, checkValue]
    );
  };

  if (loading) {
    return (
      <Card title="Telegram Bot / Watchdog">
        <LoadingText>Loading watchdog configuration...</LoadingText>
      </Card>
    );
  }

  return (
    <Card title="Telegram Bot / Watchdog">
      <Content>
        <Description>
          Configure automated monitoring that periodically checks for issues and sends
          Telegram notifications. Create a bot via @BotFather and add it to your group chat.
        </Description>

        {error && <ErrorText>{error}</ErrorText>}

        {/* Bot Configuration */}
        <Section>
          <SectionTitle>Bot Configuration</SectionTitle>
          <FieldGroup>
            <Label htmlFor="wd-token">Bot Token</Label>
            <Input
              id="wd-token"
              type="password"
              placeholder={config?.botTokenConfigured ? 'Token configured (enter new to replace)' : 'Paste bot token from @BotFather'}
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              autoComplete="off"
            />
          </FieldGroup>
          <FieldGroup>
            <Label htmlFor="wd-chatid">Chat ID</Label>
            <Input
              id="wd-chatid"
              type="text"
              placeholder="-1001234567890"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
            />
            <HelpText>Use @userinfobot or @getidsbot to find your chat/group ID</HelpText>
          </FieldGroup>
          <FieldGroup>
            <Label>
              <Checkbox
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
              />
              Enable automatic watchdog checks
            </Label>
          </FieldGroup>
        </Section>

        {/* Schedule Settings */}
        <Section>
          <SectionTitle>Schedule</SectionTitle>
          <InlineFields>
            <FieldGroup>
              <Label htmlFor="wd-interval">Check Interval (minutes)</Label>
              <NumberInput
                id="wd-interval"
                type="number"
                min={1}
                max={1440}
                value={checkInterval}
                onChange={e => setCheckInterval(parseInt(e.target.value) || 15)}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="wd-cooldown">Cooldown (minutes)</Label>
              <NumberInput
                id="wd-cooldown"
                type="number"
                min={5}
                max={1440}
                value={cooldown}
                onChange={e => setCooldown(parseInt(e.target.value) || 60)}
              />
              <HelpText>Prevents repeated notifications for same issue</HelpText>
            </FieldGroup>
          </InlineFields>
        </Section>

        {/* Checks & Severity */}
        <Section>
          <SectionTitle>Checks & Severity</SectionTitle>
          <FieldGroup>
            <Label htmlFor="wd-severity">Minimum Severity</Label>
            <Select
              id="wd-severity"
              value={severity}
              onChange={e => setSeverity(e.target.value)}
            >
              {SEVERITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup>
            <Label>Enabled Checks</Label>
            <CheckList>
              {CHECK_OPTIONS.map(opt => (
                <CheckItem key={opt.value}>
                  <Checkbox
                    type="checkbox"
                    checked={enabledChecks.includes(opt.value)}
                    onChange={() => toggleCheck(opt.value)}
                  />
                  {opt.label}
                </CheckItem>
              ))}
            </CheckList>
          </FieldGroup>
        </Section>

        {/* Actions */}
        <ButtonRow>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </PrimaryButton>
          <SecondaryButton
            onClick={handleTest}
            disabled={testing || !config?.botTokenConfigured}
            title={!config?.botTokenConfigured ? 'Save a bot token first' : ''}
          >
            {testing ? 'Sending...' : 'Test Notification'}
          </SecondaryButton>
          <SecondaryButton onClick={handleTrigger} disabled={triggering}>
            {triggering ? 'Running...' : 'Run Check Now'}
          </SecondaryButton>
          <SecondaryButton onClick={handleLoadHistory}>
            {showHistory ? 'Hide History' : 'View History'}
          </SecondaryButton>
        </ButtonRow>

        {/* Test result */}
        {testResult && (
          <ResultBox success={testResult.success}>
            {testResult.success ? 'Test passed' : 'Test failed'}: {testResult.message}
            {testResult.botName && <div>Bot: {testResult.botName}</div>}
          </ResultBox>
        )}

        {/* Trigger result */}
        {triggerResult && (
          <ResultBox success={triggerResult.errors?.length === 0}>
            Issues: {triggerResult.totalIssues} | Sent: {triggerResult.sentIssues} | Cooldown: {triggerResult.skippedByCooldown}
            {triggerResult.errors?.length > 0 && (
              <div>Errors: {triggerResult.errors.join(', ')}</div>
            )}
          </ResultBox>
        )}

        {/* Scheduler status */}
        {schedulerStatus && (
          <StatusBar>
            Scheduler: {schedulerStatus.isRunning ? 'Running' : 'Stopped'}
            {schedulerStatus.lastRun && ` | Last run: ${new Date(schedulerStatus.lastRun).toLocaleString()}`}
          </StatusBar>
        )}

        {/* History */}
        {showHistory && (
          <HistorySection>
            <SectionTitle>Recent Notifications</SectionTitle>
            {history.length === 0 ? (
              <HelpText>No notifications sent yet</HelpText>
            ) : (
              <HistoryList>
                {history.map((entry, i) => (
                  <HistoryItem key={entry.logId || i}>
                    <HistorySeverity $phase={severityToPhase(entry.severity)}>{entry.severity?.toUpperCase()}</HistorySeverity>
                    <HistoryTitle>{entry.title}</HistoryTitle>
                    <HistoryTime>{entry.sentAt ? new Date(entry.sentAt).toLocaleString() : ''}</HistoryTime>
                  </HistoryItem>
                ))}
              </HistoryList>
            )}
          </HistorySection>
        )}
      </Content>
    </Card>
  );
}

// Styled components

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.lg};
`;

const Description = styled.p`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  margin: 0;
  line-height: 1.6;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.md};
`;

const SectionTitle = styled.h4`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  margin: 0;
  padding-bottom: ${({ theme }: any) => theme.spacing.xs};
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.line};
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InlineFields = styled.div`
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const Label = styled.label`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Input = styled.input`
  padding: 8px 12px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  max-width: 400px;
  &::placeholder { color: ${({ theme }: any) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }: any) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const NumberInput = styled(Input)`
  max-width: 120px;
  text-align: right;
`;

const Select = styled.select`
  padding: 8px 12px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  max-width: 300px;
  &:focus {
    outline: none;
    border-color: ${({ theme }: any) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: ${({ theme }: any) => theme.colors.secondary[500]};
`;

const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CheckItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  cursor: pointer;
`;

const HelpText = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.sm};
  flex-wrap: wrap;
`;

// The primary-CTA gold treatment (spec §4 Buttons).
const PrimaryButton = styled.button`
  padding: 8px 16px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: 700;
  color: ${({ theme }: any) => theme.colors.onAccent};
  background: ${({ theme }: any) => `linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]})`};
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 8px 16px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  background: ${({ theme }: any) => theme.colors.glass.base};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  cursor: pointer;
  &:hover:not(:disabled) { background: ${({ theme }: any) => theme.colors.glass.hi}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ResultBox = styled.div<{ success: boolean }>`
  padding: ${({ theme }: any) => theme.spacing.md};
  border-radius: 6px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  background: ${({ success, theme }: any) => success ? theme.colors.successBg : theme.colors.errorBg};
  color: ${({ success, theme }: any) => success ? theme.colors.bright.emerald : theme.colors.bright.coral};
`;

const StatusBar = styled.div`
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.md};
  background: ${({ theme }: any) => theme.colors.glass.base};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const ErrorText = styled.div`
  color: ${({ theme }: any) => theme.colors.error};
  padding: ${({ theme }: any) => theme.spacing.md};
  background: ${({ theme }: any) => theme.colors.errorBg};
  border-radius: 6px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }: any) => theme.spacing.xl};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const HistorySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.sm};
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }: any) => theme.spacing.sm};
  padding: 6px ${({ theme }: any) => theme.spacing.sm};
  border-radius: 4px;
  background: ${({ theme }: any) => theme.colors.glass.base};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
`;

// Maps watchdog severity onto the spec §5 phase vocabulary instead of a
// bespoke warm ramp — same badge pattern (phaseBadge) used everywhere else
// status is signalled. "high"/"critical" share `quarantined` (coral, the
// "rejected/failed" extrapolation) — the label text still carries the
// distinction, colour is never the only signal (spec §9).
const severityToPhase = (severity: string): PhaseKey => {
  switch (severity) {
    case 'medium':
      return 'fruitingInit';
    case 'high':
    case 'critical':
      return 'quarantined';
    case 'low':
    default:
      return 'empty';
  }
};

const HistorySeverity = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
  min-width: 60px;
  justify-content: center;
`;

const HistoryTitle = styled.span`
  flex: 1;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const HistoryTime = styled.span`
  color: ${({ theme }: any) => theme.colors.textSecondary};
  white-space: nowrap;
`;
