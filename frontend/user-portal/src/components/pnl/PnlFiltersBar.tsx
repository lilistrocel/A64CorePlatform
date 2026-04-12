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
}

// ─── Styled Components ────────────────────────────────────────────────────────

const FiltersBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const FilterLabel = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-family: inherit;
  cursor: pointer;
  min-width: 160px;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[100]};
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DateInput = styled.input`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-family: inherit;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ToggleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
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
    $checked ? theme.colors.success : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.full};
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
    background: white;
    border-radius: ${({ theme }) => theme.borderRadius.full};
    transition: left 150ms ease-in-out;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ToggleLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// ─── Component ────────────────────────────────────────────────────────────────

const FARMING_YEAR_OPTIONS = [
  { value: '', label: 'All Years' },
  { value: 'FY2023', label: 'FY2023' },
  { value: 'FY2024', label: 'FY2024' },
  { value: 'FY2025', label: 'FY2025' },
  { value: 'custom', label: 'Custom Range' },
];

export function PnlFiltersBar({ filters, farms, farmsLoading, onChange }: PnlFiltersBarProps) {
  const showCustomDates = filters.farmingYear === 'custom';

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

      {/* Farming Year */}
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
