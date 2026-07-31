/**
 * FarmDashboard Component
 *
 * Redesigned Farm Manager Dashboard with tabbed layout:
 * - Overview: KPI cards, blocks-by-state chart, quick actions
 * - Farm Breakdown: per-farm stacked bar chart, harvest bar chart, comparison table
 * - Activity & Alerts: summary cards and activity placeholder
 */

import { useState, useEffect, useCallback } from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import { Filter, ChevronUp, ChevronDown } from 'lucide-react';
import type { Theme, PhaseKey } from '@a64core/shared';
import { PageHeader as SharedPageHeader, glassPanel, glassControl, monoLabel } from '@a64core/shared';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { farmApi } from '../../services/farmApi';
import { apiClient } from '../../services/api';
import { GlobalFarmAnalyticsModal } from './GlobalFarmAnalyticsModal';
import { FarmList } from './FarmList';
import { formatNumber } from '../../utils';
import { useFarmingYearStore } from '../../stores/farmingYear.store';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardSummaryResponse {
  success: boolean;
  data: {
    overview: {
      totalFarms: number;
      totalBlocks: number;
      activePlantings: number;
      upcomingHarvests: number;
    };
    blocksByState: {
      empty: number;
      planned: number;
      growing: number;
      fruiting: number;
      harvesting: number;
      cleaning: number;
      alert: number;
      partial: number;
    };
    blocksByFarm: Array<{
      farmId: string;
      farmName: string;
      totalBlocks: number;
      empty: number;
      planned: number;
      growing: number;
      fruiting: number;
      harvesting: number;
      cleaning: number;
      alert: number;
      partial: number;
    }>;
    harvestSummary: {
      totalHarvestsKg: number;
      harvestsByFarm: Array<{
        farmId: string;
        farmName: string;
        totalKg: number;
        harvestCount: number;
      }>;
    };
    recentActivity: {
      recentHarvests: number;
      pendingTasks: number;
      activeAlerts: number;
    };
    farmingYearContext: {
      farmingYear: number | null;
      isFiltered: boolean;
    };
  };
}

type ActiveTab = 'overview' | 'activity' | 'farms';

type SortKey = 'farmName' | 'totalBlocks' | 'activePlantings' | 'totalKg';
type SortDirection = 'asc' | 'desc';

// States available for the state chip filter (excludes 'partial' which is a composite state)
type BlockState = 'empty' | 'planned' | 'growing' | 'fruiting' | 'harvesting' | 'cleaning' | 'alert';

// ============================================================================
// CONSTANTS
// ============================================================================

// Block-state → room-phase map (Night Observatory spec §5.2 — "crop stage" is
// named explicitly as an extrapolation target). Themed once per render (not a
// module constant) because Recharts `fill` props take plain strings, not
// styled-components callbacks. Each of the 8 block states gets its own,
// DISTINCT phase key (this feeds the pie/stacked-bar chart legends, filter
// chips and KPI accents, which all need 8 visually distinct colours) —
// mapped by literal name where the block-state vocabulary already matches a
// room-phase name (empty/fruiting/harvesting/cleaning), and by closest
// lifecycle analogue otherwise. Gold (`harvesting`) is used exactly once,
// for the one state that is literally the harvest phase — the predecessor
// map incorrectly also gold-ed `fruiting`, which broke the "≤1 gold status"
// rule (spec §3/§5.2).
const BLOCK_STATE_PHASE_MAP: Record<string, PhaseKey> = {
  empty: 'empty',              // literal match
  planned: 'preparing',        // scheduled, not yet growing
  growing: 'colonizing',       // active vegetative growth
  fruiting: 'fruiting',        // literal match
  harvesting: 'harvesting',    // literal match — the ONE gold status
  cleaning: 'cleaning',        // literal match
  alert: 'quarantined',        // problem state, coral — the only red
  partial: 'maintenance',      // mixed/composite virtual-block state
};

function getStateColors(theme: Theme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(BLOCK_STATE_PHASE_MAP).map(([state, phase]) => [state, theme.colors.phase[phase]])
  );
}

const STATE_LABELS: Record<string, string> = {
  empty: 'Empty',
  planned: 'Planned',
  growing: 'Growing',
  fruiting: 'Fruiting',
  harvesting: 'Harvesting',
  cleaning: 'Cleaning',
  alert: 'Alert',
  partial: 'Partial',
};

