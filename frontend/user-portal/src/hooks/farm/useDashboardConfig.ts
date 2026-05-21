/**
 * useDashboardConfig Hook
 *
 * Manages dashboard configuration (colors, icons, layout) in localStorage.
 */

import { useState, useEffect } from 'react';

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
      empty: '#4B4844',
      planned: '#0F6E56',
      planted: '#0F6E56',
      growing: '#34D399',
      fruiting: '#FCD34D',
      harvesting: '#B8842A',
      cleaning: '#4B4844',
      alert_critical: '#9E2A2A',
      alert_high: '#B85C2A',
      alert_medium: '#FCD34D',
      alert_low: '#FDE68A'
    },
    performanceColors: {
      exceptional: '#0F6E56',
      exceeding: '#34D399',
      excellent: '#0F6E56',
      good: '#FCD34D',
      acceptable: '#B85C2A',
      poor: '#9E2A2A'
    },
    timelinessColors: {
      early: '#0F6E56',
      onTime: '#0F6E56',
      slightlyLate: '#FCD34D',
      late: '#B85C2A',
      veryLate: '#9E2A2A'
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
