/**
 * Genetics Repo — Remove Line Modal
 *
 * "Remove line" is not one action — it branches on what the line actually
 * holds, mirroring the three distinct server-side operations (see
 * LineService's module docstring for deactivate_line / purge_line /
 * cascade_purge_line):
 *
 * - Zero dependents: nothing is lost, so "Purge permanently" is offered
 *   directly with a plain confirm — proportionate friction, not a
 *   type-to-confirm dance.
 * - Has accessions / propagation events / observations: "Deactivate" (keeps
 *   history) leads as the safe default. "Purge everything" is offered as a
 *   clearly destructive secondary — gated to super_admin, previewed via a
 *   real server dry-run (exact accession codes, not a generic warning)
 *   before the operator ever has to type the line's code back to confirm.
 * - Has harvests or child lines: the server hard-refuses cascade
 *   unconditionally, even with a correct confirm — a harvest is real
 *   production yield, a child line means real downstream work exists. The
 *   button is never offered here; a control that always 409s is worse than
 *   no control. Deactivate remains the only path.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import {
  useDeactivateLine,
  useLineDependents,
  usePurgeLine,
} from '../../hooks/genetics/useGenetics';
import type { CascadePurgeResult, GeneticLine } from '../../types/genetics';
import { canCascadePurge } from './permissions';
import { Modal } from './Modal';
import { Banner, Button, Field, Hint, Input, Label } from './styled';

const List = styled.ul`
  margin: 8px 0 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Item = styled.li`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Count = styled.strong`
  font-weight: 700;
`;

const CodeGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  max-height: 160px;
  overflow-y: auto;
`;

const RemovedCodeChip = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
`;

const DEPENDENT_LABELS: Record<string, string> = {
  accessions: 'accession(s)',
  propagationEvents: 'propagation event(s)',
  observations: 'observation(s)',
  childLines: 'child line(s) derived from this line',
  harvests: 'harvest(s) recorded against this line',
};

type Step = 'menu' | 'cascade';

interface RemoveLineModalProps {
  line: GeneticLine;
  onClose: () => void;
  /**
   * Called after a successful PURGE (plain or cascade) — the line document
   * is gone, so the caller should navigate away rather than leave the
   * detail page pointed at a 404. Never called after a deactivate, since
   * the line still exists.
   */
  onPurged?: () => void;
}

