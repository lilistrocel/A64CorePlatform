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
 */

import styled from 'styled-components';
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

  if (isLoading) {
    return (
      <Container className={className}>
        {label && <Label>{label}</Label>}
        <LoadingSelect disabled>
          <option>Loading years...</option>
        </LoadingSelect>
      </Container>
    );
  }

  if (availableYears.length === 0) {
    return (
      <Container className={className}>
        {label && <Label>{label}</Label>}
        <EmptySelect disabled>
          <option>No years available</option>
        </EmptySelect>
      </Container>
    );
  }

  return (
    <Container className={className}>
      {label && <Label htmlFor="farming-year-select">{label}</Label>}
      <Select
        id="farming-year-select"
        value={selectedYear === null ? 'all' : selectedYear.toString()}
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
      >
        {showAllOption && <option value="all">All Years</option>}
        {availableYears.map((yearItem) => (
          <option key={yearItem.year} value={yearItem.year.toString()}>
            {yearItem.display}
            {yearItem.isCurrent ? ' (Current)' : ''}
            {yearItem.isNext ? ' (Next)' : ''}
          </option>
        ))}
      </Select>
      {selectedYear !== null && (
        <SelectedInfo>
          <YearBadge $isCurrent={availableYears.find((y) => y.year === selectedYear)?.isCurrent}>
            {getSelectedDisplay()}
          </YearBadge>
        </SelectedInfo>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const baseSelectStyles = `
  padding: 10px 32px 10px 12px;
  font-size: 14px;
  font-weight: 500;
  color: #212121;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23757575' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: all 150ms ease-in-out;

  &:hover:not(:disabled) {
    border-color: #3b82f6;
    background-color: #f8faff;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    background-color: #f5f5f5;
    color: #9e9e9e;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  ${baseSelectStyles}
`;

const LoadingSelect = styled.select`
  ${baseSelectStyles}
  color: #757575;
  font-style: italic;
`;

const EmptySelect = styled.select`
  ${baseSelectStyles}
  color: #f44336;
  border-color: #ffcdd2;
`;

const SelectedInfo = styled.div`
  display: flex;
  align-items: center;
  margin-top: 4px;
`;

const YearBadge = styled.span<{ $isCurrent?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  background: ${(props) => (props.$isCurrent ? '#e3f2fd' : '#f5f5f5')};
  color: ${(props) => (props.$isCurrent ? '#1976d2' : '#616161')};
  border: 1px solid ${(props) => (props.$isCurrent ? '#bbdefb' : '#e0e0e0')};
`;

export default FarmingYearSelector;
