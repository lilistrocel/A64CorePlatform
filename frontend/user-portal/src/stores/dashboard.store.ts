import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CCMWidget, StatWidgetData } from '@a64core/shared';
import { dashboardService, type WidgetDataResponse } from '../services/dashboard.service';
import type { Layout } from 'react-grid-layout';

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
  let rowHeights: number[] = []; // Track heights at each y position

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

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      widgets: [],
      widgetData: {},
      layout: [],
      isLoading: false,
      error: null,

  loadDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      // For now, use mock data until backend is ready
      // TODO: Uncomment when backend API is available
      // const layout = await dashboardService.getDashboardLayout();

      // Mock widgets for development
      const mockWidgets: CCMWidget[] = [
        {
          id: 'sales-summary',
          title: 'Sales Today',
          description: 'Total sales for today',
          dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/metrics/summary' },
          type: 'stat',
          size: 'medium',
        },
        {
          id: 'system-health',
          title: 'System Health',
          description: 'Overall system status',
          dataSource: { type: 'system', metric: 'health_score' },
          type: 'stat',
          size: 'medium',
        },
        {
          id: 'inventory-alerts',
          title: 'Inventory Alerts',
          description: 'Products running low on stock',
          dataSource: { type: 'module', moduleName: 'inventory', endpoint: '/api/alerts/low-stock' },
          type: 'stat',
          size: 'medium',
        },
        {
          id: 'sales-trend-chart',
          title: 'Sales Trend',
          icon: '📈',
          description: 'Weekly sales performance',
          dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/analytics/trend' },
          type: 'chart',
          size: 'large',
        },
        {
          id: 'revenue-breakdown-chart',
          title: 'Revenue by Category',
          icon: '💰',
          description: 'Revenue distribution across product categories',
          dataSource: { type: 'module', moduleName: 'sales', endpoint: '/api/analytics/revenue-breakdown' },
          type: 'chart',
          size: 'medium',
        },
        {
          id: 'user-activity-chart',
          title: 'User Activity',
          icon: '👥',
          description: 'Daily active users over the past week',
          dataSource: { type: 'system', metric: 'user_activity' },
          type: 'chart',
          size: 'large',
        },
      ];

      // Generate default layout if not exists or if layout doesn't match widgets
      const currentLayout = get().layout;
      const layoutWidgetIds = currentLayout.map(l => l.i);
      const widgetIds = mockWidgets.map(w => w.id);

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
      const newLayout = layoutIsValid ? currentLayout : generateDefaultLayout(mockWidgets);

      set({ widgets: mockWidgets, layout: newLayout, isLoading: false });

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
      // For now, use mock data until backend is ready
      // TODO: Uncomment when backend API is available
      // const response = await dashboardService.getWidgetData(widgetId);

      // Mock data for development
      const mockData: Record<string, any> = {
        'sales-summary': {
          value: '$15,234',
          label: 'Total Sales',
          trend: 12.5,
          trendLabel: 'vs yesterday',
          secondaryMetrics: [
            { value: '47', label: 'Orders' },
            { value: '$324', label: 'Avg Order' },
          ],
        },
        'system-health': {
          value: '98%',
          label: 'Health Score',
          trend: 2.1,
          trendLabel: 'vs last hour',
          secondaryMetrics: [
            { value: '3', label: 'Active Alerts' },
            { value: '12', label: 'Services' },
          ],
        },
        'inventory-alerts': {
          value: '12',
          label: 'Low Stock Items',
          trend: -8.3,
          trendLabel: 'vs last week',
          secondaryMetrics: [
            { value: '3', label: 'Critical' },
            { value: '9', label: 'Warning' },
          ],
        },
        'sales-trend-chart': {
          chartType: 'line',
          data: [
            { date: 'Mon', sales: 4200, revenue: 12500 },
            { date: 'Tue', sales: 5100, revenue: 15300 },
            { date: 'Wed', sales: 3800, revenue: 11400 },
            { date: 'Thu', sales: 6200, revenue: 18600 },
            { date: 'Fri', sales: 7300, revenue: 21900 },
            { date: 'Sat', sales: 8500, revenue: 25500 },
            { date: 'Sun', sales: 6800, revenue: 20400 },
          ],
          xKey: 'date',
          yKey: 'sales',
          series: [
            { name: 'Sales', dataKey: 'sales', color: '#3b82f6' },
            { name: 'Revenue', dataKey: 'revenue', color: '#10b981' },
          ],
        },
        'revenue-breakdown-chart': {
          chartType: 'pie',
          data: [
            { category: 'Electronics', amount: 45000 },
            { category: 'Clothing', amount: 32000 },
            { category: 'Home & Garden', amount: 28000 },
            { category: 'Sports', amount: 18000 },
            { category: 'Books', amount: 12000 },
          ],
          xKey: 'category',
          yKey: 'amount',
        },
        'user-activity-chart': {
          chartType: 'bar',
          data: [
            { day: 'Mon', active: 320, new: 45 },
            { day: 'Tue', active: 410, new: 52 },
            { day: 'Wed', active: 380, new: 38 },
            { day: 'Thu', active: 450, new: 61 },
            { day: 'Fri', active: 520, new: 73 },
            { day: 'Sat', active: 380, new: 42 },
            { day: 'Sun', active: 290, new: 31 },
          ],
          xKey: 'day',
          yKey: 'active',
          series: [
            { name: 'Active Users', dataKey: 'active', color: '#3b82f6' },
            { name: 'New Users', dataKey: 'new', color: '#10b981' },
          ],
        },
      };

      const data = mockData[widgetId] || null;

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
    await get().loadWidgetData(widgetId);
  },

  refreshAllWidgets: async () => {
    const { widgets } = get();
    await Promise.all(widgets.map(w => get().loadWidgetData(w.id)));
  },

  addWidget: async (widgetId: string) => {
    try {
      await dashboardService.addWidget(widgetId);
      await get().loadDashboard();
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to add widget',
      });
    }
  },

  removeWidget: async (widgetId: string) => {
    try {
      await dashboardService.removeWidget(widgetId);
      set((state) => ({
        widgets: state.widgets.filter(w => w.id !== widgetId),
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Failed to remove widget',
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
      }),
    }
  )
);
