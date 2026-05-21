/**
 * PnlFiltersBar
 *
 * Top filter bar for the P&L page.
 * Controls: Farm selector, Farming Year, custom date range, includeImputed toggle.
 * All state is owned by the parent (PnLPage) and synced to URL query params.
 */

import styled from 'styled-components';
import type { PnlFilters } from '../../pages/pnl/PnLPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FarmOption {
  farmId: string;
  farmName: string;
}

interface PnlFiltersBarProps {
  filters: PnlFilters;
  farms: FarmOption[];
  farmsLoading: boolean;
  onChange: (next: Partial<PnlFilters>) => void;
  /** When true, hides the Farming Year dropdown (used when a global year selector controls it). */
  hideFarmingYear?: boolean;
}

// ─── Styled Components ────────────────────────────────────────────────────────

const FiltersBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space['4']};
  padding: ${({ theme }) => theme.space['6']};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: ${({ theme }) => theme.radii.lg};
  margin-bottom: ${({ theme }) => theme.space['8']};
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
`;

const FilterLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.caption};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-family: inherit;
  cursor: pointer;
  min-width: 160px;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface.raised};
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DateInput = styled.input`
  padding: ${({ theme }) => theme.space['2']} ${({ theme }) => theme.space['4']};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  font-family: inherit;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const ToggleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space['1']};
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space['2']};
  cursor: pointer;
  user-select: none;
`;

interface ToggleInputProps {
  $checked: boolean;
}

const ToggleInput = styled.input<ToggleInputProps>`
  appearance: none;
  width: 36px;
  height: 20px;
  background: ${({ $checked, theme }) =>
    $checked ? theme.colors.status.success : theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.pill};
  position: relative;
  cursor: pointer;
  transition: background 150ms ease-in-out;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${({ $checked }) => ($checked ? '18px' : '2px')};
    width: 16px;
    height: 16px;
    background: ${({ theme }) => theme.colors.surface.canvas};
    border-radius: ${({ theme }) => theme.radii.pill};
    transition: left 150ms ease-in-out;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

const ToggleLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.bodySm};
  color: ${({ theme }) => theme.colors.text.primary};
`;

// ─── Component ────────────────────────────────────────────────────────────────

const FARMING_YEAR_OPTIONS = [
  { value: '', label: 'All Years' },
  { value: 'FY2023', label: 'FY2023' },
  { value: 'FY2024', label: 'FY2024' },
  { value: 'FY2025', label: 'FY2025' },
  { value: 'custom', label: 'Custom Range' },
];

export function PnlFiltersBar({
  filters,
  farms,
  farmsLoading,
  onChange,
  hideFarmingYear = false,
}: PnlFiltersBarProps) {
  // Custom date range only makes sense when the year dropdown is visible
  const showCustomDates = !hideFarmingYear && filters.farmingYear === 'custom';

  return (
    <FiltersBar role="search" aria-label="P&L filter controls">
      {/* Farm selector */}
      <FilterGroup>
        <FilterLabel htmlFor="pnl-farm-select">Farm</FilterLabel>
        <Select
          id="pnl-farm-select"
          value={filters.farmId}
          onChange={(e) => onChange({ farmId: e.target.value })}
          disabled={farmsLoading}
          aria-label="Select farm"
        >
          <option value="">All Farms</option>
          {farms.map((f) => (
            <option key={f.farmId} value={f.farmId}>
              {f.farmName}
            </option>
          ))}
        </Select>
      </FilterGroup>

      {/* Farming Year (hidden when a global year selector is in charge) */}
      {!hideFarmingYear && (
        <FilterGroup>
          <FilterLabel htmlFor="pnl-year-select">Farming Year</FilterLabel>
          <Select
            id="pnl-year-select"
            value={filters.farmingYear}
            onChange={(e) => onChange({ farmingYear: e.target.value, startDate: '', endDate: '' })}
            aria-label="Select farming year"
          >
            {FARMING_YEAR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FilterGroup>
      )}

      {/* Custom date range (only shown when "custom" is selected) */}
      {showCustomDates && (
        <>
          <FilterGroup>
            <FilterLabel htmlFor="pnl-start-date">From</FilterLabel>
            <DateInput
              id="pnl-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              aria-label="Start date"
            />
          </FilterGroup>
          <FilterGroup>
            <FilterLabel htmlFor="pnl-end-date">To</FilterLabel>
            <DateInput
              id="pnl-end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              aria-label="End date"
            />
          </FilterGroup>
        </>
      )}

      {/* Include imputed toggle */}
      <ToggleGroup>
        <FilterLabel as="span">Revenue Confidence</FilterLabel>
        <ToggleRow>
          <ToggleInput
            type="checkbox"
            checked={filters.includeImputed}
            $checked={filters.includeImputed}
            onChange={(e) => onChange({ includeImputed: e.target.checked })}
            aria-label="Include imputed revenue in totals"
            role="switch"
            aria-checked={filters.includeImputed}
          />
          <ToggleLabel>Include imputed revenue</ToggleLabel>
        </ToggleRow>
      </ToggleGroup>
    </FiltersBar>
  );
}
