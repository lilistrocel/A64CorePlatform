/**
 * FarmHistoryTab Component
 *
 * Displays all archived cycles across all blocks for a farm.
 * Shows comprehensive historical performance data and cycle completion information.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Trash2, X } from 'lucide-react';
import { glassPanel, glassPanelHover, glassControl, monoLabel, phaseBadge, Spinner } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import { farmApi } from '../../services/farmApi';
import type { BlockArchive } from '../../types/farm';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================
// Night Observatory (T-901, screen sweep). This tab has no literal <table> —
// archived cycles render as a list of clickable glass cards (glassPanelHover).
// Never stack more than 2 glass layers (spec §2): the archive-detail modal is
// layer 1, its nested QualityCard grid deliberately stays a flat tinted card
// (not glassPanel) rather than nesting a second glass surface there.

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FilterSection = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const PageInfo = styled.span`
  ${monoLabel}
  font-size: 0.68rem;
  text-transform: none;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.celeste};
`;

// Summary Cards Section
const SummaryGrid = styled.div`
  ${glassPanel}
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
`;

const SummaryCard = styled.div`
  text-align: center;
`;

const SummaryLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const SummaryValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SummarySubtext = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`;

// Archives List Section
const ArchivesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ArchiveCard = styled.div`
  ${glassPanelHover}
  padding: 20px;
`;

const ArchiveHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ArchiveTitleSection = styled.div`
  flex: 1;
`;

const ArchiveTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const ArchiveMeta = styled.div`
  ${monoLabel}
  font-size: 0.68rem;
  text-transform: none;
  letter-spacing: 0.03em;
  color: ${({ theme }) => theme.colors.muted};
`;

const BlockInfo = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const ArchiveHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  transition: background 150ms ease-in-out, transform 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** Yield-efficiency tier → phase colour (spec §5.2 extrapolation). This is a
 * magnitude scale, not a workflow status, so it borrows the room-phase
 * progression by "how healthy the cycle read": quarantined (worst) through
 * fruiting (best) — never gold-b, which spec §5.1 reserves for the literal
 * Harvesting phase, not a performance tier. */
function getEfficiencyPhase(efficiency: number): PhaseKey {
  if (efficiency >= 90) return 'fruiting';
  if (efficiency >= 75) return 'colonizing';
  if (efficiency >= 60) return 'fruitingInit';
  return 'quarantined';
}

const EfficiencyBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const ArchiveStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 4px;
`;

const StatValue = styled.span`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const QualitySection = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.6;
`;

const QualityRow = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const SpinnerWrap = styled.div`
  margin: 0 auto 16px;
  width: fit-content;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
`;

const EmptyHeadline = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 10px;
`;

const EmptyBody = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  max-width: 480px;
  margin: 0 auto;
`;

const ErrorState = styled.div`
  padding: 24px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
`;

const PaginationButton = styled.button<{ $disabled?: boolean }>`
  ${glassControl}
  padding: 8px 16px;
  color: ${({ $disabled, theme }) => ($disabled ? theme.colors.textDisabled : theme.colors.textPrimary)};
  font-size: 14px;
  font-weight: 500;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ $disabled, theme }) => ($disabled ? theme.colors.glass.base : theme.colors.glass.hi)};
  }
`;

// Confirmation Modal Styles
const ModalOverlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: fadeIn 300ms ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const ModalContent = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  animation: slideIn 300ms ease-in-out;

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ModalTitle = styled.h3`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  border-radius: 4px;
  transition: background 150ms ease-in-out, color 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.base};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  margin-bottom: 24px;
`;

const WarningText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.error};
  font-weight: 500;
  margin: 0 0 16px 0;
`;

const ArchiveDetails = styled.div`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }
`;

const DetailLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: 500;
`;

const DetailValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 600;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const CancelButton = styled.button`
  ${glassControl}
  padding: 10px 20px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** Destructive action — coral-tinted glass, never solid red (spec §4 Buttons). */