const TABS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'farms', label: 'View Farms' },
  { id: 'activity', label: 'Activity & Alerts' },
];

// Block states that are exposed in the filter UI (partial is omitted — it's a derived state)
const FILTERABLE_STATES: BlockState[] = [
  'empty',
  'planned',
  'growing',
  'fruiting',
  'harvesting',
  'cleaning',
  'alert',
];

// ============================================================================
// ANIMATIONS
// ============================================================================

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

// ============================================================================
// STYLED COMPONENTS — LAYOUT
// ============================================================================

const Container = styled.div`
  /* No background here — the fixed Sky layer (spec §7) must show through
     every routed page. */
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 1440px;
  margin: 0 auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: ${({ theme }) => theme.spacing.md};
  }
`;

// ============================================================================
// STYLED COMPONENTS — TABS
// ============================================================================

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  gap: 4px;
  overflow-x: auto;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const TabButton = styled.button<{ $active: boolean }>`
  position: relative;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  color: ${({ $active, theme }) => ($active ? theme.colors.textPrimary : theme.colors.muted)};
  background: none;
  border: none;
  /* Pull the button down 1px so its ::after underline overlays the TabBar's
     own hairline border-bottom instead of sitting just above it. */
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms ease-in-out;

  /* Sliding underline indicator: scales horizontally from 0 → 1 when the
     tab becomes active. Sits exactly on top of the TabBar's hairline
     border-bottom so it visually replaces it for the active tab. Celeste,
     not gold — tab emphasis is secondary emphasis (spec §3). */
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: ${({ theme }) => theme.colors.celeste};
    transform: scaleX(${({ $active }) => ($active ? 1 : 0)});
    transform-origin: center;
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:hover::after {
    transform: scaleX(${({ $active }) => ($active ? 1 : 0.4)});
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const TabContent = styled.div`
  animation: ${fadeIn} 200ms ease-out;
`;

// ============================================================================
// STYLED COMPONENTS — KPI CARDS
// ============================================================================

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const KpiCard = styled.div<{ $borderColor: string }>`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
  border-radius: 14px;
  border-left: 3px solid ${({ $borderColor }) => $borderColor};
  transition: box-shadow 150ms ease-in-out, transform 150ms ease-in-out;

  &:hover {
    transform: translateY(-2px);
  }
`;

const KpiIndicator = styled.div<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $color }) => $color};
  box-shadow: 0 0 6px ${({ $color }) => $color}99;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const KpiLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const KpiValue = styled.div<{ $color?: string }>`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: 800;
  color: ${({ theme, $color }) => $color || theme.colors.textPrimary};
  line-height: ${({ theme }) => theme.typography.lineHeight.tight};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const KpiSubtext = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// STYLED COMPONENTS — CHART PANELS
// ============================================================================

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: ${({ theme }) => theme.breakpoints.desktop}) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
`;

const PanelFull = styled(Panel)`
  grid-column: 1 / -1;
`;

const PanelTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.lg} 0;
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 280px;
`;

// ============================================================================
// STYLED COMPONENTS — BLOCKS BY STATE LEGEND
// ============================================================================

const StateLegend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const StateLegendItem = styled.div`
  ${monoLabel}
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 0.6rem;
  color: ${({ theme }) => theme.colors.celeste};
`;

const StateDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ $color }) => $color};
  box-shadow: 0 0 6px ${({ $color }) => $color}99;
  flex-shrink: 0;
`;

// ============================================================================
// STYLED COMPONENTS — QUICK ACTIONS
// ============================================================================

const QuickActionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// Variant recipes mirror the shared Button.tsx primary/secondary/ghost
// treatment (spec §4 "Buttons") — kept local because this button also needs
// an `outline`-named alias for its one existing call site.
const ActionBtn = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-radius: 10px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms ease-in-out, box-shadow 150ms ease-in-out,
    border-color 150ms ease-in-out, transform 150ms ease-in-out;
  border: 1px solid transparent;

  ${({ $variant, theme }) => {
    if ($variant === 'primary') {
      return `
        background: linear-gradient(145deg, ${theme.colors.secondary[500]}, ${theme.colors.secondary[600]});
        color: ${theme.colors.onAccent};
        box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
        &:hover { transform: translateY(-1px); }
      `;
    }
    if ($variant === 'secondary') {
      return `
        background: ${theme.colors.glass.base};
        border-color: ${theme.colors.glass.border};
        color: ${theme.colors.textPrimary};
        &:hover { background: ${theme.colors.glass.hi}; }
      `;
    }
    // outline — ghost treatment (ghost/secondary CTA, never gold)
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border-color: ${theme.colors.glass.border};
      &:hover {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
      }
    `;
  }}

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

