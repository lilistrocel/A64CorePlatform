/**
 * useDashboardConfig Hook
 *
 * Manages dashboard configuration (colors, icons, layout) in localStorage.
 */

import { useState, useEffect } from 'react';
import { lightTheme } from '@a64core/shared';

// NOTE (A20Core sweep, T-900): DEFAULT_CONFIG is a plain object persisted to
// localStorage, not evaluated in a theme context. It reads lightTheme.colors
// once at module load for its default hex values (single source of truth),
// but will not flip in dark mode. See src/config/mapConfig.ts for the same
// caveat and rationale.
const c = lightTheme.colors;

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
    stateColors: {
      empty: c.neutral[500],
      planned: c.primary[500],
      planted: c.success,
      growing: c.emerald[300],
      fruiting: c.gold[300],
      harvesting: c.warning,
      cleaning: c.primary[700], // was purple, decorative-only judgement call, spec §3
      alert_critical: c.terracotta[600], // deepened — danger carries weight, spec §1
      alert_high: c.terracotta[400],
      alert_medium: c.gold[200],
      alert_low: c.gold[100]
    },
    performanceColors: {
      exceptional: c.success,
      exceeding: c.emerald[300],
      excellent: c.primary[500],
      good: c.gold[300],
      acceptable: c.terracotta[400],
      poor: c.terracotta[600]
    },
    timelinessColors: {
      early: c.primary[500],
      onTime: c.success,
      slightlyLate: c.gold[300],
      late: c.terracotta[400],
      veryLate: c.terracotta[600]
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
