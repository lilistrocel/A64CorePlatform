/**
 * ToolCallCard
 *
 * Inline card rendered inside an assistant message bubble when Claude
 * invokes a tool (e.g. query_mongodb, get_alerts).
 * Shows a "pending" spinner while the tool runs, then a "done" checkmark
 * with a short summary of the result.
 */

import styled, { keyframes } from 'styled-components';
import { Check, Wrench } from 'lucide-react';
import type { ToolCallEntry } from '../../stores/aiAssistant.store';

interface ToolCallCardProps {
  toolCall: ToolCallEntry;
}

// Human-readable tool name mapping
const TOOL_LABELS: Record<string, string> = {
  query_mongodb: 'Querying database',
  get_equipment_list: 'Loading equipment',
  get_sensor_readings: 'Fetching sensor data',
  get_alerts: 'Checking alerts',
  get_automations: 'Loading automations',
  get_lab_readings: 'Fetching lab readings',
  get_lab_latest: 'Loading latest lab data',
};

function formatToolName(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const isPending = toolCall.status === 'pending';
  const label = formatToolName(toolCall.name);

  return (
    <Card $isPending={isPending}>
      <ToolIcon aria-hidden="true"><Wrench size={13} strokeWidth={1.8} /></ToolIcon>
      <ToolContent>
        <ToolLabel $isPending={isPending}>
          {label}
          {isPending && <Ellipsis aria-label="Loading">…</Ellipsis>}
        </ToolLabel>
        {toolCall.summary && !isPending && (
          <ToolSummary>{toolCall.summary}</ToolSummary>
        )}
      </ToolContent>
      {isPending && <Spinner aria-label="Tool running" />}
      {!isPending && <DoneCheck aria-hidden="true"><Check size={13} strokeWidth={2.4} /></DoneCheck>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Card = styled.div<{ $isPending: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: ${({ theme, $isPending }) =>
    $isPending ? theme.colors.neutral[100] : theme.colors.successBg};
  border: 1px solid ${({ theme, $isPending }) =>
    $isPending ? theme.colors.neutral[300] : theme.colors.success};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  transition: all 200ms ease;
`;

const ToolIcon = styled.span`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`;

const ToolContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToolLabel = styled.div<{ $isPending: boolean }>`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme, $isPending }) =>
    $isPending ? theme.colors.textSecondary : theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 2px;
`;

const Ellipsis = styled.span`
  letter-spacing: 1px;
`;

const ToolSummary = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 11px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Spinner = styled.div`
  width: 12px;
  height: 12px;
  border: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
  flex-shrink: 0;
`;

const DoneCheck = styled.span`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.success};
  flex-shrink: 0;
`;