// ============================================================================
// STYLED COMPONENTS — FARM BREAKDOWN TABLE
// ============================================================================

// Table sits inside ONE glass Panel already (spec §4 "Tables" two-layer
// rule) — no independent chrome here, transparent rows on the panel ground.
const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const Thead = styled.thead``;

const Th = styled.th<{ $sortable?: boolean }>`
  ${monoLabel}
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-align: left;
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    color: ${({ $sortable, theme }) => ($sortable ? theme.colors.textPrimary : theme.colors.celeste)};
  }
`;

const Tbody = styled.tbody``;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background 150ms ease-in-out;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
`;

// Numeric/code table cells (spec §4 "Tables" — Space Mono for numeric/code
// cells).
const TdSecondary = styled(Td)`
  ${monoLabel}
  font-size: 0.78rem;
  text-transform: none;
  letter-spacing: 0;
  color: ${({ theme }) => theme.colors.celeste};
`;

const SortIndicator = styled.span`
  margin-left: 4px;
  opacity: 0.6;
`;

// ============================================================================
// STYLED COMPONENTS — ACTIVITY TAB
// ============================================================================

const ActivityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const ActivityCard = styled.div<{ $accent: string }>`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.lg};
  border-top: 3px solid ${({ $accent }) => $accent};
`;

const ActivityCardLabel = styled.div`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const ActivityCardValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const ActivityCardNote = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

const FuturePlaceholder = styled.div`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
`;

const PlaceholderTitle = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-size: 1.15rem;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.celeste};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const PlaceholderText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// STYLED COMPONENTS — STATES
// ============================================================================

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const SpinnerEl = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  /* celeste, not gold — a loading spinner isn't on the gold-budget allowlist
     (spec §3). */
  border-top-color: ${({ theme }) => theme.colors.celeste};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  animation: ${spin} 0.8s linear infinite;
`;

const ErrorContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const EmptyPlaceholder = styled.div`
  text-align: center;
  padding: ${({ theme }) => `${theme.spacing['2xl']} ${theme.spacing.xl}`};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

// ============================================================================
// STYLED COMPONENTS — FILTER BAR
// ============================================================================

const FilterBarWrapper = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const FilterToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const FilterToggleBtn = styled.button`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 7px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  transition: border-color 150ms ease-in-out, color 150ms ease-in-out,
    background 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const FilterActiveDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.bright.lapis};
  flex-shrink: 0;
`;

const FilterActiveCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.bright.lapis};
  /* onDark, not onAccent — this fill is lapis, not gold (spec §1.1). */
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: 700;
  line-height: 1;
`;

const ClearAllBtn = styled.button`
  padding: 7px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.error};
  background: transparent;
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 11px;
  cursor: pointer;
  transition: background 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const FilterPanel = styled.div<{ $open: boolean }>`
  overflow: hidden;
  max-height: ${({ $open }) => ($open ? '600px' : '0')};
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  transition: max-height 300ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms ease-in-out;
`;

const FilterPanelInner = styled.div`
  ${glassControl}
  padding: ${({ theme }) => theme.spacing.md};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FilterRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const FilterLabel = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.celeste};
  white-space: nowrap;
  padding-top: 6px;
  min-width: 52px;
`;

const FilterFarmList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const FilterFarmItem = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  padding: 4px ${({ theme }) => theme.spacing.sm};
  border-radius: 6px;
  transition: background 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }

  /* Checkbox/radio: celeste border, gold-hi checked (spec §4 "Inputs"). */
  input[type='checkbox'] {
    accent-color: ${({ theme }) => theme.colors.secondary[500]};
    width: 15px;
    height: 15px;
    cursor: pointer;
    flex-shrink: 0;
  }
`;

const FilterChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
`;

interface FilterChipStyledProps {
  $color: string;
  $selected: boolean;
}