const ConfirmDeleteButton = styled.button`
  padding: 10px 20px;
  background: rgba(240, 138, 112, 0.16);
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease-in-out;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: rgba(240, 138, 112, 0.24);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/** Small glass toast chip, bottom-right, with a phase-coloured edge bar
 * (spec §4 Toasts: "emerald-b success, coral-b error"). */
const Toast = styled.div<{ $show: boolean; $type: 'success' | 'error' }>`
  ${glassPanel}
  display: ${({ $show }) => ($show ? 'flex' : 'none')};
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 14px 22px 14px 16px;
  border-left: 3px solid
    ${({ $type, theme }) => ($type === 'success' ? theme.colors.bright.emerald : theme.colors.bright.coral)};
  z-index: 1400;
  align-items: center;
  gap: 12px;
  animation: slideInRight 300ms ease-in-out;

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

const ToastMessage = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** Inline spinner for the (coral, tinted-glass) delete button — rides on
 * `currentColor` so it always matches its host button's text colour instead
 * of assuming a fixed onAccent/onDark value. */
const ButtonSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(240, 138, 112, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// Detail Modal Styles
const DetailModalOverlay = styled.div<{ $isOpen: boolean }>`
  display: ${({ $isOpen }) => ($isOpen ? 'flex' : 'none')};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 36, 0.6);
  backdrop-filter: blur(4px);
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: fadeIn 300ms ease-in-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const DetailModalContent = styled.div`
  ${glassPanel}
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: slideIn 300ms ease-in-out;

  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const DetailModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 32px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const DetailModalHeaderLeft = styled.div`
  flex: 1;
`;

const DetailModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const DetailModalSubtitle = styled.div`
  ${monoLabel}
  font-size: 0.7rem;
  text-transform: none;
  letter-spacing: 0.03em;
  color: ${({ theme }) => theme.colors.celeste};
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
`;

const DetailModalHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DetailModalBody = styled.div`
  padding: 32px;
  overflow-y: auto;
  flex: 1;
`;

const DetailSection = styled.div`
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const DetailSectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.line};
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DetailItemLabel = styled.span`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const DetailItemValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Timeline = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TimelineItem = styled.div`
  display: flex;
  gap: 16px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  border-left: 4px solid ${({ theme }) => theme.colors.primary[500]};
`;

const TimelineIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onDark};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
`;

const TimelineContent = styled.div`
  flex: 1;
`;

const TimelineTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 4px;
`;

const TimelineDate = styled.div`
  ${monoLabel}
  font-size: 0.66rem;
  text-transform: none;
  letter-spacing: 0.03em;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
`;

const TimelineDetails = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;
`;

/** Performance-category tier → phase colour (spec §5.2 extrapolation). Same
 * rationale as getEfficiencyPhase: a magnitude scale reusing the room-phase
 * progression, worst (quarantined) to best (resting — chosen for
 * "exceptional" precisely because gold-b is off-limits here per spec §3/§5.1,
 * reserved for the literal Harvesting phase only). */
const PERFORMANCE_PHASE: Record<string, PhaseKey> = {
  poor: 'quarantined',
  acceptable: 'fruitingInit',
  good: 'inoculated',
  excellent: 'colonizing',
  exceeding: 'fruiting',
  exceptional: 'resting',
};

function getPerformanceCategoryPhase(category: string): PhaseKey {
  return PERFORMANCE_PHASE[category] ?? 'empty';
}

const PerformanceBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
`;

const QualityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
`;

const QualityCard = styled.div<{ $grade: string }>`
  background: ${({ $grade, theme }) => {
    switch ($grade) {
      case 'A':
        return theme.colors.successBg;
      case 'B':
        // Grade B is a mid quality tier, not a warning — gold-b is reserved
        // for the Harvesting phase only (spec §3), so this borrows the
        // colonizing (laurel) phase tint instead of warningBg.
        return 'rgba(201, 203, 164, 0.16)';
      case 'C':
        return theme.colors.errorBg;
      default:
        return theme.colors.glass.base;
    }
  }};
  border: 2px solid
    ${({ $grade, theme }) => {
      switch ($grade) {
        case 'A':
          return theme.colors.success;
        case 'B':
          return theme.colors.phase.colonizing;
        case 'C':
          return theme.colors.error;
        default:
          return theme.colors.line;
      }
    }};
  border-radius: 8px;
  padding: 16px;
  text-align: center;
`;

const QualityGradeLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 8px;
`;

