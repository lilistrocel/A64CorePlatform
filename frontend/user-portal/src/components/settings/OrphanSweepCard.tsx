/**
 * OrphanSweepCard — Genetics Repo org-wide orphan sweep (T-809)
 *
 * Housekeeping, not per-line — lives in Settings rather than on any one
 * line's detail page. Finds accessions, propagation events and observations
 * whose lineId points at a genetic line that no longer exists (leftovers
 * from before this feature existed, or a line removed by some other path)
 * and lets a super_admin remove them.
 *
 * Three-step flow, deliberately not a single button: the counts shown on
 * load (GET /maintenance/orphans) can go stale between page load and a
 * click days later, so "Review & delete" re-runs the same detection as a
 * fresh dry run immediately before the real delete, and shows exactly what
 * that fresh check found — never the possibly-stale numbers from load.
 *
 * super_admin only (genetics.maintenance) — component self-gates, matching
 * ModulesSettingsCard's pattern. Modal-free: the confirm step is inline,
 * consistent with RemoveLineModal's cascade-purge preview.
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useToastStore } from '../../stores/toast.store';
import {
  useDeleteOrphans,
  useOrphans,
} from '../../hooks/genetics/useGenetics';
import type { OrphanRecords } from '../../types/genetics';

const ORPHAN_LABELS: Record<keyof OrphanRecords['counts'], string> = {
  accessions: 'accession(s)',
  observations: 'observation(s)',
  propagationEvents: 'propagation event(s)',
};

export function OrphanSweepCard() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const { data: orphans, isLoading } = useOrphans(isSuperAdmin);
  const deleteOrphans = useDeleteOrphans();

  const [preview, setPreview] = useState<OrphanRecords | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!isSuperAdmin) return null;

  const counts = orphans?.counts;
  const total = counts ? counts.accessions + counts.observations + counts.propagationEvents : 0;
  const breakdown = counts
    ? (Object.entries(counts) as [keyof OrphanRecords['counts'], number][]).filter(
        ([, n]) => n > 0
      )
    : [];

  const handleReview = async () => {
    try {
      const result = await deleteOrphans.mutateAsync({ dryRun: true });
      setPreview(result);
      setConfirming(true);
    } catch (err: any) {
      addToast('error', err?.response?.data?.detail ?? err?.message ?? 'Failed to preview orphan sweep.');
    }
  };

  const handleCancel = () => {
    setConfirming(false);
    setPreview(null);
  };

  const handleDelete = async () => {
    try {
      const result = await deleteOrphans.mutateAsync({ dryRun: false });
      addToast(
        'success',
        `Removed ${result.counts.accessions} orphaned accessions, ` +
          `${result.counts.propagationEvents} propagation events, ` +
          `${result.counts.observations} observations.`
      );
      setConfirming(false);
      setPreview(null);
    } catch (err: any) {
      addToast('error', err?.response?.data?.detail ?? err?.message ?? 'Failed to delete orphaned records.');
    }
  };

  const previewTotal = preview
    ? preview.counts.accessions + preview.counts.observations + preview.counts.propagationEvents
    : 0;

  return (
    <Card title="Genetics Repo Orphan Sweep">
      <Content>
        <Intro>
          Finds accessions, propagation events and observations whose genetic line no longer
          exists — leftovers from before this check existed, or from a line removed by some
          other path. A record with no lineId at all is never an orphan and is never touched
          here.
        </Intro>

        {isLoading ? (
          <Muted>Checking for orphaned records…</Muted>
        ) : total === 0 ? (
          <Muted>No orphaned records found.</Muted>
        ) : (
          <Row>
            <List>
              {breakdown.map(([key, n]) => (
                <Item key={key}>
                  <Count>{n}</Count> {ORPHAN_LABELS[key]}
                </Item>
              ))}
            </List>
          </Row>
        )}

        {!confirming && total > 0 && (
          <ButtonRow>
            <DangerButton onClick={handleReview} disabled={deleteOrphans.isPending}>
              {deleteOrphans.isPending ? 'Checking…' : 'Review & delete orphans'}
            </DangerButton>
          </ButtonRow>
        )}

        {confirming && preview && (
          <ConfirmBox>
            <ConfirmTitle>
              {previewTotal === 0
                ? 'Nothing left to delete'
                : 'Confirm permanent deletion'}
            </ConfirmTitle>
            {previewTotal === 0 ? (
              <ConfirmText>
                A fresh check found no orphaned records — the counts above were already cleared
                by another session, or have since resolved.
              </ConfirmText>
            ) : (
              <>
                <ConfirmText>
                  This fresh check (just now, not the possibly-stale numbers above) found:
                </ConfirmText>
                <List>
                  {(Object.entries(preview.counts) as [keyof OrphanRecords['counts'], number][])
                    .filter(([, n]) => n > 0)
                    .map(([key, n]) => (
                      <Item key={key}>
                        <Count>{n}</Count> {ORPHAN_LABELS[key]}
                      </Item>
                    ))}
                </List>
                <ConfirmText>
                  <strong>This cannot be undone.</strong>
                </ConfirmText>
              </>
            )}
            <ButtonRow>
              <SecondaryButton onClick={handleCancel} disabled={deleteOrphans.isPending}>
                Cancel
              </SecondaryButton>
              {previewTotal > 0 && (
                <DangerButton onClick={handleDelete} disabled={deleteOrphans.isPending}>
                  {deleteOrphans.isPending ? 'Deleting…' : 'Delete permanently'}
                </DangerButton>
              )}
            </ButtonRow>
          </ConfirmBox>
        )}
      </Content>
    </Card>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Intro = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Muted = styled.div`
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-size: 0.875rem;
`;

const List = styled.ul`
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const Item = styled.li`
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const Count = styled.strong`
  font-weight: 700;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
`;

// Warning tint (not error) — this is a confirm step, the actual danger sits
// on the Delete button itself. Semantic token, never a [50]/[100] ramp step.
const ConfirmBox = styled.div`
  background: ${({ theme }: any) => theme.colors.warningBg};
  border: 1px solid ${({ theme }: any) => theme.colors.warning};
  border-radius: 8px;
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const ConfirmTitle = styled.h4`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: ${({ theme }: any) => theme.colors.warning};
`;

const ConfirmText = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
  line-height: 1.5;
`;

const SecondaryButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Destructive action — coral-b tinted glass, never solid red (spec §4).
const DangerButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }: any) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.26);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
