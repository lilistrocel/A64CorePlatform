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

// Finance hooks — GL Chart of Accounts
export {
  useFinanceAccounts,
  useFinanceAccount,
  useCreateFinanceAccount,
  useUpdateFinanceAccount,
  useDeactivateFinanceAccount,
  useReactivateFinanceAccount,
  financeAccountsQueryKeys,
} from './useFinanceAccounts';

// Finance hooks — Approval Rules
export {
  useApprovalRules,
  useResolveApprovalRule,
  useCreateApprovalRule,
  useUpdateApprovalRule,
  useDeleteApprovalRule,
  useReactivateApprovalRule,
  approvalRulesQueryKeys,
} from './useApprovalRules';

// Finance hooks — Companies (legal entity master data)
export { useFinanceCompanies } from './useFinanceCompanies';

// Finance hooks — Tax Codes (VAT/tax master data)
export { useTaxCodes } from './useTaxCodes';

// Finance hooks — Incoming Preview (read-only Pending Approval docs)
export {
  useIncomingPRs,
  useIncomingPOs,
  useIncomingPRDetail,
  useIncomingPODetail,
  incomingQueryKeys,
} from './useIncomingDocs';

// Finance hooks — Posting Setup (company_posting_setup config)
export {
  usePostingSetup,
  useUpsertPostingSetup,
  postingSetupQueryKeys,
} from './usePostingSetup';

// Finance hooks — Item GL Account Mapping (purchase_item_finance_ext)
export {
  useItemMappings,
  useItemMapping,
  useUpdateItemMapping,
  itemMappingQueryKeys,
} from './useItemMappings';

// Purchasing hooks — Goods Receipts (Phase B)
export {
  useGoodsReceipts,
  useGoodsReceipt,
  useCreateGRFromPO,
  useUpdateGoodsReceipt,
  usePostGoodsReceipt,
  useDeleteGoodsReceipt,
  grQueryKeys,
} from './useGoodsReceipts';

// Finance hooks — Journal Entries (Phase B)
export {
  useJournalEntries,
  useJournalEntry,
  useReverseJournalEntry,
  jeQueryKeys,
} from './useJournalEntries';

// Purchasing hooks — AP Invoices (Phase C)
export {
  useAPInvoices,
  useAPInvoice,
  usePostedGRsForAP,
  useCreateAPFromGR,
  useUpdateAPInvoice,
  useSubmitAPInvoice,
  useApproveAPInvoice,
  useRejectAPInvoice,
  useDeleteAPInvoice,
  apQueryKeys,
} from './useAPInvoices';

// Finance hooks — Trial Balance (PM feedback item 5)
export {
  useTrialBalance,
  useFinancePeriods,
  trialBalanceQueryKeys,
} from './useTrialBalance';

// Finance hooks — AP Payments (Phase D)
export {
  usePayments,
  usePayment,
  useCreatePayment,
  paymentsQueryKeys,
} from './usePayments';

// Finance hooks — Fiscal Periods (Phase D.5)
export {
  useFiscalPeriods,
  useCreatePeriod,
  useClosePeriod,
  useReopenPeriod,
  fiscalPeriodsQueryKeys,
} from './useFiscalPeriods';

// Finance hooks — AP Aging + Vendor Sub-Ledger reports (Phase E)
export {
  useApAging,
  useVendorSubLedger,
  financeReportsQueryKeys,
} from './useFinanceReports';

// Attachments hooks — reusable across PR, PO, GR, AP, PAYMENT detail pages
export {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  attachmentsQueryKeys,
} from './useAttachments';
