/**
 * Genetics Repo - Shared Styled Primitives
 *
 * Common building blocks for the genetics screens, kept in one place so the
 * pages stay readable and the visual language stays consistent.
 */

import styled, { css } from 'styled-components';
import type { Theme } from '@a64core/shared';
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
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

export const PageSubtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  max-width: 720px;
  line-height: 1.5;
`;

export const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
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

export const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px dashed ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: 14px;
  line-height: 1.6;
`;

// ============================================================================
// CONTROLS
// ============================================================================

export const Button = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 600;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  transition: filter 0.15s ease, background 0.15s ease;
  border: 1px solid transparent;
  white-space: nowrap;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  &:not(:disabled):hover {
    filter: brightness(0.95);
  }

  ${({ $variant = 'primary', theme }) => {
    if ($variant === 'ghost') {
      return css`
        background: transparent;
        color: ${theme.colors.textPrimary};
        border-color: ${theme.colors.neutral[300]};
      `;
    }
    if ($variant === 'danger') {
      return css`
        background: ${theme.colors.error};
        color: ${theme.colors.onAccent};
      `;
    }
    return css`
      background: ${theme.colors.primary[600]};
      color: ${theme.colors.onAccent};
    `;
  }}
`;

export const Input = styled.input`
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

export const Select = styled.select`
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  min-height: 72px;
  resize: vertical;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export const Hint = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
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
 * vigour loss.
 */
export const GenerationBadge = styled.span<{ $clone: number; $filial?: number }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;

  ${({ $clone, theme }) => {
    if ($clone >= 7) {
      return css`
        background: ${theme.colors.errorBg};
        color: ${theme.colors.terracotta[700]};
      `;
    }
    if ($clone >= 5) {
      return css`
        background: ${theme.colors.warningBg};
        color: ${theme.colors.gold[800]};
      `;
    }
    return css`
      background: ${theme.colors.primary[50]};
      color: ${theme.colors.primary[800]};
    `;
  }}
`;

function getStatusStyles(theme: Theme): Record<AccessionStatus, { bg: string; fg: string }> {
  return {
    active: { bg: theme.colors.successBg, fg: theme.colors.emerald[700] },
    contaminated: { bg: theme.colors.errorBg, fg: theme.colors.terracotta[700] },
    senescent: { bg: theme.colors.warningBg, fg: theme.colors.gold[800] },
    consumed: { bg: theme.colors.neutral[100], fg: theme.colors.neutral[700] },
    archived: { bg: theme.colors.neutral[100], fg: theme.colors.neutral[700] },
    discarded: { bg: theme.colors.neutral[100], fg: theme.colors.textDisabled },
  };
}

export const StatusBadge = styled.span<{ $status: AccessionStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 12px;
  font-weight: 600;
  background: ${({ $status, theme }) => getStatusStyles(theme)[$status].bg};
  color: ${({ $status, theme }) => getStatusStyles(theme)[$status].fg};
`;

// The brand supplies exactly four chromatic voices (spec §1); organism kind
// is a four-way categorical split, so it maps onto them one-to-one rather
// than reaching for the reserved gold: plant→emerald (life/growth), fungus→
// lapis, animal→terracotta (earth/humanity — the old palette's orange was
// already adjacent to this ramp), other→neutral.
function getKindStyles(theme: Theme): Record<OrganismKind, { bg: string; fg: string }> {
  return {
    plant: { bg: theme.colors.successBg, fg: theme.colors.emerald[700] },
    fungus: { bg: theme.colors.primary[50], fg: theme.colors.primary[700] },
    animal: { bg: theme.colors.terracotta[50], fg: theme.colors.terracotta[700] },
    other: { bg: theme.colors.neutral[100], fg: theme.colors.neutral[700] },
  };
}

export const KindBadge = styled.span<{ $kind: OrganismKind }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 12px;
  font-weight: 600;
  background: ${({ $kind, theme }) => getKindStyles(theme)[$kind].bg};
  color: ${({ $kind, theme }) => getKindStyles(theme)[$kind].fg};
`;

/** Asexual vs sexual — the axis that decides which generation counter moves. */
export const ModeBadge = styled.span<{ $mode: ReproductionMode }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ $mode, theme }) => ($mode === 'sexual' ? theme.colors.warningBg : theme.colors.primary[50])};
  color: ${({ $mode, theme }) => ($mode === 'sexual' ? theme.colors.gold[800] : theme.colors.primary[700])};
`;

export const CodeChip = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: 2px 7px;
  white-space: nowrap;
`;

export const Tag = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: 11px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// ============================================================================
// TABLE
// ============================================================================

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`;

export const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  white-space: nowrap;
`;

export const Td = styled.td`
  padding: 11px 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  vertical-align: middle;
`;

export const Tr = styled.tr<{ $clickable?: boolean }>`
  ${({ $clickable, theme }) =>
    $clickable &&
    css`
      cursor: pointer;
      &:hover {
        background: ${theme.colors.surface};
      }
    `}
`;

export const TableScroll = styled.div`
  overflow-x: auto;
`;

// ============================================================================
// BANNERS
// ============================================================================

export const Banner = styled.div<{ $tone?: 'info' | 'warning' | 'error' }>`
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 16px;

  ${({ $tone = 'info', theme }) => {
    if ($tone === 'warning') {
      return css`
        background: ${theme.colors.warningBg};
        color: ${theme.colors.gold[800]};
      `;
    }
    if ($tone === 'error') {
      return css`
        background: ${theme.colors.errorBg};
        color: ${theme.colors.terracotta[700]};
      `;
    }
    return css`
      background: ${theme.colors.infoBg};
      color: ${theme.colors.primary[700]};
    `;
  }}
`;
