import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CCMWidget, StatWidgetData } from '@a64core/shared';
import { queryClient } from '../config/react-query.config';
import { queryKeys } from '../config/react-query.config';
import type { Layout } from 'react-grid-layout';
import { formatNumber } from '../utils';

interface WidgetState {
  data: StatWidgetData | any;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

interface DashboardState {
  widgets: CCMWidget[];
  widgetData: Record<string, WidgetState>;
  layout: Layout[];
  activeWidgetIds: string[];  // persisted list of active widget IDs
  isLoading: boolean;
  error: string | null;

  // Actions
  loadDashboard: () => Promise<void>;
  loadWidgetData: (widgetId: string) => Promise<void>;
  refreshWidget: (widgetId: string) => Promise<void>;
  refreshAllWidgets: () => Promise<void>;
  addWidget: (widgetId: string) => Promise<void>;
  removeWidget: (widgetId: string) => Promise<void>;
  updateLayout: (newLayout: Layout[]) => void;
  resetLayout: () => void;
  clearError: () => void;
}

// Helper function to generate default layout from widgets
const generateDefaultLayout = (widgets: CCMWidget[]): Layout[] => {
  const layouts: Layout[] = [];
  let currentX = 0;
  let currentY = 0;
  const maxCols = 4;

  widgets.forEach((widget) => {
    const cols = widget.size === 'large' ? 2 : widget.size === 'wide' ? 4 : 1;
    // Increase height for charts to prevent overlap (3 rows = 450px)
    const rows = widget.type === 'chart' ? 3 : 1;

    // If widget doesn't fit in current row, move to next row
    if (currentX + cols > maxCols) {
      currentX = 0;
      // Find the maximum Y position occupied by any widget so far
      const maxY = layouts.reduce((max, layout) => Math.max(max, layout.y + layout.h), 0);
      currentY = maxY;
    }

    // Constrain widget width to not exceed maxCols
    const constrainedCols = Math.min(cols, maxCols);

    layouts.push({
      i: widget.id,
      x: currentX,
      y: currentY,
      w: constrainedCols,
      h: rows,
      minW: 1,
      minH: widget.type === 'chart' ? 2 : 1,
      maxH: widget.type === 'chart' ? 6 : 3,
      maxW: maxCols,
    });

    // Update position for next widget
    currentX += constrainedCols;
  });

  return layouts;
};

// Full catalog of all available widgets
export const WIDGET_CATALOG: CCMWidget[] = [
  {
    id: 'total-farms',
    title: 'Total Farms',
    icon: '🏞️',
    description: 'Number of registered farms',
    dataSource: { type: 'module', moduleName: 'farm', endpoint: '/api/v1/farm/farms' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-blocks',
    title: 'Total Blocks',
    icon: '🧱',
    description: 'Total cultivation blocks across all farms',
    dataSource: { type: 'module', moduleName: 'farm', endpoint: '/api/v1/farm/blocks' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-harvests',
    title: 'Total Harvests',
    icon: '🌾',
    description: 'Completed harvest records',
    dataSource: { type: 'module', moduleName: 'farm', endpoint: '/api/v1/farm/harvests' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-orders',
    title: 'Total Orders',
    icon: '📦',
    description: 'Sales orders across all customers',
    dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/v1/sales/orders' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-employees',
    title: 'Total Employees',
    icon: '👥',
    description: 'Total number of employees',
    dataSource: { type: 'module', moduleName: 'hr', endpoint: '/api/v1/hr/employees' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-customers',
    title: 'Total Customers',
    icon: '🤝',
    description: 'Total CRM customers',
    dataSource: { type: 'module', moduleName: 'crm', endpoint: '/api/v1/crm/customers' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-vehicles',
    title: 'Total Vehicles',
    icon: '🚚',
    description: 'Logistics fleet vehicles',
    dataSource: { type: 'module', moduleName: 'logistics', endpoint: '/api/v1/logistics/vehicles' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'total-campaigns',
    title: 'Active Campaigns',
    icon: '📢',
    description: 'Marketing campaigns',
    dataSource: { type: 'module', moduleName: 'marketing', endpoint: '/api/v1/marketing/campaigns' },
    type: 'stat',
    size: 'medium',
  },
  {
    id: 'orders-by-status-chart',
    title: 'Orders by Status',
    icon: '📊',
    description: 'Distribution of orders by status',
    dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/v1/sales/dashboard' },
    type: 'chart',
    size: 'large',
  },
  {
    id: 'blocks-by-farm-chart',
    title: 'Blocks by Farm',
    icon: '🌾',
    description: 'Block distribution across farms',
    dataSource: { type: 'module', moduleName: 'farm', endpoint: '/api/v1/farm/farms' },
    type: 'chart',
    size: 'large',
  },
];

// Default widgets shown on first load
const DEFAULT_WIDGET_IDS = [
  'total-farms',
  'total-blocks',
  'total-harvests',
  'total-orders',
  'orders-by-status-chart',
  'blocks-by-farm-chart',
];

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      widgets: [],
      widgetData: {},
      layout: [],
      activeWidgetIds: [],
      isLoading: false,
      error: null,

  loadDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      // Use persisted active widget IDs, or default set on first load
      const storedActiveIds = get().activeWidgetIds;
      const activeIds = storedActiveIds.length > 0 ? storedActiveIds : DEFAULT_WIDGET_IDS;

      // Build widgets list from catalog based on active IDs
      const widgets: CCMWidget[] = activeIds
        .map(id => WIDGET_CATALOG.find(w => w.id === id))
        .filter((w): w is CCMWidget => w !== undefined);

      // Generate default layout if not exists or if layout doesn't match widgets
      const currentLayout = get().layout;
      const layoutWidgetIds = currentLayout.map(l => l.i);
      const widgetIds = widgets.map(w => w.id);

      // Check if any widgets overlap (indicating bad layout)
      const hasOverlaps = currentLayout.some((layout1, i) =>
        currentLayout.slice(i + 1).some((layout2) => {
          const xOverlap = layout1.x < layout2.x + layout2.w && layout1.x + layout1.w > layout2.x;
          const yOverlap = layout1.y < layout2.y + layout2.h && layout1.y + layout1.h > layout2.y;
          return xOverlap && yOverlap;
        })
      );

      const layoutIsValid = currentLayout.length > 0 &&
                           layoutWidgetIds.length === widgetIds.length &&
                           widgetIds.every(id => layoutWidgetIds.includes(id)) &&
                           !hasOverlaps;

      // Force regenerate if layout is invalid or has overlaps
      const newLayout = layoutIsValid ? currentLayout : generateDefaultLayout(widgets);

      set({ widgets: widgets, layout: newLayout, activeWidgetIds: activeIds, isLoading: false });

      // Load data for all widgets
      await Promise.all(widgetIds.map(id => get().loadWidgetData(id)));
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.response?.data?.message || 'Failed to load dashboard',
      });
    }
  },

  loadWidgetData: async (widgetId: string) => {
    set((state) => ({
      widgetData: {
        ...state.widgetData,
        [widgetId]: {
          ...state.widgetData[widgetId],
          loading: true,
          error: null,
        },
      },
    }));

    try {
      let data: any = null;

      // OPTIMIZATION: Use single aggregated dashboard summary endpoint
      // This replaces 80+ individual API calls with ONE call (~28ms)
      const summary = await queryClient.fetchQuery({
        queryKey: queryKeys.dashboard.summary(),
        queryFn: async () => {
          const { dashboardDataService } = await import('../services/dashboard-data.service');
          return dashboardDataService.getDashboardSummary();
        },
      });

      // Extract widget-specific data from summary
      switch (widgetId) {
        case 'total-farms': {
          data = {
            value: formatNumber(summary.overview.totalFarms),
            label: 'Total Farms',
            secondaryMetrics: [
              { value: formatNumber(summary.overview.activePlantings), label: 'Active Plantings' },
            ],
          };
          break;
        }

        case 'total-blocks': {
          data = {
            value: formatNumber(summary.overview.totalBlocks),
            label: 'Total Blocks',
            secondaryMetrics: [
              { value: formatNumber(summary.overview.activePlantings), label: 'Active' },
              { value: formatNumber(summary.blocksByState.empty), label: 'Empty' },
            ],
          };
          break;
        }

        case 'total-harvests': {
          data = {
            value: formatNumber(summary.harvestSummary.totalHarvestsKg, { decimals: 2 }),
            label: 'Total Harvests (kg)',
            secondaryMetrics: [
              { value: formatNumber(summary.blocksByState.harvesting), label: 'Harvesting Now' },
            ],
          };
          break;
        }

        case 'total-orders': {
          // Keep sales stats separate (not yet in aggregated endpoint)
          const stats = await queryClient.fetchQuery({
            queryKey: queryKeys.dashboard.salesStats(),
            queryFn: async () => {
              const { dashboardDataService } = await import('../services/dashboard-data.service');
              return dashboardDataService.getSalesStats();
            },
          });
          data = {
            value: formatNumber(stats.totalOrders),
            label: 'Total Orders',
            secondaryMetrics: [
              { value: formatNumber(stats.deliveredOrders), label: 'Delivered' },
              { value: formatNumber(stats.processingOrders), label: 'Processing' },
            ],
          };
          break;
        }

        case 'orders-by-status-chart': {
          // Keep sales chart separate (not yet in aggregated endpoint)
          const orderData = await queryClient.fetchQuery({
            queryKey: queryKeys.dashboard.ordersByStatus(),
            queryFn: async () => {
              const { dashboardDataService } = await import('../services/dashboard-data.service');
              return dashboardDataService.getOrdersByStatus();
            },
          });
          data = {
            chartType: 'pie',
            data: orderData.map(item => ({
              name: item.status,
              value: item.count,
            })),
            xKey: 'name',
            yKey: 'value',
          };
          break;
        }

        case 'blocks-by-farm-chart': {
          // Use data from aggregated summary
          data = {
            chartType: 'bar',
            data: summary.blocksByFarm.map(farm => ({
              farm: farm.farmName,
              blocks: farm.totalBlocks,
            })),
            xKey: 'farm',
            yKey: 'blocks',
            series: [
              { name: 'Blocks', dataKey: 'blocks', color: '#3b82f6' },
            ],
          };
          break;
        }

        case 'total-employees': {
          try {
            const resp = await fetch('/api/v1/hr/employees?perPage=1', {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            });
            const result = await resp.json();
            const total = result?.meta?.total ?? result?.total ?? 0;
            data = {
              value: formatNumber(total),
              label: 'Total Employees',
            };
          } catch {
            data = { value: '—', label: 'Total Employees' };
          }
          break;
        }

        case 'total-customers': {
          try {
            const resp = await fetch('/api/v1/crm/customers?perPage=1', {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            });
            const result = await resp.json();
            const total = result?.meta?.total ?? result?.total ?? 0;
            data = {
              value: formatNumber(total),
              label: 'Total Customers',
            };
          } catch {
            data = { value: '—', label: 'Total Customers' };
          }
          break;
        }

        case 'total-vehicles': {
          try {
            const resp = await fetch('/api/v1/logistics/vehicles?perPage=1', {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            });
            const result = await resp.json();
            const total = result?.meta?.total ?? result?.total ?? 0;
            data = {
              value: formatNumber(total),
              label: 'Total Vehicles',
            };
          } catch {
            data = { value: '—', label: 'Total Vehicles' };
          }
          break;
        }

        case 'total-campaigns': {
          try {
            const resp = await fetch('/api/v1/marketing/campaigns?perPage=1', {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
            });
            const result = await resp.json();
            const total = result?.meta?.total ?? result?.total ?? 0;
            data = {
              value: formatNumber(total),
              label: 'Active Campaigns',
            };
          } catch {
            data = { value: '—', label: 'Active Campaigns' };
          }
          break;
        }

        default:
          data = null;
      }

      set((state) => ({
        widgetData: {
          ...state.widgetData,
          [widgetId]: {
            data,
            loading: false,
            error: null,
            lastUpdated: new Date().toISOString(),
          },
        },
      }));
    } catch (error: any) {
      set((state) => ({
        widgetData: {
          ...state.widgetData,
          [widgetId]: {
            ...state.widgetData[widgetId],
            loading: false,
            error: error.response?.data?.message || 'Failed to load widget data',
          },
        },
      }));
    }
  },

  refreshWidget: async (widgetId: string) => {
    // Remove cached data entirely to force fresh API fetch on next loadWidgetData
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.summary() });
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.salesStats() });
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.ordersByStatus() });
    await get().loadWidgetData(widgetId);
  },

  refreshAllWidgets: async () => {
    // Remove all cached dashboard data to force fresh API fetches
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.summary() });
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.salesStats() });
    queryClient.removeQueries({ queryKey: queryKeys.dashboard.ordersByStatus() });
    const { widgets } = get();
    await Promise.all(widgets.map(w => get().loadWidgetData(w.id)));
  },

  addWidget: async (widgetId: string) => {
    try {
      const catalogWidget = WIDGET_CATALOG.find(w => w.id === widgetId);
      if (!catalogWidget) {
        set({ error: 'Widget not found in catalog' });
        return;
      }

      // Check if already active
      const { widgets, activeWidgetIds, layout } = get();
      if (widgets.find(w => w.id === widgetId)) {
        set({ error: 'Widget is already on the dashboard' });
        return;
      }

      // Add to active widgets
      const newActiveIds = [...activeWidgetIds, widgetId];
      const newWidgets = [...widgets, catalogWidget];

      // Generate layout position for new widget (place at bottom)
      const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const cols = catalogWidget.size === 'large' ? 2 : catalogWidget.size === 'wide' ? 4 : 1;
      const rows = catalogWidget.type === 'chart' ? 3 : 1;

      const newLayoutItem: Layout = {
        i: widgetId,
        x: 0,
        y: maxY,
        w: cols,
        h: rows,
        minW: 1,
        minH: catalogWidget.type === 'chart' ? 2 : 1,
        maxH: catalogWidget.type === 'chart' ? 6 : 3,
        maxW: 4,
      };

      set({
        widgets: newWidgets,
        activeWidgetIds: newActiveIds,
        layout: [...layout, newLayoutItem],
      });

      // Load data for the new widget
      await get().loadWidgetData(widgetId);
    } catch (error: any) {
      set({
        error: error.message || 'Failed to add widget',
      });
    }
  },

  removeWidget: async (widgetId: string) => {
    try {
      const { widgets, activeWidgetIds, layout, widgetData } = get();
      const newWidgetData = { ...widgetData };
      delete newWidgetData[widgetId];

      set({
        widgets: widgets.filter(w => w.id !== widgetId),
        activeWidgetIds: activeWidgetIds.filter(id => id !== widgetId),
        layout: layout.filter(l => l.i !== widgetId),
        widgetData: newWidgetData,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to remove widget',
      });
    }
  },

  updateLayout: (newLayout: Layout[]) => {
    set({ layout: newLayout });
  },

  resetLayout: () => {
    const { widgets } = get();
    const defaultLayout = generateDefaultLayout(widgets);
    set({ layout: defaultLayout });
  },

  clearError: () => {
    set({ error: null });
  },
    }),
    {
      name: 'dashboard-storage',
      partialize: (state) => ({
        layout: state.layout,
        activeWidgetIds: state.activeWidgetIds,
      }),
    }
  )
);

// Helper to wait for Zustand persist hydration before using persisted state
export const waitForHydration = (): Promise<void> => {
  return new Promise((resolve) => {
    // If already hydrated, resolve immediately
    if (useDashboardStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    // Otherwise wait for hydration to finish
    const unsub = useDashboardStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
};