const FilterChip = styled.button<FilterChipStyledProps>`
  padding: 4px ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: 700;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  border: 1.5px solid ${({ $color }) => $color};
  cursor: pointer;
  transition: background 150ms ease-in-out, color 150ms ease-in-out;
  background: ${({ $color, $selected, theme }) =>
    $selected ? $color : theme.colors.glass.base};
  /* onDark, not onAccent — these fills are phase colours (lapis/emerald/
     coral/etc.), never gold except the literal "harvesting" chip, which is
     still a light-on-dark pairing (spec §1.1). */
  color: ${({ $color, $selected, theme }) => ($selected ? theme.colors.onDark : $color)};

  &:hover {
    background: ${({ $color, $selected }) =>
      $selected ? $color : `${$color}22`};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const FilterSelect = styled.select`
  ${glassControl}
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  padding: 7px ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  min-width: 160px;
  transition: border-color 150ms ease-in-out;

  &:hover {
    border-color: ${({ theme }) => theme.colors.glass.border};
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FilterDateGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const FilterDateLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.celeste};
`;

const FilterDateInput = styled.input`
  ${glassControl}
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  padding: 7px ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  transition: border-color 150ms ease-in-out;
  color-scheme: dark;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// ============================================================================
// HELPERS
// ============================================================================

function buildBlockStateChartData(
  blocksByState: DashboardSummaryResponse['data']['blocksByState'],
  stateColors: Record<string, string>
): Array<{ name: string; value: number; color: string }> {
  return (Object.keys(STATE_LABELS) as Array<keyof typeof STATE_LABELS>)
    .map((key) => ({
      name: STATE_LABELS[key],
      value: blocksByState[key as keyof typeof blocksByState] ?? 0,
      color: stateColors[key],
    }))
    .filter((entry) => entry.value > 0);
}

function buildStackedBarData(
  blocksByFarm: DashboardSummaryResponse['data']['blocksByFarm']
) {
  return blocksByFarm.map((farm) => ({
    name: farm.farmName.length > 14 ? farm.farmName.slice(0, 13) + '…' : farm.farmName,
    fullName: farm.farmName,
    empty: farm.empty,
    planned: farm.planned,
    growing: farm.growing,
    fruiting: farm.fruiting,
    harvesting: farm.harvesting,
    cleaning: farm.cleaning,
    alert: farm.alert,
    partial: farm.partial,
  }));
}

function buildHarvestBarData(
  harvestsByFarm: DashboardSummaryResponse['data']['harvestSummary']['harvestsByFarm']
) {
  return harvestsByFarm
    .filter((f) => f.totalKg > 0)
    .sort((a, b) => b.totalKg - a.totalKg)
    .slice(0, 10)
    .map((f) => ({
      name: f.farmName.length > 14 ? f.farmName.slice(0, 13) + '…' : f.farmName,
      fullName: f.farmName,
      kg: f.totalKg,
    }));
}

