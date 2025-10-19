import { apiClient } from './api';
import type { CCMWidget, StatWidgetData } from '@a64core/shared';

export interface DashboardLayout {
  id: string;
  userId: string;
  widgets: CCMWidget[];
  layout: {
    widgetId: string;
    position: { x: number; y: number; w: number; h: number };
  }[];
}

export interface WidgetDataResponse {
  widgetId: string;
  data: StatWidgetData | any;
  lastUpdated: string;
}

class DashboardService {
  /**
   * Get user's dashboard layout and widget configuration
   */
  async getDashboardLayout(): Promise<DashboardLayout> {
    const response = await apiClient.get<DashboardLayout>('/v1/dashboard/layout');
    return response.data;
  }

  /**
   * Save user's dashboard layout
   */
  async saveDashboardLayout(layout: DashboardLayout): Promise<void> {
    await apiClient.put('/v1/dashboard/layout', layout);
  }

  /**
   * Get data for a specific widget
   */
  async getWidgetData(widgetId: string): Promise<WidgetDataResponse> {
    const response = await apiClient.get<WidgetDataResponse>(`/v1/dashboard/widgets/${widgetId}/data`);
    return response.data;
  }

  /**
   * Get data for multiple widgets at once
   */
  async getBulkWidgetData(widgetIds: string[]): Promise<WidgetDataResponse[]> {
    const response = await apiClient.post<WidgetDataResponse[]>('/v1/dashboard/widgets/bulk', {
      widgetIds,
    });
    return response.data;
  }

  /**
   * Refresh widget data (force update)
   */
  async refreshWidgetData(widgetId: string): Promise<WidgetDataResponse> {
    const response = await apiClient.post<WidgetDataResponse>(`/v1/dashboard/widgets/${widgetId}/refresh`);
    return response.data;
  }

  /**
   * Get available widgets that can be added to dashboard
   */
  async getAvailableWidgets(): Promise<CCMWidget[]> {
    const response = await apiClient.get<CCMWidget[]>('/v1/dashboard/widgets/available');
    return response.data;
  }

  /**
   * Add widget to user's dashboard
   */
  async addWidget(widgetId: string): Promise<void> {
    await apiClient.post('/v1/dashboard/widgets/add', { widgetId });
  }

  /**
   * Remove widget from user's dashboard
   */
  async removeWidget(widgetId: string): Promise<void> {
    await apiClient.delete(`/v1/dashboard/widgets/${widgetId}`);
  }
}

export const dashboardService = new DashboardService();
