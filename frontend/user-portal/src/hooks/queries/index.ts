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
} from './useSales';

// Dashboard hooks
export {
  useFarmStats,
  useSalesStats,
  useOrdersByStatus,
  useBlocksByFarm,
} from './useDashboard';

// Tools hooks (Fertilizer Cost Calculator + Chemicals Catalog)
export {
  useChemicals,
  useCreateChemical,
  useUpdateChemical,
  useArchiveChemical,
  useDiscoverChemicals,
  usePrices,
  useUpdatePrice,
  useDeletePriceOverride,
  useCalculate,
  useExportXlsx,
  useImportXlsx,
  useSavedLists,
  useCreateSavedList,
  useUpdateSavedList,
  useDeleteSavedList,
} from './useTools';

// Purchasing hooks (Phase 1A — vendor master, purchase item master, payment terms)
export {
  useVendors,
  useVendor,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  usePurchaseItems,
  usePurchaseItem,
  useCreatePurchaseItem,
  useUpdatePurchaseItem,
  useDeletePurchaseItem,
  usePaymentTerms,
  useCreatePaymentTerms,
  useUpdatePaymentTerms,
  useDeletePaymentTerms,
  purchasingQueryKeys,
} from './usePurchasing';
