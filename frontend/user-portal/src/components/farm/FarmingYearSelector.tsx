/**
 * FarmingYearSelector Component
 *
 * A reusable dropdown component for selecting a farming year.
 * Displays years in the configured format (e.g., 'Aug 2024 - Jul 2025').
 *
 * Features:
 * - Displays farming years in human-readable format
 * - Optional "All Years" selection
 * - Loading state while fetching data
 * - Highlights current farming year
 * - Shows data availability indicators (hasHarvests, hasBlocks)
 * - Consistent styling with design system (matches FarmSelector, DashboardFilters)
 * - Mobile-responsive behavior
 * - Calendar icon for visual context
 */

import styled, { keyframes } from 'styled-components';
import { Calendar, ChevronDown, Check, ArrowRight } from 'lucide-react';
import { glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import type { FarmingYearItem } from '../../services/farmApi';

// Night Observatory (T-901, spec §5.2): the "current farming year" indicator
// is a status vocabulary like any other — route it through the single
// colors.phase.* map instead of ad-hoc lapis/gold. Current == the active
// cycle ("open/active/in progress" -> inoculated); Next == not yet started
// ("pending/awaiting" -> fruitingInit); anything else selected is a past,
// completed year ("closed/settled" -> resting).
function getFarmingYearPhase(isCurrent?: boolean, isNext?: boolean): PhaseKey {
  if (isCurrent) return 'inoculated';
  if (isNext) return 'fruitingInit';
  return 'resting';
}

interface FarmingYearSelectorProps {
  /** Currently selected year (null means "All Years" if showAllOption is true) */
  selectedYear: number | null;
  /** List of available farming years to display */
  availableYears: FarmingYearItem[];
  /** Callback when user selects a year */
  onYearChange: (year: number | null) => void;
  /** Whether to show "All Years" option (default: true) */
  showAllOption?: boolean;
  /** Label to display above the selector */
  label?: string;
  /** Whether the selector is in loading state */
  isLoading?: boolean;
  /** Disable the selector */
  disabled?: boolean;
  /** Optional className for styling */
  className?: string;
  /** Compact mode - removes label and reduces padding */
  compact?: boolean;
}

export function FarmingYearSelector({
  selectedYear,
  availableYears,
  onYearChange,
  showAllOption = true,
  label = 'Farming Year',
  isLoading = false,
  disabled = false,
  className,
  compact = false,
}: FarmingYearSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'all') {
      onYearChange(null);
    } else {
      onYearChange(parseInt(value, 10));
    }
  };

  // Get display string for selected year
  const getSelectedDisplay = () => {
    if (selectedYear === null) {
      return 'All Years';
    }
    const yearItem = availableYears.find((y) => y.year === selectedYear);
    return yearItem?.display || `${selectedYear}`;
  };

  // Get current year item for badge styling
  const currentYearItem = selectedYear !== null
    ? availableYears.find((y) => y.year === selectedYear)
    : null;

  if (isLoading) {
    return (
      <Container className={className} $compact={compact}>
        {!compact && label && <Label>{label}</Label>}
        <SelectWrapper>
          <CalendarIcon aria-hidden="true"><Calendar size={13} strokeWidth={1.6} /></CalendarIcon>
          <LoadingSelect disabled $compact={compact}>
            <option>Loading...</option>
          </LoadingSelect>
          <LoadingSpinner />
        </SelectWrapper>
      </Container>
    );
  }

  if (availableYears.length === 0) {
    return (
      <Container className={className} $compact={compact}>
        {!compact && label && <Label>{label}</Label>}
        <SelectWrapper>
          <CalendarIcon $disabled aria-hidden="true"><Calendar size={13} strokeWidth={1.6} /></CalendarIcon>
          <EmptySelect disabled $compact={compact}>
            <option>No years available</option>
          </EmptySelect>
        </SelectWrapper>
      </Container>
    );
  }

  return (
    <Container className={className} $compact={compact}>
      {!compact && label && <Label htmlFor="farming-year-select">{label}</Label>}
      <SelectWrapper>
        <CalendarIcon $disabled={disabled} aria-hidden="true"><Calendar size={13} strokeWidth={1.6} /></CalendarIcon>
        <Select
          id="farming-year-select"
          value={selectedYear === null ? 'all' : selectedYear.toString()}
          onChange={handleChange}
          disabled={disabled}
          aria-label={label}
          $compact={compact}
        >
          {/* Native <option> text can't host an SVG icon — the emoji/glyph
              decorations are dropped here rather than swapped 1:1 (spec §6). */}
          {showAllOption && <option value="all">All Years</option>}
          {availableYears.map((yearItem) => (
            <option key={yearItem.year} value={yearItem.year.toString()}>
              {yearItem.display}
              {yearItem.isCurrent ? ' (Current)' : ''}
              {yearItem.isNext ? ' (Next)' : ''}
            </option>
          ))}
        </Select>
        <DropdownArrow $disabled={disabled} aria-hidden="true">
          <ChevronDown size={13} strokeWidth={1.8} />
        </DropdownArrow>
      </SelectWrapper>
      {!compact && selectedYear !== null && (
        <SelectedInfo>
          <YearBadge $phase={getFarmingYearPhase(currentYearItem?.isCurrent, currentYearItem?.isNext)}>
            {currentYearItem?.isCurrent && <BadgeIcon><Check size={11} strokeWidth={2} /></BadgeIcon>}
            {currentYearItem?.isNext && <BadgeIcon><ArrowRight size={11} strokeWidth={2} /></BadgeIcon>}
            {getSelectedDisplay()}
            {(currentYearItem?.hasHarvests || currentYearItem?.hasBlocks) && (
              <DataIndicator title="Has farm data" />
            )}
          </YearBadge>
        </SelectedInfo>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS - Design System Consistent
// ============================================================================

// Animation for loading spinner
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Container = styled.div<{ $compact?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${(props) => (props.$compact ? '0' : '8px')};
  min-width: ${(props) => (props.$compact ? '160px' : '220px')};
  position: relative;

  @media (max-width: 768px) {
    min-width: ${(props) => (props.$compact ? '140px' : '100%')};
    width: ${(props) => (props.$compact ? 'auto' : '100%')};
  }
`;

const Label = styled.label`
  ${monoLabel}
  display: block;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const SelectWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const CalendarIcon = styled.span<{ $disabled?: boolean }>`
  position: absolute;
  left: 12px;
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
  pointer-events: none;
  z-index: 1;
  opacity: ${(props) => (props.$disabled ? '0.5' : '1')};
  transition: opacity 150ms ease-in-out;
`;

const DropdownArrow = styled.span<{ $disabled?: boolean }>`
  position: absolute;
  right: 12px;
  display: flex;
  color: ${({ $disabled, theme }) => ($disabled ? theme.colors.muted : theme.colors.celeste)};
  pointer-events: none;
  transition: color 150ms ease-in-out, transform 150ms ease-in-out;
`;

const Select = styled.select<{ $compact?: boolean }>`
  ${glassControl}
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  appearance: none;
  transition: all 150ms ease-in-out;
  padding: ${(props) => (props.$compact ? '8px 32px 8px 36px' : '12px 32px 12px 40px')};

  &:hover:not(:disabled) {
    border-color: rgba(180, 200, 220, 0.35);
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  &:disabled {
    color: ${({ theme }) => theme.colors.muted};
    cursor: not-allowed;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    padding: ${(props) => (props.$compact ? '8px 28px 8px 32px' : '10px 32px 10px 36px')};
    font-size: 13px;
  }
`;

const LoadingSelect = styled.select<{ $compact?: boolean }>`
  ${glassControl}
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  appearance: none;
  transition: all 150ms ease-in-out;
  padding: ${(props) => (props.$compact ? '8px 32px 8px 36px' : '12px 32px 12px 40px')};
  font-style: italic;
  padding-right: 40px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }

  @media (max-width: 768px) {
    padding: ${(props) => (props.$compact ? '8px 28px 8px 32px' : '10px 32px 10px 36px')};
  }
`;

const EmptySelect = styled(Select)`
  color: ${({ theme }) => theme.colors.error};
  border-color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.errorBg};
`;

const LoadingSpinner = styled.div`
  position: absolute;
  right: 12px;
  width: 14px;
  height: 14px;
  border: 2px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.celeste};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const SelectedInfo = styled.div`
  display: flex;
  align-items: center;
  margin-top: 4px;
  flex-wrap: wrap;
  gap: 4px;

  @media (max-width: 768px) {
    margin-top: 2px;
  }
`;

// Night Observatory (T-901, spec §5.2): current/next/past year all route
// through the single colors.phase.* vocabulary via phaseBadge() instead of
// hand-picked lapis/gold ramps — see getFarmingYearPhase() above.
const YearBadge = styled.span<{ $phase: PhaseKey }>`
  ${({ $phase }) => phaseBadge($phase)}
  gap: 5px;

  @media (max-width: 768px) {
    padding: 3px 8px;
    font-size: 0.58rem;
  }
`;

const BadgeIcon = styled.span`
  display: inline-flex;
`;

const DataIndicator = styled.span`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.success};
  margin-left: 2px;
`;

export default FarmingYearSelector;
