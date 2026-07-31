/**
 * Genetics Repo - Shared Styled Primitives
 *
 * Common building blocks for the genetics screens, kept in one place so the
 * pages stay readable and the visual language stays consistent.
 *
 * Night Observatory (T-901 Phase 3, spec §4): retinted once here so every
 * consumer (genetics + mushroom's DeleteRoomDialog/HarvestEntryModal, which
 * import Button/Banner/Hint from this file) picks it up. Badges route
 * through the phase map (`phaseBadge()`) where the vocabulary is a genuine
 * status (AccessionStatus); `GenerationBadge`/`KindBadge`/`ModeBadge` stay
 * categorical (`colors.bright.*`), per the shard brief's "G/F generation
 * badges are categorical, not the phase map" note.
 */

import styled, { css } from 'styled-components';
import type { PhaseKey } from '@a64core/shared';
import { glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { AccessionStatus, OrganismKind, ReproductionMode } from '../../types/genetics';

// ============================================================================
// LAYOUT
// ============================================================================

export const PageWrap = styled.div`
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
`;

export const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`;

export const PageTitle = styled.h1`
  font-size: 1.9rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: -0.01em;
  margin: 0 0 4px 0;
`;

export const PageSubtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
  max-width: 720px;
  line-height: 1.5;
`;

export const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Card = styled.div`
  ${glassPanel}
  padding: 20px;
`;

export const Toolbar = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 20px;
`;

export const Grid = styled.div<{ $min?: string }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${({ $min }) => $min ?? '300px'}, 1fr));
  gap: 16px;
`;

// Empty state — Fraunces italic celeste headline pattern (spec §4). This
// primitive doubles as an inline dashed placeholder in some screens, so it
// keeps a light border rather than the full three-part empty-state layout;
// callers wanting the full pattern (headline + sentence + button) compose it
// directly.
export const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px dashed ${({ theme }) => theme.colors.line};
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
`;

// ============================================================================
// CONTROLS
// ============================================================================

// Primary/Secondary(ghost)/Destructive per spec §4 "Buttons". Gold is the
// primary-CTA fill (spec §3 budget item) — callers using $variant="primary"
// spend this screen's one gold CTA allotment.
export const Button = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 11px;
  cursor: pointer;
  transition: transform 150ms ease, filter 0.15s ease, background 0.15s ease;
  border: 1px solid transparent;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:not(:disabled):hover {
    transform: translateY(-1px);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }

  ${({ $variant = 'primary', theme }) => {
    if ($variant === 'ghost') {
      return css`
        background: transparent;
        color: ${theme.colors.celeste};
        border-color: ${theme.colors.glass.border};

        &:not(:disabled):hover {
          background: rgba(180, 200, 220, 0.07);
          color: ${theme.colors.textPrimary};
        }
      `;
    }
    if ($variant === 'danger') {
      // Destructive: coral-tinted glass, never solid red (spec §4).
      return css`
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border-color: ${theme.colors.error}66;

        &:not(:disabled):hover {
          background: ${theme.colors.error}33;
        }
      `;
    }
    return css`
      background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
      color: ${theme.colors.onAccent};
      box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);

      &:not(:disabled):hover {
        box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
      }
    `;
  }}
`;

export const Input = styled.input`
  ${glassControl}
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

export const Select = styled.select`
  ${glassControl}
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

export const TextArea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  min-height: 72px;
  resize: vertical;
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Label = styled.label`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Hint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`;

export const FormRow = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 2}, 1fr);
  gap: 14px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

// ============================================================================
// BADGES
// ============================================================================

/**
 * Generation chip. Clone depth drives the colour — deeper clone chains shade
 * warmer as a standing senescence cue, since that is the number that predicts
 * vigour loss. Categorical/ordinal, not a phase — built from `bright.*`
 * (never gold, spec §3) per the shard brief's genetics-badge note.
 */
export const GenerationBadge = styled.span<{ $clone: number; $filial?: number }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 99px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;

  ${({ $clone, theme }) => {
    if ($clone >= 7) {
      return css`
        background: ${theme.colors.bright.coral}29;
        color: ${theme.colors.bright.coral};
      `;
    }
    if ($clone >= 5) {
      return css`
        background: ${theme.colors.bright.terra}29;
        color: ${theme.colors.bright.terra};
      `;
    }
    return css`
      background: ${theme.colors.infoBg};
      color: ${theme.colors.bright.lapis};
    `;
  }}
