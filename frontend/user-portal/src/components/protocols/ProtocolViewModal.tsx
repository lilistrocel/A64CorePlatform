/**
 * ProtocolViewModal
 *
 * Read-only view of a procedure, and the printable one.
 *
 * Until this existed the only route to a protocol's content was the edit form,
 * which is a bad way to read an approved SOP: revising the content drops it back
 * to draft and pulls it off the bench, so opening the editor merely to check a
 * step put the procedure one stray keystroke away from being withdrawn.
 *
 * Print is a first-class action rather than an afterthought. A procedure that
 * cannot be pinned above the flow hood gets memorised approximately instead,
 * which defeats the point of writing it down.
 */

import styled, { createGlobalStyle } from 'styled-components';
import type { Protocol } from '../../types/protocols';
import {
  PROTOCOL_CATEGORY_ICONS,
  PROTOCOL_CATEGORY_LABELS,
  PROTOCOL_STATUS_LABELS,
} from '../../types/protocols';
import { Modal } from '../genetics/Modal';
import { Banner, Button, Hint } from '../genetics/styled';

/**
 * Hide the app and promote the protocol panel to the page while printing.
 * Applied only while this modal is mounted, so it cannot affect printing
 * anywhere else in the app.
 */
const PrintStyles = createGlobalStyle`
  @media print {
    body * {
      visibility: hidden;
    }
    [data-protocol-print],
    [data-protocol-print] * {
      visibility: visible;
    }
    [data-protocol-print] {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      max-width: none;
      max-height: none;
      overflow: visible;
      box-shadow: none;
      border: none;
    }
    /* Footer buttons are meaningless on paper. */
    [data-protocol-print] [data-print-hide] {
      display: none !important;
    }
  }
`;

const MetaRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

const Chip = styled.span<{ $tone?: 'active' | 'draft' | 'retired' }>`
  display: inline-flex;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 11.5px;
  font-weight: 700;
  background: ${({ $tone, theme }) =>
    $tone === 'active'
      ? theme.colors.successBg
      : $tone === 'draft'
      ? theme.colors.warningBg
      : theme.colors.surface};
  color: ${({ $tone, theme }) =>
    $tone === 'active' ? theme.colors.emerald[700] : $tone === 'draft' ? theme.colors.gold[800] : theme.colors.neutral[700]};
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SectionLabel = styled.h3`
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Body = styled.p`
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: pre-wrap;
`;

const ItemList = styled.ul`
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const Item = styled.li`
  font-size: 13px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Qty = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Steps = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Step = styled.li<{ $critical: boolean }>`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: ${({ $critical }) => ($critical ? '10px 12px' : '0')};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $critical, theme }) =>
    $critical ? theme.colors.warningBg : 'transparent'};
  border-left: ${({ $critical, theme }) =>
    $critical ? `3px solid ${theme.colors.warning}` : 'none'};
`;

const StepNum = styled.span`
  flex-shrink: 0;
  min-width: 22px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StepText = styled.div`
  font-size: 13.5px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StepMeta = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.gold[800]};
  margin-left: 8px;
`;

const Duration = styled.span`
  font-size: 11.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: 6px;
`;

const RefList = styled.ol`
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Ref = styled.li`
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSecondary};
  word-break: break-word;
`;

const ImageNote = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px dashed ${({ theme }) => theme.colors.neutral[300]};
  font-size: 12.5px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.neutral[200]};