// ============================================================================
// CUSTOM TOOLTIP
// ============================================================================

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  const theme = useTheme();
  if (!active || !payload || payload.length === 0) return null;
  // glassOpaque recipe (spec §4 "Charts" — tooltips are glassOpaque, not a
  // glass layer stacked on top of the chart's own glass Panel).
  return (
    <div
      style={{
        background: theme.colors.cosmosHi,
        border: `1px solid ${theme.colors.glass.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        color: theme.colors.textPrimary,
        boxShadow: '0 12px 32px rgba(4, 6, 18, 0.5)',
        maxWidth: 220,
      }}
    >
      {label && (
        <div style={{ fontWeight: 700, marginBottom: 6, borderBottom: `1px solid ${theme.colors.line}`, paddingBottom: 4 }}>
          {label}
        </div>
      )}
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: theme.colors.celeste }}>{entry.name}:</span>
          <span style={{ fontWeight: 700 }}>{typeof entry.value === 'number' && entry.name === 'kg' ? `${formatNumber(entry.value)} kg` : formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FarmDashboard() {
  const theme = useTheme();
  const stateColors = getStateColors(theme);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [summary, setSummary] = useState<DashboardSummaryResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalAnalyticsOpen, setGlobalAnalyticsOpen] = useState(false);

  // Farming year from global sidebar selector
  const { selectedYear } = useFarmingYearStore();

  // Filter bar state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFarms, setSelectedFarms] = useState<Set<string>>(new Set());
  const [selectedStates, setSelectedStates] = useState<Set<BlockState>>(new Set());
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [availableCrops, setAvailableCrops] = useState<string[]>([]);

  // Farm breakdown table sorting
  const [sortKey, setSortKey] = useState<SortKey>('farmName');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  // Load available crops for the crop filter dropdown
  useEffect(() => {
    apiClient.get<{ crops: string[] }>('/v1/farm/dashboard/filters/crops')
      .then((res) => setAvailableCrops(res.data.crops || []))
      .catch(() => setAvailableCrops([]));
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (selectedYear !== null) {
        params.farmingYear = String(selectedYear);
      }
      if (selectedCrop) {
        params.cropName = selectedCrop;
      }
      if (dateFrom) {
        params.dateFrom = dateFrom;
      }
      if (dateTo) {
        params.dateTo = dateTo;
      }
      if (selectedFarms.size > 0) {
        params.farmIds = Array.from(selectedFarms).join(',');
      }
      if (selectedStates.size > 0) {
        params.states = Array.from(selectedStates).join(',');
      }

      const response = await apiClient.get<DashboardSummaryResponse>(
        '/v1/farm/dashboard/summary',
        { params }
      );

      if (response.data.success && response.data.data) {
        setSummary(response.data.data);
      } else {
        setError('Dashboard data is unavailable.');
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedCrop, dateFrom, dateTo, selectedFarms, selectedStates]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Table sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // ── Filter helpers ────────────────────────────────────────────────────────────

  const handleToggleFarm = (farmId: string) => {
    setSelectedFarms((prev) => {
      const next = new Set(prev);
      if (next.has(farmId)) {
        next.delete(farmId);
      } else {
        next.add(farmId);
      }
      return next;
    });
  };

  const handleToggleState = (state: BlockState) => {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  };

  const handleClearAllFilters = () => {
    setSelectedFarms(new Set());
    setSelectedStates(new Set());
    setSelectedCrop('');
    setDateFrom('');
    setDateTo('');
  };

  // Count of active filter categories (for the badge)
  const activeFilterCount =
    (selectedFarms.size > 0 ? 1 : 0) +
    (selectedStates.size > 0 ? 1 : 0) +
    (selectedCrop ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  // Build sorted table rows
  const sortedFarmRows = summary
    ? [...summary.blocksByFarm].sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        if (sortKey === 'farmName') {
          aVal = a.farmName.toLowerCase();
          bVal = b.farmName.toLowerCase();
        } else if (sortKey === 'totalBlocks') {
          aVal = a.totalBlocks;
          bVal = b.totalBlocks;
        } else if (sortKey === 'activePlantings') {
          aVal = (a.growing ?? 0) + (a.fruiting ?? 0) + (a.harvesting ?? 0);
          bVal = (b.growing ?? 0) + (b.fruiting ?? 0) + (b.harvesting ?? 0);
        } else {
          // totalKg - join from harvestSummary
          const aHarvest = summary.harvestSummary.harvestsByFarm.find((h) => h.farmId === a.farmId);
          const bHarvest = summary.harvestSummary.harvestsByFarm.find((h) => h.farmId === b.farmId);
          aVal = aHarvest?.totalKg ?? 0;
          bVal = bHarvest?.totalKg ?? 0;
        }

        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : [];

  // ── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <SpinnerEl aria-label="Loading dashboard data" />
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer role="alert">{error}</ErrorContainer>
      </Container>
    );
  }

  if (!summary) return null;

  const { overview, blocksByState, blocksByFarm, harvestSummary, recentActivity } = summary;

  const stateChartData = buildBlockStateChartData(blocksByState, stateColors);
  const stackedBarData = buildStackedBarData(blocksByFarm);
  const harvestBarData = buildHarvestBarData(harvestSummary.harvestsByFarm);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Container>
      {/* Page Header */}
      <SharedPageHeader
        breadcrumb="OPERATIONS · FARM"
        title="Farm Manager Dashboard"
        description="Overview of your farming operations"
      />

      {/* Tab Bar */}
      <TabBar role="tablist" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            $active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabBar>

      {/* Filter Bar */}
      <FilterBarWrapper>
        <FilterToggleRow>
          <FilterToggleBtn
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="dashboard-filter-panel"
          >
            <Filter size={14} strokeWidth={1.8} />
            Filters
            {showFilters ? <ChevronUp size={14} strokeWidth={1.8} /> : <ChevronDown size={14} strokeWidth={1.8} />}
            {hasActiveFilters && <FilterActiveDot aria-hidden="true" />}
            {activeFilterCount > 0 && (
              <FilterActiveCount aria-label={`${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`}>
                {activeFilterCount}
              </FilterActiveCount>
            )}
          </FilterToggleBtn>
          {hasActiveFilters && (
            <ClearAllBtn
              type="button"
              onClick={handleClearAllFilters}
              aria-label="Clear all filters"
            >
              Clear All
            </ClearAllBtn>
          )}
        </FilterToggleRow>

        <FilterPanel $open={showFilters} id="dashboard-filter-panel" aria-hidden={!showFilters}>
          <FilterPanelInner>
            {/* Farm filter */}
            {summary && summary.blocksByFarm.length > 0 && (
              <FilterRow>
                <FilterLabel>Farms:</FilterLabel>
                <FilterFarmList>
                  {summary.blocksByFarm.map((farm) => (
                    <FilterFarmItem key={farm.farmId}>
                      <input
                        type="checkbox"
                        checked={selectedFarms.has(farm.farmId)}
                        onChange={() => handleToggleFarm(farm.farmId)}
                        aria-label={`Filter by farm ${farm.farmName}`}
                      />
                      {farm.farmName}
                    </FilterFarmItem>
                  ))}
                </FilterFarmList>
              </FilterRow>
            )}

            {/* State chip filter */}
            <FilterRow>
              <FilterLabel>States:</FilterLabel>
              <FilterChipList>
                {FILTERABLE_STATES.map((state) => (
                  <FilterChip
                    key={state}
                    type="button"
                    $color={stateColors[state]}
                    $selected={selectedStates.has(state)}
                    onClick={() => handleToggleState(state)}
                    aria-pressed={selectedStates.has(state)}
                    aria-label={`${selectedStates.has(state) ? 'Remove' : 'Add'} ${STATE_LABELS[state]} state filter`}
                  >
                    {STATE_LABELS[state]}
                  </FilterChip>
                ))}
              </FilterChipList>
            </FilterRow>

            {/* Crop filter */}
            <FilterRow>
              <FilterLabel>Crop:</FilterLabel>
              <FilterSelect
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
                aria-label="Filter by crop"
              >
                <option value="">All crops</option>
                {availableCrops.map((crop) => (
                  <option key={crop} value={crop}>
                    {crop}
                  </option>
                ))}
              </FilterSelect>
            </FilterRow>

            {/* Date range filter */}
            <FilterRow>
              <FilterLabel>Dates:</FilterLabel>
              <FilterDateGroup>
                <FilterDateLabel>From</FilterDateLabel>
                <FilterDateInput
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  aria-label="Harvest date from"
                />
                <FilterDateLabel>To</FilterDateLabel>
                <FilterDateInput
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  aria-label="Harvest date to"
                />
              </FilterDateGroup>
            </FilterRow>
          </FilterPanelInner>
        </FilterPanel>
      </FilterBarWrapper>

      {/* ── Tab: Overview ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <TabContent role="tabpanel" aria-label="Overview">
          {/* KPI Cards — accent colours are either a bright.* structural hue
              (counts unrelated to any block state) or the matching phase
              colour for state-derived metrics. Only Upcoming Harvests (the
              literal harvest phase) gets a gold numeral — every other value
              stays textPrimary/bright so gold isn't spent on six tiles at
              once (spec §3 gold budget). */}
          <KpiGrid>
            <KpiCard $borderColor={theme.colors.bright.lapis}>
              <KpiIndicator $color={theme.colors.bright.lapis} aria-hidden="true" />
              <KpiLabel>Total Farms</KpiLabel>
              <KpiValue>{formatNumber(overview.totalFarms)}</KpiValue>
              <KpiSubtext>Active locations</KpiSubtext>
            </KpiCard>

            <KpiCard $borderColor={theme.colors.bright.lavender}>
              <KpiIndicator $color={theme.colors.bright.lavender} aria-hidden="true" />
              <KpiLabel>Total Blocks</KpiLabel>
              <KpiValue>{formatNumber(overview.totalBlocks)}</KpiValue>
              <KpiSubtext>Across all farms</KpiSubtext>
            </KpiCard>

            <KpiCard $borderColor={stateColors.growing}>
              <KpiIndicator $color={stateColors.growing} aria-hidden="true" />
              <KpiLabel>Active Plantings</KpiLabel>
              <KpiValue $color={theme.colors.bright.emerald}>{formatNumber(overview.activePlantings)}</KpiValue>
              <KpiSubtext>Currently growing</KpiSubtext>
            </KpiCard>

            <KpiCard $borderColor={stateColors.harvesting}>
              <KpiIndicator $color={stateColors.harvesting} aria-hidden="true" />
              <KpiLabel>Upcoming Harvests</KpiLabel>
              <KpiValue $color={theme.colors.secondary[500]}>{formatNumber(overview.upcomingHarvests)}</KpiValue>
              <KpiSubtext>Blocks ready to harvest</KpiSubtext>
            </KpiCard>

            <KpiCard $borderColor={theme.colors.bright.verdi}>
              <KpiIndicator $color={theme.colors.bright.verdi} aria-hidden="true" />
              <KpiLabel>Total Yield</KpiLabel>
              <KpiValue>{formatNumber(Math.round(harvestSummary.totalHarvestsKg))}</KpiValue>
              <KpiSubtext>kg harvested</KpiSubtext>
            </KpiCard>

            <KpiCard $borderColor={stateColors.alert}>
              <KpiIndicator $color={stateColors.alert} aria-hidden="true" />
              <KpiLabel>Active Alerts</KpiLabel>
              <KpiValue $color={recentActivity.activeAlerts > 0 ? theme.colors.error : undefined}>
                {formatNumber(recentActivity.activeAlerts)}
              </KpiValue>
              <KpiSubtext>Require attention</KpiSubtext>
            </KpiCard>
          </KpiGrid>

          {/* Charts Row */}
          <ChartGrid>
            {/* Blocks by State — Donut */}
            <Panel>
              <PanelTitle>Blocks by State</PanelTitle>
              {stateChartData.length === 0 ? (
                <EmptyPlaceholder>No block data available</EmptyPlaceholder>
              ) : (
                <>
                  <ChartContainer>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stateChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius="52%"
                          outerRadius="78%"
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {stateChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  <StateLegend>
                    {stateChartData.map((entry) => (
                      <StateLegendItem key={entry.name}>
                        <StateDot $color={entry.color} aria-hidden="true" />
                        {entry.name} ({formatNumber(entry.value)})
                      </StateLegendItem>
                    ))}
                  </StateLegend>
                </>
              )}
            </Panel>

            {/* Quick Actions */}
            <Panel>
              <PanelTitle>Quick Actions</PanelTitle>
              <QuickActionsRow>
                <ActionBtn
                  $variant="outline"
                  onClick={() => setGlobalAnalyticsOpen(true)}
                  aria-label="Open All Farms Statistics"
                >
                  View All Farms Statistics
                </ActionBtn>
              </QuickActionsRow>
            </Panel>
          </ChartGrid>

          {/* Per-farm breakdown — formerly the Farm Breakdown tab. */}
          <ChartGrid>
            {/* Stacked Bar — Block distribution per farm */}
            <PanelFull>
              <PanelTitle>Block Distribution by Farm</PanelTitle>
              {stackedBarData.length === 0 ? (
                <EmptyPlaceholder>No farm block data available</EmptyPlaceholder>
              ) : (
                <ChartContainer style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stackedBarData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.line} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono }}
                        tickLine={false}
                        axisLine={{ stroke: theme.colors.line }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8, color: theme.colors.celeste, fontFamily: theme.typography.fontFamily.mono }}
                      />
                      {(Object.keys(STATE_LABELS) as string[]).map((key) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          stackId="blocks"
                          name={STATE_LABELS[key]}
                          fill={stateColors[key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </PanelFull>

            {/* Harvest by Farm — Bar */}
            <Panel>
              <PanelTitle>Total Harvest by Farm (kg)</PanelTitle>
              {harvestBarData.length === 0 ? (
                <EmptyPlaceholder>No harvest data recorded</EmptyPlaceholder>
              ) : (
                <ChartContainer>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={harvestBarData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={theme.colors.line}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${formatNumber(v)}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: theme.colors.muted, fontFamily: theme.typography.fontFamily.mono }}
                        tickLine={false}
                        axisLine={false}
                        width={80}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      {/* Single-series bar, not a status chart — celeste per
                          the chart series order (spec §4 "Charts"), never
                          gold (gold is not a chart series default, spec §3). */}
                      <Bar dataKey="kg" name="kg" fill={theme.colors.celeste} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </Panel>

            {/* Comparison Table */}
            <Panel>
              <PanelTitle>Farm Comparison</PanelTitle>
              {sortedFarmRows.length === 0 ? (
                <EmptyPlaceholder>No farms found</EmptyPlaceholder>
              ) : (
                <TableWrapper>
                  <Table>
                    <Thead>
                      <tr>
                        <Th
                          $sortable
                          onClick={() => handleSort('farmName')}
                          aria-sort={sortKey === 'farmName' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Farm
                          <SortIndicator aria-hidden="true">{getSortIcon('farmName')}</SortIndicator>
                        </Th>
                        <Th
                          $sortable
                          onClick={() => handleSort('totalBlocks')}
                          aria-sort={sortKey === 'totalBlocks' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Blocks
                          <SortIndicator aria-hidden="true">{getSortIcon('totalBlocks')}</SortIndicator>
                        </Th>
                        <Th
                          $sortable
                          onClick={() => handleSort('activePlantings')}
                          aria-sort={sortKey === 'activePlantings' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Active
                          <SortIndicator aria-hidden="true">{getSortIcon('activePlantings')}</SortIndicator>
                        </Th>
                        <Th
                          $sortable
                          onClick={() => handleSort('totalKg')}
                          aria-sort={sortKey === 'totalKg' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Harvest (kg)
                          <SortIndicator aria-hidden="true">{getSortIcon('totalKg')}</SortIndicator>
                        </Th>
                        <Th>Alerts</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {sortedFarmRows.map((farm) => {
                        const harvestEntry = summary.harvestSummary.harvestsByFarm.find(
                          (h) => h.farmId === farm.farmId
                        );
                        const activePlantings =
                          (farm.growing ?? 0) + (farm.fruiting ?? 0) + (farm.harvesting ?? 0);
                        return (
                          <Tr key={farm.farmId}>
                            <Td>{farm.farmName}</Td>
                            <Td>{formatNumber(farm.totalBlocks)}</Td>
                            <TdSecondary>{formatNumber(activePlantings)}</TdSecondary>
                            <TdSecondary>
                              {harvestEntry ? formatNumber(Math.round(harvestEntry.totalKg)) : '—'}
                            </TdSecondary>
                            <TdSecondary>{farm.alert > 0 ? farm.alert : '—'}</TdSecondary>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableWrapper>
              )}
            </Panel>
          </ChartGrid>
        </TabContent>
      )}

      {/* ── Tab: Activity & Alerts ────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <TabContent role="tabpanel" aria-label="Activity and Alerts">
          <ActivityGrid>
            {/* "Recent Harvests" is literally the harvest phase — gold — and
                "Pending Tasks" is the extrapolated "pending/awaiting" phase
                (spec §5.2), not the block-state `planned` accent it borrowed
                by convenience before (planned ≠ pending — different
                vocabularies). */}
            <ActivityCard $accent={theme.colors.phase.harvesting}>
              <ActivityCardLabel>Recent Harvests</ActivityCardLabel>
              <ActivityCardValue>{formatNumber(recentActivity.recentHarvests)}</ActivityCardValue>
              <ActivityCardNote>Last 7 days</ActivityCardNote>
            </ActivityCard>

            <ActivityCard $accent={stateColors.alert}>
              <ActivityCardLabel>Active Alerts</ActivityCardLabel>
              <ActivityCardValue>{formatNumber(recentActivity.activeAlerts)}</ActivityCardValue>
              <ActivityCardNote>Require attention</ActivityCardNote>
            </ActivityCard>

            <ActivityCard $accent={theme.colors.phase.fruitingInit}>
              <ActivityCardLabel>Pending Tasks</ActivityCardLabel>
              <ActivityCardValue>{formatNumber(recentActivity.pendingTasks)}</ActivityCardValue>
              <ActivityCardNote>Scheduled actions</ActivityCardNote>
            </ActivityCard>
          </ActivityGrid>

          <FuturePlaceholder>
            <PlaceholderTitle>Activity Feed</PlaceholderTitle>
            <PlaceholderText>
              A live activity feed showing recent harvests, state transitions, and
              system events will appear here in a future release.
            </PlaceholderText>
          </FuturePlaceholder>
        </TabContent>
      )}

      {/* ── Tab: View Farms ──────────────────────────────────────────────────── */}
      {activeTab === 'farms' && (
        <TabContent role="tabpanel" aria-label="View Farms">
          <FarmList embedded />
        </TabContent>
      )}

      {/* Global Analytics Modal */}
      <GlobalFarmAnalyticsModal
        isOpen={globalAnalyticsOpen}
        onClose={() => setGlobalAnalyticsOpen(false)}
      />
    </Container>
  );
}
