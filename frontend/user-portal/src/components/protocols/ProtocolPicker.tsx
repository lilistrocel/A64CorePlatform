/**
 * ProtocolPicker
 *
 * Surfaces the SOPs that apply at this point of work, inside the modal that
 * records it, and pins the one followed onto the record.
 *
 * This component is the reason the protocol library is worth having. A library
 * you have to go and look up is a library nobody opens; the procedure has to
 * appear where the work is happening. It shows nothing at all when no protocol
 * covers the scope, so screens without SOPs stay uncluttered.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useProtocolsForScope } from '../../hooks/protocols/useProtocols';
import type { Protocol } from '../../types/protocols';
import { Field, Hint, Label, Select } from '../genetics/styled';

const StepsBox = styled.div`
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
`;

const StepsHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
`;

const StepsTitle = styled.span`
  font-size: 12.5px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Toggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary[700]};
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const StepList = styled.ol`
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const StepItem = styled.li<{ $critical: boolean }>`
  font-size: 12.5px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};

  ${({ $critical, theme }) =>
    $critical &&
    `
    color: ${theme.colors.textPrimary};
    font-weight: 600;
  `}
`;

const CriticalTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ theme }) => theme.colors.warningBg};
  color: #92400e;
`;

const Ppe = styled.div`
  margin-bottom: 8px;
  font-size: 12px;
  color: #92400e;
`;

interface ProtocolPickerProps {
  /** Scope tag, e.g. 'propagation:agar_to_agar'. */
  scope: string;
  value: string;
  onChange: (protocolId: string) => void;
  /** Wording for what the record is, used in the hint. */
  recordLabel?: string;
}

export function ProtocolPicker({
  scope,
  value,
  onChange,
  recordLabel = 'this record',
}: ProtocolPickerProps) {
  const { data: protocols } = useProtocolsForScope(scope);
  const [expanded, setExpanded] = useState(false);

  // No SOP covers this scope — say nothing rather than showing an empty control.
  if (!protocols || protocols.length === 0) return null;

  const selected: Protocol | undefined = protocols.find((p) => p.id === value);

  return (
    <Field>
      <Label>Protocol followed</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none cited —</option>
        {protocols.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} v{p.version} · {p.title}
          </option>
        ))}
      </Select>
      <Hint>
        {selected
          ? `${selected.code} v${selected.version} will be pinned to ${recordLabel}, so the version followed stays readable even after the protocol is revised.`
          : `Optional. Citing one records which procedure ${recordLabel} was carried out under.`}
      </Hint>

      {selected && selected.steps.length > 0 && (
        <StepsBox>
          <StepsHead>
            <StepsTitle>{selected.title}</StepsTitle>
            <Toggle type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide steps' : `Show ${selected.steps.length} steps`}
            </Toggle>
          </StepsHead>

          {selected.ppe.length > 0 && <Ppe>🦺 PPE: {selected.ppe.join(', ')}</Ppe>}

          {expanded && (
            <StepList>
              {selected.steps.map((s) => (
                <StepItem key={s.order} $critical={s.isCritical}>
                  {s.text}
                  {s.durationMinutes ? ` (${s.durationMinutes} min)` : ''}
                  {s.isCritical && <CriticalTag>critical</CriticalTag>}
                </StepItem>
              ))}
            </StepList>
          )}
        </StepsBox>
      )}
    </Field>
  );
}