export function RemoveLineModal({ line, onClose, onPurged }: RemoveLineModalProps) {
  const { user } = useAuthStore();
  const role = user?.role;

  const { data: dependents, isLoading } = useLineDependents(line.id);
  const deactivate = useDeactivateLine(line.id);
  const purge = usePurgeLine(line.id);

  const [step, setStep] = useState<Step>('menu');
  const [preview, setPreview] = useState<CascadePurgeResult | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const blocking = Object.entries(dependents ?? {}).filter(([, n]) => n > 0);
  const total = blocking.reduce((sum, [, n]) => sum + n, 0);
  const hasHardBlock = (dependents?.harvests ?? 0) > 0 || (dependents?.childLines ?? 0) > 0;
  const zeroDependents = !isLoading && total === 0;
  const codeMismatch = confirmCode.length > 0 && confirmCode !== line.code;
  const busy = deactivate.isPending || purge.isPending;

  const handleDeactivate = async () => {
    await deactivate.mutateAsync();
    onClose();
  };

  const handlePlainPurge = async () => {
    await purge.mutateAsync({});
    onPurged?.();
    onClose();
  };

  const handleStartCascadePreview = async () => {
    try {
      const result = (await purge.mutateAsync({
        cascade: true,
        dryRun: true,
      })) as CascadePurgeResult;
      setPreview(result);
      setStep('cascade');
    } catch {
      // Surfaced via purge.isError below — nothing further to do here.
    }
  };

  const handleCascadeConfirm = async () => {
    if (codeMismatch || confirmCode !== line.code) return;
    await purge.mutateAsync({ cascade: true, dryRun: false, confirm: confirmCode });
    onPurged?.();
    onClose();
  };

  const handleBackFromCascade = () => {
    setStep('menu');
    setPreview(null);
    setConfirmCode('');
  };

  const mutationError = deactivate.error ?? purge.error;
  const hasMutationError = deactivate.isError || purge.isError;

  return (
    <Modal title={`Remove ${line.code}?`} subtitle={line.commonName} onClose={onClose} footer={
      step === 'menu' ? (
        <>
          <Button type="button" $variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!isLoading && total > 0 && (
            <Button type="button" onClick={handleDeactivate} disabled={busy}>
              {deactivate.isPending ? 'Deactivating…' : 'Deactivate (keeps history)'}
            </Button>
          )}
          {!isLoading && zeroDependents && (
            <Button type="button" $variant="danger" onClick={handlePlainPurge} disabled={busy}>
              {purge.isPending ? 'Purging…' : 'Purge permanently'}
            </Button>
          )}
          {!isLoading && total > 0 && !hasHardBlock && canCascadePurge(role) && (
            <Button
              type="button"
              $variant="danger"
              onClick={handleStartCascadePreview}
              disabled={busy}
            >
              {purge.isPending ? 'Loading preview…' : 'Purge everything…'}
            </Button>
          )}
        </>
      ) : (
        <>
          <Button type="button" $variant="ghost" onClick={handleBackFromCascade} disabled={busy}>
            Back
          </Button>
          <Button
            type="button"
            $variant="danger"
            onClick={handleCascadeConfirm}
            disabled={busy || confirmCode !== line.code}
          >
            {purge.isPending ? 'Purging…' : 'Confirm cascade purge'}
          </Button>
        </>
      )
    }>
      {hasMutationError && (
        <Banner $tone="error">
          {(mutationError as any)?.response?.data?.detail ?? mutationError?.message}
        </Banner>
      )}

      {isLoading && <Hint>Checking what is attached to this line…</Hint>}

      {step === 'menu' && !isLoading && zeroDependents && (
        <Banner>
          Nothing is attached to this line — no accessions, propagation events, observations,
          child lines or harvests. Purging it loses no records. This cannot be undone.
        </Banner>
      )}

      {step === 'menu' && !isLoading && total > 0 && (
        <>
          <Banner $tone={hasHardBlock ? 'warning' : 'info'}>
            This line still has material attached:
            <List>
              {blocking.map(([key, n]) => (
                <Item key={key}>
                  <Count>{n}</Count> {DEPENDENT_LABELS[key] ?? key}
                </Item>
              ))}
            </List>
          </Banner>

          <Hint>
            <strong>Deactivate</strong> retires the line — it stops showing in active-only
            views but every accession, propagation event and observation recorded against it
            is kept exactly as-is, unbroken traceability included.
          </Hint>

          {hasHardBlock && (
            <Banner $tone="warning">
              This line cannot be permanently removed, even by a super_admin — cascade purge
              refuses unconditionally, regardless of confirmation:
              <List>
                {(dependents?.harvests ?? 0) > 0 && (
                  <Item>
                    <Count>{dependents?.harvests}</Count> harvest(s) — real production yield,
                    not a test line, whatever it is named.
                  </Item>
                )}
                {(dependents?.childLines ?? 0) > 0 && (
                  <Item>
                    <Count>{dependents?.childLines}</Count> child line(s) derived from it — real
                    downstream work exists.
                  </Item>
                )}
              </List>
              Use <strong>Deactivate</strong> instead.
            </Banner>
          )}

          {!hasHardBlock && !canCascadePurge(role) && (
            <Hint>
              Permanently removing a line with material attached ("purge everything") requires
              a super_admin. Deactivate is available to you now.
            </Hint>
          )}
        </>
      )}

      {step === 'cascade' && preview && (
        <>
          <Banner $tone="warning">
            <strong>This cannot be undone.</strong> Confirming will permanently delete line{' '}
            <strong>{preview.code}</strong> and everything recorded against it:
            <List>
              <Item>
                <Count>{preview.accessionsRemoved}</Count> accession(s)
              </Item>
              <Item>
                <Count>{preview.propagationEventsRemoved}</Count> propagation event(s)
              </Item>
              <Item>
                <Count>{preview.observationsRemoved}</Count> observation(s)
              </Item>
            </List>
            {preview.accessionCodesRemoved.length > 0 && (
              <>
                <Hint>Accession codes that would be destroyed:</Hint>
                <CodeGrid>
                  {preview.accessionCodesRemoved.map((code) => (
                    <RemovedCodeChip key={code}>{code}</RemovedCodeChip>
                  ))}
                </CodeGrid>
              </>
            )}
          </Banner>

          <Field>
            <Label>
              Type <strong>{line.code}</strong> to confirm
            </Label>
            <Input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={line.code}
              autoFocus
            />
            {codeMismatch && <Hint>Doesn&apos;t match &ldquo;{line.code}&rdquo; yet.</Hint>}
          </Field>
        </>
      )}
    </Modal>
  );
}
