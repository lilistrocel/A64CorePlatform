/**
 * ToolCallCard
 *
 * Inline card rendered inside an assistant message bubble when Claude
 * invokes a tool (e.g. query_mongodb, get_alerts).
 * Shows a "pending" spinner while the tool runs, then a "done" checkmark
 * with a short summary of the result.
 */

import styled, { keyframes } from 'styled-components';
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
      <ToolIcon aria-hidden="true">{isPending ? '' : ''}</ToolIcon>
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
      {!isPending && <DoneCheck aria-hidden="true">✓</DoneCheck>}
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
    $isPending ? theme.colors.surface.raised : theme.colors.accent.sageSoft ?? theme.colors.surface.canvas};
  border: 1px solid ${({ theme, $isPending }) =>
    $isPending ? theme.colors.border.subtle : theme.colors.status.success ?? '#0F6E56'};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.caption};
  transition: all 200ms ease;
`;

const ToolIcon = styled.span`
  font-size: 13px;
  flex-shrink: 0;
`;

const ToolContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToolLabel = styled.div<{ $isPending: boolean }>`
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme, $isPending }) =>
    $isPending ? theme.colors.text.secondary : theme.colors.text.primary};
  display: flex;
  align-items: center;
  gap: 2px;
`;

const Ellipsis = styled.span`
  letter-spacing: 1px;
`;

const ToolSummary = styled.div`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 11px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Spinner = styled.div`
  width: 12px;
  height: 12px;
  border: 2px solid ${({ theme }) => theme.colors.border.subtle};
  border-top-color: ${({ theme }) => theme.colors.accent.sage};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
  flex-shrink: 0;
`;

const DoneCheck = styled.span`
  color: ${({ theme }) => theme.colors.status.success ?? '#0F6E56'};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 13px;
  flex-shrink: 0;
`;
