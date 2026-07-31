/**
 * useDashboardConfig Hook
 *
 * Manages dashboard configuration (colors, icons, layout) in localStorage.
 */

import { useState, useEffect } from 'react';
import { theme } from '@a64core/shared';
import type { LucideIcon } from 'lucide-react';
import {
  Square,
  ClipboardList,
  Sprout,
  Leaf,
  Apple,
  Wheat,
  Sparkles,
  AlertTriangle,
  Mountain,
  Construction,
  BarChart3,
  Siren,
  Eye,
  Pencil,
  Trash2,
  Scissors,
  ArrowRight,
} from 'lucide-react';

// NOTE (A20Core sweep, T-900; updated Night Observatory sweep, T-901):
// DEFAULT_CONFIG is a plain object persisted to localStorage, not evaluated
// in a theme context. It reads `theme.colors` once at module load for its
// default hex values (single source of truth), still frozen at import time.
// The "won't flip in dark mode" caveat is moot now that dark is the only
// mode, but the underlying frozen-at-load problem is unchanged — would
// resurface if a light mode ever ships. See src/config/mapConfig.ts for the
// same caveat.
const c = theme.colors;

export interface DashboardConfig {
  version: string;
  colorScheme: {
    stateColors: {
      empty: string;
      planned: string;
      planted: string;
      growing: string;
      fruiting: string;
      harvesting: string;
      cleaning: string;
      alert_critical: string;
      alert_high: string;
      alert_medium: string;
      alert_low: string;
    };
    performanceColors: {
      exceptional: string;
      exceeding: string;
      excellent: string;
      good: string;
      acceptable: string;
      poor: string;
    };
    timelinessColors: {
      early: string;
      onTime: string;
      slightlyLate: string;
      late: string;
      veryLate: string;
    };
  };
  iconSet: 'emoji' | 'material' | 'fontawesome';
  icons: {
    states: {
      empty: string;
      planned: string;
      planted: string;
      growing: string;
      fruiting: string;
      harvesting: string;
      cleaning: string;
      alert: string;
    };
    metrics: {
      farm: string;
      block: string;
      plant: string;
      harvest: string;
      efficiency: string;
      alert: string;
    };
    actions: {
      view: string;
      edit: string;
      delete: string;
      plant: string;
      harvest: string;
      transition: string;
    };
  };
  layout: {
    cardSize: 'compact' | 'medium' | 'large';
    cardsPerRow: 4 | 6 | 8;
    showBlockCode: boolean;
    showBlockName: boolean;
    showCapacityBar: boolean;
    showExpectedDates: boolean;
    showKPIPreview: boolean;
  };
  dataDisplay: {
    yieldUnit: 'kg' | 'lbs' | 'tons';
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    showPercentages: boolean;
    decimalPlaces: number;
  };
}

