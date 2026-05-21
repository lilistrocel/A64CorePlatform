/**
 * ConfirmationCard Component
 *
 * Reusable card for pending write actions returned by AI Hub (Control section).
 * Shows action description, risk level badge (color-coded), approve/deny buttons,
 * and a live countdown to expiry.
 *
 * Risk level colors:
 *   low    → green  (#0F6E56)
 *   medium → amber  (#B8842A)
 *   high   → red    (#9E2A2A)
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { PendingAction } from '../../types/aiHub';

// ============================================================================
// TYPES
// ============================================================================

export interface ConfirmationCardProps {
  pendingAction: PendingAction;
  onConfirm: (actionId: string, approved: boolean) => void;
  confirming: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getRiskColor(level: string): string {
  switch (level) {
    case 'low':    return '#0F6E56';
    case 'medium': return '#B8842A';
    case 'high':   return '#9E2A2A';
    default:       return '#4B4844';
  }
}

function getRiskIcon(level: string): React.ReactNode {
  switch (level) {
    case 'low':    return <ShieldCheck size={16} color="#0F6E56" aria-hidden="true" />;
    case 'medium': return <Shield size={16} color="#B8842A" aria-hidden="true" />;
    case 'high':   return <ShieldAlert size={16} color="#9E2A2A" aria-hidden="true" />;
    default:       return <Shield size={16} aria-hidden="true" />;
  }
}

function getRiskLabel(level: string): string {
  switch (level) {
    case 'low':    return 'Low Risk';
    case 'medium': return 'Medium Risk';
    case 'high':   return 'High Risk';
    default:       return 'Unknown Risk';
  }
}

function getExpiryRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

interface CardProps {
  $riskColor: string;
}

const Card = styled.div<CardProps>`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ $riskColor }) => `${$riskColor}30`};
  border-left: 3px solid ${({ $riskColor }) => $riskColor};
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CardTitle = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  flex: 1;
`;

interface RiskBadgeProps {
  $riskColor: string;
}

const RiskBadge = styled.span<RiskBadgeProps>`
  font-size: 10px;
  font-weight: 600;
  color: ${({ $riskColor }) => $riskColor};
  background: ${({ $riskColor }) => `${$riskColor}15`};
  border: 1px solid ${({ $riskColor }) => `${$riskColor}30`};
  padding: 2px 7px;
  border-radius: 10px;
`;

const ExpiryTimer = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-variant-numeric: tabular-nums;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
`;

const Description = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  line-height: 1.5;
  margin: 0;
`;

const ToolName = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.raised};
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ApproveButton = styled.button`
  flex: 1;
  padding: 8px 16px;
  min-height: 44px;
  background: ${({ theme }) => theme.colors.status.success};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: #0B5644;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.status.success};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DenyButton = styled.button`
  flex: 1;
  padding: 8px 16px;
  min-height: 44px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.status.danger};
  border: 1.5px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.status.danger};
  }

  &:focus-visible {
    outline: 2px solid #9E2A2A;
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function ConfirmationCard({
  pendingAction,
  onConfirm,
  confirming,
}: ConfirmationCardProps) {
  const [timeLeft, setTimeLeft] = useState(
    getExpiryRemaining(pendingAction.expires_at)
  );

  // Live countdown update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getExpiryRemaining(pendingAction.expires_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingAction.expires_at]);

  const riskColor = getRiskColor(pendingAction.risk_level);
  const isExpired = timeLeft === 'Expired';

  return (
    <Card $riskColor={riskColor} role="region" aria-label="Action confirmation required">
      <CardHeader>
        {getRiskIcon(pendingAction.risk_level)}
        <CardTitle>Confirmation Required</CardTitle>
        <RiskBadge $riskColor={riskColor}>
          {getRiskLabel(pendingAction.risk_level)}
        </RiskBadge>
        <ExpiryTimer
          title="Time remaining to confirm"
          aria-label={`Expires in: ${timeLeft}`}
        >
          {timeLeft}
        </ExpiryTimer>
      </CardHeader>

      <Description>{pendingAction.description}</Description>

      {pendingAction.tool_name && (
        <div>
          <ToolName>{pendingAction.tool_name}</ToolName>
        </div>
      )}

      <ButtonRow>
        <ApproveButton
          onClick={() => onConfirm(pendingAction.action_id, true)}
          disabled={confirming || isExpired}
          aria-label="Approve this action"
        >
          {confirming ? 'Executing...' : 'Approve'}
        </ApproveButton>
        <DenyButton
          onClick={() => onConfirm(pendingAction.action_id, false)}
          disabled={confirming}
          aria-label="Deny this action"
        >
          Deny
        </DenyButton>
      </ButtonRow>
    </Card>
  );
}