`;

// AccessionStatus is a genuine status vocabulary, extrapolated onto the
// phase map per spec §5.2: active -> fruiting (live/approved), contaminated
// -> quarantined (the alert colour), senescent -> maintenance (needs
// attention), consumed -> resting (closed out), archived/discarded ->
// decommissioned (dim, out of the system). Exported so other genetics views
// (LineageTree's status dots) reuse the exact same mapping instead of
// inventing a parallel one.
export const ACCESSION_STATUS_TO_PHASE: Record<AccessionStatus, PhaseKey> = {
  active: 'fruiting',
  contaminated: 'quarantined',
  senescent: 'maintenance',
  consumed: 'resting',
  archived: 'decommissioned',
  discarded: 'decommissioned',
};

export const StatusBadge = styled.span<{ $status: AccessionStatus }>`
  ${({ $status }) => phaseBadge(ACCESSION_STATUS_TO_PHASE[$status])}
`;

// The brand supplies exactly four bright chromatic voices for a four-way
// categorical split (spec §1); organism kind maps onto them one-to-one
// rather than reaching for the reserved gold: plant -> emerald (life/
// growth), fungus -> lapis, animal -> terra (earth/humanity), other -> muted.
function getKindHue(kind: OrganismKind): string | null {
  const map: Record<OrganismKind, string | null> = {
    plant: 'emerald',
    fungus: 'lapis',
    animal: 'terra',
    other: null,
  };
  return map[kind];
}

export const KindBadge = styled.span<{ $kind: OrganismKind }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  ${({ $kind, theme }) => {
    const hue = getKindHue($kind);
    if (!hue) {
      return css`
        background: rgba(126, 134, 166, 0.16);
        color: ${theme.colors.muted};
      `;
    }
    const c = (theme.colors.bright as Record<string, string>)[hue];
    return css`
      background: ${c}29;
      color: ${c};
    `;
  }}
`;

/** Asexual vs sexual — the axis that decides which generation counter moves.
 * Binary categorical, not a status — lapis/lavender rather than gold. */
export const ModeBadge = styled.span<{ $mode: ReproductionMode }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ $mode, theme }) =>
    $mode === 'sexual' ? `${theme.colors.bright.lavender}29` : theme.colors.infoBg};
  color: ${({ $mode, theme }) =>
    $mode === 'sexual' ? theme.colors.bright.lavender : theme.colors.bright.lapis};
`;

export const CodeChip = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.celeste};
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
`;

export const Tag = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// TABLE — spec §4 "Tables": transparent rows, Space Mono uppercase celeste
// headers, `line` dividers, hover rgba(180,200,220,.05).
// ============================================================================

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`;

export const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

export const Td = styled.td`
  padding: 11px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

export const Tr = styled.tr<{ $clickable?: boolean }>`
  ${({ $clickable }) =>
    $clickable &&
    css`
      cursor: pointer;
      &:hover {
        background: rgba(180, 200, 220, 0.05);
      }
    `}
`;

export const TableScroll = styled.div`
  overflow-x: auto;
`;

// ============================================================================
// BANNERS — glass chip with a phase-coloured edge, echoing the toast pattern
// (spec §4 "Toasts": emerald-b success, coral-b error, gold-b warning,
// celeste info) since a banner is a persistent inline toast.
// ============================================================================

export const Banner = styled.div<{ $tone?: 'info' | 'warning' | 'error' }>`
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 16px;
  border: 1px solid transparent;
  border-left-width: 3px;

  ${({ $tone = 'info', theme }) => {
    if ($tone === 'warning') {
      return css`
        background: ${theme.colors.warningBg};
        color: ${theme.colors.warning};
        border-left-color: ${theme.colors.warning};
      `;
    }
    if ($tone === 'error') {
      return css`
        background: ${theme.colors.errorBg};
        color: ${theme.colors.error};
        border-left-color: ${theme.colors.error};
      `;
    }
    return css`
      background: ${theme.colors.infoBg};
      color: ${theme.colors.celeste};
      border-left-color: ${theme.colors.bright.lapis};
    `;
  }}
`;
