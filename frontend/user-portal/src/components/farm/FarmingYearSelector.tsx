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
import type { FarmingYearItem } from '../../services/farmApi';

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
          <CalendarIcon>📅</CalendarIcon>
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
          <CalendarIcon $disabled>📅</CalendarIcon>
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
        <CalendarIcon $disabled={disabled}>📅</CalendarIcon>
        <Select
          id="farming-year-select"
          value={selectedYear === null ? 'all' : selectedYear.toString()}
          onChange={handleChange}
          disabled={disabled}
          aria-label={label}
          $compact={compact}
        >
          {showAllOption && <option value="all">📆 All Years</option>}
          {availableYears.map((yearItem) => (
            <option key={yearItem.year} value={yearItem.year.toString()}>
              {yearItem.display}
              {yearItem.isCurrent ? ' ✓ Current' : ''}
              {yearItem.isNext ? ' → Next' : ''}
            </option>
          ))}
        </Select>
        <DropdownArrow $disabled={disabled}>▼</DropdownArrow>
      </SelectWrapper>
      {!compact && selectedYear !== null && (
        <SelectedInfo>
          <YearBadge
            $isCurrent={currentYearItem?.isCurrent}
            $isNext={currentYearItem?.isNext}
            $hasData={currentYearItem?.hasHarvests || currentYearItem?.hasBlocks}
          >
            {currentYearItem?.isCurrent && <BadgeIcon>✓</BadgeIcon>}
            {currentYearItem?.isNext && <BadgeIcon>→</BadgeIcon>}
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
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SelectWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const CalendarIcon = styled.span<{ $disabled?: boolean }>`
  position: absolute;
  left: 12px;
  font-size: 16px;
  pointer-events: none;
  z-index: 1;
  opacity: ${(props) => (props.$disabled ? '0.5' : '1')};
  transition: opacity 150ms ease-in-out;
`;

const DropdownArrow = styled.span<{ $disabled?: boolean }>`
  position: absolute;
  right: 12px;
  font-size: 10px;
  color: ${(props) => (props.$disabled ? '#bdbdbd' : '#757575')};
  pointer-events: none;
  transition: color 150ms ease-in-out, transform 150ms ease-in-out;
`;

const baseSelectStyles = `
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  appearance: none;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    border-color: #3b82f6;
    background-color: #f8faff;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  &:focus + ${DropdownArrow} {
    color: #3b82f6;
  }

  &:disabled {
    background-color: #f5f5f5;
    color: #9e9e9e;
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $compact?: boolean }>`
  ${baseSelectStyles}
  padding: ${(props) => (props.$compact ? '8px 32px 8px 36px' : '12px 32px 12px 40px')};

  /* Mobile responsive */
  @media (max-width: 768px) {
    padding: ${(props) => (props.$compact ? '8px 28px 8px 32px' : '10px 32px 10px 36px')};
    font-size: 13px;
  }
`;

const LoadingSelect = styled.select<{ $compact?: boolean }>`
  ${baseSelectStyles}
  padding: ${(props) => (props.$compact ? '8px 32px 8px 36px' : '12px 32px 12px 40px')};
  color: #757575;
  font-style: italic;
  padding-right: 40px;

  @media (max-width: 768px) {
    padding: ${(props) => (props.$compact ? '8px 28px 8px 32px' : '10px 32px 10px 36px')};
  }
`;

const EmptySelect = styled.select<{ $compact?: boolean }>`
  ${baseSelectStyles}
  padding: ${(props) => (props.$compact ? '8px 32px 8px 36px' : '12px 32px 12px 40px')};
  color: #ef4444;
  border-color: #fecaca;
  background-color: #fef2f2;

  @media (max-width: 768px) {
    padding: ${(props) => (props.$compact ? '8px 28px 8px 32px' : '10px 32px 10px 36px')};
  }
`;

const LoadingSpinner = styled.div`
  position: absolute;
  right: 12px;
  width: 14px;
  height: 14px;
  border: 2px solid #e0e0e0;
  border-top-color: #3b82f6;
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

const YearBadge = styled.span<{
  $isCurrent?: boolean;
  $isNext?: boolean;
  $hasData?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  transition: all 150ms ease-in-out;

  /* Current year styling - primary blue */
  background: ${(props) =>
    props.$isCurrent
      ? '#e3f2fd'
      : props.$isNext
        ? '#fef3c7'
        : '#f5f5f5'};
  color: ${(props) =>
    props.$isCurrent
      ? '#1976d2'
      : props.$isNext
        ? '#d97706'
        : '#616161'};
  border: 1px solid ${(props) =>
    props.$isCurrent
      ? '#bbdefb'
      : props.$isNext
        ? '#fde68a'
        : '#e0e0e0'};

  &:hover {
    background: ${(props) =>
      props.$isCurrent
        ? '#bbdefb'
        : props.$isNext
          ? '#fde68a'
          : '#eeeeee'};
  }

  @media (max-width: 768px) {
    padding: 3px 8px;
    font-size: 10px;
  }
`;

const BadgeIcon = styled.span`
  font-size: 10px;
  font-weight: 700;
`;

const DataIndicator = styled.span`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  margin-left: 2px;
`;

export default FarmingYearSelector;