const QualityAmount = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const YieldComparisonBar = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  padding: 20px;
  border-radius: 10px;
`;

const YieldColumn = styled.div`
  flex: 1;
  text-align: center;
`;

const YieldLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: 8px;
`;

const YieldValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const YieldUnit = styled.span`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: 4px;
`;

const VsDivider = styled.div`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface FarmHistoryTabProps {
  farmId: string;
  /** Optional farming year to filter archives */
  farmingYear?: number | null;
}

export function FarmHistoryTab({ farmId, farmingYear }: FarmHistoryTabProps) {
  const [archives, setArchives] = useState<BlockArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [archiveToDelete, setArchiveToDelete] = useState<BlockArchive | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Detail modal state
  const [selectedArchive, setSelectedArchive] = useState<BlockArchive | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    show: false,
    message: '',
    type: 'success',
  });

  useEffect(() => {
    loadArchives();
  }, [farmId, page, farmingYear]);

  const loadArchives = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await farmApi.getFarmArchives(farmId, page, perPage, farmingYear, 'both');
      setArchives(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      console.error('Error loading farm archives:', err);
      setError('Failed to load farm history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary statistics from all archives
  const calculateSummary = () => {
    if (archives.length === 0) {
      return {
        totalCycles: 0,
        avgEfficiency: 0,
        totalYield: 0,
        avgDuration: 0,
      };
    }

    const totalEfficiency = archives.reduce((sum, a) => sum + a.yieldEfficiencyPercent, 0);
    const totalYield = archives.reduce((sum, a) => sum + a.actualYieldKg, 0);
    const totalDuration = archives.reduce((sum, a) => sum + a.cycleDurationDays, 0);

    return {
      totalCycles: total, // Use total from API (all pages)
      avgEfficiency: archives.length > 0 ? totalEfficiency / archives.length : 0,
      totalYield,
      avgDuration: archives.length > 0 ? totalDuration / archives.length : 0,
    };
  };

  const summary = calculateSummary();

  const handlePreviousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  };

  const handleDeleteClick = (archive: BlockArchive, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening detail modal
    setArchiveToDelete(archive);
    setShowDeleteModal(true);
  };

  const handleArchiveClick = (archive: BlockArchive) => {
    setSelectedArchive(archive);
  };

  const handleCloseDetailModal = () => {
    setSelectedArchive(null);
  };

  const handleCloseModal = () => {
    if (!deleting) {
      setShowDeleteModal(false);
      setArchiveToDelete(null);
    }
  };

  // Helper function to determine performance category
  const getPerformanceCategory = (efficiency: number): string => {
    if (efficiency >= 200) return 'exceptional';
    if (efficiency >= 100) return 'exceeding';
    if (efficiency >= 90) return 'excellent';
    if (efficiency >= 70) return 'good';
    if (efficiency >= 50) return 'acceptable';
    return 'poor';
  };

  // Helper function to capitalize performance category
  const formatPerformanceCategory = (category: string): string => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  const handleConfirmDelete = async () => {
    if (!archiveToDelete) return;

    try {
      setDeleting(true);
      await farmApi.deleteArchive(archiveToDelete.archiveId);

      // Show success toast
      setToast({
        show: true,
        message: 'Archive deleted successfully',
        type: 'success',
      });

      // Hide toast after 3 seconds
      setTimeout(() => {
        setToast({ show: false, message: '', type: 'success' });
      }, 3000);

      // Close modal
      setShowDeleteModal(false);
      setArchiveToDelete(null);

      // Reload archives to reflect the deletion
      await loadArchives();
    } catch (err: any) {
      console.error('Error deleting archive:', err);

      // Show error toast
      const errorMessage =
        err.response?.status === 403
          ? 'Permission denied. Only admins can delete archives.'
          : err.response?.data?.message || 'Failed to delete archive. Please try again.';

      setToast({
        show: true,
        message: errorMessage,
        type: 'error',
      });

      // Hide toast after 5 seconds (longer for errors)
      setTimeout(() => {
        setToast({ show: false, message: '', type: 'success' });
      }, 5000);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <LoadingState>
        <SpinnerWrap>
          <Spinner size="large" />
        </SpinnerWrap>
        <div>Loading farm history...</div>
      </LoadingState>
    );
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  return (
    <Container>
      <Header>
        <Title>Farm Cycle History</Title>
        {total > 0 && (
          <PageInfo>
            Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total} cycles
          </PageInfo>
        )}
      </Header>

      {summary.totalCycles > 0 && (
        <SummaryGrid>
          <SummaryCard>
            <SummaryLabel>Total Cycles</SummaryLabel>
            <SummaryValue>{summary.totalCycles}</SummaryValue>
            <SummarySubtext>completed</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Avg Efficiency</SummaryLabel>
            <SummaryValue>{summary.avgEfficiency.toFixed(1)}%</SummaryValue>
            <SummarySubtext>yield efficiency</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Total Yield</SummaryLabel>
            <SummaryValue>{summary.totalYield.toFixed(1)}</SummaryValue>
            <SummarySubtext>kg harvested</SummarySubtext>
          </SummaryCard>

          <SummaryCard>
            <SummaryLabel>Avg Duration</SummaryLabel>
            <SummaryValue>{Math.round(summary.avgDuration)}</SummaryValue>
            <SummarySubtext>days per cycle</SummarySubtext>
          </SummaryCard>
        </SummaryGrid>
      )}

      {archives.length === 0 ? (
        <EmptyState>
          <EmptyHeadline>No archived cycles yet</EmptyHeadline>
          <EmptyBody>
            Complete a full growing cycle (plant → harvest → reset to empty) on any block to see
            historical performance data here.
          </EmptyBody>
        </EmptyState>
      ) : (
        <>
          <ArchivesList>
            {archives.map((archive) => (
              <ArchiveCard key={archive.archiveId} onClick={() => handleArchiveClick(archive)}>
                <ArchiveHeader>
                  <ArchiveTitleSection>
                    <ArchiveTitle>{archive.targetCropName}</ArchiveTitle>
                    <ArchiveMeta>
                      {farmApi.formatDateForDisplay(archive.plantedDate)} →{' '}
                      {farmApi.formatDateForDisplay(archive.harvestCompletedDate)} (
                      {archive.cycleDurationDays} days)
                    </ArchiveMeta>
                    <BlockInfo>
                      Block {archive.blockCode} {archive.blockType ? `• ${archive.blockType}` : ''}
                    </BlockInfo>
                  </ArchiveTitleSection>
                  <ArchiveHeaderActions>
                    <EfficiencyBadge $phase={getEfficiencyPhase(archive.yieldEfficiencyPercent)}>
                      {archive.yieldEfficiencyPercent.toFixed(1)}% Efficiency
                    </EfficiencyBadge>
                    <DeleteButton
                      onClick={(e) => handleDeleteClick(archive, e)}
                      aria-label="Delete archive"
                      title="Delete this archived cycle"
                    >
                      <Trash2 size={18} strokeWidth={1.6} />
                    </DeleteButton>
                  </ArchiveHeaderActions>
                </ArchiveHeader>

                <ArchiveStats>
                  <StatItem>
                    <StatLabel>Plants</StatLabel>
                    <StatValue>
                      {archive.actualPlantCount}{archive.maxPlants ? ` / ${archive.maxPlants}` : ''}
                    </StatValue>
                  </StatItem>

                  <StatItem>
                    <StatLabel>Actual Yield</StatLabel>
                    <StatValue>{archive.actualYieldKg.toFixed(1)} kg</StatValue>
                  </StatItem>

                  <StatItem>
                    <StatLabel>Predicted Yield</StatLabel>
                    <StatValue>{archive.predictedYieldKg.toFixed(1)} kg</StatValue>
                  </StatItem>

                  <StatItem>
                    <StatLabel>Harvests</StatLabel>
                    <StatValue>{archive.totalHarvests}</StatValue>
                  </StatItem>
                </ArchiveStats>

                <QualitySection>
                  <strong>Quality Breakdown:</strong>
                  <QualityRow>
                    <span>Grade A: {archive.qualityBreakdown.qualityAKg.toFixed(1)} kg</span>
                    <span>Grade B: {archive.qualityBreakdown.qualityBKg.toFixed(1)} kg</span>
                    <span>Grade C: {archive.qualityBreakdown.qualityCKg.toFixed(1)} kg</span>
                  </QualityRow>
                </QualitySection>

                {archive.alertsSummary.totalAlerts > 0 && (
                  <QualitySection style={{ marginTop: '12px' }}>
                    <strong>Alerts:</strong> {archive.alertsSummary.resolvedAlerts} /{' '}
                    {archive.alertsSummary.totalAlerts} resolved
                    {archive.alertsSummary.averageResolutionTimeHours && (
                      <span>
                        {' '}
                        (avg resolution: {archive.alertsSummary.averageResolutionTimeHours.toFixed(1)}{' '}
                        hours)
                      </span>
                    )}
                  </QualitySection>
                )}
              </ArchiveCard>
            ))}
          </ArchivesList>

          {totalPages > 1 && (
            <PaginationContainer>
              <PaginationButton onClick={handlePreviousPage} $disabled={page === 1}>
                Previous
              </PaginationButton>
              <PageInfo>
                Page {page} of {totalPages}
              </PageInfo>
              <PaginationButton onClick={handleNextPage} $disabled={page === totalPages}>
                Next
              </PaginationButton>
            </PaginationContainer>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      <ModalOverlay $isOpen={showDeleteModal}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>Delete Archived Cycle</ModalTitle>
            <CloseButton onClick={handleCloseModal} aria-label="Close modal">
              <X size={20} strokeWidth={1.8} />
            </CloseButton>
          </ModalHeader>

          <ModalBody>
            <WarningText>
              Are you sure you want to delete this archived cycle? This action cannot be undone.
            </WarningText>

            {archiveToDelete && (
              <ArchiveDetails>
                <DetailRow>
                  <DetailLabel>Block Code</DetailLabel>
                  <DetailValue>{archiveToDelete.blockCode}</DetailValue>
                </DetailRow>
                <DetailRow>
                  <DetailLabel>Crop</DetailLabel>
                  <DetailValue>{archiveToDelete.targetCropName}</DetailValue>
                </DetailRow>
                <DetailRow>
                  <DetailLabel>Planted Date</DetailLabel>
                  <DetailValue>
                    {farmApi.formatDateForDisplay(archiveToDelete.plantedDate)}
                  </DetailValue>
                </DetailRow>
                <DetailRow>
                  <DetailLabel>Harvest Date</DetailLabel>
                  <DetailValue>
                    {farmApi.formatDateForDisplay(archiveToDelete.harvestCompletedDate)}
                  </DetailValue>
                </DetailRow>
                <DetailRow>
                  <DetailLabel>Duration</DetailLabel>
                  <DetailValue>{archiveToDelete.cycleDurationDays} days</DetailValue>
                </DetailRow>
                <DetailRow>
                  <DetailLabel>Efficiency</DetailLabel>
                  <DetailValue>
                    {archiveToDelete.yieldEfficiencyPercent.toFixed(1)}%
                  </DetailValue>
                </DetailRow>
              </ArchiveDetails>
            )}
          </ModalBody>

          <ModalFooter>
            <CancelButton onClick={handleCloseModal} disabled={deleting}>
              Cancel
            </CancelButton>
            <ConfirmDeleteButton onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <ButtonSpinner />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} strokeWidth={1.6} />
                  Delete
                </>
              )}
            </ConfirmDeleteButton>
          </ModalFooter>
        </ModalContent>
      </ModalOverlay>

      {/* Toast Notification */}
      <Toast $show={toast.show} $type={toast.type}>
        <ToastMessage>{toast.message}</ToastMessage>
      </Toast>

      {/* Archive Detail Modal */}
      {selectedArchive && (
        <DetailModalOverlay $isOpen={!!selectedArchive} onClick={handleCloseDetailModal}>
          <DetailModalContent onClick={(e) => e.stopPropagation()}>
            <DetailModalHeader>
              <DetailModalHeaderLeft>
                <DetailModalTitle>
                  {selectedArchive.targetCropName} - Block {selectedArchive.blockCode}
                </DetailModalTitle>
                <DetailModalSubtitle>
                  <span>{selectedArchive.blockType || 'Block'}</span>
                  <span>•</span>
                  <span>
                    {farmApi.formatDateForDisplay(selectedArchive.plantedDate)} →{' '}
                    {farmApi.formatDateForDisplay(selectedArchive.harvestCompletedDate)}
                  </span>
                  <span>•</span>
                  <span>{selectedArchive.cycleDurationDays} days</span>
                </DetailModalSubtitle>
              </DetailModalHeaderLeft>
              <DetailModalHeaderRight>
                <EfficiencyBadge $phase={getEfficiencyPhase(selectedArchive.yieldEfficiencyPercent)}>
                  {selectedArchive.yieldEfficiencyPercent.toFixed(1)}% Efficiency
                </EfficiencyBadge>
                <CloseButton onClick={handleCloseDetailModal} aria-label="Close modal">
                  <X size={20} strokeWidth={1.8} />
                </CloseButton>
              </DetailModalHeaderRight>
            </DetailModalHeader>

            <DetailModalBody>
              {/* Overview Section */}
              <DetailSection>
                <DetailSectionTitle>Overview</DetailSectionTitle>
                <DetailGrid>
                  <DetailItem>
                    <DetailItemLabel>Plants</DetailItemLabel>
                    <DetailItemValue>
                      {selectedArchive.actualPlantCount}{selectedArchive.maxPlants ? ` / ${selectedArchive.maxPlants}` : ''}
                    </DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Cycle Duration</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.cycleDurationDays} days</DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Total Harvests</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.totalHarvests}</DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Performance</DetailItemLabel>
                    <DetailItemValue>
                      <PerformanceBadge
                        $phase={getPerformanceCategoryPhase(
                          getPerformanceCategory(selectedArchive.yieldEfficiencyPercent)
                        )}
                      >
                        {formatPerformanceCategory(
                          getPerformanceCategory(selectedArchive.yieldEfficiencyPercent)
                        )}
                      </PerformanceBadge>
                    </DetailItemValue>
                  </DetailItem>
                </DetailGrid>
              </DetailSection>

              {/* Yield Performance Section */}
              <DetailSection>
                <DetailSectionTitle>Yield Performance</DetailSectionTitle>
                <YieldComparisonBar>
                  <YieldColumn>
                    <YieldLabel>Predicted Yield</YieldLabel>
                    <YieldValue>
                      {selectedArchive.predictedYieldKg.toFixed(1)}
                      <YieldUnit>kg</YieldUnit>
                    </YieldValue>
                  </YieldColumn>
                  <VsDivider>vs</VsDivider>
                  <YieldColumn>
                    <YieldLabel>Actual Yield</YieldLabel>
                    <YieldValue>
                      {selectedArchive.actualYieldKg.toFixed(1)}
                      <YieldUnit>kg</YieldUnit>
                    </YieldValue>
                  </YieldColumn>
                  <VsDivider>=</VsDivider>
                  <YieldColumn>
                    <YieldLabel>Efficiency</YieldLabel>
                    <YieldValue>
                      {selectedArchive.yieldEfficiencyPercent.toFixed(1)}
                      <YieldUnit>%</YieldUnit>
                    </YieldValue>
                  </YieldColumn>
                </YieldComparisonBar>
              </DetailSection>

              {/* Quality Breakdown Section */}
              <DetailSection>
                <DetailSectionTitle>Quality Breakdown</DetailSectionTitle>
                <QualityGrid>
                  <QualityCard $grade="A">
                    <QualityGradeLabel>Grade A</QualityGradeLabel>
                    <QualityAmount>
                      {selectedArchive.qualityBreakdown.qualityAKg.toFixed(1)} kg
                    </QualityAmount>
                  </QualityCard>
                  <QualityCard $grade="B">
                    <QualityGradeLabel>Grade B</QualityGradeLabel>
                    <QualityAmount>
                      {selectedArchive.qualityBreakdown.qualityBKg.toFixed(1)} kg
                    </QualityAmount>
                  </QualityCard>
                  <QualityCard $grade="C">
                    <QualityGradeLabel>Grade C</QualityGradeLabel>
                    <QualityAmount>
                      {selectedArchive.qualityBreakdown.qualityCKg.toFixed(1)} kg
                    </QualityAmount>
                  </QualityCard>
                </QualityGrid>
              </DetailSection>

              {/* Timeline Section */}
              {selectedArchive.statusChanges && selectedArchive.statusChanges.length > 0 && (
                <DetailSection>
                  <DetailSectionTitle>Timeline & Status Changes</DetailSectionTitle>
                  <Timeline>
                    {selectedArchive.statusChanges.map((change, index) => (
                      <TimelineItem key={index}>
                        <TimelineIcon>{index + 1}</TimelineIcon>
                        <TimelineContent>
                          <TimelineTitle>{change.status?.toUpperCase() || 'UNKNOWN'}</TimelineTitle>
                          <TimelineDate>
                            {farmApi.formatDateForDisplay(change.changedAt)}
                          </TimelineDate>
                          <TimelineDetails>
                            {change.changedByEmail && <div>Changed by: {change.changedByEmail}</div>}
                            {change.notes && <div>Notes: {change.notes}</div>}
                            {change.expectedDate && (
                              <div>Expected: {farmApi.formatDateForDisplay(change.expectedDate)}</div>
                            )}
                            {change.offsetDays !== null && change.offsetDays !== undefined && (
                              <div>
                                Offset: {change.offsetDays > 0 ? '+' : ''}{change.offsetDays} days
                                {change.offsetDays > 0 ? ' (late)' : change.offsetDays < 0 ? ' (early)' : ' (on time)'}
                              </div>
                            )}
                          </TimelineDetails>
                        </TimelineContent>
                      </TimelineItem>
                    ))}
                  </Timeline>
                </DetailSection>
              )}

              {/* Alerts Summary Section */}
              {selectedArchive.alertsSummary.totalAlerts > 0 && (
                <DetailSection>
                  <DetailSectionTitle>Alerts Summary</DetailSectionTitle>
                  <DetailGrid>
                    <DetailItem>
                      <DetailItemLabel>Total Alerts</DetailItemLabel>
                      <DetailItemValue>{selectedArchive.alertsSummary.totalAlerts}</DetailItemValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailItemLabel>Resolved Alerts</DetailItemLabel>
                      <DetailItemValue>
                        {selectedArchive.alertsSummary.resolvedAlerts}
                      </DetailItemValue>
                    </DetailItem>
                    {selectedArchive.alertsSummary.averageResolutionTimeHours && (
                      <DetailItem>
                        <DetailItemLabel>Avg Resolution Time</DetailItemLabel>
                        <DetailItemValue>
                          {selectedArchive.alertsSummary.averageResolutionTimeHours.toFixed(1)} hours
                        </DetailItemValue>
                      </DetailItem>
                    )}
                  </DetailGrid>
                </DetailSection>
              )}

              {/* Block Details Section */}
              <DetailSection>
                <DetailSectionTitle>Block Details</DetailSectionTitle>
                <DetailGrid>
                  <DetailItem>
                    <DetailItemLabel>Block Code</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.blockCode}</DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Block Type</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.blockType || 'N/A'}</DetailItemValue>
                  </DetailItem>
                  {selectedArchive.area && (
                    <DetailItem>
                      <DetailItemLabel>Area</DetailItemLabel>
                      <DetailItemValue>
                        {selectedArchive.area} {selectedArchive.areaUnit}
                      </DetailItemValue>
                    </DetailItem>
                  )}
                  {selectedArchive.maxPlants != null && (
                    <DetailItem>
                      <DetailItemLabel>Max Plants</DetailItemLabel>
                      <DetailItemValue>{selectedArchive.maxPlants}</DetailItemValue>
                    </DetailItem>
                  )}
                  <DetailItem>
                    <DetailItemLabel>Farm</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.farmName}</DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Archived Date</DetailItemLabel>
                    <DetailItemValue>
                      {farmApi.formatDateForDisplay(selectedArchive.archivedAt)}
                    </DetailItemValue>
                  </DetailItem>
                  <DetailItem>
                    <DetailItemLabel>Archived By</DetailItemLabel>
                    <DetailItemValue>{selectedArchive.archivedByEmail}</DetailItemValue>
                  </DetailItem>
                </DetailGrid>
              </DetailSection>
            </DetailModalBody>
          </DetailModalContent>
        </DetailModalOverlay>
      )}
    </Container>
  );
}