`;

interface ProtocolViewModalProps {
  protocol: Protocol;
  onClose: () => void;
  onEdit?: () => void;
}

export function ProtocolViewModal({ protocol, onClose, onEdit }: ProtocolViewModalProps) {
  const criticalCount = protocol.steps.filter((s) => s.isCritical).length;

  // Tolerate documents written before the image fields existed, and responses
  // from an API whose model predates them. Both produce undefined rather than
  // an empty array, and spreading undefined throws — which took the whole page
  // down rather than degrading to "no images".
  const allImages = [
    ...(protocol.referenceImages ?? []),
    ...protocol.steps.flatMap((s) => s.images ?? []),
  ];

  return (
    <>
      <PrintStyles />
      <Modal
        title={`${protocol.code} — ${protocol.title}`}
        subtitle={`v${protocol.version} · ${PROTOCOL_STATUS_LABELS[protocol.status]}${
          protocol.approvedByName ? ` · approved by ${protocol.approvedByName}` : ''
        }`}
        width="780px"
        onClose={onClose}
        footer={
          <span data-print-hide>
            <Button type="button" $variant="ghost" onClick={() => window.print()}>
              Print
            </Button>
            {onEdit && protocol.status !== 'retired' && (
              <Button type="button" $variant="ghost" onClick={onEdit}>
                Edit
              </Button>
            )}
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </span>
        }
      >
        <div data-protocol-print>
          <MetaRow>
            <Chip $tone={protocol.status}>{PROTOCOL_STATUS_LABELS[protocol.status]}</Chip>
            <Chip>
              {PROTOCOL_CATEGORY_ICONS[protocol.category]}{' '}
              {PROTOCOL_CATEGORY_LABELS[protocol.category]}
            </Chip>
            <Chip>{protocol.steps.length} steps</Chip>
            {criticalCount > 0 && <Chip $tone="draft">{criticalCount} critical</Chip>}
          </MetaRow>

          {protocol.status === 'draft' && (
            <Banner $tone="warning" style={{ marginTop: 14 }}>
              This is a draft. It is not offered when recording work, and it should not
              be followed at the bench until approved.
            </Banner>
          )}

          {protocol.ppe.length > 0 && (
            <Banner $tone="warning" style={{ marginTop: 14 }}>
              🦺 <strong>PPE required:</strong> {protocol.ppe.join(', ')}
            </Banner>
          )}

          {protocol.safetyNotes && (
            <Banner $tone="error" style={{ marginTop: 10 }}>
              <strong>Safety:</strong> {protocol.safetyNotes}
            </Banner>
          )}

          {protocol.purpose && (
            <Section style={{ marginTop: 16 }}>
              <SectionLabel>Purpose</SectionLabel>
              <Body>{protocol.purpose}</Body>
            </Section>
          )}

          {protocol.scope && (
            <Section style={{ marginTop: 14 }}>
              <SectionLabel>Scope</SectionLabel>
              <Body>{protocol.scope}</Body>
            </Section>
          )}

          {(protocol.equipment.length > 0 || protocol.materials.length > 0) && (
            <Section style={{ marginTop: 16 }}>
              <SectionLabel>Equipment &amp; materials</SectionLabel>
              <ItemList>
                {[...protocol.equipment, ...protocol.materials].map((c, i) => (
                  <Item key={`${c.name}-${i}`}>
                    {c.name}
                    {c.quantity ? <Qty> — {c.quantity}</Qty> : null}
                    {c.notes ? <Qty> ({c.notes})</Qty> : null}
                  </Item>
                ))}
              </ItemList>
            </Section>
          )}

          <Divider style={{ margin: '18px 0' }} />

          <Section>
            <SectionLabel>Procedure</SectionLabel>
            <Steps>
              {protocol.steps.map((s) => (
                <Step key={s.order} $critical={s.isCritical}>
                  <StepNum>{s.order}.</StepNum>
                  <StepText>
                    {s.text}
                    {s.durationMinutes ? <Duration>~{s.durationMinutes} min</Duration> : null}
                    {s.isCritical && <StepMeta>critical</StepMeta>}
                    {s.notes && (
                      <Hint style={{ display: 'block', marginTop: 4 }}>{s.notes}</Hint>
                    )}
                  </StepText>
                </Step>
              ))}
            </Steps>
          </Section>

          {allImages.length === 0 && (
            <Section style={{ marginTop: 18 }}>
              <SectionLabel>Visual reference</SectionLabel>
              <ImageNote>
                No photographs attached yet. Photos taken in this lab — your substrate,
                your lighting, your strain — are more diagnostic than stock images, and
                unambiguously yours to use. Attach them as you go.
              </ImageNote>
            </Section>
          )}

          {allImages.length > 0 && (
            <Section style={{ marginTop: 18 }}>
              <SectionLabel>Visual reference</SectionLabel>
              <ItemList>
                {allImages.map((img, i) => (
                  <Item key={i}>
                    {img.caption}
                    {img.showsWhat ? <Qty> — look for: {img.showsWhat}</Qty> : null}
                    {img.attribution ? <Qty> ({img.attribution})</Qty> : null}
                  </Item>
                ))}
              </ItemList>
            </Section>
          )}

          {protocol.appliesTo.length > 0 && (
            <Section style={{ marginTop: 18 }}>
              <SectionLabel>Appears at</SectionLabel>
              <MetaRow>
                {protocol.appliesTo.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </MetaRow>
            </Section>
          )}

          {protocol.references.length > 0 && (
            <Section style={{ marginTop: 18 }}>
              <SectionLabel>Sources</SectionLabel>
              <RefList>
                {protocol.references.map((r, i) => (
                  <Ref key={i}>{r}</Ref>
                ))}
              </RefList>
            </Section>
          )}

          {protocol.notes && (
            <Section style={{ marginTop: 18 }}>
              <SectionLabel>Notes</SectionLabel>
              <Body>{protocol.notes}</Body>
            </Section>
          )}
        </div>
      </Modal>
    </>
  );
}
