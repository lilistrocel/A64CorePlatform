/**
 * Query Hooks Index
 *
 * Central export for all React Query hooks
 */

// Farm hooks
export {
  useFarms,
  useFarm,
  useFarmSummary,
  useFarmBlocks,
  useFarmHarvests,
  useCreateFarm,
  useUpdateFarm,
  useDeleteFarm,
} from './useFarms';

// Farming year hooks
export {
  useAvailableFarmingYears,
  useCurrentFarmingYear,
  useFarmingYearsList,
  useFarmingYearConfig,
} from './useFarmingYears';

// Sales hooks
export {
  useSalesDashboard,
  useSalesOrders,
  useSalesOrder,
  useInventory,
  useAvailableInventory,
} from './useSales';

// Dashboard hooks
export {
  useFarmStats,
  useSalesStats,
  useOrdersByStatus,
  useBlocksByFarm,
} from './useDashboard';
