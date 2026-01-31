/**
 * Dashboard Data Service
 *
 * Fetches real data from various API endpoints for dashboard widgets
 */

import { apiClient } from './api';

export interface FarmStats {
  totalFarms: number;
  totalBlocks: number;
  totalHarvests: number;
  activeBlocks: number;
}

export interface SalesStats {
  totalOrders: number;
  confirmedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  processingOrders: number;
  totalRevenue: number;
  pendingPayments: number;
}

export interface OrderStatusData {
  status: string;
  count: number;
}

export interface BlocksByFarmData {
  farmName: string;
  blockCount: number;
}

// New aggregated dashboard summary types
export interface DashboardOverview {
  totalFarms: number;
  totalBlocks: number;
  activePlantings: number;
  upcomingHarvests: number;
}

export interface DashboardBlocksByState {
  empty: number;
  planned: number;
  growing: number;
  fruiting: number;
  harvesting: number;
  cleaning: number;
  alert: number;
  partial: number;
}

export interface FarmBlockSummary {
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
}

export interface FarmHarvestSummary {
  farmId: string;
  farmName: string;
  totalKg: number;
  harvestCount: number;
}

export interface DashboardHarvestSummary {
  totalHarvestsKg: number;
  harvestsByFarm: FarmHarvestSummary[];
}

export interface DashboardRecentActivity {
  recentHarvests: number;
  pendingTasks: number;
  activeAlerts: number;
}

export interface DashboardSummaryData {
  overview: DashboardOverview;
  blocksByState: DashboardBlocksByState;
  blocksByFarm: FarmBlockSummary[];
  harvestSummary: DashboardHarvestSummary;
  recentActivity: DashboardRecentActivity;
}

export interface DashboardSummaryResponse {
  success: boolean;
  data: DashboardSummaryData;
}

class DashboardDataService {
  /**
   * Get complete dashboard summary in a single optimized call
   *
   * Replaces 80+ individual API calls with one aggregated endpoint.
   * Uses MongoDB aggregation pipelines for maximum performance.
   */
  async getDashboardSummary(): Promise<DashboardSummaryData> {
    try {
      const response = await apiClient.get<DashboardSummaryResponse>('/v1/farm/dashboard/summary');
      const responseData = response.data?.data || response.data;

      // Handle both wrapped and unwrapped responses
      if ('success' in response.data && response.data.success) {
        return response.data.data;
      }

      return responseData as DashboardSummaryData;
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      throw error;
    }
  }

  /**
   * Get farm statistics
   *
   * @deprecated Use getDashboardSummary() instead for better performance
   */
  async getFarmStats(): Promise<FarmStats> {
    try {
      const response = await apiClient.get('/v1/farm/farms');
      const farms = Array.isArray(response.data) ? response.data : response.data?.data || [];

      let totalBlocks = 0;
      let totalHarvests = 0;
      let activeBlocks = 0;

      // Fetch blocks and harvests for each farm
      await Promise.all(farms.map(async (farm: any) => {
        if (farm.farmId) {
          try {
            // Get blocks (virtual only - physical blocks are just containers)
            const blocksResponse = await apiClient.get(`/v1/farm/farms/${farm.farmId}/blocks?blockCategory=virtual&perPage=100`);
            const blocks = Array.isArray(blocksResponse.data) ? blocksResponse.data : blocksResponse.data?.data || [];
            totalBlocks += blocks.length;
            activeBlocks += blocks.filter((b: any) => b.state !== 'IDLE' && b.state !== 'MAINTENANCE').length;

            // Get harvests
            const harvestsResponse = await apiClient.get(`/v1/farm/farms/${farm.farmId}/harvests`);
            const harvests = Array.isArray(harvestsResponse.data) ? harvestsResponse.data : harvestsResponse.data?.data || [];
            totalHarvests += harvests.length;
          } catch (error) {
            console.error(`Error fetching data for farm ${farm.farmId}:`, error);
          }
        }
      }));

      return {
        totalFarms: farms.length,
        totalBlocks,
        totalHarvests,
        activeBlocks,
      };
    } catch (error) {
      console.error('Error fetching farm stats:', error);
      throw error;
    }
  }

  /**
   * Get sales statistics
   */
  async getSalesStats(): Promise<SalesStats> {
    try {
      const response = await apiClient.get('/v1/sales/dashboard');
      const data = response.data?.data || response.data;

      // Calculate processing orders (total - confirmed - shipped - delivered)
      const processingOrders = (data.totalOrders || 0) -
        (data.confirmedOrders || 0) -
        (data.shippedOrders || 0) -
        (data.deliveredOrders || 0);

      return {
        totalOrders: data.totalOrders || 0,
        confirmedOrders: data.confirmedOrders || 0,
        shippedOrders: data.shippedOrders || 0,
        deliveredOrders: data.deliveredOrders || 0,
        processingOrders: Math.max(0, processingOrders),
        totalRevenue: data.totalRevenue || 0,
        pendingPayments: data.pendingPayments || 0,
      };
    } catch (error) {
      console.error('Error fetching sales stats:', error);
      throw error;
    }
  }

  /**
   * Get orders by status for chart
   */
  async getOrdersByStatus(): Promise<OrderStatusData[]> {
    try {
      const stats = await this.getSalesStats();

      return [
        { status: 'Processing', count: stats.processingOrders },
        { status: 'Confirmed', count: stats.confirmedOrders },
        { status: 'Shipped', count: stats.shippedOrders },
        { status: 'Delivered', count: stats.deliveredOrders },
      ].filter(item => item.count > 0);
    } catch (error) {
      console.error('Error fetching orders by status:', error);
      throw error;
    }
  }

  /**
   * Get blocks distribution by farm for chart
   */
  async getBlocksByFarm(): Promise<BlocksByFarmData[]> {
    try {
      const response = await apiClient.get('/v1/farm/farms');
      const farms = Array.isArray(response.data) ? response.data : response.data?.data || [];

      const blocksByFarm: BlocksByFarmData[] = [];

      await Promise.all(farms.map(async (farm: any) => {
        if (farm.farmId) {
          try {
            // Get virtual blocks only (physical blocks are just containers)
            const blocksResponse = await apiClient.get(`/v1/farm/farms/${farm.farmId}/blocks?blockCategory=virtual&perPage=100`);
            const blocks = Array.isArray(blocksResponse.data) ? blocksResponse.data : blocksResponse.data?.data || [];

            blocksByFarm.push({
              farmName: farm.name || farm.farmCode || `Farm ${farm.farmId.slice(0, 6)}`,
              blockCount: blocks.length,
            });
          } catch (error) {
            console.error(`Error fetching blocks for farm ${farm.farmId}:`, error);
          }
        }
      }));

      return blocksByFarm.filter(item => item.blockCount > 0);
    } catch (error) {
      console.error('Error fetching blocks by farm:', error);
      throw error;
    }
  }
}

export const dashboardDataService = new DashboardDataService();