const DEFAULT_CONFIG: DashboardConfig = {
  version: '1.0',
  colorScheme: {
    // Night Observatory (T-901): the block-lifecycle states are routed onto
    // colors.phase.* (spec §5.2), consistent with BLOCK_STATE_COLORS
    // (src/types/farm.ts) and BLOCK_POLYGON_COLORS (src/config/mapConfig.ts)
    // — same states, same tokens, everywhere. `harvesting` is the one
    // sanctioned gold status; `fruiting` previously (mis)used the raw gold
    // ramp and has moved to phase.fruiting (emerald). The alert_* severity
    // ramp is not a phase/lifecycle vocabulary (it's a danger-depth scale,
    // same technique as AQI_CATEGORY_COLORS in src/types/farm.ts), so it
    // stays off colors.phase.* and off gold entirely — pure terracotta-ramp
    // depth, `alert_critical` bottoming out at phase.quarantined (== error
    // == terracotta[500], "the only red").
    stateColors: {
      empty: c.phase.empty,
      planned: c.phase.preparing,
      planted: c.phase.inoculated,
      growing: c.phase.colonizing,
      fruiting: c.phase.fruiting,
      harvesting: c.phase.harvesting,
      cleaning: c.phase.cleaning,
      alert_critical: c.phase.quarantined,
      alert_high: c.terracotta[400],
      alert_medium: c.terracotta[300],
      alert_low: c.terracotta[200]
    },
    // Performance/timeliness grades are not a status/lifecycle vocabulary
    // (spec §5.2 doesn't cover grading scales) — kept off colors.phase.*.
    // Also kept off the raw gold ramp (previously used for "good" /
    // "slightlyLate", a generic-gold violation of spec §3); the one
    // "caution" tier in each scale uses the frozen `warning` semantic token
    // (gold-b) instead, which spec §1.1 explicitly sanctions as the
    // warning/caution slot — distinct from decorative gold-ramp use.
    performanceColors: {
      exceptional: c.success,
      exceeding: c.emerald[300],
      excellent: c.primary[500],
      good: c.bright.laurel,
      acceptable: c.warning,
      poor: c.error
    },
    timelinessColors: {
      early: c.primary[500],
      onTime: c.success,
      slightlyLate: c.warning,
      late: c.error,
      veryLate: c.terracotta[700]
    }
  },
  iconSet: 'emoji',
  icons: {
    states: {
      empty: '⬜',
      planned: '📋',
      planted: '🌱',
      growing: '🌿',
      fruiting: '🍎',
      harvesting: '🌾',
      cleaning: '🧹',
      alert: '⚠️'
    },
    metrics: {
      farm: '🏞️',
      block: '🏗️',
      plant: '🌱',
      harvest: '🌾',
      efficiency: '📊',
      alert: '🚨'
    },
    actions: {
      view: '👁️',
      edit: '✏️',
      delete: '🗑️',
      plant: '🌱',
      harvest: '✂️',
      transition: '➡️'
    }
  },
  layout: {
    cardSize: 'compact',
    cardsPerRow: 8,
    showBlockCode: true,
    showBlockName: true,
    showCapacityBar: true,
    showExpectedDates: true,
    showKPIPreview: true
  },
  dataDisplay: {
    yieldUnit: 'kg',
    dateFormat: 'DD/MM/YYYY',
    showPercentages: true,
    decimalPlaces: 1
  }
};

// Night Observatory (T-901) lucide-react replacements for
// DEFAULT_CONFIG.icons.* above (spec §6 removes every icon emoji). These are
// consumed as plain emoji strings by components/farm/dashboard/
// CompactBlockCard.tsx (`config.icons.states[block.state]`, out of this
// shard's scope), so the string shape in DashboardConfig/DEFAULT_CONFIG is
// left in place and this is an additive parallel map — repoint that
// consumer (and any other `config.icons.*` reader) to these components
// instead of the emoji strings.
export const STATE_ICON_COMPONENTS: Record<keyof DashboardConfig['icons']['states'], LucideIcon> = {
  empty: Square,
  planned: ClipboardList,
  planted: Sprout,
  growing: Leaf,
  fruiting: Apple,
  harvesting: Wheat,
  cleaning: Sparkles,
  alert: AlertTriangle,
};

export const METRIC_ICON_COMPONENTS: Record<keyof DashboardConfig['icons']['metrics'], LucideIcon> = {
  farm: Mountain,
  block: Construction,
  plant: Sprout,
  harvest: Wheat,
  efficiency: BarChart3,
  alert: Siren,
};

export const ACTION_ICON_COMPONENTS: Record<keyof DashboardConfig['icons']['actions'], LucideIcon> = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
  plant: Sprout,
  harvest: Scissors,
  transition: ArrowRight,
};

const STORAGE_KEY = 'block-monitor-config';

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedConfig = JSON.parse(stored);
        setConfig({ ...DEFAULT_CONFIG, ...parsedConfig });
      }
    } catch (error) {
      console.error('Error loading dashboard config:', error);
    }
  }, []);

  // Update config and save to localStorage
  const updateConfig = (updates: Partial<DashboardConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (error) {
      console.error('Error saving dashboard config:', error);
    }
  };

  // Reset to default
  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    config,
    updateConfig,
    resetConfig
  };
}
